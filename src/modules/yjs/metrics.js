/**
 * Yjs Metrics Collector
 * Provides comprehensive metrics for Yjs real-time collaboration features
 * Integrates with the monitoring infrastructure from MS-67
 */

class YjsMetrics {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.yjsService = options.yjsService;

    // Metrics storage
    this.metrics = {
      // Snapshot metrics
      snapshots: {
        totalCount: 0,
        totalSizeBytes: 0,
        saveOperations: 0,
        loadOperations: 0,
        averageSize: 0,
        largestSnapshot: 0,
        latestSnapshotTime: null,
      },

      // Room/Document metrics
      rooms: {
        totalActive: 0,
        totalEverCreated: 0,
        averageClientsPerRoom: 0,
        roomsWithoutClients: 0,
        oldestActiveRoom: null,
      },

      // Client connection metrics
      clients: {
        totalConnected: 0,
        totalEverConnected: 0,
        connectionsToday: 0,
        averageSessionDuration: 0,
        concurrentPeakToday: 0,
      },

      // WebSocket error metrics
      websocketErrors: {
        connectionErrors: 0,
        messageErrors: 0,
        upgradeErrors: 0,
        totalErrors: 0,
        errorsByType: new Map(),
        recentErrors: [], // Last 10 errors with timestamps
      },

      // Performance metrics
      performance: {
        averageSnapshotLatency: 0,
        averageMessageProcessingTime: 0,
        averageDocumentLoadTime: 0,
        slowOperationsCount: 0,
      },
    };

    // Performance tracking
    this.performanceTracking = {
      snapshotLatencies: [],
      messageProcessingTimes: [],
      documentLoadTimes: [],
    };

    // Session tracking
    this.sessionTracking = new Map(); // clientId -> { startTime, roomId, bytesTransferred }
    this.dailyTracking = {
      date: new Date().toDateString(),
      connectionsCount: 0,
      peakConcurrent: 0,
    };

    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Initialize metrics collection intervals and event handlers
   */
  startMetricsCollection() {
    // Update metrics every 30 seconds
    this.metricsInterval = setInterval(() => {
      this.updateRealTimeMetrics();
    }, 30000);

    // Reset daily tracking at midnight
    this.dailyResetInterval = setInterval(() => {
      this.resetDailyTracking();
    }, 60000); // Check every minute

    this.logger.debug('Yjs metrics collection started');
  }

  /**
   * Update real-time metrics from YjsService
   */
  updateRealTimeMetrics() {
    if (!this.yjsService) return;

    const serviceStats = this.yjsService.getStats();

    // Update room metrics
    this.metrics.rooms.totalActive = serviceStats.activeDocuments;
    this.metrics.rooms.averageClientsPerRoom =
      serviceStats.averageConnectionsPerDocument;
    this.metrics.rooms.roomsWithoutClients =
      serviceStats.activeDocuments - serviceStats.documentsWithClients;

    if (serviceStats.oldestDocument) {
      this.metrics.rooms.oldestActiveRoom = new Date(
        serviceStats.oldestDocument,
      );
    }

    // Update client metrics
    this.metrics.clients.totalConnected = serviceStats.totalConnections;

    // Track daily peak
    if (this.dailyTracking.date === new Date().toDateString()) {
      if (serviceStats.totalConnections > this.dailyTracking.peakConcurrent) {
        this.dailyTracking.peakConcurrent = serviceStats.totalConnections;
        this.metrics.clients.concurrentPeakToday =
          serviceStats.totalConnections;
      }
    }
  }

  /**
   * Record snapshot save operation
   */
  recordSnapshotSave(mapId, snapshotSize, latencyMs) {
    this.metrics.snapshots.saveOperations++;
    this.metrics.snapshots.totalSizeBytes += snapshotSize;
    this.metrics.snapshots.latestSnapshotTime = new Date();

    if (snapshotSize > this.metrics.snapshots.largestSnapshot) {
      this.metrics.snapshots.largestSnapshot = snapshotSize;
    }

    // Update average size
    if (this.metrics.snapshots.saveOperations > 0) {
      this.metrics.snapshots.averageSize = Math.round(
        this.metrics.snapshots.totalSizeBytes /
          this.metrics.snapshots.saveOperations,
      );
    }

    // Track latency
    this.recordSnapshotLatency(latencyMs);

    this.logger.debug('Yjs snapshot save recorded', {
      mapId: mapId.substring(0, 8) + '...',
      size: snapshotSize,
      latency: latencyMs,
      totalSaves: this.metrics.snapshots.saveOperations,
    });
  }

