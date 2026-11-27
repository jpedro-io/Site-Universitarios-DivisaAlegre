/*
 * ARQUIVO: lib/db.js  -  Pool Neon PostgreSQL totalmente defensivo
 * Nunca importa nada no module load que possa quebrar o Vercel.
 * Todas as operações acontecem dentro do handler, com try/catch.
 */

let pool = null;
let pg = null;
let pgErro = null;

function tentarCarregarPg() {
  if (pg !== undefined || pgErro) return;
  try {
    // eslint-disable-next-line
    pg = require("pg");
  } catch (e) {
    pg = null;
    pgErro = e.message;
  }
}

function getPool() {
  tentarCarregarPg();
  if (!pg) return null;
  if (pool) return pool;

  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    return pool;
  } catch (e) {
    pool = null;
    return null;
  }
}

function bancoDisponivel() {
  return getPool() !== null;
}

async function listarInscricoes() {
  const p = getPool();
  if (!p) return [];

  try {
    const { rows } = await p.query(
      "SELECT endpoint, tipo, keys_json FROM inscricoes ORDER BY created_at DESC"
    );
    return rows.map((r) => ({
      endpoint: r.endpoint,
      tipo: r.tipo || "geral",
      keys: r.keys_json ? JSON.parse(r.keys_json) : {},
    }));
  } catch (e) {
    console.error("[db] erro ao listar inscricoes:", e.message);
    return [];
  }
}

async function inserirInscricao(endpoint, tipo, keysJson) {
  const p = getPool();
  if (!p) return false;

  try {
    await p.query(
      "INSERT INTO inscricoes (endpoint, tipo, keys_json) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO NOTHING",
      [endpoint, tipo, keysJson]
    );
    return true;
  } catch (e) {
    console.error("[db] erro ao inserir inscricao:", e.message);
    return false;
  }
}

async function removerInscricao(endpoint) {
  const p = getPool();
  if (!p) return false;

  try {
    await p.query("DELETE FROM inscricoes WHERE endpoint = $1", [endpoint]);
    return true;
  } catch (e) {
    console.error("[db] erro ao remover inscricao:", e.message);
    return false;
  }
}

module.exports = {
  getPool,
  bancoDisponivel,
  listarInscricoes,
  inserirInscricao,
  removerInscricao,
  pgErro,
};
