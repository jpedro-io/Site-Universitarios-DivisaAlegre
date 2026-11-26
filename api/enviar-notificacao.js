/*
 * ARQUIVO: api/enviar-notificacao.js  -  Função serverless do Vercel
 * Dispara notificações push para todas as inscrições registradas.
 * Chamado pelo Vercel Cron (vercel.json) nos horários agendados.
 */

const { WebPush } = require("web-push");

let inscricoes = []; // em produção, use um banco compartilhado

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

  const { tipo } = req.body || {}; // "lista" (10h) ou "transito" (15h)

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

  inscricoes = validos;

  return res.status(200).json({
    ok: true,
    tipo,
    enviados,
    falhas,
    total: inscricoes.length,
  });
};
