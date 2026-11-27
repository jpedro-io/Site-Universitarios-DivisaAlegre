/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Inscrições push compartilhadas via Neon PostgreSQL com /api/enviar-notificacao.
 * Nenhuma importação externa no module load que possa quebrar o Vercel.
 *
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * POST /api/notificacao   -> registra inscrição (PushSubscription)
 * DELETE /api/notificacao -> cancela inscrição
 */

let inscricoesMemoria = []; // fallback se o Neon estiver indisponível

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

const db = require("../lib/db");

function lerRawBody(req) {
  return new Promise((resolve, reject) => {
    const pedacos = [];
    req.on("data", (pedaco) => pedacos.push(pedaco));
    req.on("end", () => resolve(Buffer.concat(pedacos).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseBody(req) {
  try {
    const cru = await lerRawBody(req);
    if (cru && cru.trim().length > 0) {
      return JSON.parse(cru);
    }
  } catch (e) {
    // ignora, tenta abaixo
  }
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (req.body && typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
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
          debug: {
            bodyRecebido: inscricao && typeof inscricao === "object" ? Object.keys(inscricao) : typeof inscricao,
            corpoBruto: inscricao && typeof inscricao === "object" ? JSON.stringify(inscricao).slice(0, 500) : String(inscricao),
          },
        });
      }

      const gravou = await db.inserirInscricao(
        inscricao.endpoint,
        inscricao.tipo || "geral",
        inscricao.keys ? JSON.stringify(inscricao.keys) : "{}"
      );

      if (gravou) {
        return res.status(201).json({ ok: true });
      }

      // Neon indisponível: grava em memória local (apenas para leitura desta função)
      const jaExiste = inscricoesMemoria.some((i) => i.endpoint === inscricao.endpoint);
      if (!jaExiste) {
        inscricoesMemoria.push({
          endpoint: inscricao.endpoint,
          tipo: inscricao.tipo || "geral",
          keys: inscricao.keys || {},
        });
      }
      return res.status(201).json({ ok: true });
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

      await db.removerInscricao(endpoint);
      inscricoesMemoria = inscricoesMemoria.filter((i) => i.endpoint !== endpoint);
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[notificacao] erro DELETE:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao cancelar inscrição." });
    }
  }

  return res.status(405).json({ ok: false, erro: "Método não permitido." });
}
