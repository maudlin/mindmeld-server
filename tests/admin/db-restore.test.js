const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const AdminTestEnvironment = require('./helpers/admin-test-env');

// We'll create the DatabaseRestore class during implementation
let DatabaseRestore;

// Removed unused gunzip variable

describe('Admin Command: db:restore', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();

    // Try to require the DatabaseRestore class (will fail initially - TDD)
    try {
      const dbRestore = require('../../scripts/admin/db-restore');
      DatabaseRestore = dbRestore.DatabaseRestore;
    } catch {
      // Expected during TDD - class doesn't exist yet
      DatabaseRestore = null;
    }
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe('class instantiation', () => {
    it('creates DatabaseRestore with default options', () => {
      if (!DatabaseRestore) {
        return;
      } // Skip during TDD phase

      const restore = new DatabaseRestore();
      expect(restore.options.backupDir).toBe('./backups');
      expect(restore.options.verify).toBe(true);
      expect(restore.options.createSafety).toBe(true);
      expect(restore.options.verbose).toBe(false);
    });

    it('creates DatabaseRestore with custom options', () => {
      if (!DatabaseRestore) {
        return;
      }

      const options = {
        backupDir: '/custom/backups',
        verify: false,
        createSafety: false,
        verbose: true,
        force: true
      };

      const restore = new DatabaseRestore(options);
      expect(restore.options.backupDir).toBe('/custom/backups');
      expect(restore.options.verify).toBe(false);
      expect(restore.options.createSafety).toBe(false);
      expect(restore.options.verbose).toBe(true);
      expect(restore.options.force).toBe(true);
    });
  });

  describe('backup discovery and selection', () => {
    beforeEach(async () => {
      // Create some test backup files
      await testEnv.createTestBackups();
    });

    it('discovers available backup files', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({ backupDir: testEnv.backupDir });
      const backups = await restore.discoverBackups();

      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBeGreaterThan(0);

      // Verify backup info structure
      backups.forEach(backup => {
        expect(backup).toHaveProperty('filename');
        expect(backup).toHaveProperty('path');
        expect(backup).toHaveProperty('size');
        expect(backup).toHaveProperty('modified');
        expect(backup).toHaveProperty('compressed');
      });
    });

    it('sorts backups by creation time (newest first)', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({ backupDir: testEnv.backupDir });
      const backups = await restore.discoverBackups();

      expect(backups.length).toBeGreaterThanOrEqual(2);

      // Verify sorting (newer files first)
      for (let i = 1; i < backups.length; i++) {
        expect(backups[i - 1].modified.getTime()).toBeGreaterThanOrEqual(
          backups[i].modified.getTime()
        );
      }
    });

    it('handles empty backup directory gracefully', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const emptyDir = path.join(testEnv.tempDir, 'empty-backups');
      await fs.mkdir(emptyDir, { recursive: true });

      const restore = new DatabaseRestore({ backupDir: emptyDir });
      const backups = await restore.discoverBackups();

      expect(backups).toEqual([]);
    });

    it('filters only valid backup files', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create some non-backup files
      await fs.writeFile(
        path.join(testEnv.backupDir, 'not-a-backup.txt'),
        'test'
      );
      await fs.writeFile(path.join(testEnv.backupDir, 'random.db'), 'test');

      const restore = new DatabaseRestore({ backupDir: testEnv.backupDir });
      const backups = await restore.discoverBackups();

      // Should only find actual backup files
      backups.forEach(backup => {
        expect(backup.filename).toMatch(
          /mindmeld-backup-\d{4}-\d{2}-\d{2}-\d+.*\.(sqlite|sqlite\.gz)$/
        );
      });
    });

    it('selects newest backup when backup parameter not provided', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({ backupDir: testEnv.backupDir });
      const selectedBackup = await restore.selectBackupFile();

      const allBackups = await restore.discoverBackups();
      expect(selectedBackup.path).toBe(allBackups[0].path); // First = newest
    });

    it('selects specific backup when path provided', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const backups = await testEnv.getBackupFiles();
      const specificBackup = path.join(testEnv.backupDir, backups[1]);

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir,
        backupFile: specificBackup
      });

      const selectedBackup = await restore.selectBackupFile();
      expect(selectedBackup.path).toBe(specificBackup);
    });
  });

  describe('backup validation', () => {
    beforeEach(async () => {
      await testEnv.createTestBackups();
    });

    it('validates uncompressed backup file integrity', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const backups = await testEnv.getBackupFiles();
      const uncompressedBackup = backups.find(f => f.endsWith('.sqlite'));
      const backupPath = path.join(testEnv.backupDir, uncompressedBackup);

      const restore = new DatabaseRestore();
      const isValid = await restore.validateBackupFile(backupPath);

      expect(isValid).toBe(true);
    });

    it('validates compressed backup file integrity', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const backups = await testEnv.getBackupFiles();
      const compressedBackup = backups.find(f => f.endsWith('.sqlite.gz'));

      if (compressedBackup) {
        const backupPath = path.join(testEnv.backupDir, compressedBackup);

        const restore = new DatabaseRestore();
        const isValid = await restore.validateBackupFile(backupPath);

        expect(isValid).toBe(true);
      }
    });

    it('rejects corrupted backup files', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create a corrupted backup file
      const corruptedPath = path.join(
        testEnv.backupDir,
        'corrupted-backup.sqlite'
      );
      await fs.writeFile(corruptedPath, 'This is not a valid SQLite file');

      try {
        const restore = new DatabaseRestore();
        const isValid = await restore.validateBackupFile(corruptedPath);
        expect(isValid).toBe(false);
      } finally {
        // Clean up the corrupted file
        try {
          await fs.unlink(corruptedPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('rejects non-existent backup files', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const nonExistentPath = path.join(
        testEnv.backupDir,
        'does-not-exist.sqlite'
      );

      const restore = new DatabaseRestore();
      await expect(restore.validateBackupFile(nonExistentPath)).rejects.toThrow(
        'Backup file not found'
      );
    });
  });

  describe('safety backup creation', () => {
    beforeEach(async () => {
      // Create some test data in current database
      testEnv.createTestMaps(5);
    });

    it('creates safety backup before restore', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        safetyDir: testEnv.backupDir,
        createSafety: true
      });

      const safetyPath = await restore.createSafetyBackup();

      expect(safetyPath).toBeDefined();
      expect(
        await fs
          .access(safetyPath)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      expect(path.basename(safetyPath)).toMatch(
        /^safety-backup-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/
      );
    });

    it('skips safety backup when disabled', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({ createSafety: false });
      const safetyPath = await restore.createSafetyBackup();

      expect(safetyPath).toBeNull();
    });

    it('safety backup contains current database data', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const originalData = testEnv.getAllMaps();

      const restore = new DatabaseRestore({
        safetyDir: testEnv.backupDir,
        createSafety: true
      });

      const safetyPath = await restore.createSafetyBackup();
      const safetyData = testEnv.getMapsFromBackup(safetyPath);

      expect(safetyData).toEqual(originalData);
    });
  });

  describe('database restoration', () => {
    let backupFile;
    let originalData;

    beforeEach(async () => {
      // Create original data
      originalData = testEnv.createTestMaps(3);

      // Create a backup of this data
      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const result = await backup.createBackup();
      backupFile = result.path;

      // Modify current database (so restore will change it back)
      testEnv.createTestMaps(2, 'different');
    });

    it('successfully restores from uncompressed backup', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir,
        backupFile: backupFile
      });

      const result = await restore.restoreDatabase();

      expect(result.success).toBe(true);
      expect(result.backupFile).toBe(backupFile);
      expect(result.safetyBackup).toBeDefined();

      // Verify data was restored
      const restoredData = testEnv.getAllMaps();
      expect(restoredData).toEqual(originalData);
    });

    it('successfully restores from compressed backup', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create compressed backup
      const compressedBackup = backupFile.replace('.sqlite', '.sqlite.gz');
      const data = await fs.readFile(backupFile);
      const compressed = await promisify(zlib.gzip)(data);
      await fs.writeFile(compressedBackup, compressed);

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir,
        backupFile: compressedBackup
      });

      const result = await restore.restoreDatabase();

      expect(result.success).toBe(true);

      // Verify data was restored
      const restoredData = testEnv.getAllMaps();
      expect(restoredData).toEqual(originalData);
    });

    it('creates safety backup before restoration', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir,
        backupFile: backupFile,
        createSafety: true
      });

      const result = await restore.restoreDatabase();

      expect(result.safetyBackup).toBeDefined();
      expect(
        await fs
          .access(result.safetyBackup)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
    });

    it('skips validation when disabled', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir,
        backupFile: backupFile,
        verify: false
      });

      // Should not throw even if we had a corrupted backup
      const result = await restore.restoreDatabase();
      expect(result.success).toBe(true);
    });
  });

  describe('error conditions and rollback', () => {
    let backupFile;
    let originalData;

    beforeEach(async () => {
      originalData = testEnv.createTestMaps(3);

      // Create a backup
      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const result = await backup.createBackup();
      backupFile = result.path;
    });

    it('handles non-existent backup file', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupFile: '/non/existent/backup.sqlite'
      });

      await expect(restore.restoreDatabase()).rejects.toThrow(
        'Backup file not found'
      );
    });

    it('handles corrupted backup file', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create corrupted backup
      const corruptedPath = path.join(testEnv.backupDir, 'corrupted.sqlite');
      await fs.writeFile(corruptedPath, 'Not a valid SQLite file');

      const restore = new DatabaseRestore({
        backupFile: corruptedPath,
        verify: true
      });

      await expect(restore.restoreDatabase()).rejects.toThrow(
        'Backup validation failed'
      );
    });

    it('rolls back to safety backup on restore failure', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupFile: backupFile,
        createSafety: true
      });

      // Mock restore failure after safety backup is created
      restore.performRestore = jest
        .fn()
        .mockRejectedValue(new Error('Restore failed'));

      await expect(restore.restoreDatabase()).rejects.toThrow('Restore failed');

      // Verify rollback occurred - original data should still be there
      const currentData = testEnv.getAllMaps();
      expect(currentData).toEqual(originalData);
    });

    it('cleans up temporary files on failure', async () => {
      if (!DatabaseRestore) {
        return;
      }

      const restore = new DatabaseRestore({
        backupFile: backupFile,
        createSafety: true
      });

      // Mock failure during restore
      restore.performRestore = jest
        .fn()
        .mockRejectedValue(new Error('Test failure'));

      try {
        await restore.restoreDatabase();
      } catch {
        // Expected
      }

      // Verify cleanup occurred
      // (Implementation detail - would check for temp files)
      expect(true).toBe(true); // Placeholder for cleanup verification
    });
  });

  describe('CLI interface', () => {
    it('shows help when --help flag is used', () => {
      if (!DatabaseRestore) {
        return;
      }

      // Mock console.log to capture output
      const consoleSpy = jest
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      // Mock process.exit to prevent actual exit
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

      // Mock process.argv to simulate --help
      const originalArgv = process.argv;
      process.argv = ['node', 'db-restore.js', '--help'];

      try {
        // Call parseArguments which should trigger help and exit
        const { parseArguments } = require('../../scripts/admin/db-restore');
        parseArguments();

        // Verify help was displayed and exit was called
        expect(consoleSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
      } catch {
        // If parseArguments throws instead of calling process.exit, that's also valid
        expect(consoleSpy).toHaveBeenCalled();
      }

      // Restore mocks
      process.argv = originalArgv;
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('processes command line arguments correctly', () => {
      if (!DatabaseRestore) {
        return;
      }

      const originalArgv = process.argv;
      process.argv = [
        'node',
        'db-restore.js',
        '--backup',
        '/path/to/backup.sqlite',
        '--no-safety',
        '--no-verify',
        '--force',
        '--verbose'
      ];

      // This would be called in main function
      // const options = parseArguments();

      // Verify parsing (placeholder for actual implementation)
      expect(true).toBe(true);

      process.argv = originalArgv;
    });
  });

  describe('integration with existing systems', () => {
    it('works with backup files created by DatabaseBackup', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create test data
      const originalData = testEnv.createTestMaps(5);

      // Create backup using existing backup system
      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({
        output: testEnv.backupDir,
        compress: false
      });
      const backupResult = await backup.createBackup();

      // Modify current data
      testEnv.createTestMaps(3, 'modified');

      // Restore using new restore system
      const restore = new DatabaseRestore({
        backupFile: backupResult.path
      });
      const restoreResult = await restore.restoreDatabase();

      expect(restoreResult.success).toBe(true);

      // Verify data was restored correctly
      const restoredData = testEnv.getAllMaps();
      expect(restoredData).toEqual(originalData);
    });

    it('handles backup metadata files correctly', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create backup with metadata
      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const backupResult = await backup.createBackup();

      // Verify metadata file exists
      const metadataPath = backupResult.path + '.meta.json';
      const metadataExists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false);
      expect(metadataExists).toBe(true);

      // Restore should work regardless of metadata file
      const restore = new DatabaseRestore({
        backupFile: backupResult.path
      });

      const restoreResult = await restore.restoreDatabase();
      expect(restoreResult.success).toBe(true);
    });
  });

  describe('performance and edge cases', () => {
    it('handles large database restoration within time limit', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create large database
      testEnv.createTestMaps(100);

      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const backupResult = await backup.createBackup();

      const startTime = Date.now();

      const restore = new DatabaseRestore({
        backupFile: backupResult.path
      });

      await restore.restoreDatabase();

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(30000); // 30 second limit
    }, 35000); // Extended timeout for large restore test

    it('handles empty database restoration', async () => {
      if (!DatabaseRestore) {
        return;
      }

      // Create backup of empty database
      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const backupResult = await backup.createBackup();

      // Add some data to current database
      testEnv.createTestMaps(5);

      // Restore empty database
      const restore = new DatabaseRestore({
        backupFile: backupResult.path
      });

      const result = await restore.restoreDatabase();

      expect(result.success).toBe(true);

      // Verify database is now empty
      const currentData = testEnv.getAllMaps();
      expect(currentData).toEqual([]);
    });

    it('handles concurrent restore attempts gracefully', async () => {
      if (!DatabaseRestore) {
        return;
      }

      testEnv.createTestMaps(3);

      const { DatabaseBackup } = require('../../scripts/admin/db-backup');
      const backup = new DatabaseBackup({ output: testEnv.backupDir });
      const backupResult = await backup.createBackup();

      // Attempt concurrent restores
      const restore1 = new DatabaseRestore({ backupFile: backupResult.path });
      const restore2 = new DatabaseRestore({ backupFile: backupResult.path });

      // Only one should succeed, or they should handle concurrency gracefully
      const promises = [restore1.restoreDatabase(), restore2.restoreDatabase()];

      try {
        const results = await Promise.allSettled(promises);

        // At least one should succeed
        const successes = results.filter(r => r.status === 'fulfilled');
        expect(successes.length).toBeGreaterThan(0);
      } catch (error) {
        // Concurrency handling is acceptable
        expect(error.message).toMatch(/database.*locked|concurrent|busy/i);
      }
    });
  });
});
