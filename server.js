/*
 * ARQUIVO: server.js  -  O "cérebro" do site (roda no servidor, não no navegador)
 * Site da Comissão de Transporte dos Universitários de Divisa Alegre - MG
 * ---------------------------------------------------------------------------
 * Servidor HTTP em Node puro. Integrações: Clima (Open-Meteo) e Trânsito (estimado).
 *
 * INDICE DAS PARTES
 *   PARTE 1  Configuração ........ lê o .env e monta o objeto CFG
 *   PARTE 2  Utilidades .......... respostas JSON, cache, rate limit, helpers
 *   PARTE 3  Clima ............... chama a Open-Meteo (não usa chave)
 *   PARTE 4  Trânsito ............ tempo de viagem estimado (sem API externa)
 *   PARTE 5  Arquivos estáticos .. entrega HTML, CSS, JS e imagens de ./public
 *   PARTE 6  Servidor ............ define as rotas /api/... e liga o site na porta
 *
 * Rodar:  node server.js         (porta padrão 3000, ou defina PORT no .env)
 * Instalar deps: npm install
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

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

  // Permite requisições sem origin (ex.: curl do próprio servidor)
  if (!origin && !referer) return true;

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
    return false;
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
/* PARTE 4 - TRÂNSITO: tempo estimado (sem API externa)                */
/* ------------------------------------------------------------------ */

/**
 * Retorna o tempo de viagem estimado fixo (sem consulta a API do Google Maps/TomTom).
 * Valores padrão: 120 km a 80 km/h ≈ 90 min (tempo livre).
 */
async function consultarTransito() {
  const distanciaKm = Number(process.env.TRANSITO_DISTANCIA_KM || 120);
  const velocidadeLivre = Number(process.env.TRANSITO_VELOCIDADE_LIVRE || 80);
  const tempoLivreMin = Math.round((distanciaKm / velocidadeLivre) * 60);

  const classificacao = classificarTempoViagem(tempoLivreMin);

  return {
    ok: true,
    fonte: "Estimativa (sem trânsito em tempo real)",
    tempoLivreMin: tempoLivreMin,
    tempoAtualMin: tempoLivreMin,
    temTrafegoReal: false,
    classificacao: classificacao,
    distanciaKm: distanciaKm,
    verificadoEm: new Date().toISOString(),
  };
}

function classificarTempoViagem(minutos) {
  if (minutos <= 90) return "bom";
  if (minutos > 120) return "ruim";
  if (minutos >= 100) return "lento";
  return "bom";
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
/* PARTE 5 - ARQUIVOS ESTÁTICOS: servirEstatico()                      */
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
/* PARTE 6 - SERVIDOR: rotas /api/... e inicialização                 */
/* ------------------------------------------------------------------ */

/**
 * Handler de requisições HTTP.
 * Funciona tanto com node http.createServer (execucao local) quanto
 * com o handler do Vercel (@vercel/node).
 */
async function handleRequest(req, res) {
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
          transito: "Estimativa local (sem API externa)",
        },
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

    return json(res, 404, { ok: false, erro: "Endpoint não encontrado." });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return json(res, 405, { ok: false, erro: "Método não permitido." });
  }

  servirEstatico(req, res, url.pathname);
}

const servidor = http.createServer(handleRequest);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[servidor] Encerrando...");
  servidor.close(() => process.exit(0));
});

// Execucao local: escuta na porta apenas quando rodado diretamente
if (require.main === module) {
  servidor.listen(CFG.porta, "0.0.0.0", () => {
    console.log(`Site no ar em http://0.0.0.0:${CFG.porta}`);
    console.log(`  Clima   : Open-Meteo (${CFG.climaCidade})`);
    console.log(`  Trânsito: Estimativa local (sem API externa)`);
  });
}

// Exporta o handler para o Vercel (@vercel/node)
module.exports = handleRequest;
