/**
 * Unit tests for LocalJSONProvider
 *
 * Tests offline-first localStorage-based data provider implementation.
 * Covers all DataProvider contract methods, edge cases, and LocalJSONProvider-specific features.
 *
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 */

const LocalJSONProvider = require('../../src/client/providers/LocalJSONProvider');

describe('LocalJSONProvider', () => {
  let provider;
  let originalLocalStorage;

  // Mock localStorage for Node.js testing environment
  beforeEach(() => {
    // Create a mock localStorage
    const mockStorage = {};
    originalLocalStorage = global.localStorage;

    global.localStorage = {
      getItem: jest.fn((key) => mockStorage[key] || null),
      setItem: jest.fn((key, value) => {
        mockStorage[key] = value;
      }),
      removeItem: jest.fn((key) => {
        delete mockStorage[key];
      }),
      clear: jest.fn(() => {
        Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
      }),
      key: jest.fn((index) => Object.keys(mockStorage)[index] || null),
      get length() {
        return Object.keys(mockStorage).length;
      },
    };

    // Allow Object.keys() to work on the mock localStorage by making it inherit the keys
    Object.keys(global.localStorage).forEach = function (callback) {
      Object.keys(mockStorage).forEach(callback);
    };

    // Create fresh provider instance
    provider = new LocalJSONProvider({
      storagePrefix: 'test_map_',
      metaPrefix: 'test_meta_',
      maxMaps: 10, // Lower for testing
    });
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default options', () => {
      const defaultProvider = new LocalJSONProvider();
      expect(defaultProvider.options.storagePrefix).toBe('mindmeld_map_');
      expect(defaultProvider.options.metaPrefix).toBe('mindmeld_meta_');
      expect(defaultProvider.options.maxMaps).toBe(100);
    });

    test('should initialize with custom options', () => {
      const customProvider = new LocalJSONProvider({
        storagePrefix: 'custom_map_',
        maxMaps: 50,
      });
      expect(customProvider.options.storagePrefix).toBe('custom_map_');
      expect(customProvider.options.maxMaps).toBe(50);
    });

    test('should test localStorage availability on initialization', () => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test_map_test',
        'test',
      );
      expect(localStorage.removeItem).toHaveBeenCalledWith('test_map_test');
    });

    test('should throw error if localStorage is not available', () => {
      localStorage.setItem.mockImplementation(() => {
        throw new Error('localStorage not available');
      });

      expect(() => new LocalJSONProvider()).toThrow(
        'LocalStorage not available',
      );
    });
  });

  describe('DataProvider Contract - load()', () => {
    test('should load existing map successfully', async () => {
      const mapId = 'test-map-1';
      const testData = { n: [{ i: 'note1', c: 'Test Note' }], c: [] };
      const testMeta = {
        version: 1,
        title: 'Test Map',
        created: '2024-01-01T00:00:00.000Z',
      };

      localStorage.setItem('test_map_' + mapId, JSON.stringify(testData));
      localStorage.setItem('test_meta_' + mapId, JSON.stringify(testMeta));

      const result = await provider.load(mapId);

      expect(result).toEqual({
        n: [{ i: 'note1', c: 'Test Note' }],
        c: [],
        meta: expect.objectContaining({
          version: 1,
          title: 'Test Map',
          created: '2024-01-01T00:00:00.000Z',
          modified: expect.any(String),
        }),
      });
    });

    test('should throw error for non-existent map', async () => {
      await expect(provider.load('non-existent-map')).rejects.toThrow(
        'Map not found: non-existent-map',
      );
    });

    test('should throw error for invalid mapId', async () => {
      await expect(provider.load('')).rejects.toThrow(
        'Invalid mapId: must be a non-empty string',
      );
      await expect(provider.load(null)).rejects.toThrow(
        'Invalid mapId: must be a non-empty string',
      );
    });

    test('should handle corrupted map data gracefully', async () => {
      const mapId = 'corrupted-map';
      localStorage.setItem('test_map_' + mapId, '{invalid json}');

      await expect(provider.load(mapId)).rejects.toThrow(
        `Failed to load map ${mapId}`,
      );
    });

    test('should load map with missing metadata', async () => {
      const mapId = 'no-meta-map';
      const testData = { n: [], c: [] };

      localStorage.setItem('test_map_' + mapId, JSON.stringify(testData));
      // No metadata stored

      const result = await provider.load(mapId);

      expect(result.meta.version).toBe(1);
      expect(result.meta.title).toBe('Untitled Map');
      expect(result.meta.created).toBeDefined();
    });
  });

  describe('DataProvider Contract - save()', () => {
    test('should save map data successfully', async () => {
      const mapId = 'save-test-map';
      const testData = {
        n: [{ i: 'note1', c: 'Saved Note', p: [100, 200] }],
        c: [{ f: 'note1', t: 'note2' }],
        meta: { title: 'Saved Map' },
      };

      const result = await provider.save(mapId, testData);

      expect(result.success).toBe(true);
      expect(result.version).toBe(2); // Should increment from 1 (default) to 2
      expect(result.modified).toBeDefined();
      expect(result.etag).toBeDefined();

      // Verify data was stored
      const mapKey = 'test_map_' + mapId;
      const metaKey = 'test_meta_' + mapId;

      expect(localStorage.setItem).toHaveBeenCalledWith(
        mapKey,
        JSON.stringify({ n: testData.n, c: testData.c }),
      );

      const savedMeta = JSON.parse(
        localStorage.setItem.mock.calls.find((call) => call[0] === metaKey)[1],
      );

      expect(savedMeta.title).toBe('Saved Map');
      expect(savedMeta.version).toBe(2);
      expect(savedMeta.autosave).toBe(false);
    });

    test('should handle autosave options correctly', async () => {
      const mapId = 'autosave-test';
      const testData = { n: [], c: [], meta: { title: 'Autosave Test' } };

      await provider.save(mapId, testData, { autosave: true });

      const savedMeta = JSON.parse(
        localStorage.setItem.mock.calls.find(
          (call) => call[0] === 'test_meta_' + mapId,
        )[1],
      );

      expect(savedMeta.autosave).toBe(true);
    });

    test('should respect autosave pause', async () => {
      const mapId = 'paused-save-test';
      const testData = { n: [], c: [] };

      provider.pauseAutosave();

      const result = await provider.save(mapId, testData, { autosave: true });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('autosave_paused');
      expect(localStorage.setItem).not.toHaveBeenCalledWith(
        'test_map_' + mapId,
        expect.any(String),
      );
    });

    test('should allow forced save when autosave is paused', async () => {
      const mapId = 'forced-save-test';
      const testData = { n: [], c: [] };

      provider.pauseAutosave();

      const result = await provider.save(mapId, testData, {
        autosave: true,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'test_map_' + mapId,
        expect.any(String),
      );
    });

    test('should handle storage quota exceeded error', async () => {
      const mapId = 'quota-test';
      const testData = { n: [], c: [] };

      localStorage.setItem.mockImplementation(() => {
        const error = new Error('Storage quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await expect(provider.save(mapId, testData)).rejects.toThrow(
        `Storage quota exceeded when saving map ${mapId}`,
      );
    });

    test('should validate map data before saving', async () => {
      const mapId = 'invalid-data-test';

      await expect(provider.save(mapId, null)).rejects.toThrow('Invalid data');
      await expect(provider.save(mapId, 'not an object')).rejects.toThrow(
        'Invalid data',
      );
    });
  });

  describe('DataProvider Contract - list()', () => {
    beforeEach(async () => {
      // Set up test data
      const testMaps = [
        {
          id: 'map1',
          title: 'First Map',
          created: '2024-01-01T00:00:00.000Z',
          modified: '2024-01-01T01:00:00.000Z',
        },
        {
          id: 'map2',
          title: 'Second Map',
          created: '2024-01-02T00:00:00.000Z',
          modified: '2024-01-02T01:00:00.000Z',
        },
        {
          id: 'map3',
          title: 'Third Map',
          created: '2024-01-03T00:00:00.000Z',
          modified: '2024-01-03T01:00:00.000Z',
        },
      ];

      for (const map of testMaps) {
        localStorage.setItem(`test_meta_${map.id}`, JSON.stringify(map));
      }
    });

    test('should list all maps with default options', async () => {
      const result = await provider.list();

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Third Map'); // Should be sorted by modified date desc
      expect(result[1].title).toBe('Second Map');
      expect(result[2].title).toBe('First Map');
    });

    test('should respect limit option', async () => {
      const result = await provider.list({ limit: 2 });

      expect(result).toHaveLength(2);
    });

    test('should respect offset option', async () => {
      const result = await provider.list({ offset: 1, limit: 2 });

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Second Map');
      expect(result[1].title).toBe('First Map');
    });

    test('should sort by different fields', async () => {
      const result = await provider.list({ sortBy: 'title', sortOrder: 'asc' });

      expect(result[0].title).toBe('First Map');
      expect(result[1].title).toBe('Second Map');
      expect(result[2].title).toBe('Third Map');
    });

    test('should handle corrupted metadata gracefully', async () => {
      localStorage.setItem('test_meta_corrupted', '{invalid json}');

      const result = await provider.list();

      // Should still return the valid maps, ignoring corrupted one
      expect(result).toHaveLength(3);
    });

    test('should return empty array when no maps exist', async () => {
      localStorage.clear();

      const result = await provider.list();

      expect(result).toEqual([]);
    });
  });

  describe('DataProvider Contract - delete()', () => {
    test('should delete existing map successfully', async () => {
      const mapId = 'delete-test-map';
      localStorage.setItem('test_map_' + mapId, '{}');
      localStorage.setItem('test_meta_' + mapId, '{}');

      const result = await provider.delete(mapId);

      expect(result).toBe(true);
      expect(localStorage.removeItem).toHaveBeenCalledWith('test_map_' + mapId);
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'test_meta_' + mapId,
      );
    });

    test('should return false for non-existent map', async () => {
      const result = await provider.delete('non-existent-map');

      expect(result).toBe(false);
    });

    test('should clean up subscribers when deleting map', async () => {
      const mapId = 'subscribed-map';
      localStorage.setItem('test_map_' + mapId, '{}');
      localStorage.setItem('test_meta_' + mapId, '{}');

      // Add a subscriber
      const callback = jest.fn();
      await provider.subscribe(mapId, callback);

      await provider.delete(mapId);

      expect(provider.subscribers.has(mapId)).toBe(false);
    });
  });

  describe('DataProvider Contract - subscribe/unsubscribe()', () => {
    test('should subscribe to map updates', async () => {
      const mapId = 'subscribe-test';
      const callback = jest.fn();

      await provider.subscribe(mapId, callback);

      expect(provider.subscribers.has(mapId)).toBe(true);
      expect(provider.subscribers.get(mapId).has(callback)).toBe(true);

      // Should call callback with initial state (null if map doesn't exist)
      expect(callback).toHaveBeenCalledWith({
        type: 'subscribed',
        mapId,
        data: null,
      });
    });

    test('should notify subscribers on save', async () => {
      const mapId = 'notify-test';
      const callback = jest.fn();

      await provider.subscribe(mapId, callback);
      callback.mockClear(); // Clear initial subscription call

      const testData = { n: [], c: [] };
      await provider.save(mapId, testData);

      expect(callback).toHaveBeenCalledWith({
        type: 'saved',
        mapId,
        data: expect.objectContaining({ n: [], c: [] }),
        options: expect.any(Object),
      });
    });

    test('should notify subscribers on delete', async () => {
      const mapId = 'delete-notify-test';
      localStorage.setItem('test_map_' + mapId, '{}');
      localStorage.setItem('test_meta_' + mapId, '{}');

      const callback = jest.fn();
      await provider.subscribe(mapId, callback);
      callback.mockClear();

      await provider.delete(mapId);

      expect(callback).toHaveBeenCalledWith({
        type: 'deleted',
        mapId,
      });
    });

    test('should unsubscribe from map updates', async () => {
      const mapId = 'unsubscribe-test';
      const callback = jest.fn();

      await provider.subscribe(mapId, callback);
      await provider.unsubscribe(mapId);

      expect(provider.subscribers.has(mapId)).toBe(false);
    });

    test('should require valid callback for subscription', async () => {
      await expect(provider.subscribe('test-map', null)).rejects.toThrow(
        'Callback must be a function',
      );
      await expect(
        provider.subscribe('test-map', 'not a function'),
      ).rejects.toThrow('Callback must be a function');
    });

    test('should handle subscriber callback errors gracefully', async () => {
      const mapId = 'error-callback-test';
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });

      await provider.subscribe(mapId, errorCallback);

      const testData = { n: [], c: [] };

      // Should not throw even though callback throws
      await expect(provider.save(mapId, testData)).resolves.toBeDefined();
    });
  });

  describe('Autosave Control', () => {
    test('should pause and resume autosave', () => {
      expect(provider.autosavePaused).toBe(false);

      provider.pauseAutosave();
      expect(provider.autosavePaused).toBe(true);

      provider.resumeAutosave();
      expect(provider.autosavePaused).toBe(false);
    });

    test('should be online by default', () => {
      expect(provider.isOnline()).toBe(true);
    });
  });

  describe('LocalJSONProvider Specific Features', () => {
    test('should calculate storage statistics', () => {
      localStorage.setItem('test_map_stat1', JSON.stringify({ n: [], c: [] }));
      localStorage.setItem(
        'test_meta_stat1',
        JSON.stringify({ title: 'Test' }),
      );
      localStorage.setItem('other_key', 'should be ignored');

      const stats = provider.getStorageStats();

      expect(stats.totalMaps).toBe(2); // map + meta = 2 keys
      expect(stats.storageUsed).toBeGreaterThan(0);
      expect(stats.storageAvailable).toBeDefined();
    });

    test('should export all maps', async () => {
      const testData1 = { n: [{ i: 'n1' }], c: [] };
      const testData2 = { n: [{ i: 'n2' }], c: [] };

      await provider.save('export1', testData1);
      await provider.save('export2', testData2);

      const exportData = await provider.exportAllMaps();

      expect(exportData.provider).toBe('LocalJSONProvider');
      expect(exportData.version).toBe('1.0');
      expect(exportData.maps).toHaveProperty('export1');
      expect(exportData.maps).toHaveProperty('export2');
    });

    test('should import maps from export data', async () => {
      const importData = {
        provider: 'LocalJSONProvider',
        version: '1.0',
        maps: {
          import1: { n: [{ i: 'imported1' }], c: [] },
          import2: { n: [{ i: 'imported2' }], c: [] },
        },
      };

      const result = await provider.importMaps(importData);

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);

      // Verify maps were imported
      const map1 = await provider.load('import1');
      expect(map1.n[0].i).toBe('imported1');
    });

    test('should handle import errors gracefully', async () => {
      const invalidImportData = {
        maps: {
          'valid-map': { n: [], c: [] },
          'invalid-map': null, // This should cause an error
        },
      };

      const result = await provider.importMaps(invalidImportData);

      expect(result.imported).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    test('should reject invalid import data', async () => {
      await expect(provider.importMaps({})).rejects.toThrow(
        'Invalid export data structure',
      );
      await expect(provider.importMaps({ maps: null })).rejects.toThrow(
        'Invalid export data structure',
      );
    });
  });

  describe('Storage Management', () => {
    test('should clean up storage when too many maps exist', async () => {
      // Create more than maxMaps (10) to trigger cleanup
      for (let i = 1; i <= 15; i++) {
        const mapId = `cleanup-test-${i}`;
        const metadata = {
          title: `Map ${i}`,
          created: `2024-01-${i.toString().padStart(2, '0')}T00:00:00.000Z`,
          modified: `2024-01-${i.toString().padStart(2, '0')}T00:00:00.000Z`,
        };
        localStorage.setItem(`test_meta_${mapId}`, JSON.stringify(metadata));
        localStorage.setItem(
          `test_map_${mapId}`,
          JSON.stringify({ n: [], c: [] }),
        );
      }

      // Trigger cleanup by creating new provider
      const cleanupProvider = new LocalJSONProvider({
        storagePrefix: 'test_map_',
        metaPrefix: 'test_meta_',
        maxMaps: 10,
      });

      // Should have cleaned up to maxMaps
      const remainingMaps = await cleanupProvider.list({ limit: 100 });
      expect(remainingMaps.length).toBeLessThanOrEqual(10);
    });

    test('should remove invalid metadata entries during cleanup', () => {
      // Add many maps to trigger cleanup, including invalid ones
      for (let i = 1; i <= 12; i++) {
        localStorage.setItem(
          `test_meta_cleanup${i}`,
          JSON.stringify({
            modified: `2024-01-${i.toString().padStart(2, '0')}T00:00:00.000Z`,
          }),
        );
        localStorage.setItem(`test_map_cleanup${i}`, '{}');
      }

      // Add invalid metadata
      localStorage.setItem('test_meta_invalid1', '{invalid json}');
      localStorage.setItem('test_map_invalid1', '{}');

      new LocalJSONProvider({
        storagePrefix: 'test_map_',
        metaPrefix: 'test_meta_',
        maxMaps: 10,
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'test_meta_invalid1',
      );
      expect(localStorage.removeItem).toHaveBeenCalledWith('test_map_invalid1');
    });
  });

  describe('Error Handling', () => {
    test('should handle localStorage errors gracefully', async () => {
      localStorage.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      await expect(provider.load('error-test')).rejects.toThrow(
        'Failed to load map error-test',
      );
    });

    test('should handle list operation errors', async () => {
      const originalLength = Object.getOwnPropertyDescriptor(
        localStorage,
        'length',
      );
      Object.defineProperty(localStorage, 'length', {
        get: () => {
          throw new Error('localStorage error');
        },
        configurable: true,
      });

      await expect(provider.list()).rejects.toThrow('Failed to list maps');

      // Restore original length property
      if (originalLength) {
        Object.defineProperty(localStorage, 'length', originalLength);
      }
    });
  });
});
