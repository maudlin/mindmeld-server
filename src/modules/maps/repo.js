const { openDatabase, ensureSchema } = require('./db');

class MapsRepo {
  constructor(sqliteFile) {
    this.db = openDatabase(sqliteFile);
    ensureSchema(this.db);
    this._prepare();
  }

  _prepare() {
    this.stmtInsert = this.db.prepare(
      'INSERT INTO maps (id, name, version, updated_at, state_json) VALUES (?, ?, ?, ?, ?)'
    );
    this.stmtGet = this.db.prepare(
      'SELECT id, name, version, updated_at, state_json FROM maps WHERE id = ?'
    );
    this.stmtUpdate = this.db.prepare(
      'UPDATE maps SET version = ?, updated_at = ?, state_json = ?, name = ? WHERE id = ? AND version = ?'
    );
    this.stmtList = this.db.prepare(
      'SELECT id, name, updated_at FROM maps ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    );
  }

  list(limit = 50, offset = 0) {
    return this.stmtList.all(limit, offset);
  }

  create({ id, name, version, updatedAt, stateJson }) {
    this.stmtInsert.run(id, name, version, updatedAt, stateJson);
    return { id, version, updatedAt };
  }

  get(id) {
    const row = this.stmtGet.get(id);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updated_at,
      stateJson: row.state_json
    };
  }

  update({ id, nextVersion, updatedAt, stateJson, name, expectedVersion }) {
    const info = this.stmtUpdate.run(
      nextVersion,
      updatedAt,
      stateJson,
      name,
      id,
      expectedVersion
    );
    return info.changes; // 1 if updated, 0 if version mismatch
  }
}

module.exports = MapsRepo;
