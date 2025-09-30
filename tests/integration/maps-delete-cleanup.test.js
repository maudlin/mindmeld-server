/**
 * Integration tests for MapsService delete method with YjsService cleanup
 */

const path = require('path');
const { tempFileManager } = require('../utils/temp-files');
const MapsService = require('../../src/modules/maps/service');
const YjsService = require('../../src/modules/yjs/service');
const YjsPersistence = require('../../src/modules/yjs/persistence');

// Mock Y.js
jest.mock('yjs', () => ({
  Doc: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    destroy: jest.fn(),
  })),
  encodeStateAsUpdate: jest.fn(() => new Uint8Array([1, 2, 3, 4])),
  applyUpdate: jest.fn(),
}));

describe('MapsService delete with YjsService cleanup integration', () => {
  let mapsService;
  let yjsService;
  let yjsPersistence;
  let tempDbPath;
  let mockLogger;

  beforeEach(async () => {
    // Create temporary database
    tempDbPath = await tempFileManager.createTempFilePath('test-db.sqlite');

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Initialize Y.js persistence
    yjsPersistence = new YjsPersistence(tempDbPath);

    // Initialize Y.js service with explicit persistence
    yjsService = new YjsService({
      persistence: yjsPersistence,
      logger: mockLogger,
    });

    // Initialize Maps service without Y.js service first
    mapsService = new MapsService(tempDbPath, {
      logger: mockLogger,
    });

    // Close the auto-created YjsService to avoid conflicts
    if (mapsService.yjsService) {
      mapsService.yjsService.close();
    }

    // Replace with our test instance
    mapsService.yjsService = yjsService;
  });

  afterEach(async () => {
    if (mapsService) {
      await mapsService.close();
    }
    if (yjsService) {
      yjsService.close();
    }
    await tempFileManager.cleanup();
  });

  describe('delete method', () => {
    it('should delete map and cleanup Y.js document', async () => {
      // Create a map
      const createData = {
        name: 'Test Map for Deletion',
        state: {
          n: [{ i: 'note-1', c: 'Test note', p: [100, 200] }],
          c: [],
        },
      };

      const createdMap = mapsService.create(createData);
      const mapId = createdMap.id;

      // Verify map exists in static storage
      const retrievedMap = await mapsService.getById(mapId);
      expect(retrievedMap).toBeDefined();
      expect(retrievedMap.name).toBe('Test Map for Deletion');

      // Create Y.js document directly
      await yjsService.getOrCreateDocument(mapId);

      // Verify Y.js document was created
      expect(yjsService.docs.has(mapId)).toBe(true);
      expect(yjsService.docMetadata.has(mapId)).toBe(true);

      // Add mock WebSocket connections to Y.js service
      const mockWs1 = {
        readyState: 1, // OPEN
        close: jest.fn(),
        id: 'ws-1',
      };
      const mockWs2 = {
        readyState: 1, // OPEN
        close: jest.fn(),
        id: 'ws-2',
      };
      yjsService.connections.set(mapId, new Set([mockWs1, mockWs2]));

      // Verify Y.js document exists before deletion
      expect(yjsService.docs.has(mapId)).toBe(true);

      // Spy on deleteDocument to verify it's called
      const deleteDocumentSpy = jest.spyOn(yjsService, 'deleteDocument');

      // Delete the map - this should trigger Y.js cleanup
      const deletedMap = await mapsService.delete(mapId);
      expect(deletedMap).toBeDefined();

      // Verify deleteDocument was called
      expect(deleteDocumentSpy).toHaveBeenCalledWith(mapId);

      // Verify Y.js document is cleaned up
      expect(yjsService.docs.has(mapId)).toBe(false);

      // Verify Y.js document was cleaned up
      expect(yjsService.docs.has(mapId)).toBe(false);
      expect(yjsService.docMetadata.has(mapId)).toBe(false);
      expect(yjsService.connections.has(mapId)).toBe(false);

      // Verify WebSocket connections were closed
      expect(mockWs1.close).toHaveBeenCalledWith(1000, 'Document deleted');
      expect(mockWs2.close).toHaveBeenCalledWith(1000, 'Document deleted');
    });

    it('should handle Y.js cleanup errors gracefully', async () => {
      // Create a map
      const createData = {
        name: 'Test Map with Cleanup Error',
        state: {
          n: [{ i: 'note-1', c: 'Test note', p: [100, 200] }],
          c: [],
        },
      };

      const createdMap = mapsService.create(createData);
      const mapId = createdMap.id;

      // Create Y.js document directly
      await yjsService.getOrCreateDocument(mapId);

      // Mock Y.js deleteDocument to throw error
      yjsService.deleteDocument = jest
        .fn()
        .mockRejectedValue(new Error('Y.js cleanup failed'));

      // Delete should complete even with Y.js cleanup error
      const deletedMap = await mapsService.delete(mapId);
      expect(deletedMap).toBeDefined();

      // Verify map is still deleted from static storage
      await expect(mapsService.getById(mapId)).rejects.toThrow('Map not found');

      // Verify Y.js cleanup was attempted
      expect(yjsService.deleteDocument).toHaveBeenCalledWith(mapId);

      // Warning should be logged
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup Y.js document'),
        expect.any(String),
      );
    });

    it('should work when Y.js service is not available', async () => {
      // Create maps service without Y.js service
      const mapsServiceNoYjs = new MapsService(tempDbPath, {
        logger: mockLogger,
      });

      // Set Y.js service to null
      mapsServiceNoYjs.yjsService = null;

      try {
        // Create a map
        const createData = {
          name: 'Test Map without Y.js',
          state: {
            n: [{ i: 'note-1', c: 'Test note', p: [100, 200] }],
            c: [],
          },
        };

        const createdMap = mapsServiceNoYjs.create(createData);
        const mapId = createdMap.id;

        // Delete should work without Y.js service
        const deletedMap = await mapsServiceNoYjs.delete(mapId);
        expect(deletedMap).toBeDefined();

        // Verify map is deleted
        await expect(mapsServiceNoYjs.getById(mapId)).rejects.toThrow(
          'Map not found',
        );
      } finally {
        await mapsServiceNoYjs.close();
      }
    });

    it('should work when Y.js service lacks deleteDocument method', async () => {
      // Create maps service with Y.js service that lacks deleteDocument method
      const limitedYjsService = {
        // Missing deleteDocument method
        close: jest.fn(),
      };

      const mapsServiceLimited = new MapsService(tempDbPath, {
        logger: mockLogger,
      });

      // Set limited Y.js service
      mapsServiceLimited.yjsService = limitedYjsService;

      try {
        // Create a map
        const createData = {
          name: 'Test Map with Limited Y.js',
          state: {
            n: [{ i: 'note-1', c: 'Test note', p: [100, 200] }],
            c: [],
          },
        };

        const createdMap = mapsServiceLimited.create(createData);
        const mapId = createdMap.id;

        // Delete should work even when Y.js service lacks deleteDocument
        const deletedMap = await mapsServiceLimited.delete(mapId);
        expect(deletedMap).toBeDefined();

        // Verify map is deleted
        await expect(mapsServiceLimited.getById(mapId)).rejects.toThrow(
          'Map not found',
        );
      } finally {
        await mapsServiceLimited.close();
      }
    });

    it('should handle non-existent map deletion', async () => {
      const nonExistentMapId = 'non-existent-map-id';

      // Y.js service should not be called for non-existent maps
      yjsService.deleteDocument = jest.fn();

      // Try to delete and expect it to throw
      let threwError = false;
      try {
        await mapsService.delete(nonExistentMapId);
      } catch (error) {
        threwError = true;
        expect(error.message).toBe('Map not found');
      }

      expect(threwError).toBe(true);
      expect(yjsService.deleteDocument).not.toHaveBeenCalled();
    });

    it('should handle map with only Y.js document (no static record)', async () => {
      const mapId = 'yjs-only-map';

      // Create Y.js document directly (no static record)
      await yjsService.getOrCreateDocument(mapId);

      // Add connections
      const mockWs = {
        readyState: 1,
        close: jest.fn(),
        id: 'ws-test',
      };
      yjsService.connections.set(mapId, new Set([mockWs]));

      // Verify Y.js document exists
      expect(yjsService.docs.has(mapId)).toBe(true);

      // Attempting to delete via maps service should fail (no static record)
      let threwError = false;
      try {
        await mapsService.delete(mapId);
      } catch (error) {
        threwError = true;
        expect(error.message).toBe('Map not found');
      }

      expect(threwError).toBe(true);

      // Y.js document should still exist since deletion failed
      expect(yjsService.docs.has(mapId)).toBe(true);

      // But direct deletion via Y.js service should work
      const result = await yjsService.deleteDocument(mapId);
      expect(result).toBe(true);
      expect(yjsService.docs.has(mapId)).toBe(false);
      expect(mockWs.close).toHaveBeenCalledWith(1000, 'Document deleted');
    });
  });
});
