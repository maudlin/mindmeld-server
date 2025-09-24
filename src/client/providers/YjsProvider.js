/**
 * YjsProvider - Real-time collaborative DataProvider using Y.js
 *
 * Implements the DataProvider interface using Y.js CRDT structures with
 * offline-first capabilities via y-indexeddb persistence. Features:
 *
 * - Y.Map structures for efficient O(1) note/connection lookups
 * - y-indexeddb for offline persistence across browser sessions
 * - Real-time collaboration when connected to WebSocket server
 * - Performance guards with NOTE_CONTENT_LIMIT enforcement
 * - JSON <-> Y.Doc bidirectional conversion with full fidelity
 * - Event suppression during bulk operations (hydration)
 * - Feature flag integration for gradual rollout
 *
 * @see MS-61: Define DataProvider contract and Y.Doc schema
 * @see MS-63: Client YjsProvider + y-indexeddb; converters; performance guards
 */

const DataProviderInterface = require('./DataProviderInterface');
const {
  NOTE_CONTENT_LIMIT: _NOTE_CONTENT_LIMIT,
  MAX_NOTES_PER_MAP,
  MAX_CONNECTIONS_PER_MAP,
  generateConnectionId,
  parseConnectionId: _parseConnectionId,
  initializeYDoc,
  validateNoteContent,
  validateNotePosition,
  checkPerformanceLimits,
  jsonToYDoc,
  yDocToJSON
} = require('../schemas/YjsSchema');

// Y.js imports
const Y = require('yjs');
const { IndexeddbPersistence } = require('y-indexeddb');
const { WebsocketProvider } = require('y-websocket');

/**
 * YjsProvider - Real-time collaborative data provider
 */
class YjsProvider extends DataProviderInterface {
  constructor(options = {}) {
    super();

    this.options = {
      websocketUrl: options.websocketUrl || 'ws://localhost:3001',
      offlineMode: options.offlineMode || false,
      enableServerSync: options.enableServerSync !== false,
      storagePrefix: options.storagePrefix || 'mindmeld_yjs_',
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options
    };

    // State management
    this.currentMapId = null;
    this.ydoc = null;
    this.notes = null;
    this.connections = null;
    this.meta = null;
    this.indexeddbProvider = null;
    this.websocketProvider = null;
    this.isInitialized = false;
    this.isOnlineStatus = false;
    this.autosavePaused = false;
    this.autosavePauseReason = null;

    // Event handling
    this.changeSubscribers = new Set();
    this.isHydrating = false;
    this.subscriptionCleanupFns = [];

    // Performance monitoring
    this.stats = {
      notesCount: 0,
      connectionsCount: 0,
      lastSync: null,
      syncErrors: 0
    };

    this.logger = console; // Can be overridden with proper logger
  }

  /**
   * Load a mind map by its unique identifier
   */
  async load(mapId) {
    this.validateMapId(mapId);

    try {
      // Initialize if needed
      if (!this.isInitialized || this.currentMapId !== mapId) {
        await this.init(mapId);
      }

      // Convert Y.Doc to JSON
      const jsonData = yDocToJSON(this.ydoc);

      // Update stats
      this.updateStats();

      return jsonData;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to load map:', error);
      throw new Error(`Failed to load map ${mapId}: ${error.message}`);
    }
  }

  /**
   * Save a mind map with the given data
   */
  async save(mapId, data, options = {}) {
    this.validateMapId(mapId);

    if (!this.validateMapData(data)) {
      throw new Error('Invalid map data format');
    }

    // Check autosave pause
    if (this.autosavePaused && options.autosave && !options.force) {
      this.logger.debug(
        `YjsProvider: Autosave skipped for map ${mapId} (reason: ${this.autosavePauseReason})`
      );
      return { saved: false, reason: 'autosave_paused' };
    }

    try {
      // Initialize if needed
      if (!this.isInitialized || this.currentMapId !== mapId) {
        await this.init(mapId);
      }

      // Set hydration mode to suppress events during bulk update
      const previousHydration = this.isHydrating;
      if (options.suppressEvents !== false) {
        this.isHydrating = true;
      }

      try {
        // Convert JSON to Y.Doc
        jsonToYDoc(data, this.ydoc);

        // Update modified timestamp
        this.meta.set('modified', new Date().toISOString());

        // Update version if provided
        if (options.expectedVersion) {
          this.meta.set('version', options.expectedVersion);
        }

        // Check performance limits
        checkPerformanceLimits(this.notes, this.connections);

        // Update stats
        this.updateStats();

        // Notify change subscribers (unless suppressed)
        if (!this.isHydrating && !options.suppressEvents) {
          this.notifyChangeSubscribers({
            type: 'snapshot',
            payload: {
              mapId,
              data: yDocToJSON(this.ydoc)
            }
          });
        }

        return {
          saved: true,
          timestamp: new Date().toISOString(),
          version: this.meta.get('version') || 1,
          stats: this.getStats()
        };
      } finally {
        // Restore previous hydration state
        this.isHydrating = previousHydration;
      }
    } catch (error) {
      this.logger.error('YjsProvider: Failed to save map:', error);
      throw new Error(`Failed to save map ${mapId}: ${error.message}`);
    }
  }