  /**
   * Record snapshot load operation
   */
  recordSnapshotLoad(mapId, snapshotSize, latencyMs) {
    this.metrics.snapshots.loadOperations++;
    this.metrics.snapshots.totalCount = Math.max(
      this.metrics.snapshots.totalCount,
      this.metrics.snapshots.saveOperations,
    );

    // Track latency
    this.recordSnapshotLatency(latencyMs);

    this.logger.debug('Yjs snapshot load recorded', {
      mapId: mapId.substring(0, 8) + '...',
      size: snapshotSize,
      latency: latencyMs,
      totalLoads: this.metrics.snapshots.loadOperations,
    });
  }

  /**
   * Record snapshot latency for performance tracking
   */
  recordSnapshotLatency(latencyMs) {
    this.performanceTracking.snapshotLatencies.push(latencyMs);

    // Keep only last 100 measurements for rolling average
    if (this.performanceTracking.snapshotLatencies.length > 100) {
      this.performanceTracking.snapshotLatencies.shift();
    }

    // Update average latency
    const sum = this.performanceTracking.snapshotLatencies.reduce(
      (a, b) => a + b,
      0,
    );
    this.metrics.performance.averageSnapshotLatency = Math.round(
      sum / this.performanceTracking.snapshotLatencies.length,
    );

    // Track slow operations (>500ms)
    if (latencyMs > 500) {
      this.metrics.performance.slowOperationsCount++;
    }
  }

  /**
   * Record room creation
   */
  recordRoomCreated(mapId) {
    this.metrics.rooms.totalEverCreated++;

    this.logger.info('Yjs room created', {
      mapId: mapId.substring(0, 8) + '...',
      totalRooms: this.metrics.rooms.totalEverCreated,
    });
  }

  /**
   * Record client connection
   */
  recordClientConnected(clientId, mapId, userAgent = 'unknown') {
    this.metrics.clients.totalEverConnected++;

    // Update daily tracking
    if (this.dailyTracking.date === new Date().toDateString()) {
      this.dailyTracking.connectionsCount++;
      this.metrics.clients.connectionsToday =
        this.dailyTracking.connectionsCount;
    }

    // Start session tracking
    this.sessionTracking.set(clientId, {
      startTime: new Date(),
      roomId: mapId,
      bytesTransferred: 0,
      userAgent: userAgent.substring(0, 100), // Limit length for security
    });

    this.logger.info('Yjs client connected', {
      clientId: clientId.substring(0, 16),
      mapId: mapId.substring(0, 8) + '...',
      totalEverConnected: this.metrics.clients.totalEverConnected,
      dailyConnections: this.metrics.clients.connectionsToday,
    });
  }

  /**
   * Record client disconnection
   */
  recordClientDisconnected(clientId) {
    const session = this.sessionTracking.get(clientId);

    if (session) {
      const sessionDuration = Date.now() - session.startTime.getTime();

      // Update average session duration
      this.updateAverageSessionDuration(sessionDuration);

      this.sessionTracking.delete(clientId);

      this.logger.info('Yjs client disconnected', {
        clientId: clientId.substring(0, 16),
        sessionDuration: Math.round(sessionDuration / 1000), // seconds
        bytesTransferred: session.bytesTransferred,
      });
    }
  }

  /**
   * Update average session duration
   */
  updateAverageSessionDuration(newDuration) {
    // Simple exponential moving average
    const alpha = 0.1; // Weight for new values
    if (this.metrics.clients.averageSessionDuration === 0) {
      this.metrics.clients.averageSessionDuration = newDuration;
    } else {
      this.metrics.clients.averageSessionDuration =
        alpha * newDuration +
        (1 - alpha) * this.metrics.clients.averageSessionDuration;
    }
  }

  /**
   * Record WebSocket error
   */
  recordWebSocketError(errorType, errorMessage, context = {}) {
    this.metrics.websocketErrors.totalErrors++;

    // Categorize error
    switch (errorType) {
      case 'connection':
        this.metrics.websocketErrors.connectionErrors++;
        break;
      case 'message':
        this.metrics.websocketErrors.messageErrors++;
        break;
      case 'upgrade':
        this.metrics.websocketErrors.upgradeErrors++;
        break;
    }

    // Track errors by type
    const count = this.metrics.websocketErrors.errorsByType.get(errorType) || 0;
    this.metrics.websocketErrors.errorsByType.set(errorType, count + 1);

    // Store recent error
    this.metrics.websocketErrors.recentErrors.push({
      timestamp: new Date(),
      type: errorType,
      message: errorMessage.substring(0, 200), // Limit message length
      context: context,
    });

    // Keep only last 10 errors
    if (this.metrics.websocketErrors.recentErrors.length > 10) {
      this.metrics.websocketErrors.recentErrors.shift();
    }

    this.logger.error('Yjs WebSocket error recorded', {
      type: errorType,
      message: errorMessage,
      totalErrors: this.metrics.websocketErrors.totalErrors,
      context,
    });
  }

