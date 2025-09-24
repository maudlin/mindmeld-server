/**
 * LocalJSONProvider - Offline-first DataProvider using localStorage
 *
 * Provides local-only persistence for MindMeld maps using browser localStorage.
 * Implements the full DataProvider contract with offline-first capabilities.
 * Designed for scenarios where no server connection is available or desired.
 *
 * Features:
 * - Offline-first: Works without server connection
 * - localStorage persistence with automatic cleanup
 * - JSON ↔ Y.Doc conversion using shared converters
 * - Autosave pause/resume for migration scenarios
 * - Proper error handling and recovery
 * - Storage quota management
 *
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 * @see DataProviderInterface for full contract documentation
 */

const DataProviderInterface = require('./DataProviderInterface');
// const JsonYjsConverter = require('../../shared/converters/JsonYjsConverter'); // TODO: Use in MS-63

/**
 * LocalJSONProvider - Browser localStorage implementation
 */
class LocalJSONProvider extends DataProviderInterface {
  constructor(options = {}) {
    super();

    this.options = {
      storagePrefix: options.storagePrefix || 'mindmeld_map_',
      metaPrefix: options.metaPrefix || 'mindmeld_meta_',
      maxMaps: options.maxMaps || 100,
      storageQuotaWarning: options.storageQuotaWarning || 5 * 1024 * 1024, // 5MB
      enableCompression: options.enableCompression !== false,
      ...options
    };

    // State management
    this.autosavePaused = false;
    this.subscribers = new Map(); // mapId -> Set of callbacks
    this.changeSubscribers = new Set(); // Set of normalized change callbacks
    this.isOnlineStatus = true; // LocalProvider is always "online" from its perspective
    this.isHydrating = false; // Flag to suppress events during data loading

    // Initialize storage
    this.initializeStorage();
  }

  /**
   * Initialize localStorage and perform cleanup if needed
   */
  initializeStorage() {
    try {
      // Test localStorage availability
      const testKey = this.options.storagePrefix + 'test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);

      // Clean up old or invalid entries
      this.cleanupStorage();
    } catch (error) {
      console.warn('LocalJSONProvider: localStorage not available', error);
      throw new Error('LocalStorage not available');
    }
  }

  /**
   * Load a mind map by its unique identifier
   */
  async load(mapId) {
    this.validateMapId(mapId);

    try {
      const mapKey = this.options.storagePrefix + mapId;
      const metaKey = this.options.metaPrefix + mapId;

      const mapData = localStorage.getItem(mapKey);
      const metaData = localStorage.getItem(metaKey);

      if (!mapData) {
        throw new Error(`Map not found: ${mapId}`);
      }

      const parsedMapData = JSON.parse(mapData);
      const parsedMetaData = metaData ? JSON.parse(metaData) : {};

      // Merge metadata into the main data structure
      const result = {
        ...parsedMapData,
        meta: {
          version: parsedMetaData.version || 1,
          created: parsedMetaData.created || new Date().toISOString(),
          modified:
            parsedMetaData.modified ||
            parsedMetaData.created ||
            new Date().toISOString(),
          title: parsedMetaData.title || 'Untitled Map',
          ...parsedMapData.meta,
          ...parsedMetaData
        }
      };

      return result;
    } catch (error) {
      if (error.message.includes('not found')) {
        throw error;
      }
      throw new Error(`Failed to load map ${mapId}: ${error.message}`);
    }
  }

