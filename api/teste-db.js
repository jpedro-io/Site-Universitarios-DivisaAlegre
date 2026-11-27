/*
 * ARQUIVO: api/teste-db.js - Diagnóstico da conexão com Neon
 * Acesse /api/teste-db para verificar se o banco está acessível.
 */

const { bancoDisponivel, pgErro, getPool } = require("../lib/db");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

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
        info.totalInscricoes = Number(r.rows[0].total);
        info.conectou = true;
      } finally {
        cliente.release();
      }
    } catch (e) {
      info.conectou = false;
      info.erroConexao = e.message;
    }
  }

  return res.status(200).json(info);
};