  /**
   * Record document deletion
   */
  recordDocumentDeleted(mapId, connectionCount) {
    this.logger.debug('Yjs document deletion recorded', {
      mapId: mapId.substring(0, 8) + '...',
      connectionCount: connectionCount,
      timestamp: new Date().toISOString(),
    });

    // Document deletion doesn't directly affect our current metrics structure,
    // but we log it for audit purposes. In the future, we could add
    // deletion-specific metrics if needed.
  }

  /**
   * Record message processing time
   */
  recordMessageProcessingTime(processingTimeMs) {
    this.performanceTracking.messageProcessingTimes.push(processingTimeMs);

    // Keep only last 100 measurements
    if (this.performanceTracking.messageProcessingTimes.length > 100) {
      this.performanceTracking.messageProcessingTimes.shift();
    }

    // Update average
    const sum = this.performanceTracking.messageProcessingTimes.reduce(
      (a, b) => a + b,
      0,
    );
    this.metrics.performance.averageMessageProcessingTime = Math.round(
      sum / this.performanceTracking.messageProcessingTimes.length,
    );
  }

  /**
   * Reset daily tracking at midnight
   */
  resetDailyTracking() {
    const today = new Date().toDateString();

    if (this.dailyTracking.date !== today) {
      this.dailyTracking = {
        date: today,
        connectionsCount: 0,
        peakConcurrent: 0,
      };

      // Reset daily metrics
      this.metrics.clients.connectionsToday = 0;
      this.metrics.clients.concurrentPeakToday = 0;

      this.logger.info('Yjs daily metrics reset', { date: today });
    }
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    // Update real-time metrics before returning
    this.updateRealTimeMetrics();

    return {
      ...this.metrics,

      // Add computed metrics
      computed: {
        snapshotEfficiency:
          this.metrics.snapshots.saveOperations > 0
            ? Math.round(
                (this.metrics.snapshots.loadOperations /
                  this.metrics.snapshots.saveOperations) *
                  100,
              ) / 100
            : 0,

        averageRoomUtilization:
          this.metrics.rooms.totalActive > 0
            ? Math.round(
                (this.metrics.clients.totalConnected /
                  this.metrics.rooms.totalActive) *
                  100,
              ) / 100
            : 0,

        errorRate:
          this.metrics.clients.totalEverConnected > 0
            ? Math.round(
                (this.metrics.websocketErrors.totalErrors /
                  this.metrics.clients.totalEverConnected) *
                  1000,
              ) / 1000
            : 0,

        averageSessionDurationMinutes: Math.round(
          this.metrics.clients.averageSessionDuration / (1000 * 60),
        ),
      },

      // Add collection timestamp
      collectedAt: new Date().toISOString(),
    };
  }

  /**
   * Get health status based on metrics
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const issues = [];

    // Check for high error rates
    if (metrics.computed.errorRate > 0.1) {
      // More than 10% error rate
      issues.push(
        `High WebSocket error rate: ${(metrics.computed.errorRate * 100).toFixed(1)}%`,
      );
    }

    // Check for slow operations
    if (metrics.performance.averageSnapshotLatency > 1000) {
      // More than 1 second
      issues.push(
        `Slow snapshot operations: ${metrics.performance.averageSnapshotLatency}ms avg`,
      );
    }

    // Check for too many slow operations
    if (metrics.performance.slowOperationsCount > 10) {
      issues.push(
        `Many slow operations: ${metrics.performance.slowOperationsCount}`,
      );
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'degraded',
      issues: issues,
      metrics: {
        totalRooms: metrics.rooms.totalActive,
        totalClients: metrics.clients.totalConnected,
        totalSnapshots: metrics.snapshots.totalCount,
        errorRate: metrics.computed.errorRate,
        avgLatency: metrics.performance.averageSnapshotLatency,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.dailyResetInterval) {
      clearInterval(this.dailyResetInterval);
    }

    this.sessionTracking.clear();

    this.logger.debug('Yjs metrics collector destroyed');
  }
}

module.exports = YjsMetrics;
