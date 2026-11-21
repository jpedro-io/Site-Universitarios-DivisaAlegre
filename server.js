/*
 * ARQUIVO: server.js  -  O "cérebro" do site (roda no servidor, não no navegador)
 * Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
 * ---------------------------------------------------------------------------
 * Servidor HTTP em Node puro. Integrações: Clima (Open-Meteo), Trânsito (TomTom),
 * Web Push (VAPID) para alertas de trânsito personalizados por horário e categoria.
 *
 * INDICE DAS PARTES
 *   PARTE 1  Configuração ........ lê o .env e monta o objeto CFG
 *   PARTE 2  Utilidades .......... respostas JSON, cache, rate limit, helpers
 *   PARTE 3  Clima ............... chama a Open-Meteo (não usa chave)
 *   PARTE 4  Trânsito ............ consulta TomTom Traffic API + classificação por tempo
 *   PARTE 5  Web Push ............ VAPID, inscrições com preferências, envio de notificações
 *   PARTE 6  Agendador ........... notificações segunda a sexta nos horários personalizados (ida e volta)
 *   PARTE 7  Arquivos estáticos .. entrega HTML, CSS, JS e imagens de ./public
 *   PARTE 8  Servidor ............ define as rotas /api/... e liga o site na porta
 *
 * Rodar:  node server.js         (porta padrão 3000, ou defina PORT no .env)
 * Instalar deps: npm install
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const schedule = require("node-schedule");
const webPush = require("web-push");

/* ------------------------------------------------------------------ */
/* PARTE 1 - CONFIGURAÇÃO: lê o .env e monta o objeto CFG              */
/* ------------------------------------------------------------------ */
const RAIZ = __dirname;
const ARQ_ENV = path.join(RAIZ, ".env");

function carregarEnv(caminho) {
  if (!fs.existsSync(caminho)) return;
  const linhas = fs.readFileSync(caminho, "utf8").split(/\r?\n/);
  for (const linha of linhas) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const i = limpa.indexOf("=");
    if (i === -1) continue;
    const chave = limpa.slice(0, i).trim();
    let valor = limpa.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}
carregarEnv(ARQ_ENV);

const CFG = {
  porta: Number(process.env.PORT || 3000),

  // Clima (Open-Meteo)
  climaLat: process.env.CLIMA_LAT || "-14.8661",
  climaLon: process.env.CLIMA_LON || "-40.8394",
  climaCidade: process.env.CLIMA_CIDADE || "Vitória da Conquista",
  climaTz: process.env.CLIMA_TIMEZONE || "America/Bahia",

  // Trânsito (TomTom)
  tomtomKey: process.env.TOMTOM_API_KEY || "",
  transitoOrigemLat: Number(process.env.TRANSITO_ORIGEM_LAT || -15.7215),
  transitoOrigemLon: Number(process.env.TRANSITO_ORIGEM_LON || -41.34411),
  transitoDestinoLat: Number(process.env.TRANSITO_DESTINO_LAT || -14.8661),
  transitoDestinoLon: Number(process.env.TRANSITO_DESTINO_LON || -40.8394),
  transitoDistanciaKm: Number(process.env.TRANSITO_DISTANCIA_KM || 150),
  transitoVelocidadeLivre: Number(process.env.TRANSITO_VELOCIDADE_LIVRE || 80),

  // Web Push (VAPID)
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidEmail: process.env.VAPID_EMAIL || "mailto:contato@divisaalegre.mg.gov.br",

  pastaPublica: path.join(RAIZ, "public"),
};

/* ------------------------------------------------------------------ */
/* PARTE 2 - UTILIDADES: json(), cache, limpar(), limitarAcesso()      */
/* ------------------------------------------------------------------ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

const cache = new Map();              // cache simples em memória
const acessos = new Map();            // rate limit por IP
// Estrutura: Map<endpoint, { inscricao, preferencias: { categorias:{bom,lento,ruim}, horaIda, horaVolta } }>
const inscricoesPush = new Map();

function json(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(corpo),
  });
  res.end(corpo);
}

function limpar(v) {
  let s = String(v == null ? "" : v);
  return s.slice(0, 400);
}

async function buscar(url, opcoes, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
  try {
    return await fetch(url, { ...opcoes, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function limitarAcesso(ip) {
  const agora = Date.now();
  const janela = 60000, max = 30;
  const reg = acessos.get(ip) || { inicio: agora, n: 0 };
  if (agora - reg.inicio > janela) { reg.inicio = agora; reg.n = 0; }
  reg.n += 1;
  acessos.set(ip, reg);
  return reg.n <= max;
}

/**
 * Verifica se a requisição vem do próprio site (mesma origem) ou é do servidor.
 * Bloqueia chamadas externas diretas às APIs.
 */
