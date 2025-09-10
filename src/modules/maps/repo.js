const { openDatabase, ensureSchema } = require('./db');

class MapsRepo {
  constructor(sqliteFile) {
    this.db = openDatabase(sqliteFile);
    ensureSchema(this.db);
    this._prepare();
  }

  _prepare() {
    this.stmtInsert = this.db.prepare(
      'INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
    );
    this.stmtGet = this.db.prepare(
      'SELECT id, name, version, updated_at, state_json, size_bytes FROM maps WHERE id = ?'
    );
    this.stmtUpdate = this.db.prepare(
      'UPDATE maps SET version = ?, updated_at = ?, state_json = ?, name = ?, size_bytes = ? WHERE id = ? AND version = ?'
    );
    this.stmtList = this.db.prepare(
      'SELECT id, name, version, updated_at, size_bytes FROM maps ORDER BY updated_at DESC LIMIT ? OFFSET ?'
    );
    this.stmtDelete = this.db.prepare('DELETE FROM maps WHERE id = ?');
  }

  list(limit = 50, offset = 0) {
    const rows = this.stmtList.all(limit, offset);
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updated_at,
      sizeBytes: row.size_bytes
    }));
  }

  create({ id, name, version, updatedAt, stateJson, sizeBytes }) {
    this.stmtInsert.run(id, name, version, updatedAt, stateJson, sizeBytes);
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
      stateJson: row.state_json,
      sizeBytes: row.size_bytes
    };
  }

  update({
    id,
    nextVersion,
    updatedAt,
    stateJson,
    name,
    expectedVersion,
    sizeBytes
  }) {
    const info = this.stmtUpdate.run(
      nextVersion,
      updatedAt,
      stateJson,
      name,
      sizeBytes,
      id,
      expectedVersion
    );
    return info.changes; // 1 if updated, 0 if version mismatch
  }

  delete(id) {
    const info = this.stmtDelete.run(id);
    return info.changes; // 1 if deleted, 0 if not found
  }
}

module.exports = MapsRepo;
