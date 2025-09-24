/**
 * Abstract DataProvider Interface for MindMeld Client-Side Data Management
 *
 * This interface defines the contract that all data providers must implement
 * to support MindMeld's offline-first architecture with optional real-time
 * collaboration capabilities.
 *
 * Key Design Principles:
 * - Offline-first: Works without server connection
 * - Idempotent writes: Same operation can be applied multiple times safely
 * - No DOM assumptions: Pure data operations
 * - Normalized change events: Consistent delta format
 * - Markdown-only content: HTML disallowed for security
 *
 * Implementations:
 * - LocalJSONProvider: Offline-first using localStorage (MS-62)
 * - YjsProvider: Real-time collaboration using Y.js and WebSockets (MS-63)
 *
 * @see MS-61: Define DataProvider contract and Y.Doc schema
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 * @see MS-63: Client YjsProvider + y-indexeddb; converters; performance guards
 */

/**
 * Abstract base class defining the DataProvider contract.
 * All concrete implementations must extend this class and implement all methods.
 */
class DataProviderInterface {
  /**
   * Load a mind map by its unique identifier
   *
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<Object>} Promise resolving to map data in MindMeld JSON format
   *   {
   *     n: Array<{i, c, p, color, ...}>, // notes: id, content, position, etc.
   *     c: Array<{id, f, t, type, ...}>, // connections: id, from, to, etc.
   *     meta: {version, created, modified, title, ...}
   *   }
   * @throws {Error} If mapId is invalid or map doesn't exist
   */
  async load(_mapId) {
    throw new Error('Not implemented');
  }