function origemPermitida(req) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const host = req.headers.host || "";

  // Permite requisições sem origin (ex.: curl do próprio servidor, agendador interno)
  if (!origin && !referer) return true;

  // Permite se o host bater com o referer/origin
  try {
    if (referer) {
      const refHost = new URL(referer).host;
      if (refHost === host) return true;
    }
    if (origin) {
      const oriHost = new URL(origin).host;
      if (oriHost === host) return true;
    }
  } catch (e) {
    // URL inválida, nega
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* PARTE 3 - CLIMA: DESCRICAO_TEMPO + clima()                          */
/* ------------------------------------------------------------------ */
const DESCRICAO_TEMPO = {
  0: "Céu limpo", 1: "Predomínio de sol", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa fraca", 53: "Garoa moderada",
  55: "Garoa forte", 56: "Garoa congelante", 57: "Garoa congelante forte",
  61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte",
  66: "Chuva congelante", 67: "Chuva congelante forte",
  71: "Neve fraca", 73: "Neve moderada", 75: "Neve forte", 77: "Grãos de neve",
  80: "Pancadas de chuva", 81: "Pancadas moderadas de chuva", 82: "Pancadas fortes de chuva",
  85: "Pancadas de neve", 86: "Pancadas fortes de neve",
  95: "Trovoada", 96: "Trovoada com granizo", 99: "Trovoada forte com granizo",
};

async function clima() {
  const chave = "clima";
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < 5 * 60 * 1000) return salvo.dados;

  const url = "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(CFG.climaLat)}&longitude=${encodeURIComponent(CFG.climaLon)}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
    `&timezone=${encodeURIComponent(CFG.climaTz)}`;

  const r = await buscar(url, { headers: { "User-Agent": "site-universitarios-divisa-alegre" } });
  if (!r.ok) throw new Error("Open-Meteo respondeu " + r.status);
  const d = await r.json();
  const c = d.current || {};
  const dados = {
    ok: true,
    fonte: "Open-Meteo",
    cidade: CFG.climaCidade,
    temperatura: c.temperature_2m,
    sensacao: c.apparent_temperature,
    umidade: c.relative_humidity_2m,
    vento: c.wind_speed_10m,
    chuva: c.precipitation,
    codigo: c.weather_code,
    descricao: DESCRICAO_TEMPO[c.weather_code] || "Condição não informada",
    atualizadoEm: c.time,
  };
  cache.set(chave, { em: Date.now(), dados });
  return dados;
}

/* ------------------------------------------------------------------ */
/* PARTE 4 - TRÂNSITO: TomTom + classificação por tempo de viagem      */
/* ------------------------------------------------------------------ */

/**
 * Classifica o tempo de viagem T (minutos) em: bom, lento ou ruim
 * T <= 90 min  → bom (trânsito bom)
 * T >= 100 min → lento (trânsito lento)
 * T > 120 min  → ruim (trânsito ruim/parado)
 */
function classificarTempoViagem(minutos) {
  if (minutos <= 90) return "bom";
  if (minutos > 120) return "ruim";
  if (minutos >= 100) return "lento";
  return "bom";
}

/**
 * Consulta o TomTom Traffic Flow para obter velocidade atual vs livre
 * Retorna: { ok, tempoLivreMin, tempoAtualMin, classificacao, segmento..., erro? }
 */
