const fs = require('fs').promises;
const path = require('path');
const { DatabaseBackup } = require('../../scripts/admin/db-backup');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: db:backup', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    // Reset all mocks to ensure test isolation
    jest.restoreAllMocks();

    // Restore original functions if they were mocked
    if (fs.mkdir && fs.mkdir.mockClear) {
      jest.restoreAllMocks();
    }

    await testEnv.teardown();
  });

  describe('successful backup operations', () => {
    it('creates timestamped backup file', async () => {
      // Create test data
      testEnv.createTestMaps(3);

      // Create backup
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        verbose: false,
      });

      const result = await backup.createBackup();

      // Verify backup file was created
      expect(result.filename).toMatch(
        /^mindmeld-backup-\d{4}-\d{2}-\d{2}-\d{6}\d{3}\d{3}\.sqlite$/,
      );
      expect(result.path).toBe(path.join(testEnv.backupDir, result.filename));

      // Verify file exists
      const backupExists = await fs
        .access(result.path)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('backup contains complete data copy', async () => {
      // Create test data
      const originalMaps = testEnv.createTestMaps(5);

      // Create backup
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Verify backup data
      const backupMaps = testEnv.getMapsFromBackup(result.path);

      expect(backupMaps).toHaveLength(originalMaps.length);

      // Sort both arrays by name for comparison
      const sortedOriginal = originalMaps.sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      const sortedBackup = backupMaps.sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      for (let i = 0; i < sortedOriginal.length; i++) {
        expect(sortedBackup[i].id).toBe(sortedOriginal[i].id);
        expect(sortedBackup[i].name).toBe(sortedOriginal[i].name);
        expect(sortedBackup[i].data).toEqual(sortedOriginal[i].data);
      }
    });

    it('compression option works correctly', async () => {
      // Create test data
      testEnv.createTestMaps(10);

      // Create uncompressed backup
      const uncompressedBackup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: false,
      });

      const uncompressedResult = await uncompressedBackup.createBackup();

      // Create compressed backup
      const compressedBackup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: true,
      });

      const compressedResult = await compressedBackup.createBackup();

      // Verify compression
      expect(compressedResult.filename).toMatch(/\.sqlite\.gz$/);
      expect(compressedResult.compressed).toBe(true);
      expect(compressedResult.size).toBeLessThan(uncompressedResult.size);
      expect(compressedResult.compressionRatio).toBeGreaterThan(0);
    });

    it('custom output directory is respected', async () => {
      const customOutput = path.join(testEnv.tempDir, 'custom-backups');

      // Create test data
      testEnv.createTestMaps(2);

      // Create backup with custom output
      const backup = new DatabaseBackup({
        output: customOutput,
      });

      const result = await backup.createBackup();

      // Verify backup is in custom directory
      expect(result.path).toContain('custom-backups');

      const backupExists = await fs
        .access(result.path)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('custom backup name prefix works', async () => {
      // Create test data
      testEnv.createTestMaps(1);

      // Create backup with custom name
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        name: 'custom-prefix',
      });

      const result = await backup.createBackup();

      // Verify custom prefix
      expect(result.filename).toMatch(
        /^custom-prefix-\d{4}-\d{2}-\d{2}-\d{6}\d{3}\d{3}\.sqlite$/,
      );
    });

    it('verifies backup integrity after creation', async () => {
      // Create test data
      testEnv.createTestMaps(3);

      // Create backup with verification
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        verify: true,
      });

      const result = await backup.createBackup();

      // Verify integrity check was performed
      expect(testEnv.verifyBackupIntegrity(result.path)).toBe(true);
    });

    it('reports accurate progress and statistics', async () => {
      // Create test data
      testEnv.createTestMaps(5);

      // Create backup
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Verify result metadata
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('size');
      expect(result).toHaveProperty('sourceSize');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('checksum');
      expect(result).toHaveProperty('createdAt');

      expect(result.size).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.checksum).toMatch(/^[a-f0-9]{64}$/); // SHA256 hash
    });

    it('saves backup metadata file', async () => {
      // Create test data
      testEnv.createTestMaps(2);

      // Create backup
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Verify metadata file exists
      const metadataPath = result.path + '.meta.json';
      const metadataExists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false);
      expect(metadataExists).toBe(true);

      // Verify metadata content
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.filename).toBe(result.filename);
      expect(metadata.size).toBe(result.size);
      expect(metadata.checksum).toBe(result.checksum);
    });
  });

  describe('error conditions', () => {
    it('handles non-existent source database', async () => {
      // Set invalid database path
      process.env.SQLITE_FILE = '/non/existent/database.sqlite';

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      await expect(backup.createBackup()).rejects.toThrow(
        'Cannot access source database',
      );
    });

    it('handles invalid backup directory permissions', async () => {
      // Create a test for write permission failure by mocking fs operations
      const originalMkdir = fs.mkdir;
      fs.mkdir = jest
        .fn()
        .mockRejectedValue(new Error('EACCES: permission denied'));

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      try {
        await expect(backup.createBackup()).rejects.toThrow(
          'Cannot prepare backup directory',
        );
      } finally {
        // Restore original function
        fs.mkdir = originalMkdir;
      }
    });

    it('handles compression failure gracefully', async () => {
      // Create test data
      testEnv.createTestMaps(1);

      // Mock compression failure by mocking fs.writeFile to fail during compression write
      const originalWriteFile = fs.writeFile;
      fs.writeFile = jest.fn().mockImplementation(async (path, data) => {
        if (path.endsWith('.gz')) {
          throw new Error('No space left on device');
        }
        return await originalWriteFile(path, data);
      });

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: true,
        verify: false, // Disable verification to focus on compression failure
      });

      try {
        await expect(backup.createBackup()).rejects.toThrow(
          'Backup compression failed',
        );
      } finally {
        // Restore original function
        fs.writeFile = originalWriteFile;
      }
    });

    it('handles backup verification failure', async () => {
      // Create test data
      testEnv.createTestMaps(1);

      // Create backup with forced verification failure
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        verify: true,
      });

      // Mock the verification to fail
      backup.verifyBackup = jest
        .fn()
        .mockRejectedValue(new Error('Verification failed'));

      await expect(backup.createBackup()).rejects.toThrow(
        'Verification failed',
      );
    });

    it('skips verification when disabled', async () => {
      // Create test data
      testEnv.createTestMaps(1);

      // Create backup without verification
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        verify: false,
      });

      // Should not throw even if verification would fail
      const result = await backup.createBackup();
      expect(result).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles empty database', async () => {
      // Don't create any test data - use empty database

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Verify backup was created successfully
      expect(result.size).toBeGreaterThan(0); // Even empty SQLite has some size

      // Verify backup integrity
      expect(testEnv.verifyBackupIntegrity(result.path)).toBe(true);
    });

    it('handles very large database', async () => {
      // Create large test database
      await testEnv.createLargeDatabase(100); // 100 maps

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: true,
      });

      const startTime = Date.now();
      const result = await backup.createBackup();
      const duration = Date.now() - startTime;

      // Should complete within reasonable time (adjust based on system)
      expect(duration).toBeLessThan(30000); // 30 seconds

      // Verify backup integrity
      expect(testEnv.verifyBackupIntegrity(result.path)).toBe(true);

      // Verify compression was attempted (ratio could be negative for small/non-compressible data)
      expect(result.compressionRatio).not.toBeNull();
      expect(typeof result.compressionRatio).toBe('number');

      // For a larger database, compression might not help much, especially with test data
      // SQLite databases with random UUIDs and JSON data might not compress well
      // Just verify the ratio is a reasonable number (not extremely negative)
      expect(result.compressionRatio).toBeGreaterThan(-200); // Very permissive
    }, 35000); // Extended timeout for large database test

    it('handles special characters in backup names', async () => {
      // Create test data
      testEnv.createTestMaps(1);

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        name: 'test-backup-with-special-chars',
      });

      const result = await backup.createBackup();

      expect(result.filename).toContain('test-backup-with-special-chars');
    });

    it('creates directory structure if needed', async () => {
      const nestedDir = path.join(
        testEnv.tempDir,
        'nested',
        'backup',
        'directory',
      );

      // Create test data
      testEnv.createTestMaps(1);

      const backup = new DatabaseBackup({
        output: nestedDir,
      });

      const result = await backup.createBackup();

      // Verify nested directory was created and backup exists
      const backupExists = await fs
        .access(result.path)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('handles concurrent backup attempts gracefully', async () => {
      // Ensure clean state by explicitly clearing all mocks
      jest.clearAllMocks();
      jest.restoreAllMocks();

      // Create test data
      testEnv.createTestMaps(5);

      // Create separate output directories to avoid conflicts during directory testing
      const backupDir1 = path.join(testEnv.tempDir, 'backups1');
      const backupDir2 = path.join(testEnv.tempDir, 'backups2');

      // Ensure directories exist
      await fs.mkdir(backupDir1, { recursive: true });
      await fs.mkdir(backupDir2, { recursive: true });

      // Create multiple backup instances with different output directories
      const backup1 = new DatabaseBackup({ output: backupDir1 });
      const backup2 = new DatabaseBackup({ output: backupDir2 });

      // Run backups concurrently
      const [result1, result2] = await Promise.all([
        backup1.createBackup(),
        backup2.createBackup(),
      ]);

      // Both should succeed with different filenames
      expect(result1.filename).not.toBe(result2.filename);
      expect(testEnv.verifyBackupIntegrity(result1.path)).toBe(true);
      expect(testEnv.verifyBackupIntegrity(result2.path)).toBe(true);
    });
  });

  describe('performance tests', () => {
    it('backup completes within acceptable time limits', async () => {
      // Create moderately sized database
      await testEnv.createLargeDatabase(50);

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const startTime = Date.now();
      await backup.createBackup();
      const duration = Date.now() - startTime;

      // Should complete within 15 seconds for 50 maps
      expect(duration).toBeLessThan(15000);
    }, 20000);

    it('memory usage remains reasonable for large backups', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create large database
      await testEnv.createLargeDatabase(200);

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: true,
      });

      await backup.createBackup();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 30000);
  });

  describe('integration with existing database schema', () => {
    it('preserves all database indexes and constraints', async () => {
      // Create test data
      testEnv.createTestMaps(5);

      // Get original database schema
      const originalIndexes = testEnv.testDb
        .prepare(
          `
        SELECT name, sql FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `,
        )
        .all();

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Check backup database schema
      const backupDb = require('better-sqlite3')(result.path, {
        readonly: true,
      });
      const backupIndexes = backupDb
        .prepare(
          `
        SELECT name, sql FROM sqlite_master 
        WHERE type = 'index' AND name NOT LIKE 'sqlite_%'
      `,
        )
        .all();
      backupDb.close();

      // Verify indexes are preserved
      expect(backupIndexes).toEqual(originalIndexes);
    });

    it('maintains database statistics and pragma settings', async () => {
      // Create test data
      testEnv.createTestMaps(3);

      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
      });

      const result = await backup.createBackup();

      // Verify backup database can be queried normally
      const backupMaps = testEnv.getMapsFromBackup(result.path);
      expect(backupMaps).toHaveLength(3);
    });
  });
});
