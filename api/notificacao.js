/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Gerencia inscrições para notificações push (VAPID) usando Neon (PostgreSQL).
 *
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * POST /api/notificacao   -> registra uma inscrição (PushSubscription)
 * DELETE /api/notificacao -> cancela uma inscrição (envia { endpoint, tipo })
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  }

  const pool = getPool();

  if (req.method === "POST") {
    try {
      const inscricao = req.body;
      if (!inscricao || !inscricao.endpoint) {
        return res.status(400).json({ ok: false, erro: "Inscrição inválida." });
      }

      const { endpoint } = inscricao;
      const tipo = inscricao.tipo || "geral";
      const keys_json = inscricao.keys || {};

      try {
        const cliente = await pool.connect();
        try {
          const existe = await cliente.query(
            "SELECT 1 FROM inscricoes WHERE endpoint = $1",
            [endpoint]
          );
          if (existe.rowCount > 0) {
            await cliente.query(
              "UPDATE inscricoes SET tipo = $2, keys_json = $3 WHERE endpoint = $1",
              [endpoint, tipo, JSON.stringify(keys_json)]
            );
          } else {
            await cliente.query(
              "INSERT INTO inscricoes (endpoint, tipo, keys_json) VALUES ($1, $2, $3)",
              [endpoint, tipo, JSON.stringify(keys_json)]
            );
          }
        } finally {
          cliente.release();
        }
      } catch (dbErr) {
        console.warn("[db] falhou ao gravar, usando cache em memória:", dbErr.message);
        const jaExiste = inscricoesCache.some((i) => i.endpoint === endpoint);
        if (!jaExiste) {
          inscricoesCache.push({ ...inscricao, tipo });
        }
      }

      // Retorna total (banco ou cache)
      let total;
      try {
        const cliente = await pool.connect();
        try {
          const r = await cliente.query("SELECT COUNT(*) AS total FROM inscricoes");
          total = Number(r.rows[0].total);
        } finally {
          cliente.release();
        }
      } catch (e) {
        total = inscricoesCache.length;
      }

      return res.status(201).json({ ok: true, total });
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

      try {
        const cliente = await pool.connect();
        try {
          const r = await cliente.query(
            "DELETE FROM inscricoes WHERE endpoint = $1",
            [endpoint]
          );
          inscricoesCache = inscricoesCache.filter((i) => i.endpoint !== endpoint);
          return res.status(200).json({
            ok: true,
            removidos: r.rowCount,
            total: inscricoesCache.length,
          });
        } finally {
          cliente.release();
        }
      } catch (dbErr) {
        console.warn("[db] falhou ao deletar, usando cache em memória:", dbErr.message);
        const antes = inscricoesCache.length;
        inscricoesCache = inscricoesCache.filter((i) => i.endpoint !== endpoint);
        return res.status(200).json({
          ok: true,
          removidos: antes - inscricoesCache.length,
          total: inscricoesCache.length,
        });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }

  return res.status(405).json({ ok: false, erro: "Método não permitido." });
};