async function consultarTransito() {
  if (!CFG.tomtomKey) {
    return { ok: false, erro: "TOMTOM_API_KEY não configurada no .env" };
  }

  const pontosRota = [
    { lat: CFG.transitoOrigemLat, lon: CFG.transitoOrigemLon, nome: "Divisa Alegre" },
    { lat: -13.856, lon: -40.085, nome: "Jequié (BR-116)" },
    { lat: CFG.transitoDestinoLat, lon: CFG.transitoDestinoLon, nome: "Vitória da Conquista" },
  ];

  const resultados = [];

  for (const ponto of pontosRota) {
    try {
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
        `?point=${ponto.lat},${ponto.lon}&unit=KMPH&key=${CFG.tomtomKey}`;

      const r = await buscar(url, { headers: { "User-Agent": "site-universitarios-divisa-alegre" } });
      if (!r.ok) {
        console.warn(`[trânsito] TomTom ${ponto.nome}: HTTP ${r.status}`);
        continue;
      }
      const d = await r.json();
      const seg = d.flowSegmentData;
      if (!seg) continue;

      const velocidadeAtual = seg.currentSpeed || 0;
      const velocidadeLivre = seg.freeFlowSpeed || velocidadeAtual;
      const multiplicador = velocidadeLivre > 0 ? velocidadeLivre / Math.max(velocidadeAtual, 1) : 1;

      resultados.push({
        ponto: ponto.nome,
        velocidadeAtual,
        velocidadeLivre,
        multiplicador: Number(multiplicador.toFixed(2)),
        congestionamento: seg.confidence || 0,
        roadClosure: seg.roadClosure || false,
      });
    } catch (e) {
      console.warn(`[trânsito] Erro em ${ponto.nome}:`, limpar(e.message));
    }
  }

  if (resultados.length === 0) {
    return { ok: false, erro: "Nenhum dado de trânsito obtido do TomTom" };
  }

  const multiplicadorMedio = resultados.reduce((s, r) => s + r.multiplicador, 0) / resultados.length;

  // Estima tempo livre e atual baseado na distância configurada
  const distanciaTotalKm = CFG.transitoDistanciaKm > 0 ? CFG.transitoDistanciaKm : 150;
  const velocidadeMediaLivre = CFG.transitoVelocidadeLivre > 0 ? CFG.transitoVelocidadeLivre : 80; // km/h média em estrada livre
  const tempoLivreMin = Math.round((distanciaTotalKm / velocidadeMediaLivre) * 60);
  const tempoAtualMin = Math.round(tempoLivreMin * multiplicadorMedio);

  const classificacao = classificarTempoViagem(tempoAtualMin);

  return {
    ok: true,
    fonte: "TomTom Traffic API",
    tempoLivreMin,
    tempoAtualMin,
    multiplicador: Number(multiplicadorMedio.toFixed(2)),
    classificacao, // "bom" | "lento" | "ruim"
    segmentos: resultados,
    verificadoEm: new Date().toISOString(),
  };
}

/**
 * Endpoint público: GET /api/transito
 */
async function rotaTransito(req, res) {
  try {
    const dados = await consultarTransito();
    return json(res, dados.ok ? 200 : 502, dados);
  } catch (e) {
    console.error("[trânsito] falhou:", limpar(e.message));
    return json(res, 502, { ok: false, erro: "Erro ao consultar trânsito: " + limpar(e.message) });
  }
}

/* ------------------------------------------------------------------ */
/* PARTE 5 - WEB PUSH: VAPID, inscrições com preferências, envio       */
/* ------------------------------------------------------------------ */

if (CFG.vapidPublicKey && CFG.vapidPrivateKey) {
  webPush.setVapidDetails(CFG.vapidEmail, CFG.vapidPublicKey, CFG.vapidPrivateKey);
}

/**
 * POST /api/push/inscrever
 * Body: { endpoint, keys: { p256dh, auth }, preferencias: { categorias:{bom,lento,ruim}, horaIda, horaVolta } }
 */
async function inscreverPush(req, res) {
  let corpo = "";
  req.on("data", c => corpo += c);
  req.on("end", () => {
    try {
      const inscricao = JSON.parse(corpo);
      if (!inscricao.endpoint || !inscricao.keys?.p256dh || !inscricao.keys?.auth) {
        return json(res, 400, { ok: false, erro: "Inscrição inválida (faltam endpoint/keys)" });
      }

      const preferencias = inscricao.preferencias || {
        categorias: { bom: false, lento: false, ruim: false },
        horaIda: "06:30",
        horaVolta: "17:30",
      };

      inscricoesPush.set(inscricao.endpoint, {
        inscricao,
        preferencias,
      });

      console.log(`[push] Nova inscrição com preferências: ${inscricao.endpoint.slice(0, 50)}... (total: ${inscricoesPush.size})`);
      return json(res, 201, { ok: true, total: inscricoesPush.size });
    } catch (e) {
      return json(res, 400, { ok: false, erro: "JSON inválido" });
    }
  });
}

