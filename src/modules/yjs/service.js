const Y = require('yjs');
const YjsPersistence = require('./persistence');
// Removed unused performance import

/**
 * Service for managing Yjs documents and WebSocket connections
 * Handles real-time collaborative editing with persistence
 */
class YjsService {
  constructor(options = {}) {
    this.options = options;
    this.logger = options.logger || console;

    // Map of mapId -> Y.Doc instances
    this.docs = new Map();

    // Map of mapId -> Set of WebSocket connections
    this.connections = new Map();

    // Document metadata
    this.docMetadata = new Map();

    // Initialize persistence layer with database file
    const dbFile =
      options.dbFile ||
      require('path').join(process.cwd(), 'data', 'yjs.sqlite');
    this.persistence = new YjsPersistence(dbFile);
  }

  /**
   * Get or create a Y.Doc for the given mapId
   * Restores from snapshot if available
   */
  async getOrCreateDocument(mapId) {
    if (this.docs.has(mapId)) {
      return this.docs.get(mapId);
    }

    try {
      // Try to restore from snapshot
      const snapshot = await this.persistence.getSnapshot(mapId);
      const doc = new Y.Doc();

      if (snapshot && snapshot.snapshot) {
        // Restore document state from snapshot
        Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot));
        this.logger.debug('Restored Y.Doc from snapshot', {
          mapId,
          snapshotSize: snapshot.snapshot.length
        });
      } else {
        this.logger.debug('Created new Y.Doc', {
          mapId,
          docSize: this.docs.size + 1
        });
      }

      // Set up update handler for persistence
      doc.on('update', (update, origin) => {
        this.handleDocumentUpdate(mapId, update, origin);
      });

      // Store document and metadata
      this.docs.set(mapId, doc);
      this.docMetadata.set(mapId, {
        createdAt: new Date(),
        lastUpdate: new Date()
      });

