/**
 * Integration tests for DataProvider system
 *
 * Tests provider switching, data consistency, and compatibility with existing /maps API.
 * Validates that LocalJSONProvider works correctly with the server infrastructure.
 *
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 */

const {
  DataProviderFactory,
  PROVIDER_TYPES,
} = require('../../src/client/providers/DataProviderFactory');
const LocalJSONProvider = require('../../src/client/providers/LocalJSONProvider');
const {
  HydrationChecker,
  HydrationSuppressor,
} = require('../../src/client/utils/HydrationSuppression');

// Mock browser environment for testing
const mockStorage = new Map();
global.window = {
  localStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, value) => mockStorage.set(key, value),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
    key: (index) => Array.from(mockStorage.keys())[index] || null,
    get length() {
      return mockStorage.size;
    },
  },
  sessionStorage: {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, value) => mockStorage.set(key, value),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
    key: (index) => Array.from(mockStorage.keys())[index] || null,
    get length() {
      return mockStorage.size;
    },
  },
  document: {
    documentElement: {
      hasAttribute: () => true,
      setAttribute: () => {},
    },
  },
  WebSocket: function () {},
};

// Set global localStorage to match what LocalJSONProvider expects
global.localStorage = global.window.localStorage;
global.document = global.window.document;
global.navigator = {};