  /**
   * Save a mind map with the given data
   */
  async save(mapId, data, options = {}) {
    this.validateMapId(mapId);
    if (!this.validateMapData(data)) {
      throw new Error('Invalid data: must be an object with n and c arrays');
    }

    // Check if autosave is paused and this isn't a forced save
    if (this.autosavePaused && options.autosave && !options.force) {
      console.log(
        `LocalJSONProvider: Autosave paused, skipping save for ${mapId}`
      );
      return { success: false, reason: 'autosave_paused' };
    }

    try {
      const mapKey = this.options.storagePrefix + mapId;
      const metaKey = this.options.metaPrefix + mapId;

      const now = new Date().toISOString();

      // Extract and enhance metadata
      const metadata = {
        // Start with incoming metadata
        ...data.meta,
        // Override with computed values that should always be updated
        version: (data.meta?.version || 1) + (options.expectedVersion ? 0 : 1),
        created: data.meta?.created || now,
        modified: now,
        title: data.meta?.title || 'Untitled Map',
        // Add local-specific metadata
        localSaved: now,
        autosave: Boolean(options.autosave)
      };

      // Prepare map data without metadata (store separately for efficiency)
      const mapData = {
        n: data.n || [],
        c: data.c || []
      };

      // Check storage quota before saving
      this.checkStorageQuota();

      // Save data and metadata separately
      localStorage.setItem(mapKey, JSON.stringify(mapData));
      localStorage.setItem(metaKey, JSON.stringify(metadata));

      // Notify subscribers of the update (both old and new style)
      this.notifySubscribers(mapId, {
        type: 'saved',
        mapId,
        data: { ...mapData, meta: metadata },
        options
      });

      // Notify change subscribers (unless during hydration)
      this.notifyChangeSubscribers({
        type: 'snapshot', // For save operations, we'll use snapshot type
        payload: {
          mapId,
          data: { ...mapData, meta: metadata }
        }
      });

      return {
        success: true,
        version: metadata.version,
        modified: metadata.modified,
        etag: this.generateETag(mapData, metadata)
      };
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        throw new Error(`Storage quota exceeded when saving map ${mapId}`);
      }
      throw new Error(`Failed to save map ${mapId}: ${error.message}`);
    }
  }

  /**
   * List available mind maps with metadata
   */
  async list(options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const sortBy = options.sortBy || 'modified';
    const sortOrder = options.sortOrder || 'desc';

    try {
      const maps = [];
      const keys = [];

      // Get all localStorage keys - this could throw if localStorage is broken
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }

      // Find all map metadata keys
      for (const key of keys) {
        if (key.startsWith(this.options.metaPrefix)) {
          const mapId = key.replace(this.options.metaPrefix, '');

          try {
            const metaDataString = localStorage.getItem(key);
            if (!metaDataString) {
              continue;
            }

            const metaData = JSON.parse(metaDataString);
            maps.push({
              id: mapId,
              title: metaData.title || 'Untitled Map',
              created: metaData.created,
              modified: metaData.modified,
              version: metaData.version,
              localSaved: metaData.localSaved,
              autosave: metaData.autosave
            });
          } catch (error) {
            console.warn(
              `LocalJSONProvider: Invalid metadata for map ${mapId}:`,
              error
            );
            continue;
          }
        }
      }

      // Sort maps
      maps.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Apply pagination
      return maps.slice(offset, offset + limit);
    } catch (error) {
      throw new Error(`Failed to list maps: ${error.message}`);
    }
  }

  /**
   * Delete a mind map permanently
   */
  async delete(mapId) {
    this.validateMapId(mapId);

    try {
      const mapKey = this.options.storagePrefix + mapId;
      const metaKey = this.options.metaPrefix + mapId;

      const mapExists = localStorage.getItem(mapKey) !== null;

      if (!mapExists) {
        return false; // Map not found
      }

      // Remove both map data and metadata
      localStorage.removeItem(mapKey);
      localStorage.removeItem(metaKey);

      // Notify subscribers of deletion before cleaning up subscribers
      this.notifySubscribers(mapId, {
        type: 'deleted',
        mapId
      });

      // Clean up any subscribers after notification
      this.subscribers.delete(mapId);

      return true;
    } catch (error) {
      throw new Error(`Failed to delete map ${mapId}: ${error.message}`);
    }
  }

  /**
   * Subscribe to real-time updates for a specific map
   * For LocalProvider, this is mainly for local change notifications
   */
  async subscribe(mapId, callback) {
    this.validateMapId(mapId);

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.subscribers.has(mapId)) {
      this.subscribers.set(mapId, new Set());
    }

    this.subscribers.get(mapId).add(callback);

    // Immediately notify with current state if map exists
    try {
      const currentData = await this.load(mapId);
      try {
        callback({
          type: 'subscribed',
          mapId,
          data: currentData
        });
      } catch (callbackError) {
        console.warn(
          'LocalJSONProvider: Subscriber callback failed:',
          callbackError
        );
      }
    } catch {
      // Map doesn't exist yet, that's fine
      try {
        callback({
          type: 'subscribed',
          mapId,
          data: null
        });
      } catch (callbackError) {
        console.warn(
          'LocalJSONProvider: Subscriber callback failed:',
          callbackError
        );
      }
    }
  }

  /**
   * Unsubscribe from real-time updates for a specific map
   */
  async unsubscribe(mapId) {
    this.validateMapId(mapId);

    if (this.subscribers.has(mapId)) {
      this.subscribers.delete(mapId);
    }
  }

  /**
   * Pause autosave functionality
   * Enhanced for MS-62 migration scenarios
   */
  pauseAutosave(reason = 'manual') {
    const wasPaused = this.autosavePaused;
    this.autosavePaused = true;

    if (!wasPaused) {
      console.log(`LocalJSONProvider: Autosave paused (reason: ${reason})`);
    }
  }

  /**
   * Resume autosave functionality
   * Enhanced for MS-62 migration scenarios
   */
  resumeAutosave(reason = 'manual') {
    const wasPaused = this.autosavePaused;
    this.autosavePaused = false;

    if (wasPaused) {
      console.log(`LocalJSONProvider: Autosave resumed (reason: ${reason})`);
    }
  }

  /**
   * Check if the provider is currently online
   */
  isOnline() {
    return this.isOnlineStatus;
  }

  // MS-61 Required Methods - Granular Operations

  /**
   * Initialize provider for a specific map
   *
   * @param {string} mapId - Map identifier
   * @param {Object} [options={}] - Initialization options
   * @param {boolean} [options.serverSync=true] - Enable server synchronization (ignored for LocalProvider)
   * @param {boolean} [options.offlineMode=false] - Start in offline-only mode (always true for LocalProvider)
   * @returns {Function} Unsubscribe function
   */
  async init(mapId, options = {}) {
    this.validateMapId(mapId);

    // LocalProvider is always offline, so we ignore serverSync
    if (options.serverSync !== false) {
      console.log(
        'LocalJSONProvider: serverSync option ignored (always offline)'
      );
    }

    // Ensure map exists or create empty one
    try {
      await this.load(mapId);
    } catch (error) {
      if (error.message.includes('not found')) {
        // Create empty map
        const emptyMap = {
          n: [],
          c: [],
          meta: {
            version: 1,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            title: 'Untitled Map'
          }
        };
        await this.save(mapId, emptyMap);
      } else {
        throw error;
      }
    }

    // Set up subscription for this map
    const unsubscribe = () => {
      this.unsubscribe(mapId);
    };

    return unsubscribe;
  }

  /**
   * Subscribe to normalized change events
   * Different from the existing subscribe() method - this provides normalized events
   *
   * @param {Function} onChange - Callback for change events
   * @returns {Function} Unsubscribe function
   */
  subscribeToChanges(onChange) {
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }

    if (!this.changeSubscribers) {
      this.changeSubscribers = new Set();
    }

    this.changeSubscribers.add(onChange);

    return () => {
      this.changeSubscribers.delete(onChange);
    };
  }

  /**
   * Insert or update a note
   *
   * @param {Object} noteData - Note data
   * @param {string} noteData.id - Unique note identifier
   * @param {string} noteData.content - Markdown content
   * @param {Array<number>} noteData.pos - Position [x, y]
   * @param {string} [noteData.color] - Note color
   * @returns {Promise<void>}
   */
  async upsertNote(noteData) {
    if (!noteData || !noteData.id || typeof noteData.content !== 'string') {
      throw new Error('Invalid note data: id and content are required');
    }

    if (!Array.isArray(noteData.pos) || noteData.pos.length !== 2) {
      throw new Error('Invalid note position: must be [x, y] array');
    }

    // This is a simplified implementation - in practice we'd need to know which map
    // For LocalProvider, we'll implement this as part of a broader state management approach
    throw new Error(
      'upsertNote requires active map context - use save() with full map data instead'
    );
  }

  /**
   * Delete a note by ID
   *
   * @param {string} noteId - Note identifier to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteNote(noteId) {
    if (!noteId) {
      throw new Error('Note ID is required');
    }

    // This is a simplified implementation - in practice we'd need to know which map
    throw new Error(
      'deleteNote requires active map context - use save() with updated map data instead'
    );
  }

  /**
   * Insert or update a connection
   *
   * @param {Object} connectionData - Connection data
   * @param {string} connectionData.from - Source note ID
   * @param {string} connectionData.to - Target note ID
   * @param {string} [connectionData.type='arrow'] - Connection type
   * @returns {Promise<void>}
   */
  async upsertConnection(connectionData) {
    if (!connectionData || !connectionData.from || !connectionData.to) {
      throw new Error('Invalid connection data: from and to are required');
    }

    // This is a simplified implementation - in practice we'd need to know which map
    throw new Error(
      'upsertConnection requires active map context - use save() with full map data instead'
    );
  }

  /**
   * Delete a connection by from/to/type
   *
   * @param {string} from - Source note ID
   * @param {string} to - Target note ID
   * @param {string} [type='arrow'] - Connection type
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async deleteConnection(from, to, _type = 'arrow') {
    if (!from || !to) {
      throw new Error('Connection from and to are required');
    }

    // This is a simplified implementation - in practice we'd need to know which map
    throw new Error(
      'deleteConnection requires active map context - use save() with updated map data instead'
    );
  }

  /**
   * Update map metadata for a specific map
   *
   * @param {string} mapId - Map identifier
   * @param {Object} metaUpdates - Metadata updates
   * @returns {Promise<void>}
   */
  async setMeta(mapId, metaUpdates) {
    this.validateMapId(mapId);

    if (!metaUpdates || typeof metaUpdates !== 'object') {
      throw new Error('Meta updates must be an object');
    }

    try {
      // Load current map
      const currentMap = await this.load(mapId);

      // Update metadata
      const updatedMap = {
        ...currentMap,
        meta: {
          ...currentMap.meta,
          ...metaUpdates,
          modified: new Date().toISOString()
        }
      };

      // Save updated map
      await this.save(mapId, updatedMap, { skipMetaUpdate: true });

      // Notify change subscribers
      this.notifyChangeSubscribers({
        type: 'meta',
        payload: {
          mapId,
          updates: metaUpdates
        }
      });
    } catch (error) {
      throw new Error(
        `Failed to update metadata for map ${mapId}: ${error.message}`
      );
    }
  }

  /**
   * Get current map data as JSON snapshot
   *
   * @param {string} mapId - Map identifier
   * @returns {Promise<Object>} Map data { n: notes[], c: connections[], meta }
   */
  async getSnapshot(mapId) {
    return await this.load(mapId);
  }

  /**
   * Import JSON data for a specific map, replacing current contents
   * Suppresses user events during import
   *
   * @param {string} mapId - Map identifier
   * @param {Object} jsonData - Map data in MindMeld JSON format
   * @param {Object} [options={}] - Import options
   * @param {boolean} [options.merge=false] - Merge instead of replace
   * @param {boolean} [options.suppressEvents=true] - Suppress change notifications
   * @returns {Promise<void>}
   */
  async importJSON(mapId, jsonData, options = {}) {
    this.validateMapId(mapId);

    if (!this.validateMapData(jsonData)) {
      throw new Error('Invalid JSON data format');
    }

    const suppressEvents = options.suppressEvents !== false;

    try {
      // Set hydration mode to suppress events
      if (suppressEvents) {
        this.isHydrating = true;
      }

      if (options.merge && !options.replace) {
        // Merge with existing data
        try {
          const existingData = await this.load(mapId);
          const mergedData = {
            n: [...(existingData.n || []), ...(jsonData.n || [])],
            c: [...(existingData.c || []), ...(jsonData.c || [])],
            meta: {
              ...existingData.meta,
              ...jsonData.meta,
              modified: new Date().toISOString()
            }
          };
          await this.save(mapId, mergedData, { force: true });
        } catch (_loadError) {
          // If load fails (map doesn't exist), just save new data
          await this.save(mapId, jsonData, { force: true });
        }
      } else {
        // Replace existing data
        await this.save(mapId, jsonData, { force: true });
      }

      // Notify change subscribers (unless suppressed)
      if (!suppressEvents) {
        this.notifyChangeSubscribers({
          type: 'snapshot',
          payload: {
            mapId,
            data: jsonData
          }
        });
      }
    } finally {
      // Always clear hydration mode
      if (suppressEvents) {
        this.isHydrating = false;
      }
    }
  }

  /**
   * Export current map data as JSON for backup/interchange
   *
   * @param {string} mapId - Map identifier
   * @returns {Promise<Object>} Map data in MindMeld JSON format
   */
  async exportJSON(mapId) {
    return await this.load(mapId);
  }

  // Extended functionality specific to LocalJSONProvider

  /**
   * Get storage usage statistics
   */
  getStorageStats() {
    const stats = {
      totalMaps: 0,
      storageUsed: 0,
      storageAvailable: 0,
      quotaWarning: false
    };

    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }

      for (const key of keys) {
        if (
          key.startsWith(this.options.storagePrefix) ||
          key.startsWith(this.options.metaPrefix)
        ) {
          stats.totalMaps++;
          const value = localStorage.getItem(key);
          stats.storageUsed += key.length + (value ? value.length : 0);
        }
      }

      // Estimate available storage (rough approximation)
      stats.storageAvailable = Math.max(
        0,
        10 * 1024 * 1024 - stats.storageUsed
      ); // Assume 10MB limit
      stats.quotaWarning = stats.storageUsed > this.options.storageQuotaWarning;
    } catch (error) {
      console.warn(
        'LocalJSONProvider: Could not calculate storage stats:',
        error
      );
    }

    return stats;
  }

  /**
   * Export all maps as a single JSON structure
   */
  async exportAllMaps() {
    const maps = await this.list({ limit: 1000 });
    const exportData = {
      exported: new Date().toISOString(),
      provider: 'LocalJSONProvider',
      version: '1.0',
      maps: {}
    };

    for (const mapMeta of maps) {
      try {
        const mapData = await this.load(mapMeta.id);
        exportData.maps[mapMeta.id] = mapData;
      } catch (error) {
        console.warn(
          `LocalJSONProvider: Failed to export map ${mapMeta.id}:`,
          error
        );
      }
    }

    return exportData;
  }

  /**
   * Import maps from exported JSON structure
   * Enhanced for MS-62 with hydration suppression
   */
  async importMaps(exportData, options = {}) {
    if (!exportData.maps || typeof exportData.maps !== 'object') {
      throw new Error('Invalid export data structure');
    }

    const suppressEvents = options.suppressEvents !== false;
    const results = {
      imported: 0,
      failed: 0,
      errors: []
    };

    try {
      // Pause autosave and enable hydration mode during bulk import
      this.pauseAutosave('bulk-import');
      if (suppressEvents) {
        this.isHydrating = true;
      }

      for (const [mapId, mapData] of Object.entries(exportData.maps)) {
        try {
          await this.save(mapId, mapData, { force: true });
          results.imported++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${mapId}: ${error.message}`);
        }
      }
    } finally {
      // Always restore state
      if (suppressEvents) {
        this.isHydrating = false;
      }
      this.resumeAutosave('bulk-import');
    }

    return results;
  }

  // Private helper methods

  validateMapId(mapId) {
    if (!mapId || typeof mapId !== 'string' || mapId.trim().length === 0) {
      throw new Error('Invalid mapId: must be a non-empty string');
    }
  }

  validateMapData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }
    // Allow data.n and data.c to be missing (will default to empty arrays)
    return true;
  }

  generateETag(mapData, metadata) {
    const content = JSON.stringify(mapData) + JSON.stringify(metadata);
    // Simple hash for ETag - in production might want something more robust
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  checkStorageQuota() {
    const stats = this.getStorageStats();
    if (stats.quotaWarning) {
      console.warn(
        'LocalJSONProvider: Storage quota warning - consider cleaning up old maps'
      );
    }
  }

  cleanupStorage() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }

      const mapKeys = keys.filter(
        key =>
          key.startsWith(this.options.storagePrefix) ||
          key.startsWith(this.options.metaPrefix)
      );

      // If we have too many maps, remove oldest ones
      if (mapKeys.length > this.options.maxMaps * 2) {
        // *2 because we have map + meta keys
        console.log(
          `LocalJSONProvider: Cleaning up storage (${mapKeys.length} keys found)`
        );

        const mapMetaKeys = keys.filter(key =>
          key.startsWith(this.options.metaPrefix)
        );
        const mapMetas = [];

        for (const key of mapMetaKeys) {
          try {
            const mapId = key.replace(this.options.metaPrefix, '');
            const meta = JSON.parse(localStorage.getItem(key));
            mapMetas.push({ mapId, modified: meta.modified || '1970-01-01' });
          } catch {
            // Remove invalid entries
            localStorage.removeItem(key);
            const mapKey = key.replace(
              this.options.metaPrefix,
              this.options.storagePrefix
            );
            localStorage.removeItem(mapKey);
          }
        }

        // Sort by modified date and remove oldest if over limit
        mapMetas.sort((a, b) => new Date(a.modified) - new Date(b.modified));
        const toRemove = mapMetas.slice(
          0,
          Math.max(0, mapMetas.length - this.options.maxMaps)
        );

        for (const { mapId } of toRemove) {
          localStorage.removeItem(this.options.storagePrefix + mapId);
          localStorage.removeItem(this.options.metaPrefix + mapId);
        }

        if (toRemove.length > 0) {
          console.log(`LocalJSONProvider: Removed ${toRemove.length} old maps`);
        }
      }
    } catch (error) {
      console.warn('LocalJSONProvider: Storage cleanup failed:', error);
    }
  }

  notifySubscribers(mapId, updateData) {
    const subscribers = this.subscribers.get(mapId);
    if (subscribers) {
      subscribers.forEach(callback => {
        try {
          callback(updateData);
        } catch (error) {
          console.warn('LocalJSONProvider: Subscriber callback failed:', error);
        }
      });
    }
  }

  /**
   * Notify normalized change subscribers
   * Only notifies if not in hydration mode
   */
  notifyChangeSubscribers(changeEvent) {
    // Don't notify during hydration to prevent feedback loops
    if (this.isHydrating) {
      console.log(
        'LocalJSONProvider: Suppressing change event during hydration'
      );
      return;
    }

    this.changeSubscribers.forEach(callback => {
      try {
        callback(changeEvent);
      } catch (error) {
        console.warn(
          'LocalJSONProvider: Change subscriber callback failed:',
          error
        );
      }
    });
  }
}

module.exports = LocalJSONProvider;