      return doc;
    } catch (error) {
      this.logger.error('Failed to load snapshot, creating new document', {
        mapId,
        error: error.message
      });

      // Fallback: create new document
      const doc = new Y.Doc();
      doc.on('update', (update, origin) => {
        this.handleDocumentUpdate(mapId, update, origin);
      });

      this.docs.set(mapId, doc);
      this.docMetadata.set(mapId, {
        createdAt: new Date(),
        lastUpdate: new Date()
      });

      return doc;
    }
  }

  /**
   * Handle document updates from Y.Doc
   * Saves snapshots for local updates, broadcasts to connected clients
   */
  async handleDocumentUpdate(mapId, update, origin) {
    try {
      // Update metadata
      if (this.docMetadata.has(mapId)) {
        this.docMetadata.get(mapId).lastUpdate = new Date();
      }

      // Only save snapshot for local updates (not from WebSocket clients)
      if (
        !origin ||
        typeof origin !== 'string' ||
        !origin.startsWith('websocket-')
      ) {
        const doc = this.docs.get(mapId);
        if (doc) {
          const docState = Y.encodeStateAsUpdate(doc);
          await this.persistence.saveSnapshot(mapId, Buffer.from(docState));

          this.logger.debug('Y.js document updated and persisted', {
            mapId: mapId.substring(0, 8) + '...', // Truncate for security
            updateSize: update.length,
            documentSize: docState.length,
            origin: origin ? 'local' : 'unknown',
            activeClients: this.connections.get(mapId)?.size || 0
          });
        }
      } else {
        this.logger.debug('Skipping snapshot save for remote update', {
          mapId,
          origin,
          updateSize: update.length
        });
      }

      // Broadcast update to all connected clients except the origin
      this.broadcastUpdate(
        mapId,
        update,
        typeof origin === 'string' ? null : origin
      );
    } catch (error) {
      this.logger.error('Failed to save document snapshot', {
        mapId,
        error: error.message
      });
    }
  }

  /**
   * Handle new WebSocket connection
   */
  async handleWebSocketConnection(ws, request) {
    try {
      // Parse mapId from URL: /yjs/:mapId
      const urlMatch = request.url.match(/^\/yjs\/([^/]+)$/);
      if (!urlMatch) {
        ws.close(1008, 'Invalid URL format');
        this.logger.warn('WebSocket connection rejected: Invalid URL format', {
          url: request.url
        });
        return;
      }

      const mapId = urlMatch[1];
      ws.id = `websocket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get or create document
      const doc = await this.getOrCreateDocument(mapId);

      // Add connection to tracking
      if (!this.connections.has(mapId)) {
        this.connections.set(mapId, new Set());
      }
      this.connections.get(mapId).add(ws);

      this.logger.info('WebSocket client connected', {
        mapId: mapId.substring(0, 8) + '...', // Truncate for security
        clientId: ws.id.substring(0, 16),
        totalClientsForDocument: this.connections.get(mapId).size,
        totalDocuments: this.docs.size,
        userAgent: request.headers['user-agent']?.substring(0, 100) || 'unknown'
      });

      // Send initial document state to new client
      const initialState = Y.encodeStateAsUpdate(doc);
      if (initialState.length > 0) {
        ws.send(initialState);
      }

      // Set up message handler
      ws.on('message', data => {
        try {
          if (!(data instanceof Uint8Array) && !Buffer.isBuffer(data)) {
            this.logger.error('Invalid WebSocket message format', {
              mapId,
              dataType: typeof data
            });
            return;
          }

          const updateData =
            data instanceof Uint8Array ? data : new Uint8Array(data);
          this.applyUpdateToDocument(mapId, updateData, ws);
        } catch (error) {
          this.logger.error('Error processing WebSocket message', {
            mapId,
            error: error.message
          });
        }
      });

      // Handle connection close
      ws.on('close', () => {
        const connections = this.connections.get(mapId);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            this.connections.delete(mapId);
          }
        }
        this.logger.info('WebSocket client disconnected', {
          mapId: mapId.substring(0, 8) + '...', // Truncate for security
          remainingClientsForDocument: connections.size,
          totalDocuments: this.docs.size,
          documentCleanedUp: connections.size === 0
        });
      });

      // Handle connection errors
      ws.on('error', error => {
        this.logger.error('WebSocket error for document', {
          mapId: mapId.substring(0, 8) + '...', // Truncate for security
          clientId: ws.id?.substring(0, 16),
          error: error.message,
          errorType: error.name,
          totalClients: this.connections.get(mapId)?.size || 0
        });
      });
    } catch (error) {
      this.logger.error('Failed to handle WebSocket connection', {
        url: request.url,
        error: error.message
      });
      ws.close(1011, 'Server error');
    }
  }

  /**
   * Apply update from WebSocket client to document
   */
  applyUpdateToDocument(mapId, updateData, ws) {
    try {
      const doc = this.docs.get(mapId);
      if (!doc) {
        this.logger.error(
          'Attempted to apply update to non-existent document',
          {
            mapId
          }
        );
        return;
      }

      // Apply update with WebSocket origin to prevent echo-back
      Y.applyUpdate(doc, updateData, ws.id);

      this.logger.debug('Applied update to document', {
        mapId,
        updateSize: updateData.length,
        origin: ws.id
      });
    } catch (error) {
      this.logger.error('Failed to apply update to document', {
        mapId,
        updateSize: updateData.length,
        error: error.message
      });
    }
  }

  /**
   * Broadcast update to all connected WebSocket clients except origin
   */
  broadcastUpdate(mapId, updateData, originWs) {
    const connections = this.connections.get(mapId);
    if (!connections) {
      return;
    }

    const closedConnections = [];

    for (const ws of connections) {
      // Skip origin WebSocket and closed connections
      if (ws === originWs || ws.readyState !== 1) {
        // 1 = WebSocket.OPEN
        if (ws.readyState === 0 || ws.readyState === 3) {
          // CONNECTING or CLOSED
          closedConnections.push(ws);
        }
        continue;
      }

      try {
        ws.send(updateData);
      } catch (error) {
        this.logger.error('Failed to send update to WebSocket client', {
          mapId,
          error: error.message
        });
        closedConnections.push(ws);
      }
    }

    // Clean up closed connections
    for (const closedWs of closedConnections) {
      connections.delete(closedWs);
    }
  }

  /**
   * Get statistics about a document
   */
  getDocumentStats(mapId) {
    const doc = this.docs.get(mapId);
    const connections = this.connections.get(mapId);
    const metadata = this.docMetadata.get(mapId);

    if (!doc) {
      return {
        exists: false,
        clientCount: 0,
        documentSize: 0,
        lastUpdate: null
      };
    }

    const activeConnections = connections
      ? Array.from(connections).filter(ws => ws.readyState === 1).length
      : 0;

    return {
      exists: true,
      clientCount: activeConnections,
      documentSize: Y.encodeStateAsUpdate(doc).length,
      lastUpdate: metadata ? metadata.lastUpdate : new Date()
    };
  }

  /**
   * Get service statistics and metrics
   * Used for monitoring and health checks
   * @returns {Object} Service statistics
   */
  getStats() {
    const connectionCounts = new Map();
    let totalConnections = 0;

    // Calculate connections per document
    for (const [mapId, connections] of this.connections) {
      const activeConnections = Array.from(connections).filter(
        ws => ws.readyState === 1
      ).length; // Only count OPEN connections
      connectionCounts.set(mapId, activeConnections);
      totalConnections += activeConnections;
    }

    return {
      // Document metrics
      activeDocuments: this.docs.size,
      documentsWithClients: this.connections.size,

      // Connection metrics
      totalConnections,
      averageConnectionsPerDocument:
        this.connections.size > 0
          ? Math.round((totalConnections / this.connections.size) * 100) / 100
          : 0,

      // Memory metrics (lightweight)
      documentsInMemory: this.docs.size,
      metadataEntries: this.docMetadata.size,

      // Uptime tracking
      oldestDocument:
        this.docMetadata.size > 0
          ? Math.min(
              ...Array.from(this.docMetadata.values()).map(m =>
                m.createdAt.getTime()
              )
            )
          : null,

      // Health indicators
      isHealthy:
        this.docs.size === this.docMetadata.size && this.persistence !== null,

      // Per-document breakdown (limited for security)
      documentsOverview: Array.from(connectionCounts.entries())
        .sort(([, a], [, b]) => b - a) // Sort by connection count desc
        .slice(0, 10) // Limit to top 10 for security
        .map(([mapId, connections]) => ({
          mapId: mapId.substring(0, 8) + '...', // Truncate for security
          connections,
          hasDocument: this.docs.has(mapId),
          lastUpdate:
            this.docMetadata.get(mapId)?.lastUpdate?.toISOString() || null
        }))
    };
  }

  /**
   * Get health status for this service
   * @returns {Object} Health status information
   */
  getHealthStatus() {
    const stats = this.getStats();

    return {
      status: stats.isHealthy ? 'healthy' : 'degraded',
      details: {
        documentsLoaded: stats.activeDocuments,
        clientsConnected: stats.totalConnections,
        persistenceHealthy: this.persistence ? true : false,
        memoryConsistency: stats.isHealthy
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close all connections and clean up resources
   */
  close() {
    this.logger.info('YjsService shutting down', {
      documentsActive: this.docs.size,
      connectionsActive: Array.from(this.connections.values()).reduce(
        (total, set) =>
          total + Array.from(set).filter(ws => ws.readyState === 1).length,
        0
      )
    });

    // Close all WebSocket connections
    for (const [, connections] of this.connections) {
      for (const ws of connections) {
        if (ws.readyState === 1) {
          // WebSocket.OPEN
          ws.close(1001, 'Server shutting down');
        }
      }
    }

    // Clear all data structures
    this.connections.clear();
    this.docs.clear();
    this.docMetadata.clear();

    this.logger.info('YjsService shut down');
  }
}

module.exports = YjsService;
