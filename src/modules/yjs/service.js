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
    this.metrics = options.metrics || null;

    // Map of mapId -> Y.Doc instances
    this.docs = new Map();

    // Map of mapId -> Set of WebSocket connections
    this.connections = new Map();

    // Document metadata
    this.docMetadata = new Map();

    // Performance tracking
    this.performanceData = {
      startTime: Date.now(),
      totalOperations: 0,
      errorCount: 0,
    };

    // Initialize persistence layer if provided
    if (options.persistence !== undefined) {
      this.persistence = options.persistence;
    } else {
      // Default: create persistence with database file
      const dbFile =
        options.dbFile ||
        require('path').join(process.cwd(), 'data', 'yjs.sqlite');
      this.persistence = new YjsPersistence(dbFile);
    }
  }

  /**
   * Get or create a Y.Doc for the given mapId
   * Restores from snapshot if available
   */
  async getOrCreateDocument(mapId) {
    if (this.docs.has(mapId)) {
      return this.docs.get(mapId);
    }

    const loadStartTime = Date.now();
    let hasSnapshot = false;
    let snapshotSize = 0;

    try {
      const doc = new Y.Doc();
      // Try to restore from snapshot if persistence is available
      if (this.persistence) {
        const snapshot = await this.persistence.getSnapshot(mapId);

        if (snapshot && snapshot.snapshot) {
          // Restore document state from snapshot
          hasSnapshot = true;
          snapshotSize = snapshot.snapshot.length;

          Y.applyUpdate(doc, new Uint8Array(snapshot.snapshot));

          const loadLatency = Date.now() - loadStartTime;

          this.logger.info('Yjs snapshot loaded', {
            mapId: mapId.substring(0, 8) + '...',
            snapshotSize: snapshotSize,
            loadLatency: loadLatency,
            restorationSuccess: true,
            documentState: {
              documentSize: Y.encodeStateAsUpdate(doc).length,
            },
          });

          if (this.metrics) {
            this.metrics.recordSnapshotLoad(mapId, snapshotSize, loadLatency);
          }
        } else {
          // Creating new room
          const memoryUsage = this.getMemoryUsage();

          this.logger.info('Yjs room created', {
            mapId: mapId.substring(0, 8) + '...',
            hasSnapshot: hasSnapshot,
            totalRooms: this.docs.size + 1,
            memoryUsage: memoryUsage,
          });

          if (this.metrics) {
            this.metrics.recordRoomCreated(mapId);
          }
        }
      } else {
        // No persistence - creating new room
        const memoryUsage = this.getMemoryUsage();

        this.logger.info('Yjs room created', {
          mapId: mapId.substring(0, 8) + '...',
          hasSnapshot: hasSnapshot,
          totalRooms: this.docs.size + 1,
          memoryUsage: memoryUsage,
        });

        if (this.metrics) {
          this.metrics.recordRoomCreated(mapId);
        }
      }

      // Set up update handler for persistence
      doc.on('update', (update, origin) => {
        this.handleDocumentUpdate(mapId, update, origin);
      });

      // Store document and metadata
      this.docs.set(mapId, doc);
      this.docMetadata.set(mapId, {
        createdAt: new Date(),
        lastUpdate: new Date(),
      });

      return doc;
    } catch (error) {
      const loadLatency = Date.now() - loadStartTime;

      this.logger.error('Yjs snapshot load failed', {
        mapId: mapId.substring(0, 8) + '...',
        error: error.message,
        errorType: error.constructor.name,
        fallbackAction: 'created_new_document',
        loadLatency: loadLatency,
        diagnostics: {
          persistenceHealthy: !!this.persistence,
          memoryUsage: this.getMemoryUsage(),
        },
      });

      // Fallback: create new document
      try {
        const doc = new Y.Doc();
        doc.on('update', (update, origin) => {
          this.handleDocumentUpdate(mapId, update, origin);
        });

        this.docs.set(mapId, doc);
        this.docMetadata.set(mapId, {
          createdAt: new Date(),
          lastUpdate: new Date(),
        });

        return doc;
      } catch (fallbackError) {
        this.logger.error('Failed to create Y.js document in fallback', {
          mapId: mapId.substring(0, 8) + '...',
          error: fallbackError.message,
          errorType: fallbackError.constructor.name,
        });
        throw fallbackError;
      }
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
        if (doc && this.persistence) {
          const saveStartTime = Date.now();
          const docState = Y.encodeStateAsUpdate(doc);

          await this.persistence.saveSnapshot(mapId, Buffer.from(docState));

          const saveLatency = Date.now() - saveStartTime;

          this.logger.debug('Yjs snapshot saved', {
            mapId: mapId.substring(0, 8) + '...',
            snapshotSize: docState.length,
            saveLatency: saveLatency,
            documentState: {
              totalUpdates: this.performanceData.totalOperations,
              documentSize: docState.length,
            },
            performance: {
              memoryUsage: this.getMemoryUsage(),
            },
          });

          // Record metrics
          if (this.metrics) {
            this.metrics.recordSnapshotSave(
              mapId,
              docState.length,
              saveLatency,
            );
          }

          this.performanceData.totalOperations++;
        }
      } else {
        this.logger.debug('Skipping snapshot save for remote update', {
          mapId,
          origin,
          updateSize: update.length,
        });
      }

      // Broadcast update to all connected clients except the origin
      this.broadcastUpdate(
        mapId,
        update,
        typeof origin === 'string' ? null : origin,
      );

      // Create audit trail for document modifications
      if (
        origin &&
        typeof origin === 'string' &&
        origin.startsWith('websocket-')
      ) {
        this.logAuditEvent('document_modified', mapId, origin, {
          updateSize: update.length,
          documentVersion: this.performanceData.totalOperations,
          clientCount: this.connections.get(mapId)?.size || 0,
        });
      }
    } catch (error) {
      this.logger.error('Failed to save document snapshot', {
        mapId,
        error: error.message,
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
          url: request.url,
        });
        return;
      }

      const mapId = urlMatch[1];
      ws.id = `websocket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      ws.connectTime = Date.now(); // Track connection time for session duration

      // Get or create document
      const doc = await this.getOrCreateDocument(mapId);

      // Add connection to tracking
      if (!this.connections.has(mapId)) {
        this.connections.set(mapId, new Set());
      }
      this.connections.get(mapId).add(ws);

      // Enhanced connection logging with detailed context
      const userAgent =
        request.headers['user-agent']?.substring(0, 100) || 'unknown';
      const clientIP =
        request.headers['x-forwarded-for'] ||
        request.headers['x-real-ip'] ||
        'unknown';
      const origin = request.headers['origin'] || 'unknown';

      this.logger.info('Yjs room connection established', {
        mapId: mapId.substring(0, 8) + '...',
        clientId: ws.id.substring(0, 16),
        userAgent: userAgent,
        origin: origin,
        clientIP: clientIP,
        totalClientsInRoom: this.connections.get(mapId).size,
        totalActiveRooms: this.docs.size,
      });

      // Record metrics
      if (this.metrics) {
        this.metrics.recordClientConnected(ws.id, mapId, userAgent);
      }

      // Send initial document state to new client
      const initialState = Y.encodeStateAsUpdate(doc);
      if (initialState.length > 0) {
        ws.send(initialState);
      }

      // Set up message handler
      ws.on('message', (data) => {
        try {
          if (!(data instanceof Uint8Array) && !Buffer.isBuffer(data)) {
            this.logger.error('Invalid WebSocket message format', {
              mapId,
              dataType: typeof data,
            });
            return;
          }

          const updateData =
            data instanceof Uint8Array ? data : new Uint8Array(data);
          this.applyUpdateToDocument(mapId, updateData, ws);
        } catch (error) {
          this.logger.error('Error processing WebSocket message', {
            mapId,
            error: error.message,
          });
        }
      });

      // Handle connection close
      ws.on('close', () => {
        const connectTime = ws.connectTime || Date.now();
        const sessionDuration = Date.now() - connectTime;

        const connections = this.connections.get(mapId);
        if (connections) {
          connections.delete(ws);
          if (connections.size === 0) {
            this.connections.delete(mapId);
          }
        }

        this.logger.info('Yjs room connection closed', {
          mapId: mapId.substring(0, 8) + '...',
          clientId: ws.id?.substring(0, 16),
          sessionDuration: Math.round(sessionDuration / 1000), // seconds
          remainingClients: connections ? connections.size : 0,
          roomCleanedUp: !connections || connections.size === 0,
        });

        // Record metrics
        if (this.metrics) {
          this.metrics.recordClientDisconnected(ws.id);
        }
      });

      // Handle connection errors
      ws.on('error', (error) => {
        this.logger.error('WebSocket error for document', {
          mapId: mapId.substring(0, 8) + '...', // Truncate for security
          clientId: ws.id?.substring(0, 16),
          error: error.message,
          errorType: error.name,
          totalClients: this.connections.get(mapId)?.size || 0,
        });
      });
    } catch (error) {
      this.logger.error('Failed to handle WebSocket connection', {
        url: request.url,
        error: error.message,
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
            mapId,
          },
        );
        return;
      }

      // Apply update with WebSocket origin to prevent echo-back
      Y.applyUpdate(doc, updateData, ws.id);

      this.logger.debug('Applied update to document', {
        mapId,
        updateSize: updateData.length,
        origin: ws.id,
      });
    } catch (error) {
      // Enhanced error logging with diagnostics
      this.logger.error('Yjs message processing error', {
        mapId: mapId.substring(0, 8) + '...',
        clientId: ws.id,
        error: error.message,
        messageSize: updateData.length,
        diagnostics: {
          documentExists: this.docs.has(mapId),
          clientConnected: ws.readyState === 1,
        },
      });

      // Record error metrics
      if (this.metrics) {
        this.metrics.recordWebSocketError('message', error.message, {
          mapId: mapId,
          clientId: ws.id,
          messageSize: updateData.length,
        });
      }

      this.performanceData.errorCount++;
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
          error: error.message,
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
        lastUpdate: null,
      };
    }

    const activeConnections = connections
      ? Array.from(connections).filter((ws) => ws.readyState === 1).length
      : 0;

    return {
      exists: true,
      clientCount: activeConnections,
      documentSize: Y.encodeStateAsUpdate(doc).length,
      lastUpdate: metadata ? metadata.lastUpdate : new Date(),
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
        (ws) => ws.readyState === 1,
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
              ...Array.from(this.docMetadata.values()).map((m) =>
                m.createdAt.getTime(),
              ),
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
            this.docMetadata.get(mapId)?.lastUpdate?.toISOString() || null,
        })),
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
        memoryConsistency: stats.isHealthy,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log REST bridge access events
   */
  logRestBridgeAccess(mapId, operation, clientInfo) {
    this.logger.info('Yjs REST bridge access', {
      mapId: mapId.substring(0, 8) + '...',
      operation: operation,
      clientInfo: clientInfo,
      bridgeMode: 'rest_to_yjs',
      documentExists: this.docs.has(mapId),
      activeClients: this.connections.get(mapId)?.size || 0,
    });
  }

  /**
   * Log REST bridge conversion events
   */
  logRestBridgeConversion(mapId, conversionDetails) {
    const conversionRate =
      conversionDetails.dataSize / conversionDetails.conversionTime;

    this.logger.debug('Yjs REST bridge conversion', {
      mapId: mapId.substring(0, 8) + '...',
      conversion: conversionDetails,
      performance: {
        conversionRate: Math.round(conversionRate * 100) / 100, // bytes per ms
        memoryUsage: this.getMemoryUsage(),
      },
    });
  }

  /**
   * Log WebSocket errors with diagnostic context
   */
  logWebSocketError(errorType, error, context) {
    const diagnostics = {
      activeConnections: Array.from(this.connections.values()).reduce(
        (total, set) =>
          total + Array.from(set).filter((ws) => ws.readyState === 1).length,
        0,
      ),
      serverHealth: this.docs.size > 0 ? 'active' : 'idle',
      memoryPressure: this.getMemoryUsage() > 500 * 1024 * 1024, // > 500MB
    };

    this.logger.error('Yjs WebSocket error', {
      errorType: errorType,
      error: error.message,
      context: context,
      diagnostics: diagnostics,
    });

    if (this.metrics) {
      this.metrics.recordWebSocketError(errorType, error.message, context);
    }
  }

  /**
   * Log performance summaries
   */
  logPerformanceSummary() {
    const uptime = Date.now() - this.performanceData.startTime;
    const totalClients = Array.from(this.connections.values()).reduce(
      (total, set) => total + set.size,
      0,
    );

    const metrics = {
      totalRooms: this.docs.size,
      totalClients: totalClients,
      averageRoomSize:
        this.docs.size > 0
          ? Math.round((totalClients / this.docs.size) * 100) / 100
          : 0,
      memoryUsage: this.getMemoryUsage(),
    };

    const performance = {
      averageSnapshotLatency: 0, // Would be calculated from metrics
      averageMessageProcessingTime: 0, // Would be calculated from metrics
      errorRate:
        this.performanceData.totalOperations > 0
          ? this.performanceData.errorCount /
            this.performanceData.totalOperations
          : 0,
    };

    this.logger.info('Yjs performance summary', {
      uptime: uptime,
      metrics: metrics,
      performance: performance,
    });
  }

  /**
   * Check resource usage and warn if thresholds exceeded
   */
  checkResourceUsage() {
    const memUsage = process.memoryUsage();
    const memoryThreshold = 500 * 1024 * 1024; // 500MB

    if (memUsage.heapUsed > memoryThreshold) {
      const recommendations = [
        'Consider reducing document cache size',
        'Review active connection count',
        'Check for memory leaks in document handling',
      ];

      this.logger.warn('Yjs high resource usage detected', {
        memoryUsage: {
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          percentage: Math.round(
            (memUsage.heapUsed / memUsage.heapTotal) * 100,
          ),
        },
        activeResources: {
          rooms: this.docs.size,
          clients: Array.from(this.connections.values()).reduce(
            (total, set) => total + set.size,
            0,
          ),
        },
        recommendations: recommendations,
      });
    }
  }

  /**
   * Create audit trail logs for significant events
   */
  logAuditEvent(event, mapId, clientId, metadata = {}) {
    this.logger.info('Yjs audit event', {
      event: event,
      mapId: mapId.substring(0, 8) + '...',
      clientId: clientId,
      timestamp: new Date().toISOString(),
      metadata: metadata,
    });
  }

  /**
   * Get memory usage in bytes
   */
  getMemoryUsage() {
    return process.memoryUsage().heapUsed;
  }

  /**
   * Delete a Y.js document and clean up all associated resources
   * @param {string} mapId - The map ID to delete
   * @returns {Promise<boolean>} - True if document was deleted, false if it didn't exist
   */
  async deleteDocument(mapId) {
    try {
      const hadDocument = this.docs.has(mapId);
      const hadConnections = this.connections.has(mapId);

      if (!hadDocument && !hadConnections) {
        this.logger.debug(
          'Document deletion requested for non-existent document',
          {
            mapId: mapId.substring(0, 8) + '...',
          },
        );
        return false;
      }

      // Close all WebSocket connections for this document
      if (hadConnections) {
        const connections = this.connections.get(mapId);
        const connectionCount = connections.size;

        this.logger.info(
          'Closing WebSocket connections for document deletion',
          {
            mapId: mapId.substring(0, 8) + '...',
            connectionCount: connectionCount,
          },
        );

        for (const ws of connections) {
          if (ws.readyState === 1) {
            // WebSocket.OPEN
            ws.close(1000, 'Document deleted');
          }
        }

        this.connections.delete(mapId);

        // Record metrics
        if (this.metrics) {
          this.metrics.recordDocumentDeleted(mapId, connectionCount);
        }
      }

      // Remove document from memory
      if (hadDocument) {
        const doc = this.docs.get(mapId);

        // Destroy the Y.js document to free memory
        if (doc && typeof doc.destroy === 'function') {
          doc.destroy();
        }

        this.docs.delete(mapId);
      }

      // Remove metadata
      this.docMetadata.delete(mapId);

      // Delete persisted snapshot if persistence is available
      if (this.persistence && this.persistence.deleteSnapshot) {
        try {
          await this.persistence.deleteSnapshot(mapId);

          this.logger.info('Document and snapshot deleted', {
            mapId: mapId.substring(0, 8) + '...',
            hadDocument: hadDocument,
            hadConnections: hadConnections,
          });
        } catch (error) {
          this.logger.warn('Failed to delete document snapshot', {
            mapId: mapId.substring(0, 8) + '...',
            error: error.message,
          });
        }
      } else {
        this.logger.info('Document deleted from memory', {
          mapId: mapId.substring(0, 8) + '...',
          hadDocument: hadDocument,
          hadConnections: hadConnections,
        });
      }

      // Create audit trail
      this.logAuditEvent('document_deleted', mapId, 'system', {
        hadDocument: hadDocument,
        hadConnections: hadConnections,
        deletedAt: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete Y.js document', {
        mapId: mapId.substring(0, 8) + '...',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Close all connections and clean up resources
   */
  close() {
    this.logger.info('YjsService shutting down', {
      documentsActive: this.docs.size,
      connectionsActive: Array.from(this.connections.values()).reduce(
        (total, set) =>
          total + Array.from(set).filter((ws) => ws.readyState === 1).length,
        0,
      ),
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
