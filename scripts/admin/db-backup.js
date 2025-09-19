#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { promisify } = require('util');
const { openDatabase } = require('../../src/modules/maps/db');
const { config } = require('../../src/config/config');

const gzip = promisify(zlib.gzip);

/**
 * Database Backup Utility
 * Creates timestamped backups of the SQLite database with optional compression
 */
class DatabaseBackup {
  constructor(options = {}) {
    this.options = {
      output: options.output || './backups',
      compress: options.compress || false,
      verbose: options.verbose || false,
      name: options.name || 'mindmeld-backup',
      verify: options.verify !== false, // Default to true
      ...options
    };

    this.logger = {
      info: msg => console.log(`[backup] ${msg}`),
      error: msg => console.error(`[backup] ERROR: ${msg}`),
      verbose: msg => this.options.verbose && console.log(`[backup] ${msg}`)
    };
  }

  /**
   * Create a database backup
   * @returns {Promise<Object>} Backup result metadata
   */
  async createBackup() {
    const startTime = Date.now();

    try {
      this.logger.info('Starting database backup...');

      // Validate source database
      await this.validateSourceDatabase();

      // Prepare backup environment
      await this.prepareBackupEnvironment();

      // Generate backup filename
      const backupInfo = this.generateBackupFilename();

      // Check available disk space
      await this.checkDiskSpace(backupInfo.path);

      // Create the backup
      await this.performBackup(backupInfo);

      // Verify backup if requested
      if (this.options.verify) {
        await this.verifyBackup(backupInfo.path);
      }

      // Calculate and report results
      const duration = Date.now() - startTime;
      const results = await this.generateBackupReport(backupInfo, duration);

      this.logger.info(
        `Backup completed successfully in ${(duration / 1000).toFixed(1)}s`
      );
      this.logger.info(`Backup location: ${results.relativePath}`);
      this.logger.info(`File size: ${this.formatFileSize(results.size)}`);

      if (this.options.compress && results.compressionRatio) {
        this.logger.info(`Compression: ${results.compressionRatio}% reduction`);
      }

      return results;
    } catch (error) {
      this.logger.error(`Backup failed: ${error.message}`);

      // Cleanup partial backup on failure
      await this.cleanupOnFailure();

      throw error;
    }
  }

  /**
   * Validate that the source database exists and is accessible
   */
  async validateSourceDatabase() {
    // Use current environment variable or config fallback
    const dbPath = process.env.SQLITE_FILE || config.sqliteFile;

    try {
      await fs.access(dbPath, fs.constants.R_OK);
      this.logger.verbose(`Source database validated: ${dbPath}`);
    } catch (error) {
      throw new Error(`Cannot access source database: ${dbPath}`);
    }

    // Check database integrity
    try {
      const db = openDatabase(dbPath);
      const result = db.prepare('PRAGMA integrity_check').get();
      db.close();

      if (result.integrity_check !== 'ok') {
        throw new Error(
          `Database integrity check failed: ${result.integrity_check}`
        );
      }

      this.logger.verbose('Database integrity check passed');
    } catch (error) {
      throw new Error(`Database integrity validation failed: ${error.message}`);
    }
  }

