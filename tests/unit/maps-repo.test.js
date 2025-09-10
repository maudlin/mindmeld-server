const fs = require('fs').promises;
const path = require('path');
const MapsRepo = require('../../src/modules/maps/repo');

describe('MapsRepo', () => {
  let repo;
  let dbFile;

  beforeEach(() => {
    // Create a unique test database file
    dbFile = path.join(
      process.cwd(),
      'test-data',
      `maps-repo-${Date.now()}.sqlite`
    );
    repo = new MapsRepo(dbFile);
  });

  afterEach(async () => {
    // Clean up test database
    await fs.unlink(dbFile).catch(() => {
      // ignore missing file
    });
  });

  describe('delete()', () => {
    it('should delete an existing map and return 1', () => {
      // Arrange: Create a map first
      const mapData = {
        id: 'test-map-id',
        name: 'Test Map',
        version: 1,
        updatedAt: new Date().toISOString(),
        stateJson: JSON.stringify({ n: [], c: [] }),
        sizeBytes: 15
      };
      repo.create(mapData);

      // Verify it exists
      const before = repo.get('test-map-id');
      expect(before).toBeTruthy();
      expect(before.name).toBe('Test Map');

      // Act: Delete the map
      const result = repo.delete('test-map-id');

      // Assert: Should return 1 (one row affected)
      expect(result).toBe(1);

      // Verify it's gone
      const after = repo.get('test-map-id');
      expect(after).toBeNull();
    });

    it('should return 0 when trying to delete non-existent map', () => {
      // Act: Try to delete a map that doesn't exist
      const result = repo.delete('non-existent-id');

      // Assert: Should return 0 (no rows affected)
      expect(result).toBe(0);
    });

    it('should handle multiple deletes of same map', () => {
      // Arrange: Create a map
      const mapData = {
        id: 'test-map-id',
        name: 'Test Map',
        version: 1,
        updatedAt: new Date().toISOString(),
        stateJson: JSON.stringify({ n: [], c: [] }),
        sizeBytes: 15
      };
      repo.create(mapData);

      // Act: Delete twice
      const result1 = repo.delete('test-map-id');
      const result2 = repo.delete('test-map-id');

      // Assert: First delete should return 1, second should return 0
      expect(result1).toBe(1);
      expect(result2).toBe(0);
    });

    it('should not affect other maps when deleting one', () => {
      // Arrange: Create two maps
      const map1 = {
        id: 'map-1',
        name: 'Map One',
        version: 1,
        updatedAt: new Date().toISOString(),
        stateJson: JSON.stringify({ n: [], c: [] }),
        sizeBytes: 15
      };
      const map2 = {
        id: 'map-2',
        name: 'Map Two',
        version: 1,
        updatedAt: new Date().toISOString(),
        stateJson: JSON.stringify({ n: [], c: [] }),
        sizeBytes: 15
      };
      repo.create(map1);
      repo.create(map2);

      // Act: Delete one map
      const result = repo.delete('map-1');

      // Assert: Only the targeted map should be deleted
      expect(result).toBe(1);
      expect(repo.get('map-1')).toBeNull();
      expect(repo.get('map-2')).toBeTruthy();
      expect(repo.get('map-2').name).toBe('Map Two');
    });
  });
});
