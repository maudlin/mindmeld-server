const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { DatabaseRestore } = require('../../scripts/admin/db-restore');
const { openDatabase, ensureSchema } = require('../../src/modules/maps/db');

/**
 * Simplified test environment for focused behavior testing
 */
class SimpleTestEnv {
  constructor() {
    this.tempDir = null;
    this.backupDir = null;
    this.testDbPath = null;
  }

  async setup() {
    this.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-test-'));
    this.backupDir = path.join(this.tempDir, 'backups');
    await fs.mkdir(this.backupDir, { recursive: true });

    this.testDbPath = path.join(this.tempDir, 'test.sqlite');

    // Set up test database path for restore operations
    const originalEnv = process.env.SQLITE_FILE;
    process.env.SQLITE_FILE = this.testDbPath;
    this.originalEnv = originalEnv;
  }

  async teardown() {
    if (this.originalEnv) {
      process.env.SQLITE_FILE = this.originalEnv;
    } else {
      delete process.env.SQLITE_FILE;
    }

    if (this.tempDir) {
      // Add delay before cleanup to ensure all file handles are released
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await fs.rm(this.tempDir, { recursive: true, force: true });
      } catch {
        // On Windows, sometimes files are still locked - retry once
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          await fs.rm(this.tempDir, { recursive: true, force: true });
        } catch (retryError) {
          console.warn(
            'Could not clean up temp directory:',
            retryError.message
          );
        }
      }
    }
  }

  async createTestDatabase(mapCount = 2) {
    // Remove existing database file first
    try {
      await fs.unlink(this.testDbPath);
    } catch {
      // File doesn't exist, that's fine
    }

    const db = openDatabase(this.testDbPath);
    ensureSchema(db);

    if (mapCount > 0) {
      const stmt = db.prepare(
        'INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
      );

      for (let i = 0; i < mapCount; i++) {
        stmt.run(
          `test-id-${i}`,
          `Test Map ${i + 1}`,
          1,
          new Date().toISOString(),
          JSON.stringify({
            nodes: [{ id: `node-${i}`, content: `Node ${i}` }]
          }),
          50
        );
      }
    }

    db.close();

    // Add small delay to ensure file handles are released on Windows
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async createTestBackupFile(compressed = false, uniqueId = null) {
    // Create a fresh database for this backup
    const tempDbPath = path.join(
      this.tempDir,
      `temp-${uniqueId || Date.now()}.sqlite`
    );

    try {
      const db = openDatabase(tempDbPath);
      ensureSchema(db);

      // Add test data
      const stmt = db.prepare(
        'INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
      );

      for (let i = 0; i < 3; i++) {
        stmt.run(
          `test-id-${uniqueId || ''}-${i}`,
          `Test Map ${i + 1}`,
          1,
          new Date().toISOString(),
          JSON.stringify({
            nodes: [{ id: `node-${i}`, content: `Node ${i}` }]
          }),
          50
        );
      }

      // Ensure database is properly written and closed
      db.close();
    } catch (error) {
      console.error('Error creating test database:', error);
      throw error;
    }

    // Add delay to ensure database file is fully written and closed
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify database file exists and is readable
    try {
      const stats = await fs.stat(tempDbPath);
      if (stats.size === 0) {
        throw new Error('Created database file is empty');
      }
    } catch (error) {
      console.error('Error verifying temp database:', error);
      throw error;
    }

    // Create backup with proper naming
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .slice(0, 17);

    // Add uniqueId to ensure unique timestamps
    const finalTimestamp = uniqueId ? `${timestamp}${uniqueId}` : timestamp;
    const extension = compressed ? '.sqlite.gz' : '.sqlite';
    const backupPath = path.join(
      this.backupDir,
      `mindmeld-backup-${finalTimestamp}${extension}`
    );

    try {
      if (compressed) {
        // Create compressed backup
        const zlib = require('zlib');
        const { promisify } = require('util');
        const gzip = promisify(zlib.gzip);

        const uncompressed = await fs.readFile(tempDbPath);
        const compressed = await gzip(uncompressed);
        await fs.writeFile(backupPath, compressed);
      } else {
        // Simple copy for uncompressed backup
        await fs.copyFile(tempDbPath, backupPath);
      }

      // Verify backup was created successfully
      const backupStats = await fs.stat(backupPath);
      if (backupStats.size === 0) {
        throw new Error('Created backup file is empty');
      }
    } catch (error) {
      console.error('Error creating backup file:', error);
      throw error;
    } finally {
      // Clean up temporary database
      try {
        await fs.unlink(tempDbPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    return backupPath;
  }

  async createCorruptedBackup() {
    const timestamp = Date.now();
    const backupPath = path.join(
      this.backupDir,
      `mindmeld-backup-2025-01-01-120000-${timestamp}.sqlite`
    );
    await fs.writeFile(backupPath, 'This is not a valid SQLite file');

    // Add small delay to ensure file is written
    await new Promise(resolve => setTimeout(resolve, 10));

    return backupPath;
  }
}

describe('Database Restore Functionality', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new SimpleTestEnv();
    await testEnv.setup();
  });

  afterEach(async () => {
    if (testEnv) {
      await testEnv.teardown();
    }
  });

  describe('Core functionality', () => {
    it('creates DatabaseRestore with default options', () => {
      const restore = new DatabaseRestore();

      expect(restore.options.backupDir).toBe('./backups');
      expect(restore.options.verify).toBe(true);
      expect(restore.options.createSafety).toBe(true);
      expect(restore.options.verbose).toBe(false);
      expect(restore.logger).toBeDefined();
    });

    it('creates DatabaseRestore with custom options', () => {
      const options = {
        backupDir: '/custom/backup/dir',
        verify: false,
        createSafety: false,
        verbose: true,
        force: true
      };

      const restore = new DatabaseRestore(options);

      expect(restore.options.backupDir).toBe('/custom/backup/dir');
      expect(restore.options.verify).toBe(false);
      expect(restore.options.createSafety).toBe(false);
      expect(restore.options.verbose).toBe(true);
      expect(restore.options.force).toBe(true);
    });
  });

  describe('Backup discovery', () => {
    it('discovers available backup files', async () => {
      // Create test backup files with unique IDs
      await testEnv.createTestBackupFile(false, '01');
      await testEnv.createTestBackupFile(true, '02');

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir
      });

      const backups = await restore.discoverBackups();

      expect(backups).toBeDefined();
      expect(Array.isArray(backups)).toBe(true);
      expect(backups.length).toBe(2);

      // Verify backup file structure
      backups.forEach(backup => {
        expect(backup.filename).toBeDefined();
        expect(backup.path).toBeDefined();
        expect(backup.size).toBeGreaterThan(0);
        expect(backup.modified).toBeDefined();
        expect(typeof backup.compressed).toBe('boolean');
      });
    });

    it('handles empty backup directory gracefully', async () => {
      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir
      });

      const backups = await restore.discoverBackups();
      expect(backups).toEqual([]);
    });

    it('filters only valid backup files', async () => {
      // Create valid backup and invalid files
      await testEnv.createTestBackupFile(false, '03');
      await fs.writeFile(
        path.join(testEnv.backupDir, 'not-backup.txt'),
        'test'
      );
      await fs.writeFile(
        path.join(testEnv.backupDir, 'invalid-name.sqlite'),
        'test'
      );

      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir
      });

      const backups = await restore.discoverBackups();

      expect(backups.length).toBe(1);
      expect(backups[0].filename).toMatch(
        /mindmeld-backup-\d{4}-\d{2}-\d{2}-\d{6}.*\.sqlite$/
      );
    });
  });

  describe('Backup validation', () => {
    it('validates uncompressed backup file integrity', async () => {
      const backupPath = await testEnv.createTestBackupFile(false, '04');

      const restore = new DatabaseRestore();
      const isValid = await restore.validateBackupFile(backupPath);

      expect(isValid).toBe(true);
    });

    it('validates compressed backup file integrity', async () => {
      const backupPath = await testEnv.createTestBackupFile(true, '05');

      const restore = new DatabaseRestore();
      const isValid = await restore.validateBackupFile(backupPath);

      expect(isValid).toBe(true);
    });

    it('rejects corrupted backup files', async () => {
      const corruptedPath = await testEnv.createCorruptedBackup();

      const restore = new DatabaseRestore();
      const isValid = await restore.validateBackupFile(corruptedPath);

      expect(isValid).toBe(false);
    });

    it('rejects non-existent backup files', async () => {
      const restore = new DatabaseRestore();

      await expect(
        restore.validateBackupFile('/non/existent/file.sqlite')
      ).rejects.toThrow('Backup file not found');
    });
  });

  describe('Database restoration', () => {
    it('successfully restores from uncompressed backup', async () => {
      // Create backup file
      const backupPath = await testEnv.createTestBackupFile(false, '06');

      // Create empty current database for restore target
      await testEnv.createTestDatabase(0);

      const restore = new DatabaseRestore({
        backupFile: backupPath,
        createSafety: false, // Skip for test simplicity
        verify: false
      });

      const result = await restore.restoreDatabase();

      expect(result.success).toBe(true);
      expect(result.backupFile).toBe(backupPath);
    });

    it('successfully restores from compressed backup', async () => {
      // Create compressed backup
      const backupPath = await testEnv.createTestBackupFile(true, '07');

      // Create empty current database
      await testEnv.createTestDatabase(0);

      const restore = new DatabaseRestore({
        backupFile: backupPath,
        createSafety: false,
        verify: false
      });

      const result = await restore.restoreDatabase();

      expect(result.success).toBe(true);
      expect(result.backupFile).toBe(backupPath);
    });

    it('skips validation when disabled', async () => {
      const backupPath = await testEnv.createTestBackupFile(false, '08');
      await testEnv.createTestDatabase(0);

      const restore = new DatabaseRestore({
        backupFile: backupPath,
        verify: false,
        createSafety: false
      });

      // Mock validation to track if called
      const validateSpy = jest.spyOn(restore, 'validateBackupFile');

      await restore.restoreDatabase();

      expect(validateSpy).not.toHaveBeenCalled();

      validateSpy.mockRestore();
    });
  });

  describe('Error conditions', () => {
    it('handles non-existent backup file', async () => {
      const restore = new DatabaseRestore({
        backupFile: '/non/existent/backup.sqlite'
      });

      await expect(restore.restoreDatabase()).rejects.toThrow(
        'Backup file not found'
      );
    });

    it('handles corrupted backup file with validation enabled', async () => {
      const corruptedPath = await testEnv.createCorruptedBackup();

      const restore = new DatabaseRestore({
        backupFile: corruptedPath,
        verify: true
      });

      await expect(restore.restoreDatabase()).rejects.toThrow(
        'Backup validation failed'
      );
    });

    it('handles empty backup directory', async () => {
      const restore = new DatabaseRestore({
        backupDir: testEnv.backupDir
      });

      await expect(restore.restoreDatabase()).rejects.toThrow(
        'No backup files found'
      );
    });
  });

  describe('Safety features', () => {
    it('creates safety backup when enabled', async () => {
      // Create current database with data
      await testEnv.createTestDatabase(2);

      const restore = new DatabaseRestore({
        safetyDir: testEnv.backupDir,
        verbose: true
      });

      const safetyPath = await restore.createSafetyBackup();

      expect(safetyPath).toBeDefined();
      expect(path.basename(safetyPath)).toMatch(
        /^safety-backup-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/
      );

      // Verify file exists
      const exists = await fs
        .access(safetyPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('skips safety backup when disabled', async () => {
      const restore = new DatabaseRestore({
        createSafety: false
      });

      const safetyPath = await restore.createSafetyBackup();
      expect(safetyPath).toBeNull();
    });

    it('handles current database exists for safety backup', async () => {
      // Create current database - the environment variable is set to testDbPath
      await testEnv.createTestDatabase(1);

      const restore = new DatabaseRestore({
        safetyDir: testEnv.backupDir
      });

      const safetyPath = await restore.createSafetyBackup();

      // Should create backup since database exists
      expect(safetyPath).toBeDefined();
      expect(path.basename(safetyPath)).toMatch(
        /^safety-backup-\d{4}-\d{2}-\d{2}-\d{6}\.sqlite$/
      );

      // Verify file exists
      const exists = await fs
        .access(safetyPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('CLI functionality', () => {
    it('processes command line arguments correctly', () => {
      const { parseArguments } = require('../../scripts/admin/db-restore');

      // Mock process.argv
      const originalArgv = process.argv;
      process.argv = [
        'node',
        'db-restore.js',
        '--backup',
        '/path/to/backup.sqlite',
        '--backup-dir',
        '/custom/dir',
        '--no-safety',
        '--no-verify',
        '--verbose',
        '--force'
      ];

      const options = parseArguments();

      expect(options.backupFile).toBe('/path/to/backup.sqlite');
      expect(options.backupDir).toBe('/custom/dir');
      expect(options.createSafety).toBe(false);
      expect(options.verify).toBe(false);
      expect(options.verbose).toBe(true);
      expect(options.force).toBe(true);

      // Restore original argv
      process.argv = originalArgv;
    });
  });

  describe('Utility functions', () => {
    it('formats file sizes correctly', () => {
      const restore = new DatabaseRestore();

      expect(restore.formatFileSize(1024)).toBe('1.0 KB');
      expect(restore.formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(restore.formatFileSize(1536)).toBe('1.5 KB');
      expect(restore.formatFileSize(500)).toBe('500.0 B');
    });
  });
});