/**
 * POST /api/push/desinscrever
 * Body: { endpoint }
 */
async function desinscreverPush(req, res) {
  let corpo = "";
  req.on("data", c => corpo += c);
  req.on("end", () => {
    try {
      const { endpoint } = JSON.parse(corpo);
      const removido = inscricoesPush.delete(endpoint);
      console.log(`[push] Desinscrito: ${removido} (total: ${inscricoesPush.size})`);
      return json(res, 200, { ok: true, removido, total: inscricoesPush.size });
    } catch (e) {
      return json(res, 400, { ok: false, erro: "JSON inválido" });
    }
  });
}

/**
 * GET /api/push/vapid-public-key
 */
function obterVapidPublicKey(req, res) {
  if (!CFG.vapidPublicKey) {
    return json(res, 503, { ok: false, erro: "VAPID não configurado no servidor" });
  }
  return json(res, 200, { ok: true, chavePublica: CFG.vapidPublicKey });
}

/**
 * Envia notificação push para inscrições que quiserem receber essa categoria
 */
async function enviarNotificacaoParaCategorias(titulo, corpo, categoriasAlvo, dadosAdicionais = {}) {
  if (inscricoesPush.size === 0) {
    console.log("[push] Nenhuma inscrição ativa para notificar");
    return { enviados: 0, falhas: 0 };
  }

  const payload = JSON.stringify({ titulo, corpo, ...dadosAdicionais });
  let enviados = 0, falhas = 0;

  for (const [endpoint, item] of inscricoesPush) {
    // Só envia se a categoria alvo estiver selecionada pelo usuário
    const pref = item.preferencias || {};
    const cat = pref.categorias || {};
    if (!cat[categoriasAlvo]) continue;

    try {
      await webPush.sendNotification(item.inscricao, payload);
      enviados++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        inscricoesPush.delete(endpoint);
      }
      falhas++;
      console.warn("[push] Falha ao enviar:", limpar(e.message));
    }
  }

  console.log(`[push] Notificação "${categoriasAlvo}" enviada: ${enviados} ok, ${falhas} falhas`);
  return { enviados, falhas };
}

/* ------------------------------------------------------------------ */
/* PARTE 6 - AGENDADOR: notificações segunda a sexta nos horários      */
/* ------------------------------------------------------------------ */

/**
 * Retorna verdadeiro se hoje é segunda a sexta
 */
function ehDiaUtil() {
  const dia = new Date().getDay(); // 0=domingo, 6=sábado
  return dia >= 1 && dia <= 5;
}

/**
 * Verifica se já passou do horário agendado hoje (para não enviar notificação atrasada)
 */
function jaPassouDoHorario(horaStr) {
  const agora = new Date();
  const [h, m] = horaStr.split(":").map(Number);
  const agendado = new Date();
  agendado.setHours(h, m, 0, 0);
  return agora > agendado;
}

/**
 * Busca o trânsito atual e envia notificação para as categorias selecionadas
 * Se a classificação atual bater com uma categoria selecionada, notifica.
 */
