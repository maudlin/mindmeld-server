const path = require('path');
const { promises: fs } = require('fs');
const { AdminTestEnvironment } = require('../helpers/admin-test-environment');

describe('Admin Command: data:export', () => {
  let testEnv;
  let dataExport;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();

    // Import the data export module
    dataExport = require('../../scripts/admin/data-export');

    // Setup test data
    await testEnv.createTestMaps([
      {
        name: 'Test Map 1',
        data: { nodes: [{ id: 1, label: 'Node 1' }] }
      },
      {
        name: 'Test Map 2',
        data: { nodes: [{ id: 2, label: 'Node 2' }] }
      }
    ]);
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('data export functionality', () => {
    it('exports all maps in JSON format by default', async () => {
      const result = await dataExport.exportData();

      expect(result).toHaveProperty('export_info');
      expect(result).toHaveProperty('maps');
      expect(result.export_info).toHaveProperty('format', 'json');
      expect(result.maps).toHaveLength(2);

      // Verify map structure
      result.maps.forEach(map => {
        expect(map).toHaveProperty('id');
        expect(map).toHaveProperty('name');
        expect(map).toHaveProperty('data');
        expect(map).toHaveProperty('created_at');
        expect(map).toHaveProperty('updated_at');
      });
    });

    it('exports maps in CSV format when requested', async () => {
      const result = await dataExport.exportData({ format: 'csv' });

      expect(result).toHaveProperty('format', 'csv');
      expect(result).toHaveProperty('headers');
      expect(result).toHaveProperty('rows');

      expect(result.headers).toContain('id');
      expect(result.headers).toContain('name');
      expect(result.headers).toContain('created_at');
      expect(result.rows).toHaveLength(2);
    });

    it('exports database schema in SQL format', async () => {
      const result = await dataExport.exportSchema({ format: 'sql' });

      expect(result).toHaveProperty('format', 'sql');
      expect(result).toHaveProperty('schema');
      expect(result.schema).toContain('CREATE TABLE');
      expect(result.schema).toContain('maps');
    });

    it('filters maps by date range when specified', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const result = await dataExport.exportData({
        filter: {
          dateFrom: yesterday.toISOString(),
          dateTo: new Date().toISOString()
        }
      });

      expect(result.maps).toHaveLength(2);
      expect(result.export_info).toHaveProperty('filter_applied', true);
    });

    it('includes metadata when requested', async () => {
      const result = await dataExport.exportData({ includeMetadata: true });

      expect(result.export_info).toHaveProperty('include_metadata', true);
      result.maps.forEach(map => {
        expect(map).toHaveProperty('size_bytes');
        expect(map).toHaveProperty('version');
      });
    });

    it('excludes sensitive data by default', async () => {
      const result = await dataExport.exportData();

      result.maps.forEach(map => {
        expect(map).not.toHaveProperty('internal_id');
        expect(map).not.toHaveProperty('raw_data');
      });
    });
  });

  describe('file operations', () => {
    it('writes export to specified file path', async () => {
      const outputPath = path.join(testEnv.tempDir, 'export.json');

      await dataExport.exportToFile({
        output: outputPath,
        format: 'json'
      });

      const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const fileContent = await fs.readFile(outputPath, 'utf8');
      const parsedContent = JSON.parse(fileContent);

      expect(parsedContent).toHaveProperty('export_info');
      expect(parsedContent).toHaveProperty('maps');
    });

    it('creates compressed export when requested', async () => {
      const outputPath = path.join(testEnv.tempDir, 'export.json.gz');

      await dataExport.exportToFile({
        output: outputPath,
        format: 'json',
        compress: true
      });

      const fileExists = await fs
        .access(outputPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      const stats = await fs.stat(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('generates unique filename when path not specified', async () => {
      const result = await dataExport.exportToFile({
        format: 'json'
      });

      expect(result).toHaveProperty('filename');
      expect(result.filename).toMatch(/^mindmeld-export-\d{8}-\d{6}\.json$/);

      const fileExists = await fs
        .access(result.filename)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });
  });

  describe('export validation', () => {
    it('validates export data integrity', async () => {
      const result = await dataExport.exportData({ validate: true });

      expect(result.export_info).toHaveProperty('validation');
      expect(result.export_info.validation).toHaveProperty('valid', true);
      expect(result.export_info.validation).toHaveProperty('total_maps');
      expect(result.export_info.validation).toHaveProperty(
        'validation_errors',
        []
      );
    });

    it('detects corrupted data during export', async () => {
      // Create corrupted test data
      await testEnv.createCorruptedMap();

      const result = await dataExport.exportData({
        validate: true,
        skipCorrupted: false
      });

      expect(result.export_info.validation).toHaveProperty('valid', false);
      expect(result.export_info.validation.validation_errors).toHaveLength(1);
    });

    it('skips corrupted data when skipCorrupted option is enabled', async () => {
      await testEnv.createCorruptedMap();

      const result = await dataExport.exportData({
        validate: true,
        skipCorrupted: true
      });

      expect(result.export_info).toHaveProperty('skipped_items', 1);
      expect(result.maps).toHaveLength(2); // Only valid maps
    });
  });

  describe('progress tracking', () => {
    it('reports progress for large exports', async () => {
      // Create many test maps
      const largeBatch = Array.from({ length: 100 }, (_, i) => ({
        name: `Map ${i + 1}`,
        data: { nodes: [{ id: i + 1, label: `Node ${i + 1}` }] }
      }));
      await testEnv.createTestMaps(largeBatch);

      const progressUpdates = [];

      const result = await dataExport.exportData({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toHaveProperty(
        'completed',
        102
      );
      expect(result.maps).toHaveLength(102);
    });

    it('includes timing information in progress updates', async () => {
      const progressUpdates = [];

      await dataExport.exportData({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      progressUpdates.forEach(update => {
        expect(update).toHaveProperty('elapsed');
        expect(update).toHaveProperty('estimated_total');
      });
    });
  });

  describe('error handling', () => {
    it('handles database connection errors gracefully', async () => {
      // Simulate database error
      jest
        .spyOn(testEnv.db, 'all')
        .mockRejectedValueOnce(new Error('Database connection lost'));

      await expect(dataExport.exportData()).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('provides helpful error message for invalid output path', async () => {
      const invalidPath = '/nonexistent/directory/export.json';

      await expect(
        dataExport.exportToFile({ output: invalidPath })
      ).rejects.toThrow('Unable to write to output path');
    });

    it('handles invalid filter criteria', async () => {
      await expect(
        dataExport.exportData({
          filter: {
            dateFrom: 'invalid-date'
          }
        })
      ).rejects.toThrow('Invalid date format in filter');
    });
  });

  describe('output formatting', () => {
    it('formats output as table when requested', async () => {
      const output = await dataExport.generateOutput('table', {
        maps: [{ id: '1', name: 'Test', created_at: new Date().toISOString() }],
        export_info: { total_maps: 1, format: 'json' }
      });

      expect(output).toContain('Export Summary');
      expect(output).toContain('Total Maps:');
      expect(output).toContain('Format:');
    });

    it('formats output as JSON when requested', async () => {
      const data = {
        maps: [{ id: '1', name: 'Test' }],
        export_info: { total_maps: 1 }
      };

      const output = await dataExport.generateOutput('json', data);

      const parsed = JSON.parse(output);
      expect(parsed).toEqual(data);
    });

    it('includes export statistics in summary', async () => {
      const result = await dataExport.exportData();
      const output = await dataExport.generateOutput('table', result);

      expect(output).toContain('Export completed');
      expect(output).toContain('Total Maps: 2');
      expect(output).toMatch(/Exported in: \d+ms/);
    });
  });

  describe('integration', () => {
    it('works with real database queries', async () => {
      const result = await dataExport.exportData();

      // Verify we get real data from the test database
      expect(result.maps).toHaveLength(2);
      expect(result.maps[0]).toHaveProperty('name', 'Test Map 1');
      expect(result.maps[1]).toHaveProperty('name', 'Test Map 2');
    });

    it('maintains data consistency across multiple exports', async () => {
      const export1 = await dataExport.exportData();
      const export2 = await dataExport.exportData();

      expect(export1.maps).toHaveLength(export2.maps.length);

      // Maps should have same IDs and content
      export1.maps.forEach((map, index) => {
        expect(map.id).toBe(export2.maps[index].id);
        expect(map.name).toBe(export2.maps[index].name);
      });
    });
  });
});
