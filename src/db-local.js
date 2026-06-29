import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data.db');
const require = createRequire(import.meta.url);

let db = null;
let initialized = false;

export function initLocalDB() {
  if (initialized) return;

  try {
    logger.info(`📦 Opening SQLite: ${dbPath}`);
    const Database = require('better-sqlite3');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    logger.info('✅ SQLite connected');

    // Create tables
    logger.info('Creating tables...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY,
        numero_telefono TEXT,
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
    logger.info('✅ Tables created');
    initialized = true;

  } catch (error) {
    logger.error(`❌ SQLite init error: ${error.message}`);
    throw error;
  }
}

export function getLocalDB() {
  if (!db) {
    logger.error('❌ SQLite not initialized - call initLocalDB() first');
    throw new Error('SQLite not initialized');
  }
  return db;
}