async function verificarENotificar(tipoViagem, horaStr, categoriaPreferida) {
  if (!ehDiaUtil()) {
    console.log(`[agendador] Fim de semana — pulando notificação de ${tipoViagem} às ${horaStr}`);
    return;
  }

  if (jaPassouDoHorario(horaStr)) {
    console.log(`[agendador] Horário ${horaStr} já passou hoje — pulando ${tipoViagem}`);
    return;
  }

  const resultado = await consultarTransito();
  if (!resultado.ok) {
    console.warn(`[agendador] Falha ao consultar trânsito para ${tipoViagem}:`, resultado.erro);
    return;
  }

  const classificacaoAtual = resultado.classificacao; // "bom" | "lento" | "ruim"

  // Só notifica se a classificação atual for a categoria preferida E o usuário selecionou essa categoria
  if (classificacaoAtual !== categoriaPreferida) {
    console.log(`[agendador] ${tipoViagem} às ${horaStr}: trânsito ${classificacaoAtual}, não é ${categoriaPreferida} — sem notificação`);
    return;
  }

  const atraso = resultado.tempoAtualMin - resultado.tempoLivreMin;
  const nomesCategoria = {
    bom: "bom",
    lento: "lento",
    ruim: "ruim/parado",
  };

  const rotas = {
    ida: "Divisa Alegre → Vitória da Conquista",
    volta: "Vitória da Conquista → Divisa Alegre",
  };

  await enviarNotificacaoParaCategorias(
    `Trânsito ${nomesCategoria[categoriaPreferida]} — ${rotas[tipoViagem]}`,
    `Saída prevista às ${horaStr}. Tempo de viagem: ~${resultado.tempoAtualMin} min ` +
    (atraso > 0 ? `(+${atraso} min que o normal)` : "") +
    `. ${resultado.tempoLivreMin} min em condições normais.`,
    categoriaPreferida,
    {
      tipo: "notificacao_agendada",
      viagem: tipoViagem,
      hora: horaStr,
      classificacao: resultado.classificacao,
      tempoAtualMin: resultado.tempoAtualMin,
      tempoLivreMin: resultado.tempoLivreMin,
      atraso,
    }
  );
}

/**
 * Inicia os agendadores de ida e volta (segunda a sexta)
 */
function iniciarAgendadorNotificacoes() {
  if (!CFG.tomtomKey) {
    console.log("[agendador] TOMTOM_API_KEY não configurada — notificações DESATIVADAS");
    return;
  }
  if (!CFG.vapidPublicKey || !CFG.vapidPrivateKey) {
    console.log("[agendador] Chaves VAPID não configuradas — notificações push DESATIVADAS");
  }

  // Função para ler preferências atuais e agendar dinamicamente
  function agendarComPreferenciasAtuais() {
    // Para cada inscrição, lê os horários e categorias preferidas
    // Agendamos verificações em todos os horários possíveis (00:00 a 23:59) de minuto em minuto
    // mas só enviamos se o horário bater com o preferido de alguém e a categoria corresponder.
    // Simplificado: verificamos a cada minuto se alguma inscrição tem notificação agendada para esse exato minuto.

    schedule.scheduleJob("* * * * 1-5", async function () {
      // Roda todo minuto, segunda a sexta
      if (!ehDiaUtil()) return;

      const agora = new Date();
      const horaAtual = agora.getHours().toString().padStart(2, "0") + ":" + agora.getMinutes().toString().padStart(2, "0");

      for (const [endpoint, item] of inscricoesPush) {
        const pref = item.preferencias || {};
        const categorias = pref.categorias || {};
        const horaIda = pref.horaIda || "06:30";
        const horaVolta = pref.horaVolta || "17:30";

        // Verifica ida
        if (horaAtual === horaIda) {
          // Envia para a categoria que corresponde ao trânsito atual (se selecionada)
          // Como não sabemos o trânsito ainda, consultamos e enviamos para todas categorias selecionadas
          // que baterem com o resultado
          const resultado = await consultarTransito();
          if (!resultado.ok) continue;

          const classificacao = resultado.classificacao;
          if (categorias[classificacao]) {
            await enviarNotificacaoParaCategorias(
              `Lembrete: Saída para Vitória da Conquista`,
              `Hora da saída (${horaIda}). Trânsito ${classificacao}. Tempo estimado: ~${resultado.tempoAtualMin} min.`,
              classificacao,
              { tipo: "lembrete_saida", viagem: "ida", hora: horaIda, classificacao }
            );
          }
        }

        // Verifica volta
        if (horaAtual === horaVolta) {
          const resultado = await consultarTransito();
          if (!resultado.ok) continue;

          const classificacao = resultado.classificacao;
          if (categorias[classificacao]) {
            await enviarNotificacaoParaCategorias(
              `Lembrete: Saída para Divisa Alegre`,
              `Hora da saída (${horaVolta}). Trânsito ${classificacao}. Tempo estimado: ~${resultado.tempoAtualMin} min.`,
              classificacao,
              { tipo: "lembrete_saida", viagem: "volta", hora: horaVolta, classificacao }
            );
          }
        }
      }
    });

    console.log("[agendador] Notificações agendadas: segunda a sexta, verificação a cada minuto");
  }

  agendarComPreferenciasAtuais();

  // Verificação imediata na inicialização (útil pra testar)
  setTimeout(async () => {
    const resultado = await consultarTransito();
    if (resultado.ok) {
      console.log(`[inicialização] Trânsito atual: ${resultado.tempoAtualMin} min (${resultado.classificacao})`);
    }
  }, 3000);
}