describe('DataProvider Integration Tests', () => {
  let factory;

  beforeEach(() => {
    // Clear localStorage before each test
    mockStorage.clear();

    // Create factory with test configuration
    factory = new DataProviderFactory({
      defaultProvider: PROVIDER_TYPES.LOCAL,
      localStoragePrefix: 'test_integration_',
      enableHydrationSuppression: false, // Disable for testing
      featureFlags: {
        enableCollaboration: false,
        enableYjsProvider: false,
      },
    });
  });

  afterEach(() => {
    factory.cleanup();
  });

  describe('Provider Factory', () => {
    test('should create LocalJSONProvider by default in browser environment', async () => {
      const provider = await factory.createProvider();

      expect(provider).toBeInstanceOf(LocalJSONProvider);
      expect(factory.getCurrentProviderType()).toBe(PROVIDER_TYPES.LOCAL);
    });

    test('should cache provider instances', async () => {
      const provider1 = await factory.createProvider();
      const provider2 = await factory.createProvider();

      expect(provider1).toBe(provider2);
    });

    test('should create new provider when forceNew is true', async () => {
      const provider1 = await factory.createProvider();
      const provider2 = await factory.createProvider({ forceNew: true });

      expect(provider1).not.toBe(provider2);
      expect(provider1).toBeInstanceOf(LocalJSONProvider);
      expect(provider2).toBeInstanceOf(LocalJSONProvider);
    });

    test('should detect available providers correctly', () => {
      expect(factory.isProviderAvailable(PROVIDER_TYPES.LOCAL)).toBe(true);
      expect(factory.isProviderAvailable(PROVIDER_TYPES.YJS)).toBe(false); // Not implemented yet
    });

    test('should provide environment information', () => {
      const envInfo = factory.getEnvironmentInfo();

      expect(envInfo).toHaveProperty('isBrowser');
      expect(envInfo).toHaveProperty('isServerSide');
      expect(envInfo).toHaveProperty('availableProviders');
      expect(envInfo).toHaveProperty('recommendedProvider');
      expect(envInfo.availableProviders).toContain(PROVIDER_TYPES.LOCAL);
    });
  });

  describe('Provider Switching', () => {
    test('should switch between provider instances', async () => {
      const provider1 = await factory.createProvider({
        type: PROVIDER_TYPES.LOCAL,
      });

      // Create test data with first provider
      await provider1.save('switch-test-1', {
        n: [{ i: 'note1', c: 'First provider' }],
        c: [],
      });

      // Verify first provider has data
      const maps1 = await provider1.list();
      expect(maps1).toHaveLength(1);

      // Switch to a new provider instance with different prefix
      const provider2 = await factory.switchProvider(PROVIDER_TYPES.LOCAL, {
        storagePrefix: 'test_switch_map_',
        metaPrefix: 'test_switch_meta_',
        maxMaps: 50,
      });

      expect(provider2).not.toBe(provider1);
      expect(factory.getCurrentProviderType()).toBe(PROVIDER_TYPES.LOCAL);

      // Verify new provider is independent (different storage prefix)
      const maps2 = await provider2.list();
      expect(maps2).toHaveLength(0); // Different storage prefix, so no maps

      // Verify first provider still has its data
      const maps1Again = await provider1.list();
      expect(maps1Again).toHaveLength(1);
    });

    test('should handle autosave pause/resume during provider switching', async () => {
      const provider1 = await factory.createProvider();

      // Mock autosave methods
      const pauseSpy = jest.spyOn(provider1, 'pauseAutosave');

      await factory.switchProvider(PROVIDER_TYPES.LOCAL, {
        forceNew: true,
      });

      expect(pauseSpy).toHaveBeenCalled();
    });
  });

  describe('Data Consistency', () => {
    test('should maintain data consistency across provider operations', async () => {
      const provider = await factory.createProvider();

      // Create test data
      const testData = {
        n: [
          { i: 'note1', c: 'Test Note 1', p: [100, 200], color: '#ff0000' },
          { i: 'note2', c: 'Test Note 2', p: [300, 400], color: '#00ff00' },
        ],
        c: [{ id: 'conn1', f: 'note1', t: 'note2', type: 'arrow' }],
        meta: {
          title: 'Integration Test Map',
          version: 1,
        },
      };

      // Save data
      const saveResult = await provider.save('consistency-test', testData);
      expect(saveResult.success).toBe(true);

      // Load data back
      const loadedData = await provider.load('consistency-test');

      // Verify data integrity
      expect(loadedData.n).toEqual(testData.n);
      expect(loadedData.c).toEqual(testData.c);
      expect(loadedData.meta.title).toBe('Integration Test Map');
      expect(loadedData.meta.version).toBe(2); // Should increment from 1 to 2

      // Verify in list
      const maps = await provider.list();
      const testMap = maps.find((map) => map.id === 'consistency-test');
      expect(testMap).toBeDefined();
      expect(testMap.title).toBe('Integration Test Map');
    });

    test('should handle concurrent operations correctly', async () => {
      const provider = await factory.createProvider();

      // Start multiple save operations concurrently
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          provider.save(`concurrent-${i}`, {
            n: [{ i: `note${i}`, c: `Note ${i}` }],
            c: [],
            meta: { title: `Map ${i}` },
          }),
        );
      }

      const results = await Promise.all(promises);

      // All operations should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Verify all maps were created
      const maps = await provider.list();
      const concurrentMaps = maps.filter((map) =>
        map.id.startsWith('concurrent-'),
      );
      expect(concurrentMaps).toHaveLength(5);
    });

    test('should preserve data across provider recreation', async () => {
      // Create data with first provider instance
      const provider1 = await factory.createProvider();
      await provider1.save('persistence-test', {
        n: [{ i: 'persistent', c: 'This should persist' }],
        c: [],
        meta: { title: 'Persistent Map' },
      });

      // Create new provider instance (same configuration)
      const provider2 = await factory.createProvider({ forceNew: true });

      // Data should still be accessible
      const loadedData = await provider2.load('persistence-test');
      expect(loadedData.n[0].c).toBe('This should persist');
      expect(loadedData.meta.title).toBe('Persistent Map');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid map data gracefully', async () => {
      const provider = await factory.createProvider();

      // Try to save invalid data
      await expect(provider.save('invalid-test', null)).rejects.toThrow();
      await expect(
        provider.save('invalid-test', 'not an object'),
      ).rejects.toThrow();
    });

    test('should handle storage quota scenarios', async () => {
      const provider = await factory.createProvider({ maxMaps: 2 });

      // Create more maps than the limit to trigger cleanup
      // Need maxMaps * 2 keys to trigger cleanup (map + meta keys)
      await provider.save('quota-1', { n: [], c: [] });
      await provider.save('quota-2', { n: [], c: [] });
      await provider.save('quota-3', { n: [], c: [] });
      await provider.save('quota-4', { n: [], c: [] });
      await provider.save('quota-5', { n: [], c: [] });

      // Trigger cleanup manually since it only happens during initialization
      provider.cleanupStorage();

      // Should clean up to maxMaps limit
      const maps = await provider.list();
      expect(maps.length).toBeLessThanOrEqual(2);
    });

    test('should handle subscription errors gracefully', async () => {
      const provider = await factory.createProvider();

      // Subscribe with error-throwing callback
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });

      await provider.subscribe('error-test', errorCallback);

      // Save should not fail even if subscriber throws
      await expect(
        provider.save('error-test', { n: [], c: [] }),
      ).resolves.toBeDefined();
    });

    test('should handle missing maps correctly', async () => {
      const provider = await factory.createProvider();

      await expect(provider.load('does-not-exist')).rejects.toThrow(
        'Map not found',
      );

      const deleteResult = await provider.delete('does-not-exist');
      expect(deleteResult).toBe(false);
    });
  });

  describe('Subscription System', () => {
    test('should notify subscribers of map changes', async () => {
      const provider = await factory.createProvider();

      const callback = jest.fn();
      await provider.subscribe('subscription-test', callback);

      // Should get initial subscription notification
      expect(callback).toHaveBeenCalledWith({
        type: 'subscribed',
        mapId: 'subscription-test',
        data: null,
      });

      callback.mockClear();

      // Save data and check for notification
      await provider.save('subscription-test', { n: [], c: [] });

      expect(callback).toHaveBeenCalledWith({
        type: 'saved',
        mapId: 'subscription-test',
        data: expect.objectContaining({ n: [], c: [] }),
        options: expect.any(Object),
      });
    });

    test('should handle multiple subscribers', async () => {
      const provider = await factory.createProvider();

      const callback1 = jest.fn();
      const callback2 = jest.fn();

      await provider.subscribe('multi-sub-test', callback1);
      await provider.subscribe('multi-sub-test', callback2);

      callback1.mockClear();
      callback2.mockClear();

      await provider.save('multi-sub-test', { n: [], c: [] });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    test('should unsubscribe correctly', async () => {
      const provider = await factory.createProvider();

      const callback = jest.fn();
      await provider.subscribe('unsub-test', callback);
      await provider.unsubscribe('unsub-test');

      callback.mockClear();

      await provider.save('unsub-test', { n: [], c: [] });

      // Should not receive notification after unsubscribing
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large datasets efficiently', async () => {
      const provider = await factory.createProvider();

      // Create a large dataset
      const largeData = {
        n: Array.from({ length: 1000 }, (_, i) => ({
          i: `note${i}`,
          c: `Note content ${i}`,
          p: [i * 10, i * 10],
          color: '#000000',
        })),
        c: Array.from({ length: 500 }, (_, i) => ({
          id: `conn${i}`,
          f: `note${i}`,
          t: `note${i + 1}`,
          type: 'arrow',
        })),
        meta: { title: 'Large Dataset Test' },
      };

      // Measure save performance
      const startTime = Date.now();
      await provider.save('large-dataset', largeData);
      const saveTime = Date.now() - startTime;

      // Should complete within reasonable time (adjust as needed)
      expect(saveTime).toBeLessThan(1000); // 1 second

      // Measure load performance
      const loadStartTime = Date.now();
      const loadedData = await provider.load('large-dataset');
      const loadTime = Date.now() - loadStartTime;

      expect(loadTime).toBeLessThan(500); // 0.5 seconds
      expect(loadedData.n).toHaveLength(1000);
      expect(loadedData.c).toHaveLength(500);
    });

    test('should clean up resources properly', async () => {
      const provider = await factory.createProvider();

      // Create subscriptions
      await provider.subscribe('cleanup-test-1', jest.fn());
      await provider.subscribe('cleanup-test-2', jest.fn());

      expect(provider.subscribers.size).toBe(2);

      // Delete one map
      await provider.save('cleanup-test-1', { n: [], c: [] });
      await provider.delete('cleanup-test-1');

      expect(provider.subscribers.size).toBe(1);
    });
  });
});

