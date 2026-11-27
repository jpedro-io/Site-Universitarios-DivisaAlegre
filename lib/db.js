/*
 * ARQUIVO: lib/db.js - Conexão compartilhada com o Neon (PostgreSQL)
 * Totalmente defensivo: nunca lança exceção no require, apenas ao conectar.
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
  if (!pg) {
    throw new Error("Módulo pg não instalado: " + (pgErro || "desconhecido"));
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

function bancoDisponivel() {
  return !!pg && !!process.env.DATABASE_URL;
}

module.exports = { getPool, bancoDisponivel, pgErro };
