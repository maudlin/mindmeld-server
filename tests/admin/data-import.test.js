const path = require('path');
const { promises: fs } = require('fs');
const { AdminTestEnvironment } = require('../helpers/admin-test-environment');

describe('Admin Command: data:import', () => {
  let testEnv;
  let dataImport;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();

    // Import the data import module
    dataImport = require('../../scripts/admin/data-import');
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('import validation', () => {
    it('validates JSON import file format', async () => {
      const validImport = {
        export_info: {
          version: '1.0.0',
          format: 'json',
          total_maps: 2
        },
        maps: [
          {
            id: 'test-id-1',
            name: 'Import Test 1',
            data: { nodes: [{ id: 1, label: 'Node 1' }] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'test-id-2',
            name: 'Import Test 2',
            data: { nodes: [{ id: 2, label: 'Node 2' }] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const validation = await dataImport.validateImportFile(validImport);

      expect(validation).toHaveProperty('valid', true);
      expect(validation).toHaveProperty('total_maps', 2);
      expect(validation).toHaveProperty('errors', []);
    });

    it('rejects invalid import file format', async () => {
      const invalidImport = {
        maps: 'not-an-array'
      };

      const validation = await dataImport.validateImportFile(invalidImport);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors).toContain('maps must be an array');
    });

    it('validates required fields in map data', async () => {
      const incompleteImport = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            // Missing required fields like id, name, data
            created_at: new Date().toISOString()
          }
        ]
      };

      const validation = await dataImport.validateImportFile(incompleteImport);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors).toContain(
        'Map at index 0 missing required field: id'
      );
      expect(validation.errors).toContain(
        'Map at index 0 missing required field: name'
      );
      expect(validation.errors).toContain(
        'Map at index 0 missing required field: data'
      );
    });

    it('validates map data structure', async () => {
      const invalidDataImport = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'test-id',
            name: 'Test Map',
            data: 'invalid-data-structure',
            created_at: new Date().toISOString()
          }
        ]
      };

      const validation = await dataImport.validateImportFile(invalidDataImport);

      expect(validation).toHaveProperty('valid', false);
      expect(validation.errors).toContain(
        'Map at index 0 has invalid data structure'
      );
    });
  });

  describe('conflict resolution', () => {
    beforeEach(async () => {
      // Create existing test data
      await testEnv.createTestMaps([
        {
          id: 'existing-id',
          name: 'Existing Map',
          data: { nodes: [{ id: 'existing', label: 'Existing Node' }] }
        }
      ]);
    });

    it('detects conflicts with existing maps', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'existing-id',
            name: 'Updated Map',
            data: { nodes: [{ id: 'updated', label: 'Updated Node' }] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.analyzeImport(importData);

      expect(result).toHaveProperty('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toHaveProperty('id', 'existing-id');
      expect(result.conflicts[0]).toHaveProperty('type', 'id_conflict');
    });

    it('handles skip conflict resolution strategy', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 2 },
        maps: [
          {
            id: 'existing-id',
            name: 'Conflicting Map',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'new-id',
            name: 'New Map',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData, {
        conflictResolution: 'skip'
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.conflicts_resolved).toHaveLength(1);
    });

    it('handles overwrite conflict resolution strategy', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'existing-id',
            name: 'Overwritten Map',
            data: { nodes: [{ id: 'new', label: 'New Node' }] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData, {
        conflictResolution: 'overwrite'
      });

      expect(result.imported).toBe(1);
      expect(result.overwritten).toBe(1);

      // Verify the data was actually overwritten
      const maps = await testEnv.getAllMaps();
      const overwrittenMap = maps.find(m => m.id === 'existing-id');
      expect(overwrittenMap.name).toBe('Overwritten Map');
    });

    it('handles merge conflict resolution strategy', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'existing-id',
            name: 'Merged Map',
            data: {
              nodes: [{ id: 'merged', label: 'Merged Node' }],
              metadata: { merged: true }
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData, {
        conflictResolution: 'merge'
      });

      expect(result.imported).toBe(1);
      expect(result.merged).toBe(1);
    });
  });

  describe('batch processing', () => {
    it('processes imports in configurable batches', async () => {
      const largeMaps = Array.from({ length: 50 }, (_, i) => ({
        id: `batch-test-${i}`,
        name: `Batch Map ${i}`,
        data: { nodes: [{ id: i, label: `Node ${i}` }] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 50 },
        maps: largeMaps
      };

      const progressUpdates = [];

      const result = await dataImport.importData(importData, {
        batchSize: 10,
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(result.imported).toBe(50);
      expect(progressUpdates.length).toBeGreaterThanOrEqual(5); // At least 5 batches
      expect(progressUpdates[progressUpdates.length - 1]).toHaveProperty(
        'completed',
        50
      );
    });

    it('handles batch processing errors gracefully', async () => {
      const mixedMaps = [
        {
          id: 'valid-1',
          name: 'Valid Map 1',
          data: { nodes: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          // Invalid map - missing required fields
          name: 'Invalid Map'
        },
        {
          id: 'valid-2',
          name: 'Valid Map 2',
          data: { nodes: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 3 },
        maps: mixedMaps
      };

      const result = await dataImport.importData(importData, {
        continueOnError: true
      });

      expect(result.imported).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.error_details).toHaveLength(1);
    });
  });

  describe('backup creation', () => {
    beforeEach(async () => {
      await testEnv.createTestMaps([
        { name: 'Existing 1', data: { nodes: [] } },
        { name: 'Existing 2', data: { nodes: [] } }
      ]);
    });

    it('creates backup before import by default', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'new-import',
            name: 'New Import',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData);

      expect(result).toHaveProperty('backup_created', true);
      expect(result).toHaveProperty('backup_path');
      expect(result.backup_path).toMatch(/pre-import-\d{8}-\d{6}\.sqlite/);
    });

    it('skips backup when explicitly disabled', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'no-backup',
            name: 'No Backup Import',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData, {
        createBackup: false
      });

      expect(result).toHaveProperty('backup_created', false);
      expect(result).not.toHaveProperty('backup_path');
    });
  });

  describe('rollback functionality', () => {
    it('supports rollback on import failure', async () => {
      // Create initial state
      await testEnv.createTestMaps([
        { name: 'Original 1', data: { nodes: [] } }
      ]);
      const originalCount = await testEnv.getMapCount();

      const problematicImport = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 2 },
        maps: [
          {
            id: 'valid-import',
            name: 'Valid Import',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'invalid-import',
            name: 'Invalid Import',
            data: 'invalid-structure', // This will cause an error
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      try {
        await dataImport.importData(problematicImport, {
          rollbackOnError: true
        });
      } catch (error) {
        // Import should fail and rollback
        expect(error.message).toContain('Import failed');

        // Verify rollback - should be back to original state
        const finalCount = await testEnv.getMapCount();
        expect(finalCount).toBe(originalCount);
      }
    });

    it('provides manual rollback capability', async () => {
      // Create backup
      const backupPath = await dataImport.createBackup();

      // Modify database
      await testEnv.createTestMaps([
        { name: 'Added After Backup', data: { nodes: [] } }
      ]);
      const modifiedCount = await testEnv.getMapCount();

      // Rollback to backup
      await dataImport.rollbackFromBackup(backupPath);

      const rolledBackCount = await testEnv.getMapCount();
      expect(rolledBackCount).toBeLessThan(modifiedCount);
    });
  });

  describe('dry run mode', () => {
    it('validates import without making changes in dry run mode', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 2 },
        maps: [
          {
            id: 'dry-run-1',
            name: 'Dry Run Test 1',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'dry-run-2',
            name: 'Dry Run Test 2',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const originalCount = await testEnv.getMapCount();

      const result = await dataImport.importData(importData, {
        dryRun: true
      });

      expect(result).toHaveProperty('dry_run', true);
      expect(result).toHaveProperty('would_import', 2);
      expect(result).toHaveProperty('validation');

      // Verify no changes were made
      const finalCount = await testEnv.getMapCount();
      expect(finalCount).toBe(originalCount);
    });

    it('detects issues in dry run mode', async () => {
      await testEnv.createTestMaps([
        { id: 'conflict-test', name: 'Existing', data: { nodes: [] } }
      ]);

      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'conflict-test',
            name: 'Conflicting Import',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData, {
        dryRun: true
      });

      expect(result).toHaveProperty('conflicts');
      expect(result.conflicts).toHaveLength(1);
      expect(result).toHaveProperty('would_skip', 1);
    });
  });

  describe('progress tracking', () => {
    it('reports detailed progress during import', async () => {
      const maps = Array.from({ length: 25 }, (_, i) => ({
        id: `progress-${i}`,
        name: `Progress Map ${i}`,
        data: { nodes: [] },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 25 },
        maps
      };

      const progressUpdates = [];

      await dataImport.importData(importData, {
        batchSize: 5,
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      progressUpdates.forEach(update => {
        expect(update).toHaveProperty('completed');
        expect(update).toHaveProperty('total', 25);
        expect(update).toHaveProperty('percent');
        expect(update).toHaveProperty('elapsed');
        expect(update).toHaveProperty('estimated_total');
      });
    });

    it('includes import statistics in progress updates', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 3 },
        maps: [
          {
            id: 'stats-1',
            name: 'Stats Test 1',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const progressUpdates = [];

      await dataImport.importData(importData, {
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate).toHaveProperty('imported');
      expect(finalUpdate).toHaveProperty('skipped');
      expect(finalUpdate).toHaveProperty('errors');
    });
  });

  describe('file handling', () => {
    it('imports from JSON file', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'file-import',
            name: 'File Import Test',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const filePath = path.join(testEnv.tempDir, 'import.json');
      await fs.writeFile(filePath, JSON.stringify(importData, null, 2));

      const result = await dataImport.importFromFile(filePath);

      expect(result.imported).toBe(1);
      expect(result.source_file).toBe(filePath);
    });

    it('handles compressed import files', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'compressed-import',
            name: 'Compressed Import',
            data: { nodes: [] },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      // Create a compressed file (simulated)
      const filePath = path.join(testEnv.tempDir, 'import.json.gz');
      await testEnv.createCompressedFile(filePath, JSON.stringify(importData));

      const result = await dataImport.importFromFile(filePath);

      expect(result.imported).toBe(1);
      expect(result.compressed).toBe(true);
    });
  });

  describe('error handling', () => {
    it('provides detailed error messages for import failures', async () => {
      const invalidImport = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 1 },
        maps: [
          {
            id: 'error-test',
            // Missing required fields
            created_at: 'invalid-date'
          }
        ]
      };

      await expect(dataImport.importData(invalidImport)).rejects.toThrow(
        'Validation failed'
      );
    });

    it('handles file system errors gracefully', async () => {
      const nonExistentFile = '/nonexistent/import.json';

      await expect(dataImport.importFromFile(nonExistentFile)).rejects.toThrow(
        'Import file not found'
      );
    });

    it('recovers from partial import failures', async () => {
      // Simulate database becoming unavailable mid-import
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 3 },
        maps: Array.from({ length: 3 }, (_, i) => ({
          id: `recovery-${i}`,
          name: `Recovery Test ${i}`,
          data: { nodes: [] },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))
      };

      // Mock database to fail after first import
      let importCount = 0;
      jest.spyOn(testEnv.db, 'run').mockImplementation((sql, params) => {
        if (sql.includes('INSERT') && ++importCount > 1) {
          throw new Error('Database connection lost');
        }
        return testEnv.db.run.wrappedMethod(sql, params);
      });

      const result = await dataImport.importData(importData, {
        continueOnError: true,
        rollbackOnError: false
      });

      expect(result.imported).toBe(1);
      expect(result.errors).toBe(2);
    });
  });

  describe('integration', () => {
    it('works end-to-end with exported data', async () => {
      // First, create and export some data
      await testEnv.createTestMaps([
        { name: 'Original 1', data: { nodes: [{ id: 1 }] } },
        { name: 'Original 2', data: { nodes: [{ id: 2 }] } }
      ]);

      const dataExport = require('../../scripts/admin/data-export');
      const exportedData = await dataExport.exportData();

      // Clear database
      await testEnv.clearAllMaps();

      // Re-import the data
      const result = await dataImport.importData(exportedData);

      expect(result.imported).toBe(2);

      // Verify data integrity
      const maps = await testEnv.getAllMaps();
      expect(maps).toHaveLength(2);
      expect(maps.map(m => m.name)).toContain('Original 1');
      expect(maps.map(m => m.name)).toContain('Original 2');
    });

    it('maintains referential integrity during import', async () => {
      const importData = {
        export_info: { version: '1.0.0', format: 'json', total_maps: 2 },
        maps: [
          {
            id: 'parent-map',
            name: 'Parent Map',
            data: {
              nodes: [{ id: 'parent-node', label: 'Parent' }],
              connections: []
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'child-map',
            name: 'Child Map',
            data: {
              nodes: [{ id: 'child-node', label: 'Child' }],
              parent_reference: 'parent-map'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]
      };

      const result = await dataImport.importData(importData);

      expect(result.imported).toBe(2);

      // Verify both maps exist and relationships are intact
      const maps = await testEnv.getAllMaps();
      const parentMap = maps.find(m => m.id === 'parent-map');
      const childMap = maps.find(m => m.id === 'child-map');

      expect(parentMap).toBeDefined();
      expect(childMap).toBeDefined();
      expect(childMap.data.parent_reference).toBe('parent-map');
    });
  });
});
