/*
 * ARQUIVO: api/enviar-notificacao.js  -  Função serverless do Vercel
 * Dispara notificações push para todas as inscrições registradas no Neon.
 * Chamado pelo Vercel Cron (vercel.json) nos horários agendados.
 */

const { WebPush } = require("web-push");
const { getPool, bancoDisponivel, pgErro } = require("../lib/db");

let inscricoesMemoria = []; // fallback se o banco não estiver disponível

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

const webpush = new WebPush({
  publicKey: VAPID_PUBLIC_KEY,
  privateKey: VAPID_PRIVATE_KEY,
  email: VAPID_EMAIL,
});

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Proteção simples: apenas o Cron do Vercel pode chamar (header secreto opcional)
  const auth = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, erro: "Não autorizado." });
  }

  // O cron do Vercel chama via GET com ?tipo=lista ou ?tipo=transito
  const tipo =
    (req.query && req.query.tipo) ||
    (req.body && req.body.tipo) ||
    "lista";

  const mensagens = {
    lista: {
      titulo: "Lista de Espera",
      corpo: "Você já colocou seu nome na lista de hoje? Lembre-se do horário.",
      tag: "lista-espera",
    },
    transito: {
      titulo: "Trânsito e Clima",
      corpo: "Confira o estado do trânsito e o clima em Vitória da Conquista.",
      tag: "transito",
    },
  };

  const msg = mensagens[tipo] || mensagens.lista;

  // Carrega as inscrições (banco Neon com fallback em memória)
  const inscricoes = await carregarInscrições();

  let enviados = 0;
  let falhas = 0;
  const validos = [];

  for (const inscricao of inscricoes) {
    try {
      await webpush.sendNotification(
        inscricao,
        JSON.stringify({
          ...msg,
          icone: "/img/favicon.png",
          url: "/",
        })
      );
      validos.push(inscricao);
      enviados += 1;
    } catch (e) {
      // Remove inscrições inválidas (ex.: usuário bloqueou)
      falhas += 1;
    }
  }

  // Atualiza a fonte de dados com apenas as inscrições válidas
  if (bancoDisponivel()) {
    try {
      await sincronizarBanco(validos);
    } catch (dbErr) {
      console.warn("[db] falhou ao sincronizar:", dbErr.message);
      inscricoesMemoria = validos;
    }
  } else {
    inscricoesMemoria = validos;
  }

  return res.status(200).json({
    ok: true,
    tipo,
    enviados,
    falhas,
    total: inscricoes.length,
  });
};

/* ---------------- Helpers ---------------- */

async function carregarInscrições() {
  if (bancoDisponivel()) {
    try {
      const cliente = await getPool().connect();
      try {
        const r = await cliente.query(
          "SELECT endpoint, tipo, keys_json FROM inscricoes"
        );
        return r.rows.map((row) => ({
          endpoint: row.endpoint,
          keys: row.keys_json || {},
        }));
      } finally {
        cliente.release();
      }
    } catch (dbErr) {
      console.warn("[db] falhou ao ler, usando memória:", dbErr.message);
    }
  } else {
    console.warn("[db] banco indisponível (" + (pgErro || "sem DATABASE_URL") + "), usando memória");
  }

  return inscricoesMemoria.map((i) => ({
    endpoint: i.endpoint,
    keys: i.keys || {},
  }));
}

async function sincronizarBanco(validos) {
  const cliente = await getPool().connect();
  try {
    // Remove inscrições que falharam (não estão mais em validos)
    const endpointsValidos = validos.map((v) => v.endpoint);
    if (endpointsValidos.length > 0) {
      const placeholders = endpointsValidos.map((_, i) => `$${i + 1}`).join(",");
      await cliente.query(
        `DELETE FROM inscricoes WHERE endpoint NOT IN (${placeholders})`,
        endpointsValidos
      );
    } else {
      await cliente.query("DELETE FROM inscricoes");
    }

    // (Re)inscreve as válidas
    for (const inscricao of validos) {
      await cliente.query(
        "INSERT INTO inscricoes (endpoint, tipo, keys_json) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO NOTHING",
        [inscricao.endpoint, "geral", JSON.stringify(inscricao.keys)]
      );
    }
  } finally {
    cliente.release();
  }
}