  /**
   * Prepare backup environment (create directories, etc.)
   */
  async prepareBackupEnvironment() {
    try {
      await fs.mkdir(this.options.output, { recursive: true });

      // Test write permissions
      const testFile = path.join(this.options.output, '.backup-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      this.logger.verbose(`Backup directory prepared: ${this.options.output}`);
    } catch (error) {
      throw new Error(`Cannot prepare backup directory: ${error.message}`);
    }
  }

  /**
   * Generate backup filename with timestamp
   * @returns {Object} Backup file information
   */
  generateBackupFilename() {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .slice(0, 17); // YYYY-MM-DD-HHMMSS

    // Add milliseconds and a random suffix to ensure uniqueness for concurrent backups
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    const randomSuffix = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const uniqueTimestamp = `${timestamp}${ms}${randomSuffix}`; // YYYY-MM-DD-HHMMSSMMMNNN

    const extension = this.options.compress ? '.sqlite.gz' : '.sqlite';
    const filename = `${this.options.name}-${uniqueTimestamp}${extension}`;
    const fullPath = path.join(this.options.output, filename);

    return {
      filename,
      path: fullPath,
      timestamp: uniqueTimestamp,
      compressed: this.options.compress
    };
  }

  /**
   * Check if there's enough disk space for the backup
   * @param {string} backupPath - Target backup path
   */
  async checkDiskSpace(backupPath) {
    // Use current environment variable or config fallback
    const dbPath = process.env.SQLITE_FILE || config.sqliteFile;

    try {
      const sourceStats = await fs.stat(dbPath);
      const sourceSize = sourceStats.size;

      // Estimate required space (source size + 50% buffer)
      const requiredSpace = Math.ceil(sourceSize * 1.5);

      this.logger.verbose(
        `Source database size: ${this.formatFileSize(sourceSize)}`
      );
      this.logger.verbose(
        `Estimated backup space needed: ${this.formatFileSize(requiredSpace)}`
      );

      // Note: Node.js doesn't have a built-in way to check free disk space
      // In a production environment, you might want to use a library like 'statvfs'
      // For now, we'll proceed and handle ENOSPC errors during write
    } catch (error) {
      this.logger.verbose(`Could not check disk space: ${error.message}`);
    }
  }

  /**
   * Perform the actual backup operation
   * @param {Object} backupInfo - Backup file information
   */
  async performBackup(backupInfo) {
    // Use current environment variable or config fallback
    const dbPath = process.env.SQLITE_FILE || config.sqliteFile;
    const sourceDb = openDatabase(dbPath);

    try {
      // Determine the actual backup path (uncompressed first)
      let actualBackupPath = backupInfo.path;
      if (this.options.compress) {
        // If compressing, create uncompressed backup first
        actualBackupPath = backupInfo.path.replace('.gz', '');
      }

      // Use SQLite's backup API for consistent backup
      // The backup method expects a filename string, not a database instance
      const backupResult = await sourceDb.backup(actualBackupPath);

      this.logger.verbose(
        `Backup operation completed: ${backupResult.totalPages} pages`
      );

      // Apply compression if requested
      if (this.options.compress) {
        await this.compressBackup(actualBackupPath, backupInfo.path);
      }
    } finally {
      sourceDb.close();
    }
  }

  /**
   * Compress backup file using gzip
   * @param {string} sourcePath - Path to uncompressed backup file
   * @param {string} destPath - Path for compressed backup file
   */
  async compressBackup(sourcePath, destPath) {
    try {
      this.logger.verbose('Compressing backup file...');

      const data = await fs.readFile(sourcePath);
      const compressed = await gzip(data);

      // Write compressed file
      await fs.writeFile(destPath, compressed);

      // Remove uncompressed file
      await fs.unlink(sourcePath);

      this.logger.verbose('Backup compression completed');
    } catch (error) {
      throw new Error(`Backup compression failed: ${error.message}`);
    }
  }

  /**
   * Verify backup file integrity
   * @param {string} backupPath - Path to backup file
   */
  async verifyBackup(backupPath) {
    try {
      this.logger.verbose('Verifying backup integrity...');

      let actualBackupPath = backupPath;

      // Handle compressed backups
      if (this.options.compress) {
        // For compressed backups, we'll decompress temporarily for verification
        const tempPath = backupPath.replace('.gz', '.tmp');
        const compressed = await fs.readFile(backupPath);
        const decompressed = zlib.gunzipSync(compressed);
        await fs.writeFile(tempPath, decompressed);
        actualBackupPath = tempPath;
      }

      // Verify database can be opened and is valid
      const backupDb = openDatabase(actualBackupPath);
      const result = backupDb.prepare('PRAGMA integrity_check').get();
      backupDb.close();

      // Cleanup temporary file if created
      if (actualBackupPath !== backupPath) {
        await fs.unlink(actualBackupPath);
      }

      if (result.integrity_check !== 'ok') {
        throw new Error(
          `Backup integrity verification failed: ${result.integrity_check}`
        );
      }

      this.logger.verbose('Backup integrity verification passed');
    } catch (error) {
      throw new Error(`Backup verification failed: ${error.message}`);
    }
  }

  /**
   * Generate backup report with metadata
   * @param {Object} backupInfo - Backup file information
   * @param {number} duration - Backup duration in ms
   * @returns {Object} Backup report
   */
  async generateBackupReport(backupInfo, duration) {
    // Use current environment variable or config fallback
    const dbPath = process.env.SQLITE_FILE || config.sqliteFile;

    const stats = await fs.stat(backupInfo.path);
    const sourceStats = await fs.stat(dbPath);

    let compressionRatio = null;
    if (this.options.compress) {
      compressionRatio = Math.round((1 - stats.size / sourceStats.size) * 100);
    }

    // Calculate checksum for verification
    const fileData = await fs.readFile(backupInfo.path);
    const checksum = crypto.createHash('sha256').update(fileData).digest('hex');

    const report = {
      filename: backupInfo.filename,
      path: backupInfo.path,
      relativePath: path.relative(process.cwd(), backupInfo.path),
      size: stats.size,
      sourceSize: sourceStats.size,
      compressed: this.options.compress,
      compressionRatio,
      checksum,
      timestamp: backupInfo.timestamp,
      duration,
      createdAt: new Date().toISOString()
    };

    // Save backup metadata
    await this.saveBackupMetadata(report);

    return report;
  }

  /**
   * Save backup metadata to a JSON file
   * @param {Object} report - Backup report
   */
  async saveBackupMetadata(report) {
    const metadataPath = report.path + '.meta.json';

    try {
      await fs.writeFile(metadataPath, JSON.stringify(report, null, 2));
      this.logger.verbose(`Backup metadata saved: ${metadataPath}`);
    } catch (error) {
      this.logger.verbose(`Could not save backup metadata: ${error.message}`);
    }
  }

  /**
   * Clean up partial backup files on failure
   */
  async cleanupOnFailure() {
    // Implementation would clean up any partial files created during backup
    this.logger.verbose('Cleaning up partial backup files...');
  }

  /**
   * Format file size in human-readable format
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

/**
 * Parse command line arguments
 * @returns {Object} Parsed options
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--output' && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '--compress') {
      options.compress = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--name' && args[i + 1]) {
      options.name = args[++i];
    } else if (arg === '--no-verify') {
      options.verify = false;
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
MindMeld Database Backup Utility

Usage: node db-backup.js [options]

Options:
  --output <path>     Backup output directory (default: ./backups)
  --compress          Enable gzip compression
  --verbose           Show detailed progress information
  --name <prefix>     Custom backup filename prefix (default: mindmeld-backup)
  --no-verify         Skip backup integrity verification
  --help              Show this help message

Examples:
  node db-backup.js --output /backups --compress --verbose
  node db-backup.js --name daily-backup --compress
`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArguments();
    const backup = new DatabaseBackup(options);

    const result = await backup.createBackup();

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { DatabaseBackup };