function pararAgendador() {
  schedule.cancelJobs();
  console.log("[agendador] Todos os jobs cancelados");
}

/* ------------------------------------------------------------------ */
/* PARTE 7 - ARQUIVOS ESTÁTICOS: servirEstatico()                      */
/* ------------------------------------------------------------------ */
function servirEstatico(req, res, caminhoUrl) {
  let rel = decodeURIComponent(caminhoUrl.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";

  const alvo = path.normalize(path.join(CFG.pastaPublica, rel));
  if (!alvo.startsWith(CFG.pastaPublica)) {
    return json(res, 403, { ok: false, erro: "Acesso negado." });
  }
  if (!fs.existsSync(alvo) || !fs.statSync(alvo).isFile()) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    return res.end("<h1>404 — Página não encontrada</h1><p><a href=\"/\">Voltar à página inicial</a></p>");
  }

  const ext = path.extname(alvo).toLowerCase();
  const cacheavel = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".css", ".js", ".ico"].includes(ext);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheavel ? "public, max-age=86400" : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(alvo).pipe(res);
}

/* ------------------------------------------------------------------ */
/* PARTE 8 - SERVIDOR: rotas /api/... e inicialização                 */
/* ------------------------------------------------------------------ */
const servidor = http.createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").toString().split(",")[0].trim();
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));

  // Rotas de API
  if (url.pathname.startsWith("/api/")) {
    if (!limitarAcesso(ip)) return json(res, 429, { ok: false, erro: "Muitas solicitações. Aguarde um instante." });

    // Bloqueia chamadas externas diretas às APIs (apenas o próprio site pode acessar)
    if (!origemPermitida(req)) {
      return json(res, 403, { ok: false, erro: "Acesso restrito ao site." });
    }

    if (url.pathname === "/api/status") {
      return json(res, 200, {
        ok: true,
        integracoes: {
          clima: "Open-Meteo (sem chave)",
          transito: CFG.tomtomKey ? "TomTom Traffic API" : "Não configurado",
          push: (CFG.vapidPublicKey && CFG.vapidPrivateKey) ? "VAPID configurado" : "Não configurado",
        },
        inscricoesPush: inscricoesPush.size,
      });
    }

    if (url.pathname === "/api/clima") {
      try {
        return json(res, 200, await clima());
      } catch (e) {
        console.error("[clima] falhou:", limpar(e.message));
        return json(res, 502, { ok: false, erro: "Não foi possível consultar o clima agora. " + limpar(e.message) });
      }
    }

    if (url.pathname === "/api/transito") {
      return await rotaTransito(req, res);
    }

    if (url.pathname === "/api/push/vapid-public-key" && req.method === "GET") {
      return obterVapidPublicKey(req, res);
    }

    if (url.pathname === "/api/push/inscrever" && req.method === "POST") {
      return await inscreverPush(req, res);
    }

    if (url.pathname === "/api/push/desinscrever" && req.method === "POST") {
      return await desinscreverPush(req, res);
    }

    return json(res, 404, { ok: false, erro: "Endpoint não encontrado." });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { ok: false, erro: "Método não permitido." });
  }

  servirEstatico(req, res, url.pathname);
});

// Inicia agendador de notificações
iniciarAgendadorNotificacoes();

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[servidor] Encerrando...");
  pararAgendador();
  servidor.close(() => process.exit(0));
});

servidor.listen(CFG.porta, "0.0.0.0", () => {
  console.log(`Site no ar em http://0.0.0.0:${CFG.porta}`);
  console.log(`  Clima  : Open-Meteo (${CFG.climaCidade})`);
  console.log(`  Trânsito: ${CFG.tomtomKey ? "TomTom Traffic API" : "Não configurado (defina TOMTOM_API_KEY no .env)"}`);
  console.log(`  Push   : ${(CFG.vapidPublicKey && CFG.vapidPrivateKey) ? "VAPID pronto (notificações segunda a sexta)" : "Não configurado"}`);
});