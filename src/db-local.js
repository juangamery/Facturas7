import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data.db');
const require = createRequire(import.meta.url);

let db = null;

async function initDB() {
  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    // Create tables if not exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY,
        numero_telefono TEXT UNIQUE,
        nombre TEXT,
        plan TEXT DEFAULT 'basico',
        activo INTEGER DEFAULT 1,
        fecha_registro INTEGER,
        fecha_vencimiento INTEGER
      );

      CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER,
        numero_factura TEXT,
        creado_en INTEGER,
        pdf_path TEXT
      );
    `);

    logger.info('✅ Local SQLite OK');
    return db;
  } catch (error) {
    logger.warn(`SQLite unavailable: ${error.message}`);
    return null;
  }
}

export function getLocalDB() {
  if (db) return db;
  return createStubDB();
}

export function initLocalDB() {
  return initDB();
}

function createStubDB() {
  return {
    prepare: (sql) => ({
      get: () => ({ count: 0 }),
      all: () => []
    })
  };
}
