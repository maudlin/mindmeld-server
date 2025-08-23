const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openDatabase(sqliteFile) {
  ensureDir(sqliteFile);
  const db = new Database(sqliteFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      state_json TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_maps_updated_at ON maps(updated_at);
  `);

  // Migration: ensure size_bytes exists and is populated
  const columns = db
    .prepare('PRAGMA table_info(maps)')
    .all()
    .map(r => r.name);
  if (!columns.includes('size_bytes')) {
    db.exec(
      'ALTER TABLE maps ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0'
    );
    // Populate existing rows
    db.exec(
      'UPDATE maps SET size_bytes = length(state_json) WHERE size_bytes = 0 OR size_bytes IS NULL'
    );
  }
}

module.exports = { openDatabase, ensureSchema };
