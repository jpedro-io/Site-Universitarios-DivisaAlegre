/*
 * ARQUIVO: api/enviar-notificacao.js  -  Função serverless do Vercel
 * Dispara notificações push para todas as inscrições (compartilhadas via Neon com /api/notificacao).
 * Chamado pelo Vercel Cron (vercel.json) nos horários agendados.
 * web-push importado apenas dentro do handler (lazy load) — nada quebra o module load.
 */

const db = require("../lib/db");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

module.exports = async (req, res) => {
  try {
    return await handler(req, res);
  } catch (e) {
    console.error("[enviar-notificacao] erro nao capturado:", e.message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Protecao simples: apenas o Cron do Vercel pode chamar (header secreto opcional)
  const auth = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, erro: "Não autorizado." });
  }

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

  const inscricoes = await db.listarInscricoes();

  let enviados = 0;
  let falhas = 0;

  for (const inscricao of inscricoes) {
    try {
      const webpush = require("web-push"); // lazy load: só aqui, dentro do handler
      webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

      await webpush.sendNotification(
        inscricao,
        JSON.stringify({
          ...msg,
          icone: "/img/favicon.png",
          url: "/",
        })
      );
      enviados += 1;
    } catch (e) {
      falhas += 1;
    }
  }

  return res.status(200).json({
    ok: true,
    tipo,
    enviados,
    falhas,
    total: inscricoes.length,
  });
}
