/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Gerencia inscrições para notificações push (VAPID).
 *
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * POST /api/notificacao   -> registra uma inscrição (PushSubscription)
 * DELETE /api/notificacao -> cancela uma inscrição (envia { endpoint, tipo })
 */

const { WebPush } = require("web-push");

let inscricoes = []; // em produção, use um banco (Vercel KV, Postgres, etc.)

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

const webpush = new WebPush({
  publicKey: VAPID_PUBLIC_KEY,
  privateKey: VAPID_PRIVATE_KEY,
  email: VAPID_EMAIL,
});

module.exports = async (req, res) => {
  // Permite CORS apenas do próprio domínio em produção
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  }

  if (req.method === "POST") {
    try {
      const inscricao = req.body;
      if (!inscricao || !inscricao.endpoint) {
        return res.status(400).json({ ok: false, erro: "Inscrição inválida." });
      }

      // Evita duplicatas
      const jaExiste = inscricoes.some((i) => i.endpoint === inscricao.endpoint);
      if (!jaExiste) {
        inscricoes.push(inscricao);
      }

      return res.status(201).json({ ok: true, total: inscricoes.length });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) {
        return res.status(400).json({ ok: false, erro: "Endpoint não informado." });
      }
      const antes = inscricoes.length;
      inscricoes = inscricoes.filter((i) => i.endpoint !== endpoint);
      return res.status(200).json({ ok: true, removidos: antes - inscricoes.length, total: inscricoes.length });
    } catch (e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }

  return res.status(405).json({ ok: false, erro: "Método não permitido." });
};