  /**
   * List available mind maps with metadata
   */
  async list(options = {}) {
    // For Y.js with IndexedDB, we need to scan the IndexedDB for available documents
    // This is a simplified implementation - in production you might want a dedicated index

    try {
      const maps = [];

      // If we have a current map, include it
      if (this.currentMapId && this.ydoc && this.meta) {
        const mapMeta = {
          id: this.currentMapId,
          title: this.meta.get('mapName') || 'Untitled Map',
          created: this.meta.get('created'),
          modified: this.meta.get('modified'),
          version: this.meta.get('version') || 1,
          notesCount: this.notes ? this.notes.size : 0,
          connectionsCount: this.connections ? this.connections.size : 0
        };
        maps.push(mapMeta);
      }

      // Apply sorting and limiting
      const sortBy = options.sortBy || 'modified';
      const sortOrder = options.sortOrder || 'desc';

      maps.sort((a, b) => {
        const aVal = a[sortBy] || '';
        const bVal = b[sortBy] || '';
        const comparison = aVal.localeCompare(bVal);
        return sortOrder === 'desc' ? -comparison : comparison;
      });

      // Apply pagination
      const offset = options.offset || 0;
      const limit = options.limit || maps.length;

      return maps.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('YjsProvider: Failed to list maps:', error);
      throw new Error(`Failed to list maps: ${error.message}`);
    }
  }

  /**
   * Delete a mind map permanently
   */
  async delete(mapId) {
    this.validateMapId(mapId);

    try {
      // If this is the current map, clean it up
      if (this.currentMapId === mapId) {
        await this.cleanup();
      }

      // Delete from IndexedDB
      // Note: This is a simplified implementation
      // In production, you'd want more robust cleanup
      const dbName = this.getIndexedDBName(mapId);

      if (typeof window !== 'undefined' && 'indexedDB' in window) {
        return new Promise((resolve, reject) => {
          const deleteReq = window.indexedDB.deleteDatabase(dbName);
          deleteReq.onerror = () => reject(deleteReq.error);
          deleteReq.onsuccess = () => resolve(true);
          deleteReq.onblocked = () => {
            this.logger.warn(
              `YjsProvider: Database deletion blocked for ${mapId}`
            );
            resolve(false);
          };
        });
      }

      return true;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to delete map:', error);
      return false;
    }
  }

  /**
   * Subscribe to real-time updates for a specific map
   */
  async subscribe(mapId, callback) {
    this.validateMapId(mapId);

    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    try {
      // Initialize if needed
      if (!this.isInitialized || this.currentMapId !== mapId) {
        await this.init(mapId);
      }

      // Set up Y.Doc event listeners for real-time updates
      const updateHandler = (update, origin, ydoc) => {
        // Don't notify for local changes or during hydration
        if (origin === this || this.isHydrating) {
          return;
        }

        const jsonData = yDocToJSON(ydoc);
        callback({
          type: 'update',
          mapId,
          data: jsonData,
          origin
        });
      };

      this.ydoc.on('update', updateHandler);

      // Clean up function
      const unsubscribe = () => {
        this.ydoc.off('update', updateHandler);
      };

      this.subscriptionCleanupFns.push(unsubscribe);

      return unsubscribe;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to subscribe:', error);
      throw new Error(`Failed to subscribe to map ${mapId}: ${error.message}`);
    }
  }

