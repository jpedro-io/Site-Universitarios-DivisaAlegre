/*
 * ARQUIVO: lib/db.js - Conexão compartilhada com o Neon (PostgreSQL)
 * Usada pelas funções serverless de notificações (notificacao.js e enviar-notificacao.js)
 */

const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
  }
  return pool;
}

module.exports = { getPool };
