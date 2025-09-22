const { openDatabase, ensureSchema } = require('./db');

/**
 * YjsPersistence - Handles Y.Doc snapshot persistence to SQLite
 *
 * Implements the persistence layer for Yjs documents as specified in MS-60:
 * - Snapshot-on-interval and snapshot-on-idle policies
 * - Binary Y.Doc update storage as BLOBs
 * - Efficient retrieval for document hydration
 */
class YjsPersistence {
  constructor(dbFile) {
    this.db = openDatabase(dbFile);
    ensureSchema(this.db);

    // Prepare statements for better performance
    this.statements = {
      saveSnapshot: this.db.prepare(`
        INSERT OR REPLACE INTO yjs_snapshots (map_id, snapshot_data, updated_at, size_bytes)
        VALUES (?, ?, ?, ?)
      `),
      getSnapshot: this.db.prepare(`
        SELECT snapshot_data FROM yjs_snapshots WHERE map_id = ?
      `),
      deleteSnapshot: this.db.prepare(`
        DELETE FROM yjs_snapshots WHERE map_id = ?
      `),
      listSnapshots: this.db.prepare(`
        SELECT map_id, size_bytes, updated_at 
        FROM yjs_snapshots 
        ORDER BY map_id
      `),
      getSnapshotInfo: this.db.prepare(`
        SELECT map_id, size_bytes, updated_at 
        FROM yjs_snapshots 
        WHERE map_id = ?
      `)
    };
  }

  /**
   * Save a Y.Doc snapshot to the database
   * @param {string} mapId - Unique identifier for the map
   * @param {Uint8Array} snapshot - Y.Doc state as binary update
   * @returns {Promise<void>}
   */
  async saveSnapshot(mapId, snapshot) {
    if (!mapId || typeof mapId !== 'string') {
      throw new Error('mapId must be a non-empty string');
    }

    if (!snapshot || !(snapshot instanceof Uint8Array)) {
      throw new Error('snapshot must be a Uint8Array');
    }

    const updatedAt = new Date().toISOString();
    const sizeBytes = snapshot.byteLength;

    // Convert Uint8Array to Buffer for SQLite BLOB storage
    const buffer = Buffer.from(snapshot);

    this.statements.saveSnapshot.run(mapId, buffer, updatedAt, sizeBytes);
  }

  /**
   * Retrieve a Y.Doc snapshot from the database
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<Uint8Array|null>} Y.Doc state as binary update, or null if not found
   */
  async getSnapshot(mapId) {
    if (!mapId || typeof mapId !== 'string') {
      return null;
    }

    const result = this.statements.getSnapshot.get(mapId);

    if (!result || !result.snapshot_data) {
      return null;
    }

    // Convert Buffer back to Uint8Array
    return new Uint8Array(result.snapshot_data);
  }

  /**
   * Delete a Y.Doc snapshot from the database
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<boolean>} true if a snapshot was deleted, false if none existed
   */
  async deleteSnapshot(mapId) {
    if (!mapId || typeof mapId !== 'string') {
      return false;
    }

    const result = this.statements.deleteSnapshot.run(mapId);
    return result.changes > 0;
  }

  /**
   * List all snapshots with metadata
   * @returns {Promise<Array<{mapId: string, sizeBytes: number, updatedAt: string}>>}
   */
  async listSnapshots() {
    const results = this.statements.listSnapshots.all();

    return results.map(row => ({
      mapId: row.map_id,
      sizeBytes: row.size_bytes,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get snapshot metadata without retrieving the actual data
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<{mapId: string, sizeBytes: number, updatedAt: string}|null>}
   */
  async getSnapshotInfo(mapId) {
    if (!mapId || typeof mapId !== 'string') {
      return null;
    }

    const result = this.statements.getSnapshotInfo.get(mapId);

    if (!result) {
      return null;
    }

    return {
      mapId: result.map_id,
      sizeBytes: result.size_bytes,
      updatedAt: result.updated_at
    };
  }

  /**
   * Close the database connection
   * Should be called when shutting down the server
   */
  close() {
    this.db.close();
  }

  /**
   * Check if a snapshot exists for the given mapId
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<boolean>}
   */
  async hasSnapshot(mapId) {
    const info = await this.getSnapshotInfo(mapId);
    return info !== null;
  }

  /**
   * Get database statistics
   * @returns {Promise<{totalSnapshots: number, totalSize: number}>}
   */
  async getStats() {
    const result = this.db
      .prepare(
        'SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_size FROM yjs_snapshots'
      )
      .get();

    return {
      totalSnapshots: result.count,
      totalSize: result.total_size
    };
  }
}

module.exports = YjsPersistence;
