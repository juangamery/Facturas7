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
