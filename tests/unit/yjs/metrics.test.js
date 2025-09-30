const YjsMetrics = require('../../../src/modules/yjs/metrics');

// Mock YjsService for testing
class MockYjsService {
  constructor() {
    this.mockStats = {
      activeDocuments: 5,
      documentsWithClients: 3,
      totalConnections: 12,
      averageConnectionsPerDocument: 2.4,
      oldestDocument: Date.now() - 3600000, // 1 hour ago
      isHealthy: true,
    };
  }

  getStats() {
    return this.mockStats;
  }

  setMockStats(stats) {
    this.mockStats = { ...this.mockStats, ...stats };
  }
}

describe('YjsMetrics', () => {
  let metrics;
  let mockYjsService;
  let mockLogger;

  beforeEach(() => {
    // Clear any existing intervals
    jest.clearAllTimers();
    jest.useFakeTimers('modern');

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };

    mockYjsService = new MockYjsService();

    metrics = new YjsMetrics({
      logger: mockLogger,
      yjsService: mockYjsService,
    });
  });

  afterEach(() => {
    if (metrics) {
      metrics.destroy();
    }
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    test('should initialize with default metrics structure', () => {
      const currentMetrics = metrics.getMetrics();

      expect(currentMetrics).toHaveProperty('snapshots');
      expect(currentMetrics).toHaveProperty('rooms');
      expect(currentMetrics).toHaveProperty('clients');
      expect(currentMetrics).toHaveProperty('websocketErrors');
      expect(currentMetrics).toHaveProperty('performance');
      expect(currentMetrics).toHaveProperty('computed');
      expect(currentMetrics).toHaveProperty('collectedAt');
    });

    test('should start metrics collection intervals', () => {
      expect(metrics.metricsInterval).toBeDefined();
      expect(metrics.dailyResetInterval).toBeDefined();
    });

    test('should log initialization', () => {
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Yjs metrics collection started',
      );
    });
  });

  describe('Snapshot Metrics', () => {
    test('should record snapshot save operations', () => {
      const mapId = 'test-map-12345';
      const snapshotSize = 1024;
      const latencyMs = 150;

      metrics.recordSnapshotSave(mapId, snapshotSize, latencyMs);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.snapshots.saveOperations).toBe(1);
      expect(currentMetrics.snapshots.totalSizeBytes).toBe(snapshotSize);
      expect(currentMetrics.snapshots.averageSize).toBe(snapshotSize);
      expect(currentMetrics.snapshots.largestSnapshot).toBe(snapshotSize);
      expect(currentMetrics.snapshots.latestSnapshotTime).toBeInstanceOf(Date);
    });

    test('should record snapshot load operations', () => {
      const mapId = 'test-map-12345';
      const snapshotSize = 2048;
      const latencyMs = 75;

      metrics.recordSnapshotLoad(mapId, snapshotSize, latencyMs);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.snapshots.loadOperations).toBe(1);
    });

    test('should calculate average snapshot size correctly', () => {
      metrics.recordSnapshotSave('map1', 1000, 100);
      metrics.recordSnapshotSave('map2', 2000, 150);
      metrics.recordSnapshotSave('map3', 1500, 125);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.snapshots.averageSize).toBe(1500); // (1000 + 2000 + 1500) / 3
      expect(currentMetrics.snapshots.largestSnapshot).toBe(2000);
    });

    test('should track snapshot latency and identify slow operations', () => {
      // Normal operation
      metrics.recordSnapshotSave('map1', 1000, 100);
      // Slow operation
      metrics.recordSnapshotSave('map2', 1000, 600);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.performance.slowOperationsCount).toBe(1);
      expect(currentMetrics.performance.averageSnapshotLatency).toBe(350); // (100 + 600) / 2
    });

    test('should log snapshot operations', () => {
      const mapId = 'test-map-12345';
      metrics.recordSnapshotSave(mapId, 1024, 150);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Yjs snapshot save recorded',
        expect.objectContaining({
          mapId: 'test-map...',
          size: 1024,
          latency: 150,
          totalSaves: 1,
        }),
      );
    });
  });

  describe('Room Metrics', () => {
    test('should record room creation', () => {
      const mapId = 'new-room-12345';

      metrics.recordRoomCreated(mapId);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.rooms.totalEverCreated).toBe(1);
    });

    test('should update real-time room metrics from service', () => {
      mockYjsService.setMockStats({
        activeDocuments: 10,
        documentsWithClients: 8,
        averageConnectionsPerDocument: 3.2,
      });

      metrics.updateRealTimeMetrics();

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.rooms.totalActive).toBe(10);
      expect(currentMetrics.rooms.averageClientsPerRoom).toBe(3.2);
      expect(currentMetrics.rooms.roomsWithoutClients).toBe(2); // 10 - 8
    });

    test('should log room creation', () => {
      const mapId = 'new-room-12345';
      metrics.recordRoomCreated(mapId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs room created',
        expect.objectContaining({
          mapId: 'new-room...',
          totalRooms: 1,
        }),
      );
    });
  });

  describe('Client Connection Metrics', () => {
    test('should record client connections', () => {
      const clientId = 'client-12345';
      const mapId = 'room-67890';
      const userAgent = 'Mozilla/5.0 TestBrowser';

      metrics.recordClientConnected(clientId, mapId, userAgent);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.totalEverConnected).toBe(1);
      expect(currentMetrics.clients.connectionsToday).toBe(1);
    });

    test('should record client disconnections and calculate session duration', () => {
      const clientId = 'client-12345';
      const mapId = 'room-67890';

      // Connect client
      metrics.recordClientConnected(clientId, mapId);

      // Advance time by 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Disconnect client
      metrics.recordClientDisconnected(clientId);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.averageSessionDuration).toBeGreaterThan(0);
    });

    test('should track daily peak concurrent connections', () => {
      // Mock service to show increasing connections
      mockYjsService.setMockStats({ totalConnections: 5 });
      metrics.updateRealTimeMetrics();

      mockYjsService.setMockStats({ totalConnections: 10 });
      metrics.updateRealTimeMetrics();

      mockYjsService.setMockStats({ totalConnections: 7 });
      metrics.updateRealTimeMetrics();

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.concurrentPeakToday).toBe(10);
    });

    test('should reset daily tracking at midnight', () => {
      // Set up some daily stats
      metrics.recordClientConnected('client1', 'room1');
      metrics.recordClientConnected('client2', 'room1');

      // Also simulate some peak concurrent connections
      mockYjsService.setMockStats({ totalConnections: 5 });
      metrics.updateRealTimeMetrics();

      let currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.connectionsToday).toBe(2);
      expect(currentMetrics.clients.concurrentPeakToday).toBeGreaterThan(0);

      // Mock Date to return a different day string
      const mockDateString = jest
        .spyOn(Date.prototype, 'toDateString')
        .mockReturnValue('Wed Sep 26 2024');

      metrics.resetDailyTracking();

      // Get metrics WITHOUT calling updateRealTimeMetrics to avoid re-setting the peak
      const resetMetrics = {
        ...metrics.metrics,
        collectedAt: new Date().toISOString(),
      };

      expect(resetMetrics.clients.connectionsToday).toBe(0);
      expect(resetMetrics.clients.concurrentPeakToday).toBe(0);

      // Restore original Date method
      mockDateString.mockRestore();
    });

    test('should log client connections and disconnections', () => {
      const clientId = 'client-12345';
      const mapId = 'room-67890';

      metrics.recordClientConnected(clientId, mapId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs client connected',
        expect.objectContaining({
          clientId: 'client-12345'.substring(0, 16),
          mapId: 'room-678...',
          totalEverConnected: 1,
        }),
      );

      metrics.recordClientDisconnected(clientId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs client disconnected',
        expect.objectContaining({
          clientId: 'client-12345'.substring(0, 16),
        }),
      );
    });
  });

  describe('WebSocket Error Metrics', () => {
    test('should record different types of WebSocket errors', () => {
      metrics.recordWebSocketError('connection', 'Connection refused', {
        url: '/yjs/test',
      });
      metrics.recordWebSocketError('message', 'Invalid message format');
      metrics.recordWebSocketError('upgrade', 'Upgrade failed');

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.websocketErrors.totalErrors).toBe(3);
      expect(currentMetrics.websocketErrors.connectionErrors).toBe(1);
      expect(currentMetrics.websocketErrors.messageErrors).toBe(1);
      expect(currentMetrics.websocketErrors.upgradeErrors).toBe(1);
    });

    test('should track errors by type', () => {
      metrics.recordWebSocketError('connection', 'Error 1');
      metrics.recordWebSocketError('connection', 'Error 2');
      metrics.recordWebSocketError('message', 'Error 3');

      const currentMetrics = metrics.getMetrics();
      expect(
        currentMetrics.websocketErrors.errorsByType.get('connection'),
      ).toBe(2);
      expect(currentMetrics.websocketErrors.errorsByType.get('message')).toBe(
        1,
      );
    });

    test('should maintain recent errors list (max 10)', () => {
      // Add 15 errors
      for (let i = 1; i <= 15; i++) {
        metrics.recordWebSocketError('connection', `Error ${i}`);
      }

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.websocketErrors.recentErrors).toHaveLength(10);

      // Should contain the last 10 errors (6-15)
      const errorMessages = currentMetrics.websocketErrors.recentErrors.map(
        (e) => e.message,
      );
      expect(errorMessages[0]).toBe('Error 6');
      expect(errorMessages[9]).toBe('Error 15');
    });

    test('should log WebSocket errors', () => {
      const errorType = 'connection';
      const errorMessage = 'Connection timeout';
      const context = { url: '/yjs/test-room' };

      metrics.recordWebSocketError(errorType, errorMessage, context);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Yjs WebSocket error recorded',
        expect.objectContaining({
          type: errorType,
          message: errorMessage,
          totalErrors: 1,
          context,
        }),
      );
    });
  });

  describe('Performance Metrics', () => {
    test('should record message processing times and calculate averages', () => {
      metrics.recordMessageProcessingTime(10);
      metrics.recordMessageProcessingTime(20);
      metrics.recordMessageProcessingTime(30);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.performance.averageMessageProcessingTime).toBe(20); // (10 + 20 + 30) / 3
    });

    test('should maintain rolling averages (max 100 measurements)', () => {
      // Add 150 measurements
      for (let i = 1; i <= 150; i++) {
        metrics.recordMessageProcessingTime(i);
      }

      // Should only keep the last 100
      expect(metrics.performanceTracking.messageProcessingTimes).toHaveLength(
        100,
      );

      // Average should be of values 51-150
      const expectedAverage = Math.round(((51 + 150) * 50) / 100); // Sum of arithmetic sequence / count
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.performance.averageMessageProcessingTime).toBe(
        expectedAverage,
      );
    });
  });

  describe('Computed Metrics', () => {
    test('should calculate snapshot efficiency', () => {
      metrics.recordSnapshotSave('map1', 1000, 100);
      metrics.recordSnapshotSave('map2', 1000, 100);
      metrics.recordSnapshotLoad('map1', 1000, 50);

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.computed.snapshotEfficiency).toBe(0.5); // 1 load / 2 saves
    });

    test('should calculate average room utilization', () => {
      // Mock service stats
      mockYjsService.setMockStats({
        activeDocuments: 5,
        totalConnections: 10,
      });

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.computed.averageRoomUtilization).toBe(2); // 10 clients / 5 rooms
    });

    test('should calculate error rate', () => {
      metrics.recordClientConnected('client1', 'room1');
      metrics.recordClientConnected('client2', 'room1');
      metrics.recordWebSocketError('connection', 'Error');

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.computed.errorRate).toBe(0.5); // 1 error / 2 connections
    });

    test('should convert average session duration to minutes', () => {
      // Mock a 10-minute session (600,000 ms)
      metrics.metrics.clients.averageSessionDuration = 600000;

      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.computed.averageSessionDurationMinutes).toBe(10);
    });
  });

  describe('Health Status', () => {
    test('should report healthy status with no issues', () => {
      const healthStatus = metrics.getHealthStatus();

      expect(healthStatus.status).toBe('healthy');
      expect(healthStatus.issues).toHaveLength(0);
      expect(healthStatus).toHaveProperty('metrics');
      expect(healthStatus).toHaveProperty('timestamp');
    });

    test('should report degraded status with high error rate', () => {
      // Create high error rate (>10%)
      for (let i = 0; i < 10; i++) {
        metrics.recordClientConnected(`client${i}`, 'room1');
      }
      for (let i = 0; i < 2; i++) {
        metrics.recordWebSocketError('connection', `Error ${i}`);
      }

      const healthStatus = metrics.getHealthStatus();

      expect(healthStatus.status).toBe('degraded');
      expect(healthStatus.issues.length).toBeGreaterThan(0);
      expect(healthStatus.issues[0]).toContain('High WebSocket error rate');
    });

    test('should report degraded status with slow operations', () => {
      // Create slow snapshot operations
      metrics.recordSnapshotSave('map1', 1000, 2000); // 2 seconds

      const healthStatus = metrics.getHealthStatus();

      expect(healthStatus.status).toBe('degraded');
      expect(
        healthStatus.issues.some((issue) =>
          issue.includes('Slow snapshot operations'),
        ),
      ).toBe(true);
    });

    test('should report degraded status with many slow operations', () => {
      // Create many slow operations
      for (let i = 0; i < 15; i++) {
        metrics.recordSnapshotSave(`map${i}`, 1000, 600); // 600ms (slow)
      }

      const healthStatus = metrics.getHealthStatus();

      expect(healthStatus.status).toBe('degraded');
      expect(
        healthStatus.issues.some((issue) =>
          issue.includes('Many slow operations'),
        ),
      ).toBe(true);
    });
  });

  describe('Metrics Updates and Intervals', () => {
    test('should update metrics automatically via intervals', () => {
      const initialMetrics = metrics.getMetrics();

      // Change mock service stats
      mockYjsService.setMockStats({
        activeDocuments: 15,
        totalConnections: 25,
      });

      // Trigger metrics update interval
      jest.advanceTimersByTime(30000);

      const updatedMetrics = metrics.getMetrics();
      expect(updatedMetrics.rooms.totalActive).toBe(15);
      expect(updatedMetrics.clients.totalConnected).toBe(25);
    });

    test('should check for daily reset via intervals', () => {
      // Set up some daily stats
      metrics.recordClientConnected('client1', 'room1');

      let currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.connectionsToday).toBe(1);

      // Mock Date to return a different day string
      const mockDateString = jest
        .spyOn(Date.prototype, 'toDateString')
        .mockReturnValue('Thu Sep 26 2024');

      // Trigger daily reset check
      jest.advanceTimersByTime(60000);

      currentMetrics = metrics.getMetrics();
      expect(currentMetrics.clients.connectionsToday).toBe(0);

      // Restore original Date method
      mockDateString.mockRestore();
    });
  });

  describe('Resource Cleanup', () => {
    test('should clean up intervals and resources on destroy', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      metrics.destroy();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(2); // metricsInterval and dailyResetInterval
      expect(metrics.sessionTracking.size).toBe(0);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Yjs metrics collector destroyed',
      );

      clearIntervalSpy.mockRestore();
    });
  });
});
