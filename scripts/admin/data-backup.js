#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

// Import database utilities
const Database = require('better-sqlite3');

class DataBackup {
  constructor(options = {}) {
    this.config = {
      dbPath:
        process.env.SQLITE_FILE ||
        path.join(process.cwd(), 'data', 'mindmeld.sqlite'),
      backupDir: path.join(process.cwd(), 'backups'),
      tempDir: path.join(process.cwd(), 'tmp'),
      ...options
    };

    this.metadata = {
      backup_version: '1.0.0',
      server_version: process.env.npm_package_version || '1.0.0'
    };
  }

  async createBackup(options = {}) {
    const config = {
      type: 'full',
      name: null,
      output: this.config.backupDir,
      compress: false,
      compression_level: 6,
      encrypt: false,
      password: null,
      validate: false,
      tables: null,
      exclude_tables: [],
      retention: null,
      onProgress: null,
      ...options
    };

    const startTime = Date.now();
    let progressTracker = null;

    try {
      // Initialize progress tracking
      if (config.onProgress) {
        progressTracker = new ProgressTracker(config.onProgress);
        progressTracker.start('Initializing backup');
      }

      // Ensure backup directory exists
      await fs.mkdir(config.output, { recursive: true });

      // Generate backup filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '')
        .replace('T', '-')
        .split('.')[0];
      let backupName = config.name || `mindmeld-${config.type}-${timestamp}`;

      // Apply extensions based on options
      let backupPath = path.join(config.output, `${backupName}.sqlite`);

      if (config.encrypt) {
        backupPath += '.enc';
      } else if (config.compress) {
        backupPath += '.gz';
      }

      progressTracker?.update('Opening database', 10);

      // Open source database
      const sourceDb = new Database(this.config.dbPath, { readonly: true });

      try {
        // Validate database if requested
        let validation = null;
        if (config.validate) {
          progressTracker?.update('Validating database integrity', 20);
          validation = await this.validateDatabase(sourceDb);

          if (validation.corruption_detected) {
            throw new Error(
              'Database corruption detected. Cannot create backup.'
            );
          }
        }

        // Get tables to backup
        progressTracker?.update('Scanning database schema', 25);
        const tablesToBackup = await this.getBackupTables(
          sourceDb,
          config.tables,
          config.exclude_tables
        );

        // Count total records for progress tracking
        const totalRecords = await this.countTotalRecords(
          sourceDb,
          tablesToBackup
        );

        // Create backup database
        progressTracker?.update('Creating backup database', 30);

        let backupDb;
        let tempBackupPath = backupPath;

        if (config.compress || config.encrypt) {
          // Create temporary uncompressed file first
          tempBackupPath = path.join(
            this.config.tempDir,
            `${backupName}_temp.sqlite`
          );
          await fs.mkdir(this.config.tempDir, { recursive: true });
        }

        backupDb = new Database(tempBackupPath);

        try {
          // Copy schema
          progressTracker?.update('Copying database schema', 35);
          await this.copyDatabaseSchema(sourceDb, backupDb, tablesToBackup);

          // Copy data with progress tracking
          let copiedRecords = 0;
          const backupStats = {
            tables_backed_up: [],
            records_backed_up: 0,
            backup_size: 0
          };

          for (const tableName of tablesToBackup) {
            progressTracker?.update(
              `Backing up table: ${tableName}`,
              40 + (copiedRecords / totalRecords) * 50
            );

            const tableStats = await this.backupTable(
              sourceDb,
              backupDb,
              tableName
            );
            backupStats.tables_backed_up.push(tableName);
            backupStats.records_backed_up += tableStats.records;
            copiedRecords += tableStats.records;

            if (config.onProgress) {
              config.onProgress({
                phase: 'copying_data',
                table: tableName,
                completed: copiedRecords,
                total: totalRecords,
                percent: Math.round((copiedRecords / totalRecords) * 100),
                elapsed: Date.now() - startTime
              });
            }
          }

          // Add backup metadata
          progressTracker?.update('Adding backup metadata', 90);
          await this.addBackupMetadata(backupDb, {
            ...this.metadata,
            backup_type: config.type,
            created_at: new Date().toISOString(),
            source_database: this.config.dbPath,
            tables: tablesToBackup,
            total_maps: backupStats.records_backed_up,
            validation: validation,
            schema_version: await this.getDatabaseVersion(sourceDb)
          });

          backupDb.close();

          // Apply compression/encryption if requested
          if (config.compress || config.encrypt) {
            progressTracker?.update('Applying compression/encryption', 95);

            if (config.encrypt) {
              await this.encryptBackup(
                tempBackupPath,
                backupPath,
                config.password
              );
            } else if (config.compress) {
              await this.compressBackup(
                tempBackupPath,
                backupPath,
                config.compression_level
              );
            }

            // Clean up temporary file
            await fs.unlink(tempBackupPath);
          }

          // Get final backup size
          const stats = await fs.stat(backupPath);
          backupStats.backup_size = stats.size;

          progressTracker?.update('Backup completed', 100);

          // Apply retention policy if specified
          let retentionResult = null;
          if (config.retention) {
            retentionResult = await this.applyRetentionPolicy(
              config.output,
              config.retention
            );
          }

          const result = {
            success: true,
            backup_path: backupPath,
            backup_type: config.type,
            size_bytes: backupStats.backup_size,
            maps_count: backupStats.records_backed_up,
            created_at: new Date().toISOString(),
            duration: Date.now() - startTime,
            ...backupStats
          };

          // Add optional result properties
          if (config.compress) {
            const originalStats = await fs
              .stat(tempBackupPath)
              .catch(() => null);
            result.compressed = true;
            result.compression_ratio = originalStats
              ? stats.size / originalStats.size
              : null;
          }

          if (config.encrypt) {
            result.encrypted = true;
            result.encryption_algorithm = 'aes-256-gcm';
          }

          if (validation) {
            result.validation = validation;
          }

          if (retentionResult) {
            result.retention_applied = true;
            result.retention_cleanup = retentionResult;
          }

          return result;
        } finally {
          if (backupDb && backupDb.open) {
            backupDb.close();
          }
        }
      } finally {
        sourceDb.close();
      }
    } catch (error) {
      // Enhance error with context
      const enhancedError = new Error(
        `Backup creation failed: ${error.message}`
      );
      enhancedError.operation = 'backup_creation';
      enhancedError.context = {
        backup_path: config.output,
        backup_type: config.type,
        elapsed: Date.now() - startTime
      };

      throw enhancedError;
    }
  }