  /**
   * Save a mind map with the given data
   *
   * @param {string} mapId - Unique identifier for the map
   * @param {Object} data - Map data in MindMeld JSON format
   * @param {Object} [options={}] - Save options
   * @param {boolean} [options.autosave=false] - Whether this is an autosave operation
   * @param {boolean} [options.force=false] - Force save even if autosave is paused
   * @param {number} [options.expectedVersion] - Expected version for optimistic locking
   * @returns {Promise<Object>} Promise resolving to save result with updated metadata
   * @throws {Error} If save fails due to validation, conflict, or storage issues
   */
  async save(_mapId, _data, _options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * List available mind maps with metadata
   *
   * @param {Object} [options={}] - List options
   * @param {number} [options.limit] - Maximum number of maps to return
   * @param {number} [options.offset] - Number of maps to skip (pagination)
   * @param {string} [options.sortBy='modified'] - Field to sort by ('created', 'modified', 'title')
   * @param {string} [options.sortOrder='desc'] - Sort order ('asc', 'desc')
   * @returns {Promise<Array>} Promise resolving to array of map metadata
   *   [{id, title, created, modified, version, ...}, ...]
   */
  async list(_options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Delete a mind map permanently
   *
   * @param {string} mapId - Unique identifier for the map to delete
   * @returns {Promise<boolean>} Promise resolving to true if deleted, false if not found
   * @throws {Error} If deletion fails due to storage issues
   */
  async delete(_mapId) {
    throw new Error('Not implemented');
  }

  /**
   * Subscribe to real-time updates for a specific map
   *
   * Note: LocalJSONProvider may implement this as a no-op or local event emitter.
   * YjsProvider should connect to WebSocket for collaborative updates.
   *
   * @param {string} mapId - Unique identifier for the map
   * @param {Function} callback - Function called with update data: (updateData) => void
   * @returns {Promise<void>} Promise resolving when subscription is established
   * @throws {Error} If subscription fails (network issues, invalid mapId, etc.)
   */
  async subscribe(_mapId, _callback) {
    throw new Error('Not implemented');
  }

  /**
   * Unsubscribe from real-time updates for a specific map
   *
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<void>} Promise resolving when unsubscribed
   */
  async unsubscribe(_mapId) {
    throw new Error('Not implemented');
  }

  /**
   * Pause autosave functionality
   *
   * Critical for migration scenarios where we need to prevent
   * automatic saves while converting between storage formats.
   * Manual saves with {force: true} should still work.
   */
  pauseAutosave() {
    throw new Error('Not implemented');
  }

  /**
   * Resume autosave functionality
   *
   * Re-enables automatic saving after migration or other
   * operations that required autosave to be paused.
   */
  resumeAutosave() {
    throw new Error('Not implemented');
  }

  /**
   * Check if the provider is currently online and can sync
   *
   * @returns {boolean} True if online/connected, false if offline
   */
  isOnline() {
    throw new Error('Not implemented');
  }

  // MS-61 Specific Methods - Granular Operations

  /**
   * Initialize provider for a specific map
   *
   * @param {string} mapId - Map identifier
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.serverSync=true] - Enable server synchronization
   * @param {boolean} [options.offlineMode=false] - Start in offline-only mode
   * @returns {Function|Array<Function>} Unsubscribe function(s)
   */
  async init(_mapId, _options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Subscribe to normalized change events
   *
   * @param {Function} onChange - Callback for change events
   *   Receives: { type, payload } where:
   *   - type: 'note'|'connection'|'meta'|'snapshot'
   *   - payload: change delta or compact snapshot hash
   * @returns {Function} Unsubscribe function
   */
  subscribeToChanges(_onChange) {
    throw new Error('Not implemented');
  }

  /**
   * Insert or update a note
   *
   * @param {Object} noteData - Note data
   * @param {string} noteData.id - Unique note identifier
   * @param {string} noteData.content - Markdown content (enforces NOTE_CONTENT_LIMIT)
   * @param {Array<number>} noteData.pos - Position [x, y]
   * @param {string} [noteData.color] - Note color
   * @returns {Promise<void>}
   */
  async upsertNote(_noteData) {
    throw new Error('Not implemented');
  }

  /**
   * Delete a note by ID
   *
   * @param {string} noteId - Note identifier to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteNote(_noteId) {
    throw new Error('Not implemented');
  }

  /**
   * Insert or update a connection
   *
   * @param {Object} connectionData - Connection data
   * @param {string} connectionData.id - Unique connection identifier
   * @param {string} connectionData.from - Source note ID
   * @param {string} connectionData.to - Target note ID
   * @param {string} [connectionData.type='arrow'] - Connection type
   * @returns {Promise<void>}
   */
  async upsertConnection(_connectionData) {
    throw new Error('Not implemented');
  }

  /**
   * Delete a connection by ID
   *
   * @param {string} connectionId - Connection identifier to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteConnection(_connectionId) {
    throw new Error('Not implemented');
  }

  /**
   * Update map metadata
   *
   * @param {Object} metaUpdates - Metadata updates
   * @param {number} [metaUpdates.zoomLevel] - Canvas zoom level
   * @param {string} [metaUpdates.canvasType] - Canvas type identifier
   * @param {string} [metaUpdates.mapName] - Human-readable map name
   * @returns {Promise<void>}
   */
  async setMeta(_metaUpdates) {
    throw new Error('Not implemented');
  }

  /**
   * Get current map data as JSON snapshot
   *
   * @returns {Promise<Object>} Map data { n: notes[], c: connections[], meta }
   */
  async getSnapshot() {
    throw new Error('Not implemented');
  }

  /**
   * Import JSON data, replacing current map contents
   * Suppresses user events during import
   *
   * @param {Object} jsonData - Map data in MindMeld JSON format
   * @param {Object} [options={}] - Import options
   * @param {boolean} [options.merge=false] - Merge instead of replace
   * @returns {Promise<void>}
   */
  async importJSON(_jsonData, _options = {}) {
    throw new Error('Not implemented');
  }

  /**
   * Export current map data as JSON for backup/interchange
   *
   * @returns {Promise<Object>} Map data in MindMeld JSON format
   */
  async exportJSON() {
    throw new Error('Not implemented');
  }

  // Extended interface for advanced features (optional implementation)

  /**
   * Create a new map with initial data
   *
   * @param {Object} [initialData] - Initial map data, defaults to empty map
   * @param {Object} [options={}] - Creation options
   * @param {string} [options.title] - Initial title for the map
   * @returns {Promise<string>} Promise resolving to the new map ID
   */
  async create(initialData = null, options = {}) {
    // Default implementation generates ID and calls save
    const mapId = this.generateMapId();
    const defaultData = initialData || {
      n: [], // notes
      c: [], // connections
      meta: {
        version: 1,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        title: options.title || 'Untitled Map'
      }
    };

    await this.save(mapId, defaultData);
    return mapId;
  }

  /**
   * Check if a map exists without loading its full data
   *
   * @param {string} mapId - Unique identifier for the map
   * @returns {Promise<boolean>} Promise resolving to true if map exists
   */
  async exists(mapId) {
    try {
      const maps = await this.list({ limit: 1000 }); // Reasonable limit
      return maps.some(map => map.id === mapId);
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique map ID
   *
   * Default implementation uses timestamp + random string.
   * Implementations may override for different ID strategies.
   *
   * @returns {string} Unique map identifier
   */
  generateMapId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `map_${timestamp}_${random}`;
  }

  /**
   * Validate map data structure
   *
   * Ensures data conforms to MindMeld JSON format before saving.
   *
   * @param {Object} data - Map data to validate
   * @returns {boolean} True if valid, false otherwise
   */
  validateMapData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required top-level properties (n and c can be missing, will default to empty arrays)
    if (data.meta && typeof data.meta !== 'object') {
      return false;
    }

    // If n (notes) is present, validate structure
    if (data.n && Array.isArray(data.n)) {
      for (const note of data.n) {
        if (
          !note.i || // id is required
          typeof note.c !== 'string' // content is required and must be string
        ) {
          return false;
        }
      }
    }

    // If c (connections) is present, validate structure
    if (data.c && Array.isArray(data.c)) {
      for (const conn of data.c) {
        if (!conn.f || !conn.t) {
          // from and to are required
          return false;
        }
      }
    }

    // Basic validation of meta structure
    if (!data.meta.version || typeof data.meta.version !== 'number') {
      return false;
    }

    return true;
  }
}

module.exports = DataProviderInterface;
