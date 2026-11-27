/*
 * ARQUIVO: api/notificacao.js  -  Função serverless do Vercel
 * Totalmente defensivo: nenhuma dependencia externa que possa quebrar o modulo.
 *
 * GET  /api/notificacao   -> retorna a chave pública VAPID
 * GET  /api/notificacao?debug=1 -> diagnostico (sem Neon por enquanto)
 * POST /api/notificacao   -> registra inscricao (PushSubscription) em memoria
 * DELETE /api/notificacao -> cancela inscricao
 */

const webpush = require("web-push");

let inscricoesMemoria = [];
let debugInfo = {
  moduloCarregado: true,
  webPushOk: !!webpush,
  pgNaoUsado: true,
  vapidConfigurado: false,
  erroVapid: null,
};

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:contato@example.com";

// Protege o setVapidDetails para nao derrubar o carregamento do modulo
try {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  debugInfo.vapidConfigurado = !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;
} catch (e) {
  debugInfo.erroVapid = e.message;
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

  const debug = req.query && req.query.debug === "1";

  if (req.method === "GET") {
    if (debug) {
      return res.status(200).json({
        ...debugInfo,
        bancoDisponivel: false,
        mensagem: "Usando cache em memoria (sem Neon). Inscoes nao persistem entre reinicializacoes serverless.",
      });
    }
    return res.status(200).json({ publicKey: VAPID_PUBLIC_KEY });
  }

  if (req.method === "POST") {
    try {
      const inscricao = req.body;
      if (!inscricao || !inscricao.endpoint) {
        return res.status(400).json({ ok: false, erro: "Inscrição inválida." });
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
      return res.status(500).json({ ok: false, erro: "Erro ao registrar inscricao." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) {
        return res.status(400).json({ ok: false, erro: "Endpoint não informado." });
      }

      const antes = inscricoesMemoria.length;
      inscricoesMemoria = inscricoesMemoria.filter((i) => i.endpoint !== endpoint);
      return res.status(200).json({ ok: true, removidos: antes - inscricoesMemoria.length });
    } catch (e) {
      console.error("[notificacao] erro DELETE:", e.message);
      return res.status(500).json({ ok: false, erro: "Erro ao cancelar inscricao." });
    }
  }

  return res.status(405).json({ ok: false, erro: "Metodo nao permitido." });
}