  /**
   * Unsubscribe from real-time updates for a specific map
   */
  async unsubscribe(mapId) {
    this.validateMapId(mapId);

    if (this.currentMapId === mapId) {
      // Run all cleanup functions
      this.subscriptionCleanupFns.forEach(fn => {
        try {
          fn();
        } catch (error) {
          this.logger.warn(
            'YjsProvider: Error during unsubscribe cleanup:',
            error
          );
        }
      });
      this.subscriptionCleanupFns = [];
    }
  }

  /**
   * Pause autosave functionality
   */
  pauseAutosave(reason = 'Manual pause') {
    this.autosavePaused = true;
    this.autosavePauseReason = reason;
    this.logger.debug(`YjsProvider: Autosave paused (reason: ${reason})`);
  }

  /**
   * Resume autosave functionality
   */
  resumeAutosave(reason = 'Manual resume') {
    this.autosavePaused = false;
    this.autosavePauseReason = null;
    this.logger.debug(`YjsProvider: Autosave resumed (reason: ${reason})`);
  }

  /**
   * Check if the provider is currently online and can sync
   */
  isOnline() {
    return (
      this.isOnlineStatus &&
      this.websocketProvider &&
      this.websocketProvider.wsconnected
    );
  }

  // MS-61 Specific Methods - Granular Operations

  /**
   * Initialize provider for a specific map
   */
  async init(mapId, options = {}) {
    this.validateMapId(mapId);

    try {
      // Clean up existing resources if switching maps
      if (this.currentMapId && this.currentMapId !== mapId) {
        await this.cleanup();
      }

      this.currentMapId = mapId;

      // Create Y.Doc
      this.ydoc = new Y.Doc();

      // Initialize Y.Doc structure
      const { notes, connections, meta } = initializeYDoc(this.ydoc);
      this.notes = notes;
      this.connections = connections;
      this.meta = meta;

      // Set up IndexedDB persistence (offline-first)
      const dbName = this.getIndexedDBName(mapId);
      this.indexeddbProvider = new IndexeddbPersistence(dbName, this.ydoc);

      // Wait for IndexedDB to load
      await new Promise((resolve, reject) => {
        this.indexeddbProvider.on('synced', resolve);
        this.indexeddbProvider.on('error', reject);
        setTimeout(() => reject(new Error('IndexedDB sync timeout')), 10000);
      });

      // Set up WebSocket provider for real-time sync (if enabled)
      if (
        options.serverSync !== false &&
        this.options.enableServerSync &&
        !this.options.offlineMode
      ) {
        try {
          const wsUrl = `${this.options.websocketUrl}/yjs/${mapId}`;
          this.websocketProvider = new WebsocketProvider(
            wsUrl,
            mapId,
            this.ydoc,
            {
              connect: true
            }
          );

          // Monitor connection status
          this.websocketProvider.on('status', ({ status }) => {
            this.isOnlineStatus = status === 'connected';
            this.logger.debug(
              `YjsProvider: WebSocket status changed to ${status}`
            );
          });

          this.websocketProvider.on('connection-error', error => {
            this.logger.warn('YjsProvider: WebSocket connection error:', error);
            this.isOnlineStatus = false;
          });
        } catch (error) {
          this.logger.warn(
            'YjsProvider: Failed to connect WebSocket, continuing offline:',
            error
          );
          this.isOnlineStatus = false;
        }
      }

      // Update initialization state
      this.isInitialized = true;
      this.updateStats();

      this.logger.info(`YjsProvider: Initialized for map ${mapId}`);

      // Return cleanup function
      const unsubscribe = () => this.cleanup();
      return unsubscribe;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to initialize:', error);
      throw new Error(
        `Failed to initialize YjsProvider for map ${mapId}: ${error.message}`
      );
    }
  }

  /**
   * Subscribe to normalized change events
   */
  subscribeToChanges(onChange) {
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }

    this.changeSubscribers.add(onChange);

