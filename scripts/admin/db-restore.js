#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { openDatabase } = require('../../src/modules/maps/db');
const { config } = require('../../src/config/config');

const gunzip = promisify(zlib.gunzip);

/**
 * Database Restore Utility
 * Restores SQLite database from backup files with safety and verification
 */
class DatabaseRestore {
  constructor(options = {}) {
    this.options = {
      backupDir: options.backupDir || './backups',
      backupFile: options.backupFile || null,
      safetyDir: options.safetyDir || './backups',
      verify: options.verify !== false, // Default to true
      createSafety: options.createSafety !== false, // Default to true
      force: options.force || false,
      verbose: options.verbose || false,
      ...options
    };

    this.logger = {
      info: msg => console.log(`[restore] ${msg}`),
      error: msg => console.error(`[restore] ERROR: ${msg}`),
      verbose: msg => this.options.verbose && console.log(`[restore] ${msg}`)
    };

    this.safetyBackupPath = null;
  }

  /**
   * Restore database from backup
   * @returns {Promise<Object>} Restoration result metadata
   */
  async restoreDatabase() {
    const startTime = Date.now();

    try {
      this.logger.info('Starting database restore...');

      // Select backup file to restore from
      const backupFile = await this.selectBackupFile();
      this.logger.verbose(`Selected backup: ${backupFile.path}`);

      // Validate backup file if requested
      if (this.options.verify) {
        this.logger.verbose('Validating backup file...');
        const isValid = await this.validateBackupFile(backupFile.path);
        if (!isValid) {
          throw new Error(
            'Backup validation failed - file is corrupted or invalid'
          );
        }
        this.logger.verbose('Backup validation passed');
      }

      // Create safety backup of current database
      if (this.options.createSafety) {
        this.logger.verbose('Creating safety backup of current database...');
        this.safetyBackupPath = await this.createSafetyBackup();
        if (this.safetyBackupPath) {
          this.logger.info(
            `Safety backup created: ${path.basename(this.safetyBackupPath)}`
          );
        }
      }

      // Perform the actual restore
      await this.performRestore(backupFile);

      // Calculate and report results
      const duration = Date.now() - startTime;
      const results = {
        success: true,
        backupFile: backupFile.path,
        safetyBackup: this.safetyBackupPath,
        duration,
        restoredAt: new Date().toISOString()
      };

      this.logger.info(
        `Restore completed successfully in ${(duration / 1000).toFixed(1)}s`
      );
      this.logger.info(
        `Database restored from: ${path.basename(backupFile.path)}`
      );

      return results;
    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`);

      // Attempt rollback if we have a safety backup
      if (this.safetyBackupPath) {
        try {
          this.logger.info('Attempting rollback to safety backup...');
          await this.rollbackToSafety();
          this.logger.info('Rollback completed successfully');
        } catch (rollbackError) {
          this.logger.error(`Rollback failed: ${rollbackError.message}`);
        }
      }

      // Cleanup on failure
      await this.cleanupOnFailure();

      throw error;
    }
  }

  /**
   * Discover available backup files
   * @returns {Promise<Array>} Array of backup file info
   */
  async discoverBackups() {
    try {
      await fs.access(this.options.backupDir);
    } catch (error) {
      return [];
    }

    const files = await fs.readdir(this.options.backupDir);
    const backupFiles = [];

    for (const file of files) {
      // Filter for backup files
      if (
        !/mindmeld-backup-\d{4}-\d{2}-\d{2}-\d+.*\.(sqlite|sqlite\.gz)$/.test(
          file
        )
      ) {
        continue;
      }

      const filePath = path.join(this.options.backupDir, file);

      try {
        const stats = await fs.stat(filePath);

        backupFiles.push({
          filename: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
          compressed: file.endsWith('.gz')
        });
      } catch (error) {
        // Skip files that can't be accessed
        continue;
      }
    }

    // Sort by modification time (newest first)
    backupFiles.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    return backupFiles;
  }

  /**
   * Select backup file to restore from
   * @returns {Promise<Object>} Selected backup file info
   */
  async selectBackupFile() {
    if (this.options.backupFile) {
      // Use specific backup file provided
      try {
        const stats = await fs.stat(this.options.backupFile);
        return {
          filename: path.basename(this.options.backupFile),
          path: this.options.backupFile,
          size: stats.size,
          modified: stats.mtime,
          compressed: this.options.backupFile.endsWith('.gz')
        };
      } catch (error) {
        throw new Error(`Backup file not found: ${this.options.backupFile}`);
      }
    }

    // Auto-select newest backup
    const backups = await this.discoverBackups();

    if (backups.length === 0) {
      throw new Error(`No backup files found in ${this.options.backupDir}`);
    }

    return backups[0]; // First = newest
  }

  /**
   * Validate backup file integrity
   * @param {string} backupPath - Path to backup file
   * @returns {Promise<boolean>} Whether backup is valid
   */
  async validateBackupFile(backupPath) {
    try {
      await fs.access(backupPath);
    } catch (error) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    try {
      let actualBackupPath = backupPath;

      // Handle compressed backups
      if (backupPath.endsWith('.gz')) {
        // For validation, decompress to a temporary file
        const tempPath = backupPath.replace('.gz', '.tmp');
        const compressed = await fs.readFile(backupPath);
        const decompressed = await gunzip(compressed);
        await fs.writeFile(tempPath, decompressed);
        actualBackupPath = tempPath;
      }

      // Verify it's a valid SQLite database
      const backupDb = openDatabase(actualBackupPath);
      const result = backupDb.prepare('PRAGMA integrity_check').get();
      backupDb.close();

      // Cleanup temporary file if created
      if (actualBackupPath !== backupPath) {
        await fs.unlink(actualBackupPath);
      }

      return result.integrity_check === 'ok';
    } catch (error) {
      // Cleanup temporary file if it exists
      if (backupPath.endsWith('.gz')) {
        const tempPath = backupPath.replace('.gz', '.tmp');
        try {
          await fs.unlink(tempPath);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
      }

      return false;
    }
  }

  /**
   * Create safety backup of current database
   * @returns {Promise<string|null>} Path to safety backup or null if disabled
   */
  async createSafetyBackup() {
    if (!this.options.createSafety) {
      return null;
    }

    // Use current environment variable or config fallback
    const currentDbPath = process.env.SQLITE_FILE || config.sqliteFile;

    try {
      // Check if current database exists
      await fs.access(currentDbPath);
      this.logger.verbose(`Source database exists: ${currentDbPath}`);
    } catch (error) {
      this.logger.verbose('No current database to backup');
      return null;
    }

    // Create safety backup directory
    await fs.mkdir(this.options.safetyDir, { recursive: true });

    // Generate safety backup filename
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .slice(0, 17); // YYYY-MM-DD-HHMMSS

    const safetyPath = path.join(
      this.options.safetyDir,
      `safety-backup-${timestamp}.sqlite`
    );

    try {
      // Ensure target directory exists
      await fs.mkdir(path.dirname(safetyPath), { recursive: true });

      // Create safety backup using SQLite backup API
      this.logger.verbose(`Opening source database: ${currentDbPath}`);
      const sourceDb = openDatabase(currentDbPath);

      try {
        this.logger.verbose(`Creating backup to: ${safetyPath}`);
        await sourceDb.backup(safetyPath);
        this.logger.verbose(`Safety backup created: ${safetyPath}`);
        return safetyPath;
      } finally {
        sourceDb.close();
        this.logger.verbose('Source database closed');
      }
    } catch (error) {
      this.logger.error(`Error creating safety backup: ${error.message}`);
      throw error;
    }
  }

  /**
   * Perform the actual restore operation
   * @param {Object} backupFile - Backup file information
   */
  async performRestore(backupFile) {
    let actualBackupPath = backupFile.path;
    let tempPath = null;

    try {
      // Handle compressed backups
      if (backupFile.compressed) {
        this.logger.verbose('Decompressing backup file...');
        tempPath = backupFile.path.replace('.gz', '.restore-temp');

        const compressed = await fs.readFile(backupFile.path);
        const decompressed = await gunzip(compressed);
        await fs.writeFile(tempPath, decompressed);

        actualBackupPath = tempPath;
        this.logger.verbose('Backup decompressed successfully');
      }

      // Perform restore using SQLite backup API
      this.logger.verbose('Restoring database...');

      // Use current environment variable or config fallback
      const currentDbPath = process.env.SQLITE_FILE || config.sqliteFile;

      // Ensure target directory exists
      await fs.mkdir(path.dirname(currentDbPath), { recursive: true });

      // Use better-sqlite3 backup API correctly
      // The backup method is called on source database with destination path/database
      const backupDb = openDatabase(actualBackupPath);

      try {
        // Backup FROM the backup file TO the target file path
        await backupDb.backup(currentDbPath);
        this.logger.verbose('Database restore completed');
      } finally {
        backupDb.close();
      }
    } finally {
      // Cleanup temporary decompressed file
      if (tempPath) {
        try {
          await fs.unlink(tempPath);
          this.logger.verbose('Cleaned up temporary files');
        } catch (error) {
          this.logger.verbose(
            `Could not clean up temporary file: ${error.message}`
          );
        }
      }
    }
  }

  /**
   * Rollback to safety backup on restore failure
   */
  async rollbackToSafety() {
    if (!this.safetyBackupPath) {
      throw new Error('No safety backup available for rollback');
    }

    const safetyDb = openDatabase(this.safetyBackupPath);

    // Use current environment variable or config fallback
    const currentDbPath = process.env.SQLITE_FILE || config.sqliteFile;

    try {
      await safetyDb.backup(currentDbPath);
    } finally {
      safetyDb.close();
    }
  }

  /**
   * Clean up on restore failure
   */
  async cleanupOnFailure() {
    // Implementation would clean up any temporary files created during restore
    this.logger.verbose('Cleaning up after restore failure...');
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

    if (arg === '--backup' && args[i + 1]) {
      options.backupFile = args[++i];
    } else if (arg === '--backup-dir' && args[i + 1]) {
      options.backupDir = args[++i];
    } else if (arg === '--no-safety') {
      options.createSafety = false;
    } else if (arg === '--no-verify') {
      options.verify = false;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
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
MindMeld Database Restore Utility

Usage: node db-restore.js [options]

Options:
  --backup <path>        Specific backup file to restore from
  --backup-dir <path>    Directory to search for backups (default: ./backups)
  --no-safety            Skip creating safety backup of current database
  --no-verify            Skip backup file validation before restore
  --force                Skip confirmation prompts
  --verbose              Show detailed progress information
  --help                 Show this help message

Examples:
  node db-restore.js --backup ./backups/mindmeld-backup-2025-01-10-120000.sqlite
  node db-restore.js --no-safety --verbose
  node db-restore.js --backup-dir /path/to/backups --force
`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArguments();
    const restore = new DatabaseRestore(options);

    const result = await restore.restoreDatabase();

    // Exit with success
    process.exit(0);
  } catch (error) {
    console.error(`Restore failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { DatabaseRestore, parseArguments };