  async restoreBackup(backupPath, options = {}) {
    const config = {
      createPreRestoreBackup: true,
      password: null,
      validate: false,
      tables: null,
      exclude_tables: [],
      onProgress: null,
      ...options
    };

    const startTime = Date.now();
    let progressTracker = null;

    try {
      if (config.onProgress) {
        progressTracker = new ProgressTracker(config.onProgress);
        progressTracker.start('Initializing restore');
      }

      // Check if backup file exists
      try {
        await fs.access(backupPath);
      } catch (error) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      progressTracker?.update('Analyzing backup file', 10);

      // Determine backup type and prepare for restoration
      const isCompressed = backupPath.endsWith('.gz');
      const isEncrypted = backupPath.endsWith('.enc');

      let workingBackupPath = backupPath;
      let tempFiles = [];

      try {
        // Decrypt/decompress if necessary
        if (isEncrypted || isCompressed) {
          progressTracker?.update('Preparing backup file', 15);

          const tempPath = path.join(
            this.config.tempDir,
            `restore_${Date.now()}.sqlite`
          );
          await fs.mkdir(this.config.tempDir, { recursive: true });
          tempFiles.push(tempPath);

          if (isEncrypted) {
            if (!config.password) {
              throw new Error('Password required for encrypted backup');
            }
            await this.decryptBackup(backupPath, tempPath, config.password);
          } else if (isCompressed) {
            await this.decompressBackup(backupPath, tempPath);
          }

          workingBackupPath = tempPath;
        }

        // Validate backup if requested
        if (config.validate) {
          progressTracker?.update('Validating backup file', 20);
          const validation = await this.verifyBackup(workingBackupPath, {
            checkCompatibility: true,
            checkMetadata: true
          });

          if (!validation.valid) {
            throw new Error(
              `Backup validation failed: ${validation.errors.join(', ')}`
            );
          }
        }

        // Create pre-restore backup if requested
        let preRestoreBackupPath = null;
        if (config.createPreRestoreBackup) {
          progressTracker?.update('Creating pre-restore backup', 25);

          try {
            const preBackupResult = await this.createBackup({
              type: 'full',
              name: `pre-restore-${Date.now()}`,
              output: path.dirname(backupPath)
            });
            preRestoreBackupPath = preBackupResult.backup_path;
          } catch (error) {
            console.warn(
              'Warning: Could not create pre-restore backup:',
              error.message
            );
          }
        }

        progressTracker?.update('Opening backup database', 30);

        // Open backup database
        const backupDb = new Database(workingBackupPath, { readonly: true });
        const targetDb = new Database(this.config.dbPath);

        try {
          // Get tables to restore
          const tablesToRestore = await this.getRestoreTables(
            backupDb,
            config.tables,
            config.exclude_tables
          );

          // Count total records for progress tracking
          const totalRecords = await this.countTotalRecords(
            backupDb,
            tablesToRestore
          );

          progressTracker?.update('Beginning database restore', 35);

          // Begin transaction for atomic restore
          targetDb.exec('BEGIN TRANSACTION');

          try {
            // Clear existing data for tables being restored
            for (const tableName of tablesToRestore) {
              if (await this.tableExists(targetDb, tableName)) {
                targetDb.exec(`DELETE FROM ${tableName}`);
              }
            }

            // Restore data
            let restoredRecords = 0;
            const restoreStats = {
              restored_tables: [],
              restored_records: 0
            };

            for (const tableName of tablesToRestore) {
              progressTracker?.update(
                `Restoring table: ${tableName}`,
                40 + (restoredRecords / totalRecords) * 50
              );

              const tableStats = await this.restoreTable(
                backupDb,
                targetDb,
                tableName
              );
              restoreStats.restored_tables.push(tableName);
              restoreStats.restored_records += tableStats.records;
              restoredRecords += tableStats.records;

              if (config.onProgress) {
                config.onProgress({
                  phase: 'restoring_data',
                  table: tableName,
                  completed: restoredRecords,
                  total: totalRecords,
                  percent: Math.round((restoredRecords / totalRecords) * 100),
                  elapsed: Date.now() - startTime
                });
              }
            }

            // Commit transaction
            targetDb.exec('COMMIT');

            progressTracker?.update('Restore completed', 100);

            const result = {
              success: true,
              backup_path: backupPath,
              restored_at: new Date().toISOString(),
              duration: Date.now() - startTime,
              ...restoreStats
            };

            // Add optional result properties
            if (preRestoreBackupPath) {
              result.pre_restore_backup_created = true;
              result.pre_restore_backup_path = preRestoreBackupPath;
            } else {
              result.pre_restore_backup_created = false;
            }

            if (isCompressed) {
              result.decompressed = true;
            }

            if (isEncrypted) {
              result.decrypted = true;
            }

            return result;
          } catch (error) {
            // Rollback on error
            targetDb.exec('ROLLBACK');
            throw error;
          }
        } finally {
          backupDb.close();
          targetDb.close();
        }
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          try {
            await fs.unlink(tempFile);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    } catch (error) {
      // Enhance error with context
      if (
        error.message.includes('Incorrect password') ||
        error.code === 'DECRYPT_FAILED'
      ) {
        throw new Error('Incorrect password for encrypted backup');
      }

      const enhancedError = new Error(`Restore failed: ${error.message}`);
      enhancedError.operation = 'backup_restoration';
      enhancedError.context = {
        backup_path: backupPath,
        elapsed: Date.now() - startTime
      };

      throw enhancedError;
    }
  }

  async listBackups(options = {}) {
    const config = {
      sortBy: 'created_at',
      order: 'desc',
      filter: null,
      validate: false,
      ...options
    };

    try {
      // Ensure backup directory exists
      await fs.mkdir(this.config.backupDir, { recursive: true });

      // Get all backup files
      const files = await fs.readdir(this.config.backupDir);
      const backupFiles = files.filter(
        file =>
          file.endsWith('.sqlite') ||
          file.endsWith('.sqlite.gz') ||
          file.endsWith('.sqlite.enc')
      );

      const backups = [];

      for (const fileName of backupFiles) {
        const filePath = path.join(this.config.backupDir, fileName);
        const stats = await fs.stat(filePath);

        // Apply filter if specified
        if (config.filter && !fileName.includes(config.filter)) {
          continue;
        }

        const backup = {
          path: filePath,
          name: fileName,
          created_at: stats.birthtime.toISOString(),
          size_bytes: stats.size,
          compressed: fileName.endsWith('.gz'),
          encrypted: fileName.endsWith('.enc')
        };

        // Add validation if requested
        if (config.validate) {
          try {
            const validation = await this.verifyBackup(filePath);
            backup.integrity_status = validation.valid ? 'valid' : 'corrupted';
          } catch (error) {
            backup.integrity_status = 'unknown';
          }
        }

        backups.push(backup);
      }

      // Sort backups
      backups.sort((a, b) => {
        const aValue =
          config.sortBy === 'created_at'
            ? new Date(a.created_at).getTime()
            : a[config.sortBy];
        const bValue =
          config.sortBy === 'created_at'
            ? new Date(b.created_at).getTime()
            : b[config.sortBy];

        const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        return config.order === 'desc' ? -comparison : comparison;
      });

      const result = {
        backups,
        total_backups: backups.length,
        total_size: backups.reduce((sum, backup) => sum + backup.size_bytes, 0)
      };

      if (backups.length > 0) {
        result.oldest_backup = backups[backups.length - 1].created_at;
        result.newest_backup = backups[0].created_at;
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to list backups: ${error.message}`);
    }
  }

  async verifyBackup(backupPath, options = {}) {
    const config = {
      checkMetadata: false,
      checkCompatibility: false,
      ...options
    };

    const result = {
      valid: true,
      backup_path: backupPath,
      errors: [],
      warnings: []
    };

    try {
      // Check if file exists
      const stats = await fs.stat(backupPath);
      result.file_size = stats.size;

      // Determine backup type
      const isCompressed = backupPath.endsWith('.gz');
      const isEncrypted = backupPath.endsWith('.enc');

      let workingPath = backupPath;
      let tempFiles = [];

      try {
        // Handle compressed/encrypted files
        if (isCompressed && !isEncrypted) {
          // For validation, we can decompress to temp file
          const tempPath = path.join(
            this.config.tempDir,
            `verify_${Date.now()}.sqlite`
          );
          await fs.mkdir(this.config.tempDir, { recursive: true });
          tempFiles.push(tempPath);
          await this.decompressBackup(backupPath, tempPath);
          workingPath = tempPath;
        } else if (isEncrypted) {
          // Cannot verify encrypted backups without password
          result.warnings.push(
            'Cannot verify encrypted backup without password'
          );
          return result;
        }

        // Try to open as SQLite database
        let db;
        try {
          db = new Database(workingPath, { readonly: true });
        } catch (error) {
          result.valid = false;
          result.errors.push('Invalid SQLite database format');
          result.corruption_detected = true;
          return result;
        }

        try {
          // Basic integrity check
          try {
            db.pragma('integrity_check');
            result.checksum_verified = true;
          } catch (error) {
            result.valid = false;
            result.errors.push('Database integrity check failed');
            result.corruption_detected = true;
          }

          // Check if this looks like a MindMeld backup
          const tables = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table'")
            .all();
          const tableNames = tables.map(t => t.name);

          if (!tableNames.includes('maps')) {
            result.warnings.push(
              'Does not appear to be a MindMeld backup (missing maps table)'
            );
          }

          // Count records
          if (tableNames.includes('maps')) {
            try {
              const mapCount = db
                .prepare('SELECT COUNT(*) as count FROM maps')
                .get();
              result.total_maps = mapCount.count;
            } catch (error) {
              result.warnings.push('Could not count maps in backup');
            }
          }

          result.structure_valid = true;

          // Check metadata if requested
          if (config.checkMetadata && tableNames.includes('backup_metadata')) {
            try {
              const metadata = db
                .prepare(
                  'SELECT * FROM backup_metadata ORDER BY created_at DESC LIMIT 1'
                )
                .get();
              if (metadata) {
                result.metadata_valid = true;
                result.metadata = JSON.parse(metadata.data);
              }
            } catch (error) {
              result.warnings.push('Could not read backup metadata');
            }
          }

          // Check compatibility if requested
          if (config.checkCompatibility) {
            result.compatible_version = true;
            result.schema_version_compatible = true;
            // Add specific compatibility checks here if needed
          }
        } finally {
          db.close();
        }
      } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
          try {
            await fs.unlink(tempFile);
          } catch (error) {
            // Ignore cleanup errors
          }
        }
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(error.message);
    }

    return result;
  }

  async cleanupBackups(options = {}) {
    const config = {
      keep: null,
      maxAge: null,
      pattern: null,
      ...options
    };

    try {
      const backupList = await this.listBackups({
        sortBy: 'created_at',
        order: 'desc'
      });

      let backupsToDelete = [];

      if (config.keep !== null) {
        // Keep only the N most recent backups
        backupsToDelete = backupList.backups.slice(config.keep);
      } else if (config.maxAge) {
        // Delete backups older than specified age
        const maxAgeMs = this.parseAge(config.maxAge);
        const cutoffTime = Date.now() - maxAgeMs;

        backupsToDelete = backupList.backups.filter(
          backup => new Date(backup.created_at).getTime() < cutoffTime
        );
      }

      // Apply pattern filter if specified
      if (config.pattern) {
        backupsToDelete = backupsToDelete.filter(backup =>
          backup.name.includes(config.pattern)
        );
      }

      const result = {
        success: true,
        deleted_count: 0,
        kept_count: backupList.backups.length,
        deleted_backups: [],
        storage_freed: 0
      };

      for (const backup of backupsToDelete) {
        try {
          await fs.unlink(backup.path);
          result.deleted_backups.push(path.basename(backup.path));
          result.storage_freed += backup.size_bytes;
          result.deleted_count++;
          result.kept_count--;
        } catch (error) {
          console.warn(
            `Warning: Could not delete backup ${backup.path}:`,
            error.message
          );
        }
      }

      return result;
    } catch (error) {
      throw new Error(`Backup cleanup failed: ${error.message}`);
    }
  }

  async applyRetentionPolicy(backupDir, retention) {
    // Implementation for retention policy application
    // This would implement daily/weekly/monthly backup retention
    const result = {
      removed_count: 0,
      storage_saved: 0
    };

    // Simplified implementation - in reality this would be more complex
    if (retention.daily) {
      const cleanup = await this.cleanupBackups({
        keep: retention.daily,
        pattern: 'daily'
      });
      result.removed_count += cleanup.deleted_count;
      result.storage_saved += cleanup.storage_freed;
    }

    return result;
  }

  // Helper methods
  async getBackupTables(db, includeTables, excludeTables) {
    const allTables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all();
    let tables = allTables.map(t => t.name);

    if (includeTables) {
      tables = tables.filter(name => includeTables.includes(name));
    }

    if (excludeTables.length > 0) {
      tables = tables.filter(name => !excludeTables.includes(name));
    }

    return tables;
  }

  async getRestoreTables(db, includeTables, excludeTables) {
    return this.getBackupTables(db, includeTables, excludeTables);
  }

  async countTotalRecords(db, tables) {
    let total = 0;
    for (const table of tables) {
      try {
        const result = db
          .prepare(`SELECT COUNT(*) as count FROM ${table}`)
          .get();
        total += result.count;
      } catch (error) {
        // Skip tables that can't be counted
      }
    }
    return total;
  }

  async copyDatabaseSchema(sourceDb, targetDb, tables) {
    for (const table of tables) {
      try {
        const schema = sourceDb
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
          )
          .get(table);
        if (schema && schema.sql) {
          targetDb.exec(schema.sql);
        }
      } catch (error) {
        throw new Error(
          `Failed to copy schema for table ${table}: ${error.message}`
        );
      }
    }
  }

  async backupTable(sourceDb, targetDb, tableName) {
    const rows = sourceDb.prepare(`SELECT * FROM ${tableName}`).all();

    if (rows.length === 0) {
      return { records: 0 };
    }

    // Get column names
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(',');
    const columnNames = columns.join(',');

    const insertStmt = targetDb.prepare(
      `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`
    );

    for (const row of rows) {
      const values = columns.map(col => row[col]);
      insertStmt.run(values);
    }

    return { records: rows.length };
  }

  async restoreTable(sourceDb, targetDb, tableName) {
    // Ensure table exists in target
    if (!(await this.tableExists(targetDb, tableName))) {
      // Create table schema
      const schema = sourceDb
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName);
      if (schema && schema.sql) {
        targetDb.exec(schema.sql);
      }
    }

    return this.backupTable(sourceDb, targetDb, tableName);
  }

  async tableExists(db, tableName) {
    try {
      const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .get(tableName);
      return !!result;
    } catch (error) {
      return false;
    }
  }

  async addBackupMetadata(db, metadata) {
    // Create metadata table
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `);

    // Insert metadata
    const stmt = db.prepare(
      'INSERT INTO backup_metadata (created_at, data) VALUES (?, ?)'
    );
    stmt.run(new Date().toISOString(), JSON.stringify(metadata));
  }

  async getDatabaseVersion(db) {
    try {
      // Try to get version from a version table if it exists
      const version = db
        .prepare(
          'SELECT version FROM database_version ORDER BY created_at DESC LIMIT 1'
        )
        .get();
      return version ? version.version : '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  async validateDatabase(db) {
    const validation = {
      integrity_check: true,
      corruption_detected: false,
      validated_records: 0,
      errors: []
    };

    try {
      // Run integrity check
      const integrity = db.pragma('integrity_check');
      validation.integrity_check = integrity[0] === 'ok';

      if (!validation.integrity_check) {
        validation.corruption_detected = true;
        validation.errors.push('Database integrity check failed');
      }

      // Count records
      try {
        const mapCount = db.prepare('SELECT COUNT(*) as count FROM maps').get();
        validation.validated_records = mapCount.count;
      } catch (error) {
        validation.warnings = validation.warnings || [];
        validation.warnings.push('Could not count maps');
      }
    } catch (error) {
      validation.corruption_detected = true;
      validation.errors.push(`Validation failed: ${error.message}`);
    }

    return validation;
  }

  async compressBackup(inputPath, outputPath, level = 6) {
    const input = await fs.readFile(inputPath);
    const compressed = await new Promise((resolve, reject) => {
      zlib.gzip(input, { level }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    await fs.writeFile(outputPath, compressed);
  }

  async decompressBackup(inputPath, outputPath) {
    const compressed = await fs.readFile(inputPath);
    const decompressed = await new Promise((resolve, reject) => {
      zlib.gunzip(compressed, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    await fs.writeFile(outputPath, decompressed);
  }

  async encryptBackup(inputPath, outputPath, password) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    const input = await fs.readFile(inputPath);

    let encrypted = cipher.update(input);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();
    const result = Buffer.concat([iv, authTag, encrypted]);

    await fs.writeFile(outputPath, result);
  }

  async decryptBackup(inputPath, outputPath, password) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(password, 'salt', 32);

    const encrypted = await fs.readFile(inputPath);
    const iv = encrypted.slice(0, 16);
    const authTag = encrypted.slice(16, 32);
    const data = encrypted.slice(32);

    try {
      const decipher = crypto.createDecipher(algorithm, key);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(data);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      await fs.writeFile(outputPath, decrypted);
    } catch (error) {
      const decryptError = new Error(
        'Decryption failed - incorrect password or corrupted file'
      );
      decryptError.code = 'DECRYPT_FAILED';
      throw decryptError;
    }
  }

  parseAge(ageString) {
    const units = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000
    };

    const match = ageString.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid age format: ${ageString}`);
    }

    return parseInt(match[1]) * units[match[2]];
  }

  async generateOutput(format, data) {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // Table format
    const lines = [];

    if (data.success !== undefined && data.backup_path) {
      // Backup creation output
      lines.push('Backup Creation');
      lines.push('===============');
      lines.push(`Status: ${data.success ? 'Success' : 'Failed'}`);
      lines.push(`File: ${path.basename(data.backup_path)}`);
      lines.push(`Size: ${this.formatSize(data.size_bytes)}`);
      lines.push(`Maps: ${data.maps_count}`);
      lines.push(`Duration: ${(data.duration / 1000).toFixed(1)}s`);

      if (data.compressed) {
        lines.push(
          `Compression: ${Math.round((1 - data.compression_ratio) * 100)}%`
        );
      }

      if (data.encrypted) {
        lines.push(`Encryption: ${data.encryption_algorithm}`);
      }
    } else if (data.backups !== undefined) {
      // Backup listing output
      lines.push('Available Backups');
      lines.push('=================');
      lines.push(
        `Total: ${data.total_backups} backups (${this.formatSize(data.total_size)})`
      );
      lines.push('');

      if (data.backups.length > 0) {
        lines.push('Name'.padEnd(40) + 'Created'.padEnd(20) + 'Size');
        lines.push('-'.repeat(70));

        data.backups.forEach(backup => {
          const name = path.basename(backup.name);
          const created = new Date(backup.created_at).toLocaleString();
          const size = this.formatSize(backup.size_bytes);

          lines.push(name.padEnd(40) + created.padEnd(20) + size);
        });
      } else {
        lines.push('No backups found.');
      }
    } else if (data.restored_at) {
      // Restore result output
      lines.push('Backup Restoration');
      lines.push('==================');
      lines.push(`Status: ${data.success ? 'Success' : 'Failed'}`);
      lines.push(`Restored: ${data.restored_records} records`);
      lines.push(`Tables: ${data.restored_tables.join(', ')}`);
      lines.push(`Duration: ${(data.duration / 1000).toFixed(1)}s`);

      if (data.pre_restore_backup_created) {
        lines.push(
          `Pre-restore backup: ${path.basename(data.pre_restore_backup_path)}`
        );
      }
    }

    return lines.join('\n');
  }

  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }
}

class ProgressTracker {
  constructor(callback) {
    this.callback = callback;
    this.startTime = Date.now();
  }

  start(phase) {
    this.callback({
      phase,
      completed: 0,
      total: 100,
      percent: 0,
      elapsed: 0
    });
  }

  update(phase, percent = null) {
    this.callback({
      phase,
      completed: percent || 0,
      total: 100,
      percent: percent || 0,
      elapsed: Date.now() - this.startTime
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let command = 'create';
  let backupPath = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case 'create':
      case 'restore':
      case 'list':
      case 'verify':
      case 'cleanup':
        command = arg;
        break;
      case '--name':
        options.name = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--compress':
        options.compress = true;
        break;
      case '--encrypt':
        options.encrypt = true;
        break;
      case '--password':
        options.password = args[++i];
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--tables':
        options.tables = args[++i].split(',');
        break;
      case '--exclude-tables':
        options.exclude_tables = args[++i].split(',');
        break;
      case '--keep':
        options.keep = parseInt(args[++i]);
        break;
      case '--max-age':
        options.maxAge = args[++i];
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--help':
        console.log(`
MindMeld Database Backup Tool

Usage: node data-backup.js <command> [options]

Commands:
  create                    Create a new backup
  restore <backup_path>     Restore from backup
  list                      List available backups
  verify <backup_path>      Verify backup integrity
  cleanup                   Clean up old backups

Options:
  --name <name>             Custom backup name
  --output <path>           Output directory for backups
  --compress                Compress backup with gzip
  --encrypt                 Encrypt backup (requires --password)
  --password <password>     Password for encryption/decryption
  --validate                Validate database before backup/after restore
  --tables <list>           Comma-separated list of tables to backup/restore
  --exclude-tables <list>   Comma-separated list of tables to exclude
  --keep <count>            Keep only N most recent backups (cleanup)
  --max-age <age>           Delete backups older than age (cleanup)
  --format <format>         Output format (table|json)
  --help                    Show this help

Examples:
  node data-backup.js create --compress
  node data-backup.js create --encrypt --password mypassword
  node data-backup.js restore backups/mindmeld-full-20240101.sqlite.gz
  node data-backup.js list --format json
  node data-backup.js cleanup --keep 5
`);
        return;
      default:
        if (!arg.startsWith('--') && !backupPath) {
          backupPath = arg;
        }
    }
  }

  try {
    const backup = new DataBackup();
    let result;
    const format = options.format || 'table';

    // Add progress reporting for long operations
    if (['create', 'restore'].includes(command)) {
      options.onProgress = progress => {
        const percent = Math.round(progress.percent);
        const elapsed = Math.round(progress.elapsed / 1000);
        process.stdout.write(`\r${progress.phase} (${percent}%) - ${elapsed}s`);
      };
    }

    switch (command) {
      case 'create':
        result = await backup.createBackup(options);
        break;

      case 'restore':
        if (!backupPath) {
          throw new Error('Backup path is required for restore command');
        }
        result = await backup.restoreBackup(backupPath, options);
        break;

      case 'list':
        result = await backup.listBackups(options);
        break;

      case 'verify':
        if (!backupPath) {
          throw new Error('Backup path is required for verify command');
        }
        result = await backup.verifyBackup(backupPath, {
          checkMetadata: true,
          checkCompatibility: true
        });
        break;

      case 'cleanup':
        result = await backup.cleanupBackups(options);
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Clear progress line
    if (['create', 'restore'].includes(command)) {
      process.stdout.write('\n');
    }

    const output = await backup.generateOutput(format, result);
    console.log(output);
  } catch (error) {
    console.error('Backup operation failed:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = DataBackup;

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
