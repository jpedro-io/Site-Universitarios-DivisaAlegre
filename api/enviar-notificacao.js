/*
 * ARQUIVO: api/enviar-notificacao.js  -  Função serverless do Vercel
 * Dispara notificações push para todas as inscrições registradas no Neon.
 * Chamado pelo Vercel Cron (vercel.json) nos horários agendados.
 */

const { WebPush } = require("web-push");
const { getPool } = require("../lib/db");

let inscricoesCache = []; // fallback se o banco falhar

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

  const pool = getPool();

  // Carrega as inscrições do Neon (com fallback em memória se o banco falhar)
  let inscricoes = [];
  try {
    const cliente = await pool.connect();
    try {
      const r = await cliente.query(
        "SELECT endpoint, tipo, keys_json FROM inscricoes"
      );
      inscricoes = r.rows.map((row) => ({
        endpoint: row.endpoint,
        keys: row.keys_json || {},
      }));
    } finally {
      cliente.release();
    }
  } catch (dbErr) {
    console.warn("[db] falhou ao ler inscrições, usando cache:", dbErr.message);
    inscricoes = inscricoesCache.map((i) => ({
      endpoint: i.endpoint,
      keys: i.keys || {},
    }));
  }

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

  // Persiste as inscrições válidas de volta (remove as que falharam)
  try {
    const cliente = await pool.connect();
    try {
      if (inscricoes.length > 0 && falhas > 0) {
        const endpointsValidos = validos.map((v) => v.endpoint);
        for (const endpoint of endpointsValidos) {
          await cliente.query(
            "DELETE FROM inscricoes WHERE endpoint = $1",
            [endpoint]
          );
        }
        for (const inscricao of validos) {
          await cliente.query(
            "INSERT INTO inscricoes (endpoint, tipo, keys_json) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO NOTHING",
            [inscricao.endpoint, tipo, JSON.stringify(inscricao.keys)]
          );
        }
      }
    } finally {
      cliente.release();
    }
  } catch (dbErr) {
    console.warn("[db] falhou ao limpar inscrições:", dbErr.message);
    inscricoesCache = validos;
  }

  return res.status(200).json({
    ok: true,
    tipo,
    enviados,
    falhas,
    total: inscricoes.length,
  });
};
