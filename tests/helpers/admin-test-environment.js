const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const uuidv4 = crypto.randomUUID;
const Database = require('better-sqlite3');
const { openDatabase, ensureSchema } = require('../../src/modules/maps/db');

class AdminTestEnvironment {
  constructor() {
    this.tempDir = null;
    this.testDb = null;
    this.testDbPath = null;
    this.backupDir = null;
    this.originalConfig = null;
  }

  async setup() {
    // Create temporary directories
    this.tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'mindmeld-admin-test-'),
    );
    this.backupDir = path.join(this.tempDir, 'backups');
    await fs.mkdir(this.backupDir, { recursive: true });

    // Setup test database
    this.testDbPath = path.join(this.tempDir, 'test-db.sqlite');
    this.testDb = openDatabase(this.testDbPath);
    ensureSchema(this.testDb);

    // Store original environment
    this.originalConfig = {
      SQLITE_FILE: process.env.SQLITE_FILE,
      NODE_ENV: process.env.NODE_ENV,
    };

    // Set test environment
    process.env.SQLITE_FILE = this.testDbPath;
    process.env.NODE_ENV = 'test';
  }

  // Alias for teardown for backward compatibility
  async cleanup() {
    return this.teardown();
  }

  async teardown() {
    // Close database connections
    if (this.testDb) {
      this.testDb.close();
      this.testDb = null;
    }

    // Restore original environment
    if (this.originalConfig) {
      process.env.SQLITE_FILE = this.originalConfig.SQLITE_FILE;
      process.env.NODE_ENV = this.originalConfig.NODE_ENV;
    }

    // Cleanup temporary files with retry for Windows file locking issues
    if (this.tempDir) {
      await this.safeCleanup(this.tempDir);
    }
  }

  /**
   * Safely cleanup files with retry for Windows file locking issues
   * @param {string} dirPath - Directory to clean up
   */
  async safeCleanup(dirPath, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.rm(dirPath, { recursive: true, force: true });
        return; // Success
      } catch (error) {
        if (error.code === 'EBUSY' || error.code === 'ENOTEMPTY') {
          // Wait a bit and retry
          await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
          continue;
        }
        // Other errors should not be retried
        if (i === maxRetries - 1) {
          console.warn(`Failed to cleanup ${dirPath}: ${error.message}`);
        }
        break;
      }
    }
  }

  /**
   * Create test maps in the database
   * @param {Array|number} mapsData - Either array of map objects or count of maps to create
   * @returns {Array} Array of created map objects
   */
  async createTestMaps(mapsData) {
    const stmt = this.testDb.prepare(`
      INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const maps = [];

    if (Array.isArray(mapsData)) {
      // Handle array of map objects
      for (let i = 0; i < mapsData.length; i++) {
        const mapData = mapsData[i];
        const map = {
          id: mapData.id || uuidv4(),
          name: mapData.name || `Test Map ${i + 1}`,
          version: 1,
          updated_at: new Date().toISOString(),
          data: mapData.data || { nodes: [], connections: [] },
          size_bytes: JSON.stringify(
            mapData.data || { nodes: [], connections: [] },
          ).length,
        };

        stmt.run(
          map.id,
          map.name,
          map.version,
          map.updated_at,
          JSON.stringify(map.data),
          map.size_bytes,
        );
        maps.push(map);
      }
    } else {
      // Handle count (backward compatibility)
      const count = mapsData || 5;
      for (let i = 0; i < count; i++) {
        const map = this.generateTestMap(i);
        stmt.run(
          map.id,
          map.name,
          map.version,
          map.updated_at,
          JSON.stringify(map.data),
          map.size_bytes,
        );
        maps.push(map);
      }
    }

    return maps;
  }

  /**
   * Generate a test map object
   * @param {number} index - Index for unique identification
   * @returns {Object} Test map object
   */
  generateTestMap(index) {
    const id = uuidv4();
    const data = {
      nodes: [
        {
          id: `node-${index}-1`,
          position: [100 + index * 10, 50 + index * 10],
          content: `Node ${index}-1`,
        },
        {
          id: `node-${index}-2`,
          position: [200 + index * 10, 150 + index * 10],
          content: `Node ${index}-2`,
        },
      ],
      connections: [
        { from: `node-${index}-1`, to: `node-${index}-2`, type: 'arrow' },
      ],
    };

    const state_json = JSON.stringify(data);

    return {
      id,
      name: `Test Map ${index + 1}`,
      version: 1,
      updated_at: new Date().toISOString(),
      data,
      size_bytes: Buffer.byteLength(state_json, 'utf8'),
    };
  }

  /**
   * Clear all maps from the test database
   */
  async clearAllMaps() {
    this.testDb.prepare('DELETE FROM maps').run();
  }

  /**
   * Get all maps from the test database
   * @returns {Array} Array of map objects
   */
  getAllMaps() {
    const maps = this.testDb.prepare('SELECT * FROM maps ORDER BY name').all();
    // Parse state_json to match the format returned by createTestMaps
    return maps.map((map) => {
      const { state_json, ...mapWithoutStateJson } = map;
      return {
        ...mapWithoutStateJson,
        data: JSON.parse(state_json),
      };
    });
  }

  /**
   * Get the count of maps in the test database
   * @returns {number} Number of maps in database
   */
  getMapCount() {
    const result = this.testDb
      .prepare('SELECT COUNT(*) as count FROM maps')
      .get();
    return result.count;
  }

  /**
   * Create a compressed file for testing
   * @param {string} filePath - Path where to create the compressed file
   * @param {string} content - Content to compress
   */
  async createCompressedFile(filePath, content) {
    const zlib = require('zlib');
    const { promisify } = require('util');
    const gzip = promisify(zlib.gzip);

    const compressed = await gzip(Buffer.from(content, 'utf8'));
    await fs.writeFile(filePath, compressed);
  }

  /**
   * Get maps from a backup file
   * @param {string} backupPath - Path to backup file
   * @returns {Array} Array of map objects from backup
   */
  getMapsFromBackup(backupPath) {
    // Check if file exists first
    try {
      require('fs').accessSync(backupPath);
    } catch {
      return [];
    }

    const backupDb = new Database(backupPath, { readonly: true });
    try {
      const maps = backupDb.prepare('SELECT * FROM maps ORDER BY name').all();
      // Parse state_json to match the format returned by createTestMaps
      return maps.map((map) => {
        const { state_json, ...mapWithoutStateJson } = map;
        return {
          ...mapWithoutStateJson,
          data: JSON.parse(state_json),
        };
      });
    } finally {
      backupDb.close();
    }
  }

  /**
   * Verify backup file integrity
   * @param {string} backupPath - Path to backup file
   * @returns {boolean} True if backup is valid
   */
  verifyBackupIntegrity(backupPath) {
    try {
      // Handle compressed backups
      if (backupPath.endsWith('.gz')) {
        // For compressed files, we need to decompress first
        const zlib = require('zlib');
        const compressedData = require('fs').readFileSync(backupPath);
        const uncompressedData = zlib.gunzipSync(compressedData);

        // Write to a temporary file for verification
        const tempPath = backupPath.replace('.gz', '.temp');
        require('fs').writeFileSync(tempPath, uncompressedData);

        try {
          const backupDb = new Database(tempPath, { readonly: true });
          const result = backupDb.prepare('PRAGMA integrity_check').get();
          backupDb.close();

          // Clean up temp file
          require('fs').unlinkSync(tempPath);

          return result.integrity_check === 'ok';
        } catch {
          // Clean up temp file on error
          try {
            require('fs').unlinkSync(tempPath);
          } catch {
            // Ignore cleanup errors
          }
          return false;
        }
      } else {
        // Handle uncompressed backups
        const backupDb = new Database(backupPath, { readonly: true });
        const result = backupDb.prepare('PRAGMA integrity_check').get();
        backupDb.close();
        return result.integrity_check === 'ok';
      }
    } catch {
      return false;
    }
  }

  /**
   * Get list of backup files in the backup directory
   * @returns {Array} Array of backup filenames
   */
  async getBackupFiles() {
    const files = await fs.readdir(this.backupDir);
    return files.filter((f) => f.includes('mindmeld-backup'));
  }

  /**
   * Get the most recent backup file
   * @returns {string|null} Path to most recent backup or null
   */
  async getLatestBackup() {
    const backupFiles = await this.getBackupFiles();
    if (backupFiles.length === 0) {
      return null;
    }

    // Sort by filename (timestamp-based) to get latest
    backupFiles.sort();
    return path.join(this.backupDir, backupFiles[backupFiles.length - 1]);
  }

  /**
   * Get file size in bytes
   * @param {string} filePath - Path to file
   * @returns {number} File size in bytes
   */
  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
  }

  /**
   * Set file timestamp for testing
   * @param {string} filePath - Path to file
   * @param {Date} timestamp - New timestamp
   */
  async setFileTimestamp(filePath, timestamp) {
    await fs.utimes(filePath, timestamp, timestamp);
  }

  /**
   * Parse backup filename to extract metadata
   * @param {string} filename - Backup filename
   * @returns {Object|null} Parsed metadata or null if invalid
   */
  parseBackupFilename(filename) {
    const match = filename.match(
      /mindmeld-backup-(\\d{4}-\\d{2}-\\d{2}-\\d{6}\\d{3}\\d{3})\\.(sqlite|sqlite\\.gz)$/,
    );
    if (!match) {
      return null;
    }

    return {
      timestamp: match[1],
      compressed: match[2] === 'sqlite.gz',
      fullPath: filename,
    };
  }

  /**
   * Create a map with corrupted JSON data for validation testing
   * @returns {string} ID of the corrupted map
   */
  createCorruptedMap() {
    const stmt = this.testDb.prepare(`
      INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const id = uuidv4();
    const corruptedJson = '{"nodes":[{"id":"corrupt"'; // Intentionally malformed JSON

    stmt.run(
      id,
      'Corrupted Test Map',
      1,
      new Date().toISOString(),
      corruptedJson,
      Buffer.byteLength(corruptedJson, 'utf8'),
    );

    return id;
  }

  /**
   * Create a corrupted database for error testing
   * @returns {string} Path to corrupted database
   */
  async createCorruptedDatabase() {
    const corruptedPath = path.join(this.tempDir, 'corrupted-db.sqlite');

    // Create a valid database first
    const corruptedDb = openDatabase(corruptedPath);
    ensureSchema(corruptedDb);

    // Insert some data
    const stmt = corruptedDb.prepare(`
      INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      'test-id',
      'Test Map',
      1,
      new Date().toISOString(),
      '{"nodes":[],"connections":[]}',
      25,
    );
    corruptedDb.close();

    // Corrupt the file by truncating it
    const originalSize = await this.getFileSize(corruptedPath);
    const handle = await fs.open(corruptedPath, 'r+');
    await handle.truncate(originalSize / 2); // Truncate to half size
    await handle.close();

    return corruptedPath;
  }

  /**
   * Create a large test database for performance testing
   * @param {number} mapCount - Number of maps to create
   */
  async createLargeDatabase(mapCount = 1000) {
    console.log(`Creating large test database with ${mapCount} maps...`);

    const stmt = this.testDb.prepare(`
      INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Use transaction for better performance
    const transaction = this.testDb.transaction(() => {
      for (let i = 0; i < mapCount; i++) {
        const map = this.generateTestMap(i);
        stmt.run(
          map.id,
          map.name,
          map.version,
          map.updated_at,
          JSON.stringify(map.data),
          map.size_bytes,
        );

        if (i % 100 === 0) {
          console.log(`Created ${i + 1} maps...`);
        }
      }
    });

    transaction();
    console.log(`Large test database created with ${mapCount} maps.`);
  }

  /**
   * Simulate disk space shortage by creating a large file
   * @param {string} directory - Directory to fill
   * @param {number} sizeMB - Size in MB to allocate
   */
  async simulateDiskSpaceShortage(directory, sizeMB = 100) {
    const largeFilePath = path.join(directory, 'large-file.tmp');

    // Create a large file to consume disk space
    const buffer = Buffer.alloc(1024 * 1024, 0); // 1MB buffer
    const handle = await fs.open(largeFilePath, 'w');

    for (let i = 0; i < sizeMB; i++) {
      await handle.write(buffer);
    }

    await handle.close();
    return largeFilePath;
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  getDatabaseStats() {
    const fileSize =
      this.testDb.prepare('PRAGMA page_count').get().page_count *
      this.testDb.prepare('PRAGMA page_size').get().page_size;

    const mapCount = this.testDb
      .prepare('SELECT COUNT(*) as count FROM maps')
      .get().count;

    const journalMode = this.testDb
      .prepare('PRAGMA journal_mode')
      .get().journal_mode;

    return {
      fileSize,
      mapCount,
      journalMode,
      path: this.testDbPath,
    };
  }

  /**
   * Create test backup files for restore testing
   */
  async createTestBackups() {
    // Create different test scenarios
    const scenarios = [
      { maps: 3, name: 'small', compress: false },
      { maps: 5, name: 'medium', compress: true },
      { maps: 0, name: 'empty', compress: false },
    ];

    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];

      // Create test data
      this.testDb.prepare('DELETE FROM maps').run(); // Clear first
      if (scenario.maps > 0) {
        this.createTestMaps(scenario.maps);
      }

      // Generate backup filename with unique timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '')
        .replace('T', '-')
        .slice(0, 17);

      const scenarioTime = `${timestamp}${String(i).padStart(2, '0')}`; // Add index for uniqueness
      const extension = scenario.compress ? '.sqlite.gz' : '.sqlite';
      const backupPath = path.join(
        this.backupDir,
        `mindmeld-backup-${scenarioTime}-test-${scenario.name}${extension}`,
      );

      if (scenario.compress) {
        // Create uncompressed backup first
        const uncompressedPath = path.join(
          this.backupDir,
          `temp-${scenarioTime}.sqlite`,
        );

        try {
          // Ensure the testDb connection is open and ready
          if (!this.testDb.open) {
            throw new Error('Test database connection is not open');
          }

          // Create backup using the test database connection
          await this.testDb.backup(uncompressedPath);

          // Compress the file
          const zlib = require('zlib');
          const { promisify } = require('util');
          const gzip = promisify(zlib.gzip);

          const uncompressed = await fs.readFile(uncompressedPath);
          const compressed = await gzip(uncompressed);
          await fs.writeFile(backupPath, compressed);

          // Clean up temporary file
          await fs.unlink(uncompressedPath);
        } catch (error) {
          throw new Error(
            `Failed to create compressed backup: ${error.message}`,
          );
        }
      } else {
        try {
          // Ensure the testDb connection is open and ready
          if (!this.testDb.open) {
            throw new Error('Test database connection is not open');
          }

          // Create direct SQLite backup
          await this.testDb.backup(backupPath);
        } catch (error) {
          throw new Error(`Failed to create backup: ${error.message}`);
        }
      }

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Restore original test data
    this.testDb.prepare('DELETE FROM maps').run();
    this.createTestMaps(2);
  }
}

module.exports = { AdminTestEnvironment };
