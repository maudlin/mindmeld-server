const { AdminTestEnvironment } = require('../helpers/admin-test-environment');

describe('Admin Command: data:migrate', () => {
  let testEnv;
  let dataMigrate;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();

    // Import the data migrate module
    dataMigrate = require('../../scripts/admin/data-migrate');
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('migration status', () => {
    it('reports current migration version', async () => {
      const status = await dataMigrate.getStatus();

      expect(status).toHaveProperty('current_version');
      expect(status).toHaveProperty('target_version');
      expect(status).toHaveProperty('pending_migrations');
      expect(Array.isArray(status.pending_migrations)).toBe(true);
    });

    it('detects pending migrations', async () => {
      // Mock migrations directory with test migrations
      const migrationFiles = [
        '001_initial_schema.sql',
        '002_add_metadata.sql',
        '003_update_indexes.sql'
      ];

      await testEnv.createMigrationFiles(migrationFiles);

      const status = await dataMigrate.getStatus();

      expect(status.pending_migrations.length).toBeGreaterThan(0);
      status.pending_migrations.forEach(migration => {
        expect(migration).toHaveProperty('version');
        expect(migration).toHaveProperty('name');
        expect(migration).toHaveProperty('file_path');
      });
    });

    it('shows no pending migrations when up to date', async () => {
      // Apply all available migrations first
      await dataMigrate.migrateToLatest();

      const status = await dataMigrate.getStatus();

      expect(status.pending_migrations).toHaveLength(0);
      expect(status.current_version).toBe(status.target_version);
    });

    it('tracks migration history', async () => {
      await dataMigrate.migrateToLatest();

      const history = await dataMigrate.getHistory();

      expect(Array.isArray(history)).toBe(true);
      history.forEach(entry => {
        expect(entry).toHaveProperty('version');
        expect(entry).toHaveProperty('applied_at');
        expect(entry).toHaveProperty('execution_time');
        expect(entry).toHaveProperty('checksum');
      });
    });
  });

  describe('migration execution', () => {
    beforeEach(async () => {
      await testEnv.createTestMigrations();
    });

    it('applies single migration', async () => {
      const migration = {
        version: '001',
        name: 'test_migration',
        sql: 'ALTER TABLE maps ADD COLUMN test_field TEXT DEFAULT NULL;'
      };

      const result = await dataMigrate.applyMigration(migration);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('version', '001');
      expect(result).toHaveProperty('execution_time');
      expect(result.execution_time).toBeGreaterThan(0);
    });

    it('applies multiple migrations in sequence', async () => {
      const migrations = [
        {
          version: '001',
          name: 'add_metadata',
          sql: 'ALTER TABLE maps ADD COLUMN metadata TEXT;'
        },
        {
          version: '002',
          name: 'add_tags',
          sql: 'ALTER TABLE maps ADD COLUMN tags TEXT;'
        }
      ];

      const results = await dataMigrate.applyMigrations(migrations);

      expect(results).toHaveLength(2);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.version).toBe(migrations[index].version);
      });
    });

    it('migrates to latest version', async () => {
      const result = await dataMigrate.migrateToLatest();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('applied_count');
      expect(result.applied_count).toBeGreaterThanOrEqual(0);
      expect(result).toHaveProperty('total_execution_time');
    });

    it('migrates to specific version', async () => {
      const targetVersion = '002';

      const result = await dataMigrate.migrateToVersion(targetVersion);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('target_version', targetVersion);
      expect(result).toHaveProperty('final_version');
      expect(result.final_version).toBeLessThanOrEqual(targetVersion);
    });

    it('validates migration checksums', async () => {
      const migration = {
        version: '001',
        name: 'test_checksum',
        sql: 'CREATE TABLE test_checksum (id INTEGER);',
        checksum: 'abc123'
      };

      // Apply migration with known checksum
      await dataMigrate.applyMigration(migration);

      // Verify checksum is stored and validated
      const history = await dataMigrate.getHistory();
      const appliedMigration = history.find(h => h.version === '001');

      expect(appliedMigration).toBeDefined();
      expect(appliedMigration.checksum).toBe('abc123');
    });
  });

  describe('rollback functionality', () => {
    beforeEach(async () => {
      await testEnv.createTestMigrations();
      await dataMigrate.migrateToLatest();
    });

    it('rolls back last migration', async () => {
      const initialStatus = await dataMigrate.getStatus();

      const result = await dataMigrate.rollbackLast();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('rolled_back_version');

      const finalStatus = await dataMigrate.getStatus();
      expect(finalStatus.current_version).toBeLessThan(
        initialStatus.current_version
      );
    });

    it('rolls back to specific version', async () => {
      const targetVersion = '001';

      const result = await dataMigrate.rollbackToVersion(targetVersion);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('target_version', targetVersion);

      const status = await dataMigrate.getStatus();
      expect(status.current_version).toBeLessThanOrEqual(targetVersion);
    });

    it('prevents rollback when no rollback script exists', async () => {
      const migration = {
        version: '999',
        name: 'no_rollback',
        sql: 'CREATE TABLE no_rollback (id INTEGER);'
        // No rollback_sql provided
      };

      await dataMigrate.applyMigration(migration);

      await expect(dataMigrate.rollbackLast()).rejects.toThrow(
        'No rollback script available'
      );
    });

    it('validates rollback scripts', async () => {
      const migration = {
        version: '998',
        name: 'with_rollback',
        sql: 'CREATE TABLE with_rollback (id INTEGER);',
        rollback_sql: 'DROP TABLE with_rollback;'
      };

      await dataMigrate.applyMigration(migration);

      const result = await dataMigrate.rollbackLast();

      expect(result.success).toBe(true);

      // Verify table was actually dropped
      const tableExists = await testEnv.tableExists('with_rollback');
      expect(tableExists).toBe(false);
    });
  });

  describe('dry run mode', () => {
    beforeEach(async () => {
      await testEnv.createTestMigrations();
    });

    it('previews migrations without applying in dry run', async () => {
      const result = await dataMigrate.migrateToLatest({ dryRun: true });

      expect(result).toHaveProperty('dry_run', true);
      expect(result).toHaveProperty('would_apply');
      expect(result.would_apply).toBeGreaterThan(0);

      // Verify no actual changes were made
      const status = await dataMigrate.getStatus();
      expect(status.pending_migrations.length).toBeGreaterThan(0);
    });

    it('validates migration syntax in dry run', async () => {
      const invalidMigration = {
        version: '001',
        name: 'syntax_error',
        sql: 'INVALID SQL SYNTAX EXAMPLE;'
      };

      const result = await dataMigrate.applyMigration(invalidMigration, {
        dryRun: true
      });

      expect(result).toHaveProperty('dry_run', true);
      expect(result).toHaveProperty('syntax_valid', false);
      expect(result).toHaveProperty('syntax_errors');
      expect(result.syntax_errors).toHaveLength(1);
    });

    it('estimates migration execution time', async () => {
      const result = await dataMigrate.migrateToLatest({ dryRun: true });

      expect(result).toHaveProperty('estimated_execution_time');
      expect(result.estimated_execution_time).toBeGreaterThanOrEqual(0);
    });
  });

  describe('backup integration', () => {
    it('creates backup before major migrations', async () => {
      const majorMigration = {
        version: '001',
        name: 'major_schema_change',
        sql: 'ALTER TABLE maps DROP COLUMN data;', // This would be major
        major: true
      };

      const result = await dataMigrate.applyMigration(majorMigration, {
        createBackup: true
      });

      expect(result).toHaveProperty('backup_created', true);
      expect(result).toHaveProperty('backup_path');
      expect(result.backup_path).toMatch(/pre-migration-\d{8}-\d{6}\.sqlite/);
    });

    it('skips backup for minor migrations', async () => {
      const minorMigration = {
        version: '001',
        name: 'minor_index_change',
        sql: 'CREATE INDEX idx_maps_name ON maps(name);',
        major: false
      };

      const result = await dataMigrate.applyMigration(minorMigration, {
        createBackup: 'auto' // Only backup for major changes
      });

      expect(result).toHaveProperty('backup_created', false);
    });

    it('always creates backup when explicitly requested', async () => {
      const migration = {
        version: '001',
        name: 'any_change',
        sql: 'CREATE INDEX test_idx ON maps(created_at);'
      };

      const result = await dataMigrate.applyMigration(migration, {
        createBackup: true
      });

      expect(result).toHaveProperty('backup_created', true);
    });
  });

  describe('data transformation', () => {
    beforeEach(async () => {
      await testEnv.createTestMaps([
        { name: 'Map 1', data: { nodes: [], version: 1 } },
        { name: 'Map 2', data: { nodes: [], version: 1 } }
      ]);
    });

    it('handles data transformations during migration', async () => {
      const transformationMigration = {
        version: '001',
        name: 'upgrade_data_format',
        sql: 'ALTER TABLE maps ADD COLUMN data_version INTEGER DEFAULT 2;',
        data_transformation: async db => {
          // Update all maps to new data format
          await db.run(`
            UPDATE maps 
            SET data = json_set(data, '$.version', 2),
                data_version = 2
            WHERE data_version IS NULL
          `);
        }
      };

      const result = await dataMigrate.applyMigration(transformationMigration);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('data_transformed', true);

      // Verify data was actually transformed
      const maps = await testEnv.getAllMaps();
      maps.forEach(map => {
        expect(JSON.parse(map.data).version).toBe(2);
      });
    });

    it('rolls back data transformations', async () => {
      const migration = {
        version: '001',
        name: 'reversible_transformation',
        sql: 'ALTER TABLE maps ADD COLUMN transformed BOOLEAN DEFAULT 0;',
        data_transformation: async db => {
          await db.run('UPDATE maps SET transformed = 1');
        },
        rollback_sql: 'ALTER TABLE maps DROP COLUMN transformed;',
        rollback_transformation: async _db => {
          // Rollback is handled by dropping the column
          return true;
        }
      };

      // Apply migration
      await dataMigrate.applyMigration(migration);

      // Verify transformation was applied
      let maps = await testEnv.getAllMaps();
      expect(maps[0]).toHaveProperty('transformed', 1);

      // Rollback migration
      const rollbackResult = await dataMigrate.rollbackLast();

      expect(rollbackResult.success).toBe(true);

      // Verify rollback worked
      const columns = await testEnv.getTableColumns('maps');
      expect(columns.find(col => col.name === 'transformed')).toBeUndefined();
    });

    it('handles transformation errors gracefully', async () => {
      const faultyMigration = {
        version: '001',
        name: 'faulty_transformation',
        sql: 'ALTER TABLE maps ADD COLUMN test_field TEXT;',
        data_transformation: async _db => {
          throw new Error('Transformation failed');
        }
      };

      await expect(dataMigrate.applyMigration(faultyMigration)).rejects.toThrow(
        'Transformation failed'
      );

      // Verify the schema change was rolled back
      const columns = await testEnv.getTableColumns('maps');
      expect(columns.find(col => col.name === 'test_field')).toBeUndefined();
    });
  });

  describe('migration validation', () => {
    it('validates migration file structure', async () => {
      const validMigration = {
        version: '001',
        name: 'valid_migration',
        sql: 'CREATE INDEX test_idx ON maps(name);'
      };

      const validation = await dataMigrate.validateMigration(validMigration);

      expect(validation).toHaveProperty('valid', true);
      expect(validation).toHaveProperty('errors', []);
    });

    it('rejects migrations with invalid structure', async () => {
      const invalidMigration = {
        // Missing version
        name: 'invalid_migration',
        sql: 'SELECT * FROM maps;'
      };

      const validation = await dataMigrate.validateMigration(invalidMigration);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors).toContain('Missing required field: version');
    });

    it('detects SQL syntax errors', async () => {
      const syntaxErrorMigration = {
        version: '001',
        name: 'syntax_error',
        sql: 'CREATE TBALE invalid_syntax ();' // Typo in CREATE TABLE
      };

      const validation =
        await dataMigrate.validateMigration(syntaxErrorMigration);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors.some(e => e.includes('syntax'))).toBe(true);
    });

    it('prevents duplicate version numbers', async () => {
      const migration1 = {
        version: '001',
        name: 'first_migration',
        sql: 'CREATE INDEX idx1 ON maps(id);'
      };

      const migration2 = {
        version: '001', // Duplicate version
        name: 'second_migration',
        sql: 'CREATE INDEX idx2 ON maps(name);'
      };

      await dataMigrate.applyMigration(migration1);

      await expect(dataMigrate.applyMigration(migration2)).rejects.toThrow(
        'Migration version 001 already exists'
      );
    });

    it('validates migration dependencies', async () => {
      const dependentMigration = {
        version: '002',
        name: 'dependent_migration',
        sql: 'CREATE INDEX idx_on_new_column ON maps(new_column);',
        depends_on: ['001'] // Requires version 001 to be applied first
      };

      const validation =
        await dataMigrate.validateMigration(dependentMigration);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors).toContain(
        'Dependency not met: version 001 not applied'
      );
    });
  });

  describe('progress tracking', () => {
    beforeEach(async () => {
      await testEnv.createMigrationFiles([
        '001_first.sql',
        '002_second.sql',
        '003_third.sql',
        '004_fourth.sql',
        '005_fifth.sql'
      ]);
    });

    it('reports progress during migration', async () => {
      const progressUpdates = [];

      await dataMigrate.migrateToLatest({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      progressUpdates.forEach(update => {
        expect(update).toHaveProperty('current_migration');
        expect(update).toHaveProperty('completed');
        expect(update).toHaveProperty('total');
        expect(update).toHaveProperty('percent');
        expect(update).toHaveProperty('elapsed');
      });
    });

    it('includes timing information in progress', async () => {
      const progressUpdates = [];

      await dataMigrate.migrateToLatest({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate).toHaveProperty('total_execution_time');
      expect(finalUpdate.total_execution_time).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('handles database connection errors', async () => {
      // Simulate database connection loss
      jest
        .spyOn(testEnv.db, 'run')
        .mockRejectedValueOnce(new Error('Database connection lost'));

      const migration = {
        version: '001',
        name: 'test_connection_error',
        sql: 'CREATE INDEX test_idx ON maps(name);'
      };

      await expect(dataMigrate.applyMigration(migration)).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('handles migration file not found errors', async () => {
      await expect(
        dataMigrate.loadMigrationFromFile('/nonexistent/migration.sql')
      ).rejects.toThrow('Migration file not found');
    });

    it('provides detailed error context', async () => {
      const problematicMigration = {
        version: '001',
        name: 'error_context_test',
        sql: 'ALTER TABLE nonexistent_table ADD COLUMN test_field TEXT;'
      };

      try {
        await dataMigrate.applyMigration(problematicMigration);
      } catch (error) {
        expect(error.message).toContain('nonexistent_table');
        expect(error.migration_version).toBe('001');
        expect(error.migration_name).toBe('error_context_test');
      }
    });

    it('handles partial migration failures with rollback', async () => {
      const multiStepMigration = {
        version: '001',
        name: 'multi_step_failure',
        sql: `
          CREATE TABLE test_table1 (id INTEGER);
          CREATE TABLE test_table2 (id INTEGER);
          CREATE TABLE invalid_syntax_here (;  -- This will fail
          CREATE TABLE test_table3 (id INTEGER);
        `
      };

      await expect(
        dataMigrate.applyMigration(multiStepMigration, {
          rollbackOnError: true
        })
      ).rejects.toThrow();

      // Verify rollback worked - no tables should exist
      const table1Exists = await testEnv.tableExists('test_table1');
      const table2Exists = await testEnv.tableExists('test_table2');
      const table3Exists = await testEnv.tableExists('test_table3');

      expect(table1Exists).toBe(false);
      expect(table2Exists).toBe(false);
      expect(table3Exists).toBe(false);
    });
  });

  describe('output formatting', () => {
    beforeEach(async () => {
      await testEnv.createTestMigrations();
    });

    it('generates table format output for migration status', async () => {
      const status = await dataMigrate.getStatus();
      const output = await dataMigrate.generateOutput('table', status);

      expect(output).toContain('Migration Status');
      expect(output).toContain('Current Version:');
      expect(output).toContain('Target Version:');
      expect(output).toContain('Pending Migrations:');
    });

    it('generates JSON format output', async () => {
      const status = await dataMigrate.getStatus();
      const output = await dataMigrate.generateOutput('json', status);

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('current_version');
      expect(parsed).toHaveProperty('pending_migrations');
    });

    it('includes migration execution summary', async () => {
      const result = await dataMigrate.migrateToLatest();
      const output = await dataMigrate.generateOutput('table', result);

      expect(output).toContain('Migration Complete');
      expect(output).toContain('Applied:');
      expect(output).toContain('Total Time:');
    });
  });

  describe('integration', () => {
    it('works with real database schema changes', async () => {
      const realMigration = {
        version: '001',
        name: 'add_tags_column',
        sql: 'ALTER TABLE maps ADD COLUMN tags TEXT DEFAULT "[]";'
      };

      // Apply migration
      const result = await dataMigrate.applyMigration(realMigration);
      expect(result.success).toBe(true);

      // Verify column was added
      const columns = await testEnv.getTableColumns('maps');
      const tagsColumn = columns.find(col => col.name === 'tags');
      expect(tagsColumn).toBeDefined();
      expect(tagsColumn.dflt_value).toBe('"[]"');

      // Test that we can use the new column
      await testEnv.createTestMaps([
        {
          name: 'Tagged Map',
          data: { nodes: [] },
          tags: '["test", "migration"]'
        }
      ]);

      const maps = await testEnv.getAllMaps();
      expect(maps[0].tags).toBe('["test", "migration"]');
    });

    it('maintains data integrity across migrations', async () => {
      // Create initial test data
      await testEnv.createTestMaps([
        { name: 'Test Map 1', data: { nodes: [{ id: 1 }] } },
        { name: 'Test Map 2', data: { nodes: [{ id: 2 }] } }
      ]);

      const initialCount = await testEnv.getMapCount();

      // Apply schema migration
      const migration = {
        version: '001',
        name: 'add_version_tracking',
        sql: 'ALTER TABLE maps ADD COLUMN schema_version INTEGER DEFAULT 1;'
      };

      await dataMigrate.applyMigration(migration);

      // Verify data integrity maintained
      const finalCount = await testEnv.getMapCount();
      expect(finalCount).toBe(initialCount);

      const maps = await testEnv.getAllMaps();
      maps.forEach(map => {
        expect(map).toHaveProperty('name');
        expect(map).toHaveProperty('data');
        expect(map).toHaveProperty('schema_version', 1);
      });
    });
  });
});