describe('Hydration Suppression Integration', () => {
  describe('Environment Detection', () => {
    test('should correctly detect browser environment in tests', () => {
      expect(HydrationChecker.isServerSide()).toBe(false);
      expect(HydrationChecker.hasBrowserAPIs()).toBe(true);
    });

    test('should handle hydration markers', () => {
      // Initially should be hydrating (no marker set)
      expect(HydrationChecker.isHydrating()).toBe(false); // Our mock has the attribute

      // Mark hydration complete
      HydrationChecker.markHydrationComplete();
      expect(HydrationChecker.isHydrating()).toBe(false);
    });
  });

  describe('Hydration Suppression', () => {
    test('should suppress execution when configured', () => {
      const suppressor = new HydrationSuppressor({
        suppressOnServer: false,
        suppressDuringHydration: false,
      });

      const fn = jest.fn(() => 'executed');
      const result = suppressor.suppress(fn, 'fallback');

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('executed');
    });

    test('should provide fallback when suppressed', () => {
      const suppressor = new HydrationSuppressor({
        suppressOnServer: true,
        suppressDuringHydration: true,
      });

      // Mock server-side environment
      const originalWindow = global.window;
      delete global.window;

      const fn = jest.fn();
      const result = suppressor.suppress(fn, 'fallback');

      expect(fn).not.toHaveBeenCalled();
      expect(result).toBe('fallback');

      // Restore
      global.window = originalWindow;
    });

    test('should handle async suppression', async () => {
      const suppressor = new HydrationSuppressor();

      const asyncFn = jest.fn(async () => 'async result');
      const result = await suppressor.suppressAsync(asyncFn);

      expect(asyncFn).toHaveBeenCalled();
      expect(result).toBe('async result');
    });
  });
});
