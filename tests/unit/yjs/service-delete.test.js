/**
 * Tests for YjsService document deletion functionality
 */

const YjsService = require('../../../src/modules/yjs/service');
const YjsMetrics = require('../../../src/modules/yjs/metrics');

// Mock Y.js
jest.mock('yjs', () => ({
  Doc: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    destroy: jest.fn(),
  })),
  encodeStateAsUpdate: jest.fn(() => new Uint8Array([1, 2, 3, 4])),
  applyUpdate: jest.fn(),
}));

// Mock WebSocket
const mockWebSocket = (readyState = 1) => ({
  readyState,
  close: jest.fn(),
  id: `ws-${Math.random().toString(36).substr(2, 9)}`,
});

describe('YjsService deleteDocument', () => {
  let service;
  let mockPersistence;
  let mockMetrics;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockPersistence = {
      deleteSnapshot: jest.fn(),
    };

    mockMetrics = new YjsMetrics({ logger: mockLogger });
    mockMetrics.recordDocumentDeleted = jest.fn();

    service = new YjsService({
      persistence: mockPersistence,
      logger: mockLogger,
    });

    service.metrics = mockMetrics;
  });

  afterEach(() => {
    service.close();
  });

  describe('deleteDocument', () => {
    it('should return false for non-existent document', async () => {
      const result = await service.deleteDocument('non-existent-map');

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Document deletion requested for non-existent document',
        { mapId: 'non-exis...' },
      );
    });

    it('should delete document and cleanup resources', async () => {
      const mapId = 'test-map-123';

      // Mock successful snapshot deletion
      mockPersistence.deleteSnapshot.mockResolvedValue(true);

      // Create a document first
      await service.getOrCreateDocument(mapId);

      // Verify document exists
      expect(service.docs.has(mapId)).toBe(true);
      expect(service.docMetadata.has(mapId)).toBe(true);

      // Delete the document
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(service.docs.has(mapId)).toBe(false);
      expect(service.docMetadata.has(mapId)).toBe(false);
      expect(service.connections.has(mapId)).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Document and snapshot deleted',
        expect.objectContaining({
          mapId: 'test-map...',
          hadDocument: true,
          hadConnections: false,
        }),
      );
    });

    it('should close WebSocket connections when deleting document', async () => {
      const mapId = 'test-map-456';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Add mock WebSocket connections
      const ws1 = mockWebSocket(1); // OPEN
      const ws2 = mockWebSocket(1); // OPEN
      const ws3 = mockWebSocket(3); // CLOSED

      service.connections.set(mapId, new Set([ws1, ws2, ws3]));

      // Delete the document
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);

      // Verify open connections were closed
      expect(ws1.close).toHaveBeenCalledWith(1000, 'Document deleted');
      expect(ws2.close).toHaveBeenCalledWith(1000, 'Document deleted');
      expect(ws3.close).not.toHaveBeenCalled(); // Already closed

      // Verify connections were cleared
      expect(service.connections.has(mapId)).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Closing WebSocket connections for document deletion',
        expect.objectContaining({
          mapId: 'test-map...',
          connectionCount: 3,
        }),
      );
    });

    it('should delete persisted snapshot when persistence is available', async () => {
      const mapId = 'test-map-789';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Reset any previous calls and mock successful snapshot deletion
      mockPersistence.deleteSnapshot.mockReset();
      mockPersistence.deleteSnapshot.mockResolvedValue(true);

      // Delete the document
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(mockPersistence.deleteSnapshot).toHaveBeenCalledWith(mapId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Document and snapshot deleted',
        expect.objectContaining({
          mapId: 'test-map...',
          hadDocument: true,
          hadConnections: false,
        }),
      );
    });

    it('should handle persistence deletion errors gracefully', async () => {
      const mapId = 'test-map-error';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Reset any previous calls and mock persistence error
      mockPersistence.deleteSnapshot.mockReset();
      const persistenceError = new Error('Database connection failed');
      mockPersistence.deleteSnapshot.mockRejectedValue(persistenceError);

      // Delete the document
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(mockPersistence.deleteSnapshot).toHaveBeenCalledWith(mapId);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete document snapshot',
        expect.objectContaining({
          mapId: 'test-map...',
          error: 'Database connection failed',
        }),
      );

      // Document should still be deleted from memory
      expect(service.docs.has(mapId)).toBe(false);
    });

    it('should record metrics when deleting document', async () => {
      const mapId = 'test-map-metrics';

      // Create a document with connections
      await service.getOrCreateDocument(mapId);
      const ws1 = mockWebSocket(1);
      const ws2 = mockWebSocket(1);
      service.connections.set(mapId, new Set([ws1, ws2]));

      // Delete the document
      await service.deleteDocument(mapId);

      expect(mockMetrics.recordDocumentDeleted).toHaveBeenCalledWith(mapId, 2);
    });

    it('should create audit trail when deleting document', async () => {
      const mapId = 'test-map-audit';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Mock logAuditEvent method
      service.logAuditEvent = jest.fn();

      // Delete the document
      await service.deleteDocument(mapId);

      expect(service.logAuditEvent).toHaveBeenCalledWith(
        'document_deleted',
        mapId,
        'system',
        expect.objectContaining({
          hadDocument: true,
          hadConnections: false,
          deletedAt: expect.any(String),
        }),
      );
    });

    it('should handle document deletion errors', async () => {
      const mapId = 'test-map-error-handling';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Mock Y.Doc destroy to throw error
      const mockDoc = service.docs.get(mapId);
      mockDoc.destroy = jest.fn(() => {
        throw new Error('Y.Doc destroy failed');
      });

      // Delete should handle the error and still complete
      await expect(service.deleteDocument(mapId)).rejects.toThrow(
        'Y.Doc destroy failed',
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete Y.js document',
        expect.objectContaining({
          mapId: 'test-map...',
          error: 'Y.Doc destroy failed',
        }),
      );
    });

    it('should handle missing Y.Doc destroy method gracefully', async () => {
      const mapId = 'test-map-no-destroy';

      // Create a document
      await service.getOrCreateDocument(mapId);

      // Remove destroy method from mock document
      const mockDoc = service.docs.get(mapId);
      delete mockDoc.destroy;

      // Delete should handle missing destroy method
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(service.docs.has(mapId)).toBe(false);
    });

    it('should handle document with connections but no document object', async () => {
      const mapId = 'test-map-connections-only';

      // Mock successful snapshot deletion
      mockPersistence.deleteSnapshot.mockResolvedValue(true);

      // Add connections without creating document
      const ws1 = mockWebSocket(1);
      service.connections.set(mapId, new Set([ws1]));

      // Delete should handle connections even without document
      const result = await service.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(ws1.close).toHaveBeenCalledWith(1000, 'Document deleted');
      expect(service.connections.has(mapId)).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Document and snapshot deleted',
        expect.objectContaining({
          mapId: 'test-map...',
          hadDocument: false,
          hadConnections: true,
        }),
      );
    });

    it('should delete document without persistence (memory only)', async () => {
      // Create service without persistence
      const serviceNoPersistence = new YjsService({
        logger: mockLogger,
        persistence: null, // Explicitly set to null
      });

      serviceNoPersistence.metrics = mockMetrics;

      // Verify no persistence is set
      expect(serviceNoPersistence.persistence).toBeNull();

      const mapId = 'test-map-memory-only';

      // Create a document
      await serviceNoPersistence.getOrCreateDocument(mapId);

      // Verify document exists
      expect(serviceNoPersistence.docs.has(mapId)).toBe(true);

      // Delete the document
      const result = await serviceNoPersistence.deleteDocument(mapId);

      expect(result).toBe(true);
      expect(serviceNoPersistence.docs.has(mapId)).toBe(false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Document deleted from memory',
        expect.objectContaining({
          mapId: 'test-map...',
          hadDocument: true,
          hadConnections: false,
        }),
      );

      serviceNoPersistence.close();
    });
  });
});
