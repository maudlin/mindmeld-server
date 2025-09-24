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

  // Try WAL mode first for better performance, but fall back to DELETE mode
  // if WAL fails (common in CI environments with restricted filesystems)
  try {
    db.pragma('journal_mode = WAL');
  } catch (error) {
    // WAL mode failed - likely due to filesystem limitations in CI
    console.warn(
      'WAL mode failed, falling back to DELETE journal mode:',
      error.message,
    );
    db.pragma('journal_mode = DELETE');
  }

  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS yjs_snapshots (
      map_id TEXT PRIMARY KEY,
      snapshot_data BLOB NOT NULL,
      updated_at TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_yjs_snapshots_updated_at ON yjs_snapshots(updated_at);
  `);

  // Migration: ensure size_bytes exists and is populated
  const columns = db
    .prepare('PRAGMA table_info(yjs_snapshots)')
    .all()
    .map((r) => r.name);
  if (!columns.includes('size_bytes')) {
    db.exec(
      'ALTER TABLE yjs_snapshots ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0',
    );
    // Populate existing rows
    db.exec(
      'UPDATE yjs_snapshots SET size_bytes = length(snapshot_data) WHERE size_bytes = 0 OR size_bytes IS NULL',
    );
  }
}

module.exports = { openDatabase, ensureSchema };
