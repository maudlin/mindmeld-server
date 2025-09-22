const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const Y = require('yjs');

// Import the module we're testing (will fail initially as we haven't created it yet)
const YjsPersistence = require('../../../src/modules/yjs/persistence');

describe('YjsPersistence', () => {
  let persistence;
  let dbFile;

  beforeEach(async () => {
    // Use OS temp directory for test database
    const testDir = path.join(os.tmpdir(), 'yjs-persistence-tests');
    dbFile = path.join(
      testDir,
      `yjs-persistence-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.sqlite`
    );

    // Ensure test directory exists
    await fs.mkdir(path.dirname(dbFile), { recursive: true });

    persistence = new YjsPersistence(dbFile);
  });

  afterEach(async () => {
    // Clean up test database
    await fs.unlink(dbFile).catch(() => {
      // ignore missing file
    });
  });

  describe('saveSnapshot()', () => {
    it('should save a Y.Doc snapshot to SQLite', async () => {
      // Arrange: Create a Y.Doc with some data
      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      yMap.set('notes', [{ i: '1', p: [100, 100], c: 'Test note' }]);
      yMap.set('connections', []);

      const mapId = 'test-map-1';
      const snapshot = Y.encodeStateAsUpdate(doc);

      // Act: Save the snapshot
      await persistence.saveSnapshot(mapId, snapshot);

      // Assert: Should be able to retrieve it
      const retrieved = await persistence.getSnapshot(mapId);
      expect(retrieved).toBeDefined();
      expect(retrieved).toBeInstanceOf(Uint8Array);

      // Verify the content by creating a new doc and applying the snapshot
      const newDoc = new Y.Doc();
      Y.applyUpdate(newDoc, retrieved);
      const newMap = newDoc.getMap('mindmeld');
      expect(newMap.get('notes')).toEqual([
        { i: '1', p: [100, 100], c: 'Test note' }
      ]);
      expect(newMap.get('connections')).toEqual([]);
    });

    it('should update existing snapshot when called multiple times for same mapId', async () => {
      const mapId = 'test-map-1';

      // Arrange: Create first version
      const doc1 = new Y.Doc();
      const yMap1 = doc1.getMap('mindmeld');
      yMap1.set('notes', [{ i: '1', p: [100, 100], c: 'First note' }]);
      const snapshot1 = Y.encodeStateAsUpdate(doc1);

      // Act: Save first version
      await persistence.saveSnapshot(mapId, snapshot1);

      // Arrange: Create second version
      const doc2 = new Y.Doc();
      const yMap2 = doc2.getMap('mindmeld');
      yMap2.set('notes', [{ i: '1', p: [100, 100], c: 'Updated note' }]);
      const snapshot2 = Y.encodeStateAsUpdate(doc2);

      // Act: Save second version (should overwrite)
      await persistence.saveSnapshot(mapId, snapshot2);

      // Assert: Should retrieve the updated version
      const retrieved = await persistence.getSnapshot(mapId);
      const newDoc = new Y.Doc();
      Y.applyUpdate(newDoc, retrieved);
      const newMap = newDoc.getMap('mindmeld');
      expect(newMap.get('notes')).toEqual([
        { i: '1', p: [100, 100], c: 'Updated note' }
      ]);
    });

    it('should handle binary data correctly', async () => {
      // Arrange: Create a complex document with various data types
      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      const yArray = new Y.Array();
      yArray.insert(0, [1, 2, 3]);
      yMap.set('testArray', yArray);
      yMap.set('testString', 'Hello Yjs!');
      yMap.set('testNumber', 42);
      yMap.set('testObject', { nested: { value: true } });

      const mapId = 'binary-test-map';
      const snapshot = Y.encodeStateAsUpdate(doc);

      // Act: Save and retrieve
      await persistence.saveSnapshot(mapId, snapshot);
      const retrieved = await persistence.getSnapshot(mapId);

      // Assert: Binary data should be preserved
      expect(retrieved).toEqual(snapshot);
    });
  });

  describe('getSnapshot()', () => {
    it('should return null for non-existent mapId', async () => {
      const result = await persistence.getSnapshot('non-existent-map');
      expect(result).toBeNull();
    });

    it('should return the correct snapshot for existing mapId', async () => {
      // Arrange: Save multiple snapshots
      const docs = [];
      const mapIds = [];
      const snapshots = [];

      for (let i = 0; i < 3; i++) {
        const doc = new Y.Doc();
        const yMap = doc.getMap('mindmeld');
        yMap.set('notes', [
          { i: `note-${i}`, p: [i * 100, i * 100], c: `Note ${i}` }
        ]);
        docs.push(doc);
        mapIds.push(`test-map-${i}`);
        snapshots.push(Y.encodeStateAsUpdate(doc));
        await persistence.saveSnapshot(mapIds[i], snapshots[i]);
      }

      // Act & Assert: Each snapshot should be retrievable independently
      for (let i = 0; i < 3; i++) {
        const retrieved = await persistence.getSnapshot(mapIds[i]);
        expect(retrieved).toEqual(snapshots[i]);

        // Verify content
        const newDoc = new Y.Doc();
        Y.applyUpdate(newDoc, retrieved);
        const newMap = newDoc.getMap('mindmeld');
        expect(newMap.get('notes')).toEqual([
          { i: `note-${i}`, p: [i * 100, i * 100], c: `Note ${i}` }
        ]);
      }
    });
  });

  describe('deleteSnapshot()', () => {
    it('should delete existing snapshot and return true', async () => {
      // Arrange: Create and save a snapshot
      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      yMap.set('notes', [{ i: '1', p: [100, 100], c: 'Test note' }]);
      const mapId = 'test-map-1';
      const snapshot = Y.encodeStateAsUpdate(doc);
      await persistence.saveSnapshot(mapId, snapshot);

      // Verify it exists
      expect(await persistence.getSnapshot(mapId)).toBeDefined();

      // Act: Delete the snapshot
      const result = await persistence.deleteSnapshot(mapId);

      // Assert: Should return true and snapshot should be gone
      expect(result).toBe(true);
      expect(await persistence.getSnapshot(mapId)).toBeNull();
    });

    it('should return false for non-existent mapId', async () => {
      const result = await persistence.deleteSnapshot('non-existent-map');
      expect(result).toBe(false);
    });

    it('should not affect other snapshots when deleting one', async () => {
      // Arrange: Create multiple snapshots
      const mapIds = ['map-1', 'map-2', 'map-3'];
      const docs = [];

      for (let i = 0; i < mapIds.length; i++) {
        const doc = new Y.Doc();
        const yMap = doc.getMap('mindmeld');
        yMap.set('notes', [{ i: `note-${i}`, c: `Note ${i}` }]);
        docs.push(doc);
        await persistence.saveSnapshot(mapIds[i], Y.encodeStateAsUpdate(doc));
      }

      // Act: Delete middle snapshot
      const result = await persistence.deleteSnapshot('map-2');

      // Assert: Only the targeted snapshot should be deleted
      expect(result).toBe(true);
      expect(await persistence.getSnapshot('map-1')).toBeDefined();
      expect(await persistence.getSnapshot('map-2')).toBeNull();
      expect(await persistence.getSnapshot('map-3')).toBeDefined();

      // Verify remaining snapshots are intact
      for (const mapId of ['map-1', 'map-3']) {
        const retrieved = await persistence.getSnapshot(mapId);
        const newDoc = new Y.Doc();
        Y.applyUpdate(newDoc, retrieved);
        const newMap = newDoc.getMap('mindmeld');
        const index = mapId === 'map-1' ? 0 : 2;
        expect(newMap.get('notes')).toEqual([
          { i: `note-${index}`, c: `Note ${index}` }
        ]);
      }
    });
  });

  describe('listSnapshots()', () => {
    it('should return empty array when no snapshots exist', async () => {
      const result = await persistence.listSnapshots();
      expect(result).toEqual([]);
    });

    it('should return list of mapIds with metadata', async () => {
      // Arrange: Create multiple snapshots with timestamps
      const mapIds = ['map-1', 'map-2', 'map-3'];
      const createdAt = [];

      for (let i = 0; i < mapIds.length; i++) {
        const doc = new Y.Doc();
        const yMap = doc.getMap('mindmeld');
        yMap.set('notes', [{ i: `note-${i}` }]);

        createdAt.push(new Date());
        await persistence.saveSnapshot(mapIds[i], Y.encodeStateAsUpdate(doc));

        // Small delay to ensure different timestamps
        if (i < mapIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Act: List snapshots
      const result = await persistence.listSnapshots();

      // Assert: Should return all snapshots with metadata
      expect(result).toHaveLength(3);

      // Verify each entry has required fields
      result.forEach(entry => {
        expect(entry).toHaveProperty('mapId');
        expect(entry).toHaveProperty('sizeBytes');
        expect(entry).toHaveProperty('updatedAt');
        expect(entry.sizeBytes).toBeGreaterThan(0);
        expect(new Date(entry.updatedAt)).toBeInstanceOf(Date);
      });

      // Verify all mapIds are present
      const returnedMapIds = result.map(entry => entry.mapId).sort();
      expect(returnedMapIds).toEqual(mapIds.sort());
    });

    it('should handle large number of snapshots efficiently', async () => {
      // Arrange: Create many snapshots
      const numSnapshots = 100;
      const mapIds = [];

      for (let i = 0; i < numSnapshots; i++) {
        const mapId = `bulk-map-${i.toString().padStart(3, '0')}`;
        mapIds.push(mapId);

        const doc = new Y.Doc();
        const yMap = doc.getMap('mindmeld');
        yMap.set(
          'notes',
          Array.from({ length: i + 1 }, (_, j) => ({ i: `note-${j}` }))
        );

        await persistence.saveSnapshot(mapId, Y.encodeStateAsUpdate(doc));
      }

      // Act: List all snapshots (should be fast)
      const startTime = Date.now();
      const result = await persistence.listSnapshots();
      const endTime = Date.now();

      // Assert: Should return all snapshots quickly
      expect(result).toHaveLength(numSnapshots);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second

      // Verify ordering (should be consistent)
      const mapIds_result = result.map(entry => entry.mapId);
      expect(mapIds_result).toEqual(mapIds_result.slice().sort());
    });
  });

  describe('database schema and migrations', () => {
    it('should create necessary tables on initialization', async () => {
      // This test verifies the database schema is created correctly
      // We can't directly inspect the schema without exposing DB internals,
      // but we can verify basic operations work

      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      yMap.set('test', 'schema validation');

      // These operations should succeed if schema is correct
      await persistence.saveSnapshot('schema-test', Y.encodeStateAsUpdate(doc));
      const retrieved = await persistence.getSnapshot('schema-test');
      const snapshots = await persistence.listSnapshots();

      expect(retrieved).toBeDefined();
      expect(snapshots).toHaveLength(1);
    });

    it('should handle database file creation in nested directories', async () => {
      // Arrange: Use a deeply nested path
      const deepDir = path.join(
        os.tmpdir(),
        'yjs-test',
        'nested',
        'deep',
        'path'
      );
      const deepDbFile = path.join(deepDir, 'deep-test.sqlite');

      // Act: Should create directories automatically
      const deepPersistence = new YjsPersistence(deepDbFile);

      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      yMap.set('test', 'deep directory creation');

      // Should not throw
      await deepPersistence.saveSnapshot(
        'deep-test',
        Y.encodeStateAsUpdate(doc)
      );

      // Verify it worked
      const retrieved = await deepPersistence.getSnapshot('deep-test');
      expect(retrieved).toBeDefined();

      // Clean up
      await fs.unlink(deepDbFile).catch(() => {});
      await fs.rmdir(deepDir, { recursive: true }).catch(() => {});
    });
  });

  describe('error handling', () => {
    it('should handle invalid mapId gracefully', async () => {
      // Test various edge cases for mapId
      const invalidMapIds = ['', null, undefined, 123, {}, []];

      for (const invalidId of invalidMapIds) {
        await expect(persistence.getSnapshot(invalidId)).resolves.toBeNull();
        await expect(persistence.deleteSnapshot(invalidId)).resolves.toBe(
          false
        );
      }
    });

    it('should handle corrupted snapshot data gracefully', async () => {
      // This test would require injecting corrupted data directly into the database
      // For now, we'll test that invalid Uint8Array data doesn't crash the system
      const mapId = 'corrupt-test';
      const invalidSnapshot = new Uint8Array([255, 255, 255]); // Invalid Yjs data

      // Should not throw when saving invalid data
      await expect(
        persistence.saveSnapshot(mapId, invalidSnapshot)
      ).resolves.not.toThrow();

      // Should return the data as-is (corruption handling is Yjs's responsibility)
      const retrieved = await persistence.getSnapshot(mapId);
      expect(retrieved).toEqual(invalidSnapshot);
    });
  });

  describe('performance characteristics', () => {
    it('should handle large documents efficiently', async () => {
      // Arrange: Create a large document
      const doc = new Y.Doc();
      const yMap = doc.getMap('mindmeld');
      const largeNoteArray = Array.from({ length: 10000 }, (_, i) => ({
        i: `note-${i}`,
        p: [Math.random() * 1000, Math.random() * 1000],
        c: `This is note number ${i} with some content to make it larger`,
        metadata: { created: Date.now(), tags: ['tag1', 'tag2', 'tag3'] }
      }));
      yMap.set('notes', largeNoteArray);
      yMap.set(
        'connections',
        Array.from({ length: 1000 }, (_, i) => [
          `note-${i}`,
          `note-${i + 1}`,
          1
        ])
      );

      const mapId = 'large-doc-test';
      const snapshot = Y.encodeStateAsUpdate(doc);

      // Act: Save and retrieve large document
      const saveStart = Date.now();
      await persistence.saveSnapshot(mapId, snapshot);
      const saveEnd = Date.now();

      const retrieveStart = Date.now();
      const retrieved = await persistence.getSnapshot(mapId);
      const retrieveEnd = Date.now();

      // Assert: Operations should complete in reasonable time
      expect(saveEnd - saveStart).toBeLessThan(5000); // 5 seconds max for save
      expect(retrieveEnd - retrieveStart).toBeLessThan(1000); // 1 second max for retrieve
      expect(retrieved).toEqual(snapshot);

      // Verify the content is correct
      const newDoc = new Y.Doc();
      Y.applyUpdate(newDoc, retrieved);
      const newMap = newDoc.getMap('mindmeld');
      expect(newMap.get('notes')).toHaveLength(10000);
      expect(newMap.get('connections')).toHaveLength(1000);
    });
  });
});
