import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data.db');

let db = null;

export function getLocalDB() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
  }
  return db;
}
