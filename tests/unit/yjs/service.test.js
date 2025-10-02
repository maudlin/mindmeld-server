const YjsService = require('../../../src/modules/yjs/service');
const YjsPersistence = require('../../../src/modules/yjs/persistence');
const { EventEmitter } = require('events');
const Y = require('yjs');
const encoding = require('lib0/encoding');
const syncProtocol = require('y-protocols/sync');

// Mock the persistence module
jest.mock('../../../src/modules/yjs/persistence');

describe('YjsService', () => {
  let yjsService;
  let mockPersistence;
  let mockLogger;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock persistence
    mockPersistence = {
      saveSnapshot: jest.fn().mockResolvedValue(undefined),
      getSnapshot: jest.fn().mockResolvedValue(null),
      deleteSnapshot: jest.fn().mockResolvedValue(undefined),
      listSnapshots: jest.fn().mockResolvedValue([]),
    };
    YjsPersistence.mockImplementation(() => mockPersistence);

    // Mock logger
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    yjsService = new YjsService({ logger: mockLogger });
  });

  afterEach(() => {
    if (yjsService) {
      yjsService.close();
    }
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const service = new YjsService();
      expect(service).toBeDefined();
      expect(service.docs).toBeDefined();
      expect(service.docs.size).toBe(0);
    });

    it('should initialize with custom logger', () => {
      const service = new YjsService({ logger: mockLogger });
      expect(service.logger).toBe(mockLogger);
    });

    it('should initialize persistence', () => {
      expect(YjsPersistence).toHaveBeenCalledWith(expect.any(String));
    });
  });

  describe('getOrCreateDocument', () => {
    it('should create new document for unknown mapId', async () => {
      const mapId = 'test-map-id';
      mockPersistence.getSnapshot.mockResolvedValue(null);

      const doc = await yjsService.getOrCreateDocument(mapId);

      expect(doc).toBeInstanceOf(Y.Doc);
      expect(yjsService.docs.has(mapId)).toBe(true);
      expect(mockPersistence.getSnapshot).toHaveBeenCalledWith(mapId);
      expect(mockLogger.info).toHaveBeenCalledWith('Yjs room created', {
        mapId: mapId.substring(0, 8) + '...',
        hasSnapshot: false,
        totalRooms: 1,
        memoryUsage: expect.any(Number),
      });
    });

    it('should return existing document for known mapId', async () => {
      const mapId = 'test-map-id';
      const doc1 = await yjsService.getOrCreateDocument(mapId);
      const doc2 = await yjsService.getOrCreateDocument(mapId);

      expect(doc2).toBe(doc1);
      expect(yjsService.docs.size).toBe(1);
      expect(mockPersistence.getSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should restore document from snapshot when available', async () => {
      const mapId = 'test-map-id';
      // Create a proper Y.Doc state as snapshot data
      const tempDoc = new Y.Doc();
      const snapshotData = Y.encodeStateAsUpdate(tempDoc);
      mockPersistence.getSnapshot.mockResolvedValue({
        mapId,
        snapshot: Buffer.from(snapshotData),
        createdAt: new Date(),
        version: 1,
      });

      const doc = await yjsService.getOrCreateDocument(mapId);

      expect(doc).toBeInstanceOf(Y.Doc);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs snapshot loaded',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          snapshotSize: snapshotData.length,
          loadLatency: expect.any(Number),
          restorationSuccess: true,
        }),
      );
    });

    it('should handle persistence errors gracefully', async () => {
      const mapId = 'test-map-id';
      const error = new Error('Persistence error');
      mockPersistence.getSnapshot.mockRejectedValue(error);

      const doc = await yjsService.getOrCreateDocument(mapId);

      expect(doc).toBeInstanceOf(Y.Doc);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Yjs snapshot load failed',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          error: error.message,
          errorType: 'Error',
          fallbackAction: 'created_new_document',
          diagnostics: expect.objectContaining({
            persistenceHealthy: expect.any(Boolean),
            memoryUsage: expect.any(Number),
          }),
        }),
      );
    });

    it('should setup update handlers for new documents', async () => {
      const mapId = 'test-map-id';
      mockPersistence.getSnapshot.mockResolvedValue(null);

      const doc = await yjsService.getOrCreateDocument(mapId);

      // Verify update handler is set up
      expect(doc.on).toBeDefined();

      // Trigger an update and verify persistence is called
      const updateSpy = jest.spyOn(yjsService, 'handleDocumentUpdate');

      // Y.Doc updates are triggered by actual changes to the document
      // Let's make an actual change to trigger the update handler
      const yArray = doc.getArray('notes');
      yArray.insert(0, ['test note']);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('handleDocumentUpdate', () => {
    // let doc; // unused in this describe block
    const mapId = 'test-map-id';

    beforeEach(async () => {
      mockPersistence.getSnapshot.mockResolvedValue(null);
      await yjsService.getOrCreateDocument(mapId);
    });

    it('should save snapshot for local updates', async () => {
      const updateData = new Uint8Array([1, 2, 3]);
      const origin = null; // Local update

      await yjsService.handleDocumentUpdate(mapId, updateData, origin);

      expect(mockPersistence.saveSnapshot).toHaveBeenCalledWith(
        mapId,
        expect.any(Buffer),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Yjs snapshot saved',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          snapshotSize: expect.any(Number),
          saveLatency: expect.any(Number),
          documentState: expect.objectContaining({
            totalUpdates: expect.any(Number),
            documentSize: expect.any(Number),
          }),
          performance: expect.objectContaining({
            memoryUsage: expect.any(Number),
          }),
        }),
      );
    });

    it('should not save snapshot for remote updates', async () => {
      const updateData = new Uint8Array([1, 2, 3]);
      const origin = 'websocket-client-123'; // Remote update

      await yjsService.handleDocumentUpdate(mapId, updateData, origin);

      expect(mockPersistence.saveSnapshot).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping snapshot save for remote update',
        { mapId, origin, updateSize: updateData.length },
      );
    });

    it('should handle persistence errors during save', async () => {
      const updateData = new Uint8Array([1, 2, 3]);
      const error = new Error('Save failed');
      mockPersistence.saveSnapshot.mockRejectedValue(error);

      await yjsService.handleDocumentUpdate(mapId, updateData, null);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save document snapshot',
        { mapId, error: error.message },
      );
    });
  });

  describe('handleWebSocketConnection', () => {
    let mockWs;
    let mockRequest;

    beforeEach(() => {
      mockWs = new EventEmitter();
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();
      mockWs.readyState = 1; // WebSocket.OPEN

      mockRequest = {
        url: '/yjs/test-map-id',
        headers: { 'user-agent': 'test-client' },
      };
    });

    it('should setup WebSocket connection for valid mapId', async () => {
      const mapId = 'test-map-id';
      mockRequest.url = `/yjs/${mapId}`;
      mockRequest.headers = { 'user-agent': 'test-client' };
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      expect(yjsService.docs.has(mapId)).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs room connection established',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          clientId: expect.stringContaining('websocket-'),
          userAgent: 'test-client',
          origin: 'unknown',
          clientIP: 'unknown',
          totalClientsInRoom: 1,
          totalActiveRooms: 1,
        }),
      );
    });

    it('should reject connection with invalid URL format', async () => {
      mockRequest.url = '/invalid-url';

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Invalid URL format');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'WebSocket connection rejected: Invalid URL format',
        { url: mockRequest.url },
      );
    });

    it('should handle WebSocket messages', async () => {
      const mapId = 'test-map-id';
      mockRequest.url = `/yjs/${mapId}`;
      mockRequest.headers = { 'user-agent': 'test-client' };
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      // Create a proper y-websocket sync step 1 message
      const doc = await yjsService.getOrCreateDocument(mapId);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
      syncProtocol.writeSyncStep1(encoder, doc);
      const messageData = encoding.toUint8Array(encoder);
      const handleSpy = jest.spyOn(yjsService, 'handleProtocolMessage');

      mockWs.emit('message', messageData);

      expect(handleSpy).toHaveBeenCalledWith(
        mapId,
        messageData,
        mockWs,
        expect.any(Y.Doc),
      );
    });

    it('should handle WebSocket close events', async () => {
      const mapId = 'test-map-id';
      mockRequest.url = `/yjs/${mapId}`;
      mockRequest.headers = { 'user-agent': 'test-client' };
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      mockWs.emit('close');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Yjs room connection closed',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          clientId: expect.stringContaining('websocket-'),
          sessionDuration: expect.any(Number),
          remainingClients: 0,
          roomCleanedUp: true,
        }),
      );
    });

    it('should handle WebSocket error events', async () => {
      const mapId = 'test-map-id';
      mockRequest.url = `/yjs/${mapId}`;
      mockRequest.headers = { 'user-agent': 'test-client' };
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      const error = new Error('WebSocket error');
      mockWs.emit('error', error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket error for document',
        {
          mapId: mapId.substring(0, 8) + '...',
          clientId: expect.stringContaining('websocket-'),
          error: error.message,
          errorType: error.name,
          totalClients: 1,
        },
      );
    });

    it('should send initial state to new connections', async () => {
      const mapId = 'test-map-id';
      mockRequest.url = `/yjs/${mapId}`;
      mockRequest.headers = { 'user-agent': 'test-client' };

      // Mock existing document with state
      const existingDoc = new Y.Doc();
      const yArray = existingDoc.getArray('notes');
      yArray.insert(0, ['test']);
      const state = Y.encodeStateAsUpdate(existingDoc);
      mockPersistence.getSnapshot.mockResolvedValue({
        mapId,
        snapshot: Buffer.from(state),
        createdAt: new Date(),
        version: 1,
      });

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      expect(mockWs.send).toHaveBeenCalledWith(expect.any(Uint8Array));
    });
  });

  describe('handleProtocolMessage', () => {
    let mockWs;
    let doc;
    const mapId = 'test-map-id';

    beforeEach(async () => {
      mockPersistence.getSnapshot.mockResolvedValue(null);
      doc = await yjsService.getOrCreateDocument(mapId);

      mockWs = new EventEmitter();
      mockWs.send = jest.fn();
      mockWs.id = 'websocket-123';
      mockWs.readyState = 1;
    });

    it('should process update messages to document', async () => {
      // Create a proper Y.Doc update wrapped in protocol message
      const sourceDoc = new Y.Doc();
      const sourceArray = sourceDoc.getArray('test');
      sourceArray.insert(0, ['hello']);
      const updateData = Y.encodeStateAsUpdate(sourceDoc);

      // Wrap in y-websocket protocol format
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
      encoding.writeVarUint8Array(encoder, updateData);
      const protocolMessage = encoding.toUint8Array(encoder);

      yjsService.handleProtocolMessage(mapId, protocolMessage, mockWs, doc);

      // Should have logged processed message
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processed y-websocket protocol message',
        expect.objectContaining({
          mapId,
          messageType: syncProtocol.messageYjsUpdate,
          origin: mockWs.id,
        }),
      );
    });

    it('should handle invalid protocol data gracefully', () => {
      const invalidData = new Uint8Array([255, 255, 255]); // Invalid protocol message

      yjsService.handleProtocolMessage(mapId, invalidData, mockWs, doc);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Yjs message processing error',
        expect.objectContaining({
          mapId: mapId.substring(0, 8) + '...',
          clientId: mockWs.id,
          error: expect.any(String),
          messageSize: invalidData.length,
          diagnostics: expect.objectContaining({
            documentExists: true,
            clientConnected: expect.any(Boolean),
          }),
        }),
      );
    });

    // Note: Sync step 1 tests are complex because they involve y-protocols internals
    // The integration tests cover the full sync protocol behavior
    // Here we just verify the error handling works correctly (tested above)
  });

  describe('broadcastUpdate', () => {
    let mockWs1, mockWs2, mockWs3;
    const mapId = 'test-map-id';

    beforeEach(async () => {
      mockPersistence.getSnapshot.mockResolvedValue(null);
      await yjsService.getOrCreateDocument(mapId);

      // Setup mock WebSockets
      mockWs1 = { send: jest.fn(), readyState: 1, id: 'ws1', close: jest.fn() };
      mockWs2 = { send: jest.fn(), readyState: 1, id: 'ws2', close: jest.fn() };
      mockWs3 = { send: jest.fn(), readyState: 0, id: 'ws3', close: jest.fn() }; // Closed

      // Add connections to service
      yjsService.connections.set(mapId, new Set([mockWs1, mockWs2, mockWs3]));
    });

    it('should broadcast update to all connected clients except origin', () => {
      const updateData = new Uint8Array([1, 2, 3]);

      yjsService.broadcastUpdate(mapId, updateData, mockWs1);

      expect(mockWs1.send).not.toHaveBeenCalled(); // Origin should not receive
      expect(mockWs2.send).toHaveBeenCalledWith(updateData);
      expect(mockWs3.send).not.toHaveBeenCalled(); // Closed connection
    });

    it('should handle missing connections map gracefully', () => {
      const updateData = new Uint8Array([1, 2, 3]);
      const nonExistentMapId = 'non-existent';

      expect(() => {
        yjsService.broadcastUpdate(nonExistentMapId, updateData, mockWs1);
      }).not.toThrow();
    });

    it('should clean up closed connections during broadcast', () => {
      const updateData = new Uint8Array([1, 2, 3]);
      const connections = yjsService.connections.get(mapId);

      expect(connections.size).toBe(3);

      yjsService.broadcastUpdate(mapId, updateData, null);

      // Closed connection should be removed
      expect(connections.size).toBe(2);
      expect(connections.has(mockWs3)).toBe(false);
    });
  });

  describe('getDocumentStats', () => {
    it('should return stats for existing document', async () => {
      const mapId = 'test-map-id';
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.getOrCreateDocument(mapId);

      const stats = yjsService.getDocumentStats(mapId);

      expect(stats).toEqual({
        exists: true,
        clientCount: 0,
        documentSize: expect.any(Number),
        lastUpdate: expect.any(Date),
      });
    });

    it('should return stats for non-existent document', () => {
      const stats = yjsService.getDocumentStats('non-existent');

      expect(stats).toEqual({
        exists: false,
        clientCount: 0,
        documentSize: 0,
        lastUpdate: null,
      });
    });

    it('should include client count when connections exist', async () => {
      const mapId = 'test-map-id';
      await yjsService.getOrCreateDocument(mapId);

      const mockWs = { readyState: 1, close: jest.fn() };
      yjsService.connections.set(mapId, new Set([mockWs]));

      const stats = yjsService.getDocumentStats(mapId);

      expect(stats.clientCount).toBe(1);
    });
  });

  describe('close', () => {
    it('should close all WebSocket connections', async () => {
      const mapId1 = 'map-1';
      const mapId2 = 'map-2';

      const mockWs1 = { close: jest.fn(), readyState: 1 };
      const mockWs2 = { close: jest.fn(), readyState: 1 };
      const mockWs3 = { close: jest.fn(), readyState: 1 };

      yjsService.connections.set(mapId1, new Set([mockWs1, mockWs2]));
      yjsService.connections.set(mapId2, new Set([mockWs3]));

      yjsService.close();

      expect(mockWs1.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(mockWs2.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(mockWs3.close).toHaveBeenCalledWith(1001, 'Server shutting down');
    });

    it('should clear all connections and documents', async () => {
      const mapId = 'test-map-id';
      await yjsService.getOrCreateDocument(mapId);

      const mockWs = { close: jest.fn(), readyState: 1 };
      yjsService.connections.set(mapId, new Set([mockWs]));

      expect(yjsService.docs.size).toBe(1);
      expect(yjsService.connections.size).toBe(1);

      yjsService.close();

      expect(yjsService.docs.size).toBe(0);
      expect(yjsService.connections.size).toBe(0);
    });

    it('should log shutdown information', () => {
      yjsService.close();

      expect(mockLogger.info).toHaveBeenCalledWith('YjsService shut down');
    });
  });

  describe('error handling', () => {
    it('should handle Y.Doc creation errors', async () => {
      // Mock Y.Doc constructor to throw
      const originalDoc = Y.Doc;
      Y.Doc = jest.fn(() => {
        throw new Error('Y.Doc creation failed');
      });

      try {
        await expect(
          yjsService.getOrCreateDocument('test-map-id'),
        ).rejects.toThrow('Y.Doc creation failed');
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        Y.Doc = originalDoc;
      }
    });

    it('should handle malformed WebSocket messages', async () => {
      const mapId = 'test-map-id';
      const mockWs = new EventEmitter();
      mockWs.send = jest.fn();
      mockWs.close = jest.fn();
      mockWs.readyState = 1;

      const mockRequest = {
        url: `/yjs/${mapId}`,
        headers: { 'user-agent': 'test-client' },
      };
      mockPersistence.getSnapshot.mockResolvedValue(null);

      await yjsService.handleWebSocketConnection(mockWs, mockRequest);

      // Send malformed message
      const invalidMessage = 'invalid-binary-data';
      mockWs.emit('message', invalidMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid WebSocket message format',
        {
          mapId,
          dataType: 'string',
        },
      );
    });
  });
});
