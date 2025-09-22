#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Import database utilities
const Database = require('better-sqlite3');

class DataMigrate {
  constructor(options = {}) {
    this.config = {
      dbPath:
        process.env.SQLITE_FILE ||
        path.join(process.cwd(), 'data', 'mindmeld.sqlite'),
      migrationsDir: path.join(process.cwd(), 'migrations'),
      ...options
    };

    this.currentVersion = '0.0.0';
    this.targetVersion = 'latest';
  }

  async getStatus() {
    const db = new Database(this.config.dbPath);

    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable(db);

      // Get current version
      const currentMigration = db
        .prepare(
          `
        SELECT version FROM migrations 
        ORDER BY applied_at DESC 
        LIMIT 1
      `
        )
        .get();

      this.currentVersion = currentMigration
        ? currentMigration.version
        : '0.0.0';

      // Get available migrations
      const availableMigrations = await this.getAvailableMigrations();

      // Find pending migrations
      const appliedVersions = new Set(
        db
          .prepare('SELECT version FROM migrations')
          .all()
          .map(m => m.version)
      );

      const pendingMigrations = availableMigrations.filter(
        migration => !appliedVersions.has(migration.version)
      );

      // Determine target version
      if (availableMigrations.length > 0) {
        this.targetVersion =
          availableMigrations[availableMigrations.length - 1].version;
      }

      return {
        current_version: this.currentVersion,
        target_version: this.targetVersion,
        pending_migrations: pendingMigrations,
        applied_count: appliedVersions.size,
        available_count: availableMigrations.length
      };
    } finally {
      db.close();
    }
  }

  async getHistory() {
    const db = new Database(this.config.dbPath);

    try {
      await this.ensureMigrationsTable(db);

      return db
        .prepare(
          `
        SELECT version, name, applied_at, execution_time, checksum
        FROM migrations
        ORDER BY applied_at DESC
      `
        )
        .all();
    } finally {
      db.close();
    }
  }

  async applyMigration(migration, options = {}) {
    const config = {
      dryRun: false,
      createBackup: false,
      rollbackOnError: true,
      ...options
    };

    const startTime = Date.now();

    if (config.dryRun) {
      return this.validateMigrationSyntax(migration);
    }

    const db = new Database(this.config.dbPath);

    try {
      await this.ensureMigrationsTable(db);

      // Check if migration already exists
      const existing = db
        .prepare('SELECT version FROM migrations WHERE version = ?')
        .get(migration.version);
      if (existing) {
        throw new Error(
          `Migration version ${migration.version} already exists`
        );
      }

      // Validate migration
      const validation = await this.validateMigration(migration);
      if (!validation.valid) {
        throw new Error(
          `Migration validation failed: ${validation.errors.join(', ')}`
        );
      }

      // Create backup if requested
      let backupPath = null;
      if (config.createBackup || migration.major) {
        backupPath = await this.createMigrationBackup(migration.version);
      }

      // Execute migration in transaction
      db.exec('BEGIN TRANSACTION');

      try {
        // Execute SQL
        if (migration.sql) {
          db.exec(migration.sql);
        }

        // Execute data transformation if provided
        let dataTransformed = false;
        if (migration.data_transformation) {
          await migration.data_transformation(db);
          dataTransformed = true;
        }

        // Record migration
        const executionTime = Date.now() - startTime;
        const checksum = this.calculateChecksum(migration.sql || '');

        db.prepare(
          `
          INSERT INTO migrations (version, name, applied_at, execution_time, checksum)
          VALUES (?, ?, ?, ?, ?)
        `
        ).run(
          migration.version,
          migration.name,
          new Date().toISOString(),
          executionTime,
          checksum
        );

        db.exec('COMMIT');

        return {
          success: true,
          version: migration.version,
          execution_time: executionTime,
          backup_created: !!backupPath,
          backup_path: backupPath,
          data_transformed: dataTransformed,
          checksum
        };
      } catch (error) {
        db.exec('ROLLBACK');

        // Enhance error with context
        const enhancedError = new Error(
          `Migration ${migration.version} failed: ${error.message}`
        );
        enhancedError.migration_version = migration.version;
        enhancedError.migration_name = migration.name;

        throw enhancedError;
      }
    } finally {
      db.close();
    }
  }

  async applyMigrations(migrations, options = {}) {
    const results = [];
    const startTime = Date.now();

    for (const migration of migrations) {
      try {
        const result = await this.applyMigration(migration, options);
        results.push(result);

        // Report progress if callback provided
        if (options.onProgress) {
          options.onProgress({
            current_migration: migration.version,
            completed: results.length,
            total: migrations.length,
            percent: Math.round((results.length / migrations.length) * 100),
            elapsed: Date.now() - startTime
          });
        }
      } catch (error) {
        results.push({
          success: false,
          version: migration.version,
          error: error.message
        });

        if (options.rollbackOnError) {
          // Rollback all applied migrations in this batch
          await this.rollbackMigrations(results.filter(r => r.success));
        }

        throw error;
      }
    }

    return results;
  }

  async migrateToLatest(options = {}) {
    const status = await this.getStatus();

    if (status.pending_migrations.length === 0) {
      return {
        success: true,
        applied_count: 0,
        total_execution_time: 0,
        message: 'Database is already up to date'
      };
    }

    if (options.dryRun) {
      const estimatedTime = status.pending_migrations.length * 100; // Rough estimate
      return {
        dry_run: true,
        would_apply: status.pending_migrations.length,
        migrations: status.pending_migrations.map(m => ({
          version: m.version,
          name: m.name
        })),
        estimated_execution_time: estimatedTime
      };
    }

    const startTime = Date.now();
    const results = await this.applyMigrations(
      status.pending_migrations,
      options
    );

    return {
      success: true,
      applied_count: results.filter(r => r.success).length,
      total_execution_time: Date.now() - startTime,
      results
    };
  }

  async migrateToVersion(targetVersion, options = {}) {
    const status = await this.getStatus();
    const availableMigrations = await this.getAvailableMigrations();

    // Find migrations up to target version
    const migrationsToApply = availableMigrations.filter(
      migration => this.compareVersions(migration.version, targetVersion) <= 0
    );

    // Filter out already applied migrations
    const appliedVersions = new Set(
      (await this.getHistory()).map(h => h.version)
    );

    const pendingMigrations = migrationsToApply.filter(
      migration => !appliedVersions.has(migration.version)
    );

    if (pendingMigrations.length === 0) {
      return {
        success: true,
        target_version: targetVersion,
        final_version: status.current_version,
        applied_count: 0,
        message: 'No migrations needed'
      };
    }

    const startTime = Date.now();
    const results = await this.applyMigrations(pendingMigrations, options);

    return {
      success: true,
      target_version: targetVersion,
      final_version:
        pendingMigrations[pendingMigrations.length - 1]?.version ||
        status.current_version,
      applied_count: results.filter(r => r.success).length,
      total_execution_time: Date.now() - startTime,
      results
    };
  }

  async rollbackLast() {
    const history = await this.getHistory();

    if (history.length === 0) {
      throw new Error('No migrations to rollback');
    }

    const lastMigration = history[0];

    // Check if rollback script is available
    const migrationFile = await this.loadMigrationFromVersion(
      lastMigration.version
    );
    if (!migrationFile.rollback_sql) {
      throw new Error('No rollback script available for the last migration');
    }

    const db = new Database(this.config.dbPath);

    try {
      db.exec('BEGIN TRANSACTION');

      // Execute rollback SQL
      db.exec(migrationFile.rollback_sql);

      // Execute rollback transformation if provided
      if (migrationFile.rollback_transformation) {
        await migrationFile.rollback_transformation(db);
      }

      // Remove migration record
      db.prepare('DELETE FROM migrations WHERE version = ?').run(
        lastMigration.version
      );

      db.exec('COMMIT');

      return {
        success: true,
        rolled_back_version: lastMigration.version,
        rolled_back_name: lastMigration.name
      };
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Rollback failed: ${error.message}`);
    } finally {
      db.close();
    }
  }

  async rollbackToVersion(targetVersion) {
    const history = await this.getHistory();

    // Find migrations to rollback (newer than target version)
    const migrationsToRollback = history.filter(
      migration => this.compareVersions(migration.version, targetVersion) > 0
    );

    if (migrationsToRollback.length === 0) {
      return {
        success: true,
        target_version: targetVersion,
        message: 'Already at or below target version'
      };
    }

    // Rollback in reverse order
    for (const migration of migrationsToRollback) {
      const migrationFile = await this.loadMigrationFromVersion(
        migration.version
      );
      if (!migrationFile.rollback_sql) {
        throw new Error(
          `No rollback script available for migration ${migration.version}`
        );
      }

      const db = new Database(this.config.dbPath);

      try {
        db.exec('BEGIN TRANSACTION');
        db.exec(migrationFile.rollback_sql);

        if (migrationFile.rollback_transformation) {
          await migrationFile.rollback_transformation(db);
        }

        db.prepare('DELETE FROM migrations WHERE version = ?').run(
          migration.version
        );
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        db.close();
      }
    }

    return {
      success: true,
      target_version: targetVersion,
      rolled_back_count: migrationsToRollback.length
    };
  }

  async validateMigration(migration) {
    const validation = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check required fields
    const requiredFields = ['version', 'name'];
    for (const field of requiredFields) {
      if (!migration[field]) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate version format
    if (migration.version && !/^\d+\.\d+\.\d+$/.test(migration.version)) {
      validation.valid = false;
      validation.errors.push('Version must be in format x.y.z');
    }

    // Check dependencies
    if (migration.depends_on) {
      const history = await this.getHistory();
      const appliedVersions = new Set(history.map(h => h.version));

      for (const dependency of migration.depends_on) {
        if (!appliedVersions.has(dependency)) {
          validation.valid = false;
          validation.errors.push(
            `Dependency not met: version ${dependency} not applied`
          );
        }
      }
    }

    // Validate SQL syntax (basic check)
    if (migration.sql) {
      try {
        const db = new Database(':memory:');
        // Try to prepare the SQL (won't execute, just validate syntax)
        const statements = migration.sql.split(';').filter(s => s.trim());
        for (const statement of statements) {
          if (statement.trim()) {
            try {
              db.prepare(statement.trim());
            } catch (error) {
              if (!error.message.includes('no such table')) {
                throw error; // Re-throw if not a "table doesn't exist" error
              }
            }
          }
        }
        db.close();
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`SQL syntax error: ${error.message}`);
      }
    }

    return validation;
  }

  async validateMigrationSyntax(migration) {
    const validation = await this.validateMigration(migration);

    return {
      dry_run: true,
      syntax_valid: validation.valid,
      syntax_errors: validation.errors,
      syntax_warnings: validation.warnings,
      version: migration.version
    };
  }

  async getAvailableMigrations() {
    try {
      await fs.access(this.config.migrationsDir);
      const files = await fs.readdir(this.config.migrationsDir);

      const migrationFiles = files
        .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
        .sort();

      const migrations = [];

      for (const file of migrationFiles) {
        const filePath = path.join(this.config.migrationsDir, file);
        const migration = await this.parseMigrationFile(filePath);
        if (migration) {
          migrations.push({
            version: migration.version,
            name: migration.name,
            file_path: filePath,
            major: migration.major || false
          });
        }
      }

      return migrations.sort((a, b) =>
        this.compareVersions(a.version, b.version)
      );
    } catch (error) {
      return []; // Return empty array if migrations directory doesn't exist
    }
  }

  async parseMigrationFile(filePath) {
    try {
      if (filePath.endsWith('.js')) {
        // JavaScript migration file
        delete require.cache[require.resolve(filePath)];
        return require(filePath);
      } else {
        // SQL migration file
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');

        const migration = {
          sql: content
        };

        // Parse metadata from comments
        for (const line of lines) {
          if (line.startsWith('-- @version:')) {
            migration.version = line.replace('-- @version:', '').trim();
          } else if (line.startsWith('-- @name:')) {
            migration.name = line.replace('-- @name:', '').trim();
          } else if (line.startsWith('-- @major:')) {
            migration.major = line.replace('-- @major:', '').trim() === 'true';
          }
        }

        return migration;
      }
    } catch (error) {
      return null;
    }
  }

  async loadMigrationFromVersion(version) {
    const migrations = await this.getAvailableMigrations();
    const migration = migrations.find(m => m.version === version);

    if (!migration) {
      throw new Error(`Migration version ${version} not found`);
    }

    return this.parseMigrationFile(migration.file_path);
  }

  async loadMigrationFromFile(filePath) {
    try {
      await fs.access(filePath);
      return this.parseMigrationFile(filePath);
    } catch (error) {
      throw new Error('Migration file not found');
    }
  }

  async createMigrationBackup(version) {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .split('.')[0];

    const backupPath = `pre-migration-${version}-${timestamp}.sqlite`;

    // Copy database file
    await fs.copyFile(this.config.dbPath, backupPath);

    return backupPath;
  }

  async ensureMigrationsTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        name TEXT,
        applied_at TEXT NOT NULL,
        execution_time INTEGER,
        checksum TEXT
      )
    `);
  }

  calculateChecksum(content) {
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
  }

  compareVersions(version1, version2) {
    const parts1 = version1.split('.').map(Number);
    const parts2 = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }

  async generateOutput(format, data) {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // Table format
    const lines = [];

    if (data.pending_migrations !== undefined) {
      // Status output
      lines.push('Migration Status');
      lines.push('================');
      lines.push(`Current Version: ${data.current_version}`);
      lines.push(`Target Version:  ${data.target_version}`);
      lines.push(`Applied:         ${data.applied_count}`);
      lines.push(`Available:       ${data.available_count}`);
      lines.push(`Pending:         ${data.pending_migrations.length}`);

      if (data.pending_migrations.length > 0) {
        lines.push('');
        lines.push('Pending Migrations:');
        data.pending_migrations.forEach(migration => {
          lines.push(`  ${migration.version}: ${migration.name}`);
        });
      }
    } else if (data.applied_count !== undefined) {
      // Migration result output
      lines.push('Migration Complete');
      lines.push('==================');
      lines.push(`Applied: ${data.applied_count}`);
      if (data.total_execution_time) {
        lines.push(`Total Time: ${data.total_execution_time}ms`);
      }

      if (data.results) {
        lines.push('');
        lines.push('Migration Details:');
        data.results.forEach(result => {
          const status = result.success ? '✅' : '❌';
          lines.push(
            `  ${status} ${result.version}: ${result.execution_time || 0}ms`
          );
        });
      }
    } else if (data.rolled_back_version) {
      // Rollback result output
      lines.push('Rollback Complete');
      lines.push('=================');
      lines.push(`Rolled back: ${data.rolled_back_version}`);
      lines.push(`Name: ${data.rolled_back_name}`);
    }

    return lines.join('\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let command = 'status';
  let targetVersion = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case 'status':
      case 'history':
      case 'migrate':
      case 'rollback':
        command = arg;
        break;
      case '--version':
        targetVersion = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--backup':
        options.createBackup = true;
        break;
      case '--force':
        options.rollbackOnError = false;
        break;
      case '--help':
        console.log(`
MindMeld Database Migration Tool

Usage: node data-migrate.js <command> [options]

Commands:
  status                      Show migration status
  history                     Show migration history
  migrate [--version=X.Y.Z]   Run migrations (to latest or specific version)
  rollback [--version=X.Y.Z]  Rollback migrations (last or to specific version)

Options:
  --version <version>         Target version for migrate/rollback
  --dry-run                   Preview migrations without applying
  --backup                    Create backup before migrations
  --force                     Skip safety checks
  --help                      Show this help

Examples:
  node data-migrate.js status
  node data-migrate.js migrate --dry-run
  node data-migrate.js migrate --version=1.2.0 --backup
  node data-migrate.js rollback
`);
        return;
    }
  }

  try {
    const migrator = new DataMigrate();
    let result;

    // Add progress reporting for migrations
    if (command === 'migrate') {
      options.onProgress = progress => {
        process.stdout.write(
          `\rMigrating: ${progress.completed}/${progress.total} (${progress.percent}%) - Current: ${progress.current_migration}`
        );
      };
    }

    switch (command) {
      case 'status':
        result = await migrator.getStatus();
        break;

      case 'history':
        result = await migrator.getHistory();
        console.log('Migration History:');
        if (result.length === 0) {
          console.log('No migrations have been applied.');
        } else {
          result.forEach(migration => {
            console.log(
              `${migration.version}: ${migration.name} (${migration.applied_at})`
            );
          });
        }
        return;

      case 'migrate':
        if (targetVersion) {
          result = await migrator.migrateToVersion(targetVersion, options);
        } else {
          result = await migrator.migrateToLatest(options);
        }
        break;

      case 'rollback':
        if (targetVersion) {
          result = await migrator.rollbackToVersion(targetVersion);
        } else {
          result = await migrator.rollbackLast();
        }
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Clear progress line
    if (command === 'migrate' && !options.dryRun) {
      process.stdout.write('\n');
    }

    const output = await migrator.generateOutput('table', result);
    console.log(output);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = DataMigrate;

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