    return () => {
      this.changeSubscribers.delete(onChange);
    };
  }

  /**
   * Insert or update a note
   */
  async upsertNote(noteData) {
    if (!noteData || !noteData.id || typeof noteData.content !== 'string') {
      throw new Error('Invalid note data: id and content are required');
    }

    if (!Array.isArray(noteData.pos) || noteData.pos.length !== 2) {
      throw new Error('Invalid note position: must be [x, y] array');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      // Validate content and position
      validateNoteContent(noteData.content);
      validateNotePosition(noteData.pos);

      // Check performance limits before adding
      if (
        !this.notes.has(noteData.id) &&
        this.notes.size >= MAX_NOTES_PER_MAP
      ) {
        throw new Error(`Maximum notes limit exceeded: ${MAX_NOTES_PER_MAP}`);
      }

      // Create Y.Text for collaborative editing
      const yText = new Y.Text();
      yText.insert(0, noteData.content);

      const noteObj = {
        id: noteData.id,
        pos: noteData.pos,
        color: noteData.color || 'default',
        content: yText
      };

      // Upsert to Y.Map
      this.notes.set(noteData.id, noteObj);

      // Update metadata
      this.meta.set('modified', new Date().toISOString());

      // Notify change subscribers
      this.notifyChangeSubscribers({
        type: 'note',
        payload: {
          action: this.notes.has(noteData.id) ? 'updated' : 'created',
          noteId: noteData.id,
          noteData: {
            ...noteData,
            content: noteData.content // Keep as string for event
          }
        }
      });

      this.updateStats();
    } catch (error) {
      this.logger.error('YjsProvider: Failed to upsert note:', error);
      throw new Error(`Failed to upsert note: ${error.message}`);
    }
  }

  /**
   * Delete a note by ID
   */
  async deleteNote(noteId) {
    if (!noteId) {
      throw new Error('Note ID is required');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      const existed = this.notes.has(noteId);

      if (existed) {
        // Remove from Y.Map
        this.notes.delete(noteId);

        // Also remove any connections to/from this note
        const connectionsToDelete = [];
        for (const [connId, connObj] of this.connections.entries()) {
          if (connObj.from === noteId || connObj.to === noteId) {
            connectionsToDelete.push(connId);
          }
        }

        for (const connId of connectionsToDelete) {
          this.connections.delete(connId);
        }

        // Update metadata
        this.meta.set('modified', new Date().toISOString());

        // Notify change subscribers
        this.notifyChangeSubscribers({
          type: 'note',
          payload: {
            action: 'deleted',
            noteId,
            deletedConnections: connectionsToDelete
          }
        });

        this.updateStats();
      }

      return existed;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to delete note:', error);
      throw new Error(`Failed to delete note: ${error.message}`);
    }
  }

  /**
   * Insert or update a connection
   */
  async upsertConnection(connectionData) {
    if (!connectionData || !connectionData.from || !connectionData.to) {
      throw new Error('Invalid connection data: from and to are required');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      // Generate connection ID
      const connId = generateConnectionId(
        connectionData.from,
        connectionData.to,
        connectionData.type || 'arrow'
      );

      // Check performance limits before adding
      if (
        !this.connections.has(connId) &&
        this.connections.size >= MAX_CONNECTIONS_PER_MAP
      ) {
        throw new Error(
          `Maximum connections limit exceeded: ${MAX_CONNECTIONS_PER_MAP}`
        );
      }

      // Verify that both notes exist
      if (!this.notes.has(connectionData.from)) {
        throw new Error(`Source note ${connectionData.from} does not exist`);
      }
      if (!this.notes.has(connectionData.to)) {
        throw new Error(`Target note ${connectionData.to} does not exist`);
      }

      const connObj = {
        from: connectionData.from,
        to: connectionData.to,
        type: connectionData.type || 'arrow'
      };

      // Upsert to Y.Map
      const existed = this.connections.has(connId);
      this.connections.set(connId, connObj);

      // Update metadata
      this.meta.set('modified', new Date().toISOString());

      // Notify change subscribers
      this.notifyChangeSubscribers({
        type: 'connection',
        payload: {
          action: existed ? 'updated' : 'created',
          connectionId: connId,
          connectionData: { ...connObj, id: connId }
        }
      });

      this.updateStats();
    } catch (error) {
      this.logger.error('YjsProvider: Failed to upsert connection:', error);
      throw new Error(`Failed to upsert connection: ${error.message}`);
    }
  }

  /**
   * Delete a connection by ID
   */
  async deleteConnection(connectionId) {
    if (!connectionId) {
      throw new Error('Connection ID is required');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      const existed = this.connections.has(connectionId);

      if (existed) {
        // Remove from Y.Map
        this.connections.delete(connectionId);

        // Update metadata
        this.meta.set('modified', new Date().toISOString());

        // Notify change subscribers
        this.notifyChangeSubscribers({
          type: 'connection',
          payload: {
            action: 'deleted',
            connectionId
          }
        });

        this.updateStats();
      }

      return existed;
    } catch (error) {
      this.logger.error('YjsProvider: Failed to delete connection:', error);
      throw new Error(`Failed to delete connection: ${error.message}`);
    }
  }

  /**
   * Update map metadata
   */
  async setMeta(metaUpdates) {
    if (!metaUpdates || typeof metaUpdates !== 'object') {
      throw new Error('Meta updates must be an object');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      // Apply updates to Y.Map
      for (const [key, value] of Object.entries(metaUpdates)) {
        this.meta.set(key, value);
      }

      // Always update modified timestamp
      this.meta.set('modified', new Date().toISOString());

      // Notify change subscribers
      this.notifyChangeSubscribers({
        type: 'meta',
        payload: {
          updates: metaUpdates
        }
      });
    } catch (error) {
      this.logger.error('YjsProvider: Failed to update metadata:', error);
      throw new Error(`Failed to update metadata: ${error.message}`);
    }
  }

  /**
   * Get current map data as JSON snapshot
   */
  async getSnapshot() {
    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    try {
      return yDocToJSON(this.ydoc);
    } catch (error) {
      this.logger.error('YjsProvider: Failed to get snapshot:', error);
      throw new Error(`Failed to get snapshot: ${error.message}`);
    }
  }

  /**
   * Import JSON data, replacing current map contents
   */
  async importJSON(jsonData, options = {}) {
    if (!this.validateMapData(jsonData)) {
      throw new Error('Invalid JSON data format');
    }

    if (!this.isInitialized) {
      throw new Error('YjsProvider not initialized');
    }

    const suppressEvents = options.suppressEvents !== false;

    try {
      // Set hydration mode to suppress events
      if (suppressEvents) {
        this.isHydrating = true;
      }

      // Convert JSON to Y.Doc
      jsonToYDoc(jsonData, this.ydoc);

      // Update modified timestamp
      this.meta.set('modified', new Date().toISOString());

      // Notify change subscribers (unless suppressed)
      if (!suppressEvents) {
        this.notifyChangeSubscribers({
          type: 'snapshot',
          payload: {
            data: jsonData
          }
        });
      }

      this.updateStats();
    } finally {
      // Always clear hydration mode
      if (suppressEvents) {
        this.isHydrating = false;
      }
    }
  }

  /**
   * Export current map data as JSON
   */
  async exportJSON() {
    return await this.getSnapshot();
  }

  // Helper methods

  validateMapId(mapId) {
    if (!mapId || typeof mapId !== 'string') {
      throw new Error('Invalid map ID');
    }
  }

  getIndexedDBName(mapId) {
    return `${this.options.storagePrefix}${mapId}`;
  }

  updateStats() {
    this.stats = {
      notesCount: this.notes ? this.notes.size : 0,
      connectionsCount: this.connections ? this.connections.size : 0,
      lastSync: new Date().toISOString(),
      syncErrors: this.stats.syncErrors || 0
    };
  }

  getStats() {
    return { ...this.stats };
  }

  notifyChangeSubscribers(event) {
    if (this.isHydrating) {
      return;
    }

    for (const subscriber of this.changeSubscribers) {
      try {
        subscriber(event);
      } catch (error) {
        this.logger.warn(
          'YjsProvider: Error notifying change subscriber:',
          error
        );
      }
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      // Clean up subscriptions
      this.subscriptionCleanupFns.forEach(fn => {
        try {
          fn();
        } catch (error) {
          this.logger.warn('YjsProvider: Error during cleanup:', error);
        }
      });
      this.subscriptionCleanupFns = [];

      // Clean up providers
      if (this.websocketProvider) {
        this.websocketProvider.disconnect();
        this.websocketProvider.destroy();
        this.websocketProvider = null;
      }

      if (this.indexeddbProvider) {
        this.indexeddbProvider.destroy();
        this.indexeddbProvider = null;
      }

      // Clean up Y.Doc
      if (this.ydoc) {
        this.ydoc.destroy();
        this.ydoc = null;
      }

      // Reset state
      this.notes = null;
      this.connections = null;
      this.meta = null;
      this.currentMapId = null;
      this.isInitialized = false;
      this.isOnlineStatus = false;

      this.logger.debug('YjsProvider: Cleaned up successfully');
    } catch (error) {
      this.logger.error('YjsProvider: Error during cleanup:', error);
    }
  }
}

module.exports = YjsProvider;
