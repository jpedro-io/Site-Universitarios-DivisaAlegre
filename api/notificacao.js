/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Totalmente autônomo e defensivo: nunca lança exceção não capturada.
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * GET  /api/notificacao?debug=1 -> diagnostico do Neon
 * POST /api/notificacao   -> registra inscrição (PushSubscription)
 * DELETE /api/notificacao -> cancela inscrição
 */

const { WebPush } = require("web-push");

let inscricoesMemoria = [];
let pgModulo = null;
let pgErro = null;
try {
  pgModulo = require("pg");
} catch (e) {
  pgErro = e.message;
}

let pool = null;
function getPool() {
  if (!pgModulo) throw new Error("pg nao instalado: " + (pgErro || "desconhecido"));
  if (!pool) {
    pool = new pgModulo.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}
function bancoDisponivel() {
  return !!pgModulo && !!process.env.DATABASE_URL;
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

const webpush = new WebPush({
  publicKey: VAPID_PUBLIC_KEY,
  privateKey: VAPID_PRIVATE_KEY,
  email: VAPID_EMAIL,
});

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

  const debug = req.query && req.query.debug === "1";

  if (req.method === "GET") {
    if (debug) {
      const info = {
        bancoDisponivel: bancoDisponivel(),
        pgErro: pgErro || null,
        temDatabaseUrl: !!process.env.DATABASE_URL,
      };
      if (bancoDisponivel()) {
        try {
          const cliente = await getPool().connect();
          try {
            const r = await cliente.query("SELECT COUNT(*) AS total FROM inscricoes");
            info.conectou = true;
            info.totalInscricoes = Number(r.rows[0].total);
          } finally {
            cliente.release();
          }
        } catch (e) {
          info.conectou = false;
          info.erroConexao = e.message;
        }
      }
      return res.status(200).json(info);
    }
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  }

  if (req.method === "POST") {
    try {
      const inscricao = req.body;
      if (!inscricao || !inscricao.endpoint) {
        return res.status(400).json({ ok: false, erro: "Inscrição inválida." });
      }
      const total = await gravarInscrição(inscricao.endpoint, inscricao.tipo || "geral", inscricao.keys || {});
      return res.status(201).json({ ok: true, total });
    } catch (e) {
      console.error("[notificacao] erro POST:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao registrar inscrição." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) {
        return res.status(400).json({ ok: false, erro: "Endpoint não informado." });
      }
      const removidos = await removerInscrição(endpoint);
      return res.status(200).json({ ok: true, removidos });
    } catch (e) {
      console.error("[notificacao] erro DELETE:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao cancelar inscrição." });
    }
  }

  return res.status(405).json({ ok: false, erro: "Método não permitido." });
}

async function gravarInscrição(endpoint, tipo, keys_json) {
  if (bancoDisponivel()) {
    try {
      const cliente = await getPool().connect();
      try {
        const existe = await cliente.query("SELECT 1 FROM inscricoes WHERE endpoint = $1", [endpoint]);
        if (existe.rowCount > 0) {
          await cliente.query("UPDATE inscricoes SET tipo = $2, keys_json = $3 WHERE endpoint = $1", [endpoint, tipo, JSON.stringify(keys_json)]);
        } else {
          await cliente.query("INSERT INTO inscricoes (endpoint, tipo, keys_json) VALUES ($1, $2, $3)", [endpoint, tipo, JSON.stringify(keys_json)]);
        }
        const r = await cliente.query("SELECT COUNT(*) AS total FROM inscricoes");
        return Number(r.rows[0].total);
      } finally {
        cliente.release();
      }
    } catch (dbErr) {
      console.warn("[db] falhou ao gravar, usando memória:", dbErr.message);
    }
  } else {
    console.warn("[db] banco indisponível (" + (pgErro || "sem DATABASE_URL") + "), usando memória");
  }

  const jaExiste = inscricoesMemoria.some((i) => i.endpoint === endpoint);
  if (!jaExiste) {
    inscricoesMemoria.push({ endpoint, tipo, keys: keys_json });
  }
  return inscricoesMemoria.length;
}

async function removerInscrição(endpoint) {
  if (bancoDisponivel()) {
    try {
      const cliente = await getPool().connect();
      try {
        const r = await cliente.query("DELETE FROM inscricoes WHERE endpoint = $1", [endpoint]);
        return r.rowCount;
      } finally {
        cliente.release();
      }
    } catch (dbErr) {
      console.warn("[db] falhou ao deletar, usando memória:", dbErr.message);
    }
  }

  const antes = inscricoesMemoria.length;
  inscricoesMemoria = inscricoesMemoria.filter((i) => i.endpoint !== endpoint);
  return antes - inscricoesMemoria.length;
}
