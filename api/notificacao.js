/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Totalmente autônomo: nenhuma dependência externa que possa quebrar o module load.
 *
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * POST /api/notificacao   -> registra inscrição (PushSubscription) em memória
 * DELETE /api/notificacao -> cancela inscrição
 */

let inscricoesMemoria = [];

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

function lerRawBody(req) {
  return new Promise((resolve, reject) => {
    const pedaços = [];
    req.on("data", (pedaço) => pedaços.push(pedaço));
    req.on("end", () => resolve(Buffer.concat(pedaços).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseBody(req) {
  // Sempre ler o raw body do stream como fonte da verdade.
  // O req.body do @vercel-node pode chegar truncado ou vazio.
  try {
    const cru = await lerRawBody(req);
    if (!cru || cru.trim().length === 0) return {};
    return JSON.parse(cru);
  } catch (e) {
    return {};
  }
}

module.exports = async (req, res) => {
  try {
    return await handler(req, res);
  } catch (e) {
    console.error("[notificacao] erro nao capturado:", e.message);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({ ok: false, erro: "Erro interno." });
  }
};

async function handler(req, res) {
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
      const inscricao = await parseBody(req);
      if (!inscricao || !inscricao.endpoint) {
        return res.status(400).json({
          ok: false,
          erro: "Inscrição inválida. endpoint não recebido.",
          debug: { bodyRecebido: typeof inscricao === "object" ? Object.keys(inscricao) : typeof inscricao },
        });
      }

      const jaExiste = inscricoesMemoria.some((i) => i.endpoint === inscricao.endpoint);
      if (!jaExiste) {
        inscricoesMemoria.push({
          endpoint: inscricao.endpoint,
          tipo: inscricao.tipo || "geral",
          keys: inscricao.keys || {},
        });
      }

      return res.status(201).json({ ok: true, total: inscricoesMemoria.length });
    } catch (e) {
      console.error("[notificacao] erro POST:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao registrar inscrição." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const corpo = await parseBody(req);
      const { endpoint } = corpo || {};
      if (!endpoint) {
        return res.status(400).json({ ok: false, erro: "Endpoint não informado." });
      }

      const antes = inscricoesMemoria.length;
      inscricoesMemoria = inscricoesMemoria.filter((i) => i.endpoint !== endpoint);
      return res.status(200).json({ ok: true, removidos: antes - inscricoesMemoria.length });
    } catch (e) {
      console.error("[notificacao] erro DELETE:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao cancelar inscrição." });
    }
  }

  return res.status(405).json({ ok: false, erro: "Método não permitido." });
}
