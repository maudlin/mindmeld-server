/**
 * Tests for enhanced LocalJSONProvider functionality
 *
 * Tests the new methods, hydration suppression, and improved autosave controls
 */

const LocalJSONProvider = require('../../src/client/providers/LocalJSONProvider');

// Mock localStorage for Node.js environment
const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: key => store[key] || null,
    setItem: (key, value) => (store[key] = value),
    removeItem: key => delete store[key],
    clear: () => (store = {}),
    get length() {
      return Object.keys(store).length;
    },
    key: index => Object.keys(store)[index] || null
  };
})();

// Mock global objects for Node.js environment
global.window = {
  localStorage: mockLocalStorage
};
global.localStorage = mockLocalStorage;

describe('LocalJSONProvider - Enhanced Features', () => {
  let provider;

  beforeEach(() => {
    mockLocalStorage.clear();
    provider = new LocalJSONProvider({
      storagePrefix: 'test_map_',
      metaPrefix: 'test_meta_'
    });
  });

  afterEach(() => {
    if (provider) {
      provider.changeSubscribers?.clear();
      provider.subscribers?.clear();
    }
  });

  describe('Enhanced constructor', () => {
    it('initializes new state properties', () => {
      expect(provider.changeSubscribers).toBeInstanceOf(Set);
      expect(provider.isHydrating).toBe(false);
      expect(provider.autosavePaused).toBe(false);
    });
  });

  describe('Enhanced Provider Methods', () => {
    describe('init()', () => {
      it('creates empty map if it does not exist', async () => {
        const mapId = 'test-map-init';

        const unsubscribe = await provider.init(mapId);

        expect(typeof unsubscribe).toBe('function');

        // Verify map was created
        const mapData = await provider.load(mapId);
        expect(mapData).toMatchObject({
          n: [],
          c: [],
          meta: expect.objectContaining({
            version: expect.any(Number),
            title: 'Untitled Map'
          })
        });
        expect(mapData.meta.version).toBeGreaterThanOrEqual(1);
      });

      it('does not overwrite existing map', async () => {
        const mapId = 'test-map-existing';
        const existingData = {
          n: [{ i: 'note1', c: 'Test note', p: [100, 200] }],
          c: [],
          meta: { version: 1, title: 'Existing Map' }
        };

        await provider.save(mapId, existingData);
        await provider.init(mapId);

        const mapData = await provider.load(mapId);
        expect(mapData.meta.title).toBe('Existing Map');
        expect(mapData.n).toHaveLength(1);
      });

      it('ignores serverSync option with warning', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        await provider.init('test-map', { serverSync: true });

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('serverSync option ignored')
        );

        consoleSpy.mockRestore();
      });

      it('validates mapId', async () => {
        await expect(provider.init('')).rejects.toThrow('Invalid mapId');
        await expect(provider.init(null)).rejects.toThrow('Invalid mapId');
      });
    });

    describe('subscribeToChanges()', () => {
      it('adds callback to change subscribers', () => {
        const callback = jest.fn();

        const unsubscribe = provider.subscribeToChanges(callback);

        expect(provider.changeSubscribers.has(callback)).toBe(true);
        expect(typeof unsubscribe).toBe('function');
      });

      it('removes callback when unsubscribed', () => {
        const callback = jest.fn();

        const unsubscribe = provider.subscribeToChanges(callback);
        unsubscribe();

        expect(provider.changeSubscribers.has(callback)).toBe(false);
      });

      it('validates callback parameter', () => {
        expect(() => provider.subscribeToChanges(null)).toThrow(
          'onChange must be a function'
        );
        expect(() => provider.subscribeToChanges('not a function')).toThrow(
          'onChange must be a function'
        );
      });
    });

    describe('setMeta()', () => {
      it('updates metadata for existing map', async () => {
        const mapId = 'test-map-meta';
        const initialData = {
          n: [],
          c: [],
          meta: { version: 1, title: 'Original Title' }
        };

        await provider.save(mapId, initialData);
        await provider.setMeta(mapId, {
          title: 'Updated Title',
          zoomLevel: 1.5
        });

        const updatedMap = await provider.load(mapId);
        expect(updatedMap.meta.title).toBe('Updated Title');
        expect(updatedMap.meta.zoomLevel).toBe(1.5);
        expect(updatedMap.meta.version).toBeGreaterThanOrEqual(1); // Version may increment
      });

      it('notifies change subscribers', async () => {
        const mapId = 'test-map-meta-notify';
        const callback = jest.fn();
        const initialData = { n: [], c: [], meta: { version: 1 } };

        await provider.save(mapId, initialData);
        provider.subscribeToChanges(callback);

        await provider.setMeta(mapId, { title: 'Test Title' });

        expect(callback).toHaveBeenCalledWith({
          type: 'meta',
          payload: {
            mapId,
            updates: { title: 'Test Title' }
          }
        });
      });

      it('validates inputs', async () => {
        await expect(provider.setMeta('', {})).rejects.toThrow('Invalid mapId');
        await expect(provider.setMeta('test', null)).rejects.toThrow(
          'Meta updates must be an object'
        );
      });
    });

    describe('getSnapshot()', () => {
      it('returns current map data', async () => {
        const mapId = 'test-snapshot';
        const testData = {
          n: [{ i: 'note1', c: 'Test', p: [0, 0] }],
          c: [{ f: 'note1', t: 'note2' }],
          meta: { version: 1 }
        };

        await provider.save(mapId, testData);
        const snapshot = await provider.getSnapshot(mapId);

        expect(snapshot.n).toEqual(testData.n);
        expect(snapshot.c).toEqual(testData.c);
        expect(snapshot.meta.version).toBeGreaterThanOrEqual(1);
      });
    });

    describe('exportJSON() and importJSON()', () => {
      it('exports map data correctly', async () => {
        const mapId = 'test-export';
        const testData = {
          n: [{ i: 'note1', c: 'Test note', p: [100, 200] }],
          c: [],
          meta: { version: 1, title: 'Test Map' }
        };

        await provider.save(mapId, testData);
        const exported = await provider.exportJSON(mapId);

        expect(exported.n).toEqual(testData.n);
        expect(exported.meta.title).toBe('Test Map');
      });

      it('imports JSON data correctly', async () => {
        const mapId = 'test-import';
        const importData = {
          n: [{ i: 'imported', c: 'Imported note', p: [50, 100] }],
          c: [],
          meta: { title: 'Imported Map' }
        };

        await provider.importJSON(mapId, importData);
        const result = await provider.load(mapId);

        expect(result.n).toEqual(importData.n);
        expect(result.meta.title).toBe('Imported Map');
      });

      it('suppresses events during import by default', async () => {
        const mapId = 'test-import-suppress';
        const callback = jest.fn();
        const importData = { n: [], c: [], meta: { title: 'Test' } };

        provider.subscribeToChanges(callback);
        await provider.importJSON(mapId, importData);

        // Should not have been called during hydration
        expect(callback).not.toHaveBeenCalled();
      });

      it('can merge data when specified', async () => {
        const mapId = 'test-import-merge';
        const existingData = {
          n: [{ i: 'existing', c: 'Existing note', p: [0, 0] }],
          c: [],
          meta: { title: 'Existing' }
        };
        const importData = {
          n: [{ i: 'imported', c: 'Imported note', p: [100, 100] }],
          c: [],
          meta: { title: 'Merged' }
        };

        await provider.save(mapId, existingData);
        await provider.importJSON(mapId, importData, { merge: true });

        const result = await provider.load(mapId);
        expect(result.n).toHaveLength(2);
        expect(result.meta.title).toBe('Merged');
      });
    });
  });

  describe('Hydration suppression', () => {
    it('suppresses change events during hydration', () => {
      const callback = jest.fn();
      provider.subscribeToChanges(callback);

      // Simulate hydration mode
      provider.isHydrating = true;
      provider.notifyChangeSubscribers({ type: 'test', payload: {} });

      expect(callback).not.toHaveBeenCalled();
    });

    it('allows change events when not hydrating', () => {
      const callback = jest.fn();
      provider.subscribeToChanges(callback);

      provider.isHydrating = false;
      provider.notifyChangeSubscribers({ type: 'test', payload: {} });

      expect(callback).toHaveBeenCalled();
    });

    it('logs suppression during hydration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      provider.isHydrating = true;
      provider.notifyChangeSubscribers({ type: 'test', payload: {} });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suppressing change event during hydration')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Enhanced autosave controls', () => {
    it('tracks pause/resume state with reasons', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      provider.pauseAutosave('test-reason');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('paused (reason: test-reason)')
      );

      provider.resumeAutosave('test-reason');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('resumed (reason: test-reason)')
      );

      consoleSpy.mockRestore();
    });

    it('does not log when already in desired state', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      provider.autosavePaused = true;
      provider.pauseAutosave('test');

      // Should not log since already paused
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('prevents autosave when paused', async () => {
      const mapId = 'test-autosave';
      const testData = { n: [], c: [], meta: { version: 1 } };

      provider.pauseAutosave('test');

      const result = await provider.save(mapId, testData, { autosave: true });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('autosave_paused');
    });

    it('allows force save when autosave is paused', async () => {
      const mapId = 'test-force-save';
      const testData = { n: [], c: [], meta: { version: 1 } };

      provider.pauseAutosave('test');

      const result = await provider.save(mapId, testData, {
        autosave: true,
        force: true
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Enhanced bulk import with hydration suppression', () => {
    it('uses hydration suppression during bulk import', async () => {
      const exportData = {
        maps: {
          map1: { n: [], c: [], meta: { title: 'Map 1' } },
          map2: { n: [], c: [], meta: { title: 'Map 2' } }
        }
      };

      const callback = jest.fn();
      provider.subscribeToChanges(callback);

      const result = await provider.importMaps(exportData);

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);
      // Events should be suppressed during bulk import
      expect(callback).not.toHaveBeenCalled();
    });

    it('pauses and resumes autosave during bulk import', async () => {
      const pauseSpy = jest.spyOn(provider, 'pauseAutosave');
      const resumeSpy = jest.spyOn(provider, 'resumeAutosave');

      const exportData = { maps: {} };

      await provider.importMaps(exportData);

      expect(pauseSpy).toHaveBeenCalledWith('bulk-import');
      expect(resumeSpy).toHaveBeenCalledWith('bulk-import');
    });

    it('always resumes autosave even on error', async () => {
      const resumeSpy = jest.spyOn(provider, 'resumeAutosave');
      const saveSpy = jest
        .spyOn(provider, 'save')
        .mockRejectedValue(new Error('Test error'));

      const exportData = {
        maps: {
          map1: { n: [], c: [], meta: { title: 'Map 1' } }
        }
      };

      const result = await provider.importMaps(exportData);

      expect(result.failed).toBe(1);
      expect(resumeSpy).toHaveBeenCalledWith('bulk-import');

      saveSpy.mockRestore();
    });
  });

  describe('Backwards compatibility', () => {
    it('maintains existing save() behavior', async () => {
      const mapId = 'test-backwards-compat';
      const testData = { n: [], c: [], meta: { version: 1 } };

      const result = await provider.save(mapId, testData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('modified');
    });

    it('maintains existing subscribe() behavior', async () => {
      const mapId = 'test-subscribe-compat';
      const callback = jest.fn();
      const testData = { n: [], c: [], meta: { version: 1 } };

      await provider.save(mapId, testData);
      await provider.subscribe(mapId, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscribed',
          mapId
        })
      );
    });
  });
});
