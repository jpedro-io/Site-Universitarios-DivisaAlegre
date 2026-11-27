/*
 * ARQUIVO: lib/db.js - Conexão compartilhada com o Neon (PostgreSQL)
 * Usada pelas funções serverless de notificações (notificacao.js e enviar-notificacao.js)
 * Se o módulo pg não estiver instalado (ex.: produção sem npm install), cai em memória.
 */

let pg = null;
let pgErro = null;
try {
  pg = require("pg");
} catch (e) {
  pgErro = e.message;
}

let pool = null;

function getPool() {
  if (pgErro) throw new Error("Módulo pg não instalado: " + pgErro);
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
  }
  return pool;
}

function bancoDisponivel() {
  return !pgErro && !!process.env.DATABASE_URL;
}

module.exports = { getPool, bancoDisponivel, pgErro };
