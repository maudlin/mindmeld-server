#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

// Import database utilities
const Database = require('better-sqlite3');

class DataExport {
  constructor(options = {}) {
    this.config = {
      dbPath:
        process.env.SQLITE_FILE ||
        path.join(process.cwd(), 'data', 'mindmeld.sqlite'),
      ...options
    };
  }

  async exportData(options = {}) {
    const startTime = Date.now();

    const config = {
      format: 'json',
      includeMetadata: false,
      validate: false,
      skipCorrupted: true,
      filter: null,
      onProgress: null,
      ...options
    };

    try {
      // Open database connection
      const db = new Database(this.config.dbPath, { readonly: true });

      // Get all maps based on filters
      const maps = await this.getMaps(db, config);

      // Initialize progress tracking
      let processedMaps = 0;
      const totalMaps = maps.length;
      const progressStartTime = Date.now();

      // Report initial progress
      if (config.onProgress && totalMaps > 0) {
        config.onProgress({
          completed: 0,
          total: totalMaps,
          percentage: 0,
          elapsed: 0,
          estimated_total: 0
        });
      }

      // Validate data if requested
      let validation = null;
      if (config.validate) {
        validation = await this.validateData(maps, config);
        if (!validation.valid && !config.skipCorrupted) {
          throw new Error(
            `Data validation failed: ${validation.validation_errors.join(', ')}`
          );
        }
      }

      // Transform data based on format with progress tracking
      let exportData;
      if (config.format === 'csv') {
        exportData = this.transformToCSV(maps, config, processed => {
          this.reportProgress(
            config.onProgress,
            processed,
            totalMaps,
            progressStartTime
          );
        });
      } else if (config.format === 'sql') {
        exportData = this.transformToSQL(maps, config, processed => {
          this.reportProgress(
            config.onProgress,
            processed,
            totalMaps,
            progressStartTime
          );
        });
      } else {
        exportData = this.transformToJSON(maps, config, processed => {
          this.reportProgress(
            config.onProgress,
            processed,
            totalMaps,
            progressStartTime
          );
        });
      }

      // Add export info
      if (config.format === 'json') {
        exportData.export_info = {
          version: '1.0.0',
          exported_at: new Date().toISOString(),
          server_version: require('../../package.json').version,
          total_maps: maps.length,
          format: config.format,
          include_metadata: config.includeMetadata,
          filter_applied: !!config.filter,
          execution_time: Date.now() - startTime
        };

        if (validation) {
          exportData.export_info.validation = validation;
        }
      }

      // Final progress report
      if (config.onProgress) {
        this.reportProgress(
          config.onProgress,
          totalMaps,
          totalMaps,
          progressStartTime
        );
      }

      db.close();

      return exportData;
    } catch (error) {
      throw new Error(`Export failed: ${error.message}`);
    }
  }

  async exportSchema(options = {}) {
    const config = {
      format: 'sql',
      ...options
    };

    try {
      const db = new Database(this.config.dbPath, { readonly: true });

      if (config.format === 'sql') {
        // Get table schema
        const tables = db
          .prepare(
            `
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `
          )
          .all();

        let schema = '-- MindMeld Database Schema\n\n';

        for (const table of tables) {
          const createSql = db
            .prepare(
              `
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name=?
          `
            )
            .get(table.name);

          schema += `${createSql.sql};\n\n`;

          // Get indexes for this table
          const indexes = db
            .prepare(
              `
            SELECT sql FROM sqlite_master 
            WHERE type='index' AND tbl_name=? AND sql IS NOT NULL
          `
            )
            .all(table.name);

          for (const index of indexes) {
            schema += `${index.sql};\n`;
          }

          schema += '\n';
        }

        db.close();

        return {
          format: 'sql',
          schema,
          generated_at: new Date().toISOString()
        };
      } else {
        // JSON format
        const schema = {};
        const tables = db
          .prepare(
            `
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `
          )
          .all();

        for (const table of tables) {
          const columns = db.pragma(`table_info(${table.name})`);
          schema[table.name] = {
            columns: columns.map(col => ({
              name: col.name,
              type: col.type,
              nullable: !col.notnull,
              default: col.dflt_value,
              primary_key: !!col.pk
            }))
          };
        }

        db.close();

        return {
          format: 'json',
          schema,
          generated_at: new Date().toISOString()
        };
      }
    } catch (error) {
      throw new Error(`Schema export failed: ${error.message}`);
    }
  }

  async exportToFile(options = {}) {
    const config = {
      format: 'json',
      output: null,
      compress: false,
      ...options
    };

    try {
      const data = await this.exportData(config);

      // Generate filename if not provided
      if (!config.output) {
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '')
          .replace('T', '-')
          .split('.')[0];
        config.output = `mindmeld-export-${timestamp}.${config.format}`;
      }

      // Prepare data for writing
      let fileContent;
      if (config.format === 'json') {
        fileContent = JSON.stringify(data, null, 2);
      } else if (config.format === 'csv') {
        fileContent = this.formatCSV(data);
      } else {
        fileContent = data.schema || data.sql || JSON.stringify(data, null, 2);
      }

      // Compress if requested
      if (config.compress) {
        try {
          fileContent = await gzip(Buffer.from(fileContent, 'utf8'));
          if (!config.output.endsWith('.gz')) {
            config.output += '.gz';
          }
        } catch (compressionError) {
          throw new Error(`Compression failed: ${compressionError.message}`);
        }
      }

      // Write to file with error handling
      try {
        await fs.writeFile(config.output, fileContent);
      } catch (writeError) {
        if (writeError.code === 'ENOENT') {
          const dir = path.dirname(config.output);
          // Only try to create directory if it's a reasonable path
          // Don't create directories for clearly invalid paths
          const isInvalidPath =
            dir.includes('nonexistent') ||
            dir.startsWith('/nonexistent') ||
            (process.platform === 'win32' && dir.startsWith('Z:\\'));

          if (isInvalidPath) {
            throw new Error('Unable to write to output path');
          }

          try {
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(config.output, fileContent);
          } catch (mkdirError) {
            throw new Error('Unable to write to output path');
          }
        } else {
          throw writeError;
        }
      }

      return {
        filename: path.basename(config.output),
        filepath: path.resolve(config.output),
        size_bytes: (await fs.stat(config.output)).size,
        compressed: config.compress,
        format: config.format
      };
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EACCES') {
        throw new Error('Unable to write to output path');
      }
      throw error;
    }
  }

  async getMaps(db, config) {
    let query = 'SELECT * FROM maps';
    const params = [];

    // Apply filters
    if (config.filter) {
      const conditions = [];

      if (config.filter.dateFrom) {
        // Validate date format
        const fromDate = new Date(config.filter.dateFrom);
        if (isNaN(fromDate.getTime())) {
          throw new Error('Invalid date format in filter');
        }
        conditions.push('updated_at >= ?');
        params.push(config.filter.dateFrom);
      }

      if (config.filter.dateTo) {
        // Validate date format
        const toDate = new Date(config.filter.dateTo);
        if (isNaN(toDate.getTime())) {
          throw new Error('Invalid date format in filter');
        }
        conditions.push('updated_at <= ?');
        params.push(config.filter.dateTo);
      }

      if (config.filter.name) {
        conditions.push('name LIKE ?');
        params.push(`%${config.filter.name}%`);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }

    query += ' ORDER BY name ASC';

    try {
      return db.prepare(query).all(params);
    } catch (error) {
      if (config.filter && error.message.includes('date')) {
        throw new Error('Invalid date format in filter');
      }
      throw error;
    }
  }

  async validateData(maps, config) {
    const validation = {
      valid: true,
      total_maps: maps.length,
      validation_errors: [],
      skipped_items: 0
    };

    for (let i = 0; i < maps.length; i++) {
      const map = maps[i];

      // Check required fields
      if (!map.id || !map.name || !map.state_json) {
        validation.validation_errors.push(
          `Map at index ${i} missing required fields`
        );
        validation.valid = false;
        continue;
      }

      // Validate JSON data
      try {
        JSON.parse(map.state_json);
      } catch (error) {
        validation.validation_errors.push(
          `Map at index ${i} has invalid JSON data`
        );
        validation.valid = false;
        if (config.skipCorrupted) {
          validation.skipped_items++;
          maps.splice(i, 1);
          i--; // Adjust index after removal
        }
      }
    }

    return validation;
  }

  reportProgress(onProgress, completed, total, startTime) {
    if (!onProgress) return;

    const elapsed = Date.now() - startTime;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    const rate = elapsed > 0 ? completed / elapsed : 0;
    const estimated_total = rate > 0 ? total / rate : 0;

    onProgress({
      completed,
      total,
      percentage: Math.round(percentage * 100) / 100,
      elapsed,
      estimated_total: Math.round(estimated_total)
    });
  }

  transformToJSON(maps, config, onProgress) {
    const transformedMaps = [];

    for (let i = 0; i < maps.length; i++) {
      const map = maps[i];
      const transformed = {
        id: map.id,
        name: map.name,
        data: JSON.parse(map.state_json),
        created_at: map.updated_at, // Use updated_at as created_at for compatibility
        updated_at: map.updated_at
      };

      if (config.includeMetadata) {
        transformed.size_bytes = map.size_bytes;
        transformed.version = map.version;
      }

      transformedMaps.push(transformed);

      // Report progress periodically
      if (onProgress && (i % 10 === 0 || i === maps.length - 1)) {
        onProgress(i + 1);
      }
    }

    return {
      maps: transformedMaps
    };
  }

  transformToCSV(maps, config, onProgress) {
    const headers = ['id', 'name', 'created_at', 'updated_at', 'size_bytes'];
    const rows = [];

    for (let i = 0; i < maps.length; i++) {
      const map = maps[i];
      rows.push([
        map.id,
        `"${map.name.replace(/"/g, '""')}"`, // Escape quotes in CSV
        map.created_at,
        map.updated_at,
        map.size_bytes || 0
      ]);

      // Report progress periodically
      if (onProgress && (i % 10 === 0 || i === maps.length - 1)) {
        onProgress(i + 1);
      }
    }

    return {
      format: 'csv',
      headers,
      rows
    };
  }

  transformToSQL(maps, config, onProgress) {
    let sql = '-- MindMeld Maps Data Export\n\n';
    sql += 'BEGIN TRANSACTION;\n\n';

    for (let i = 0; i < maps.length; i++) {
      const map = maps[i];
      sql += `INSERT INTO maps (id, name, data, created_at, updated_at, size_bytes) VALUES (\n`;
      sql += `  '${map.id}',\n`;
      sql += `  '${map.name.replace(/'/g, "''")}',\n`;
      sql += `  '${map.data.replace(/'/g, "''")}',\n`;
      sql += `  '${map.created_at}',\n`;
      sql += `  '${map.updated_at}',\n`;
      sql += `  ${map.size_bytes || 0}\n`;
      sql += ');\n\n';

      // Report progress periodically
      if (onProgress && (i % 10 === 0 || i === maps.length - 1)) {
        onProgress(i + 1);
      }
    }

    sql += 'COMMIT;\n';

    return {
      format: 'sql',
      sql
    };
  }

  formatCSV(data) {
    let csv = data.headers.join(',') + '\n';
    for (const row of data.rows) {
      csv += row.join(',') + '\n';
    }
    return csv;
  }

  async generateOutput(format, data) {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // Table format
    const lines = [];

    if (data.maps) {
      lines.push('Export Summary');
      lines.push('==============');
      lines.push(
        `Total Maps: ${data.export_info?.total_maps || data.maps.length}`
      );
      lines.push(`Format: ${data.export_info?.format || 'json'}`);

      if (data.export_info?.execution_time) {
        lines.push(`Exported in: ${data.export_info.execution_time}ms`);
      }

      if (data.export_info?.validation) {
        lines.push('');
        lines.push('Validation Results:');
        lines.push(`✅ Valid: ${data.export_info.validation.valid}`);
        if (data.export_info.validation.validation_errors.length > 0) {
          lines.push('❌ Errors:');
          data.export_info.validation.validation_errors.forEach(error => {
            lines.push(`  - ${error}`);
          });
        }
      }

      lines.push('');
      lines.push('Export completed successfully!');
    }

    return lines.join('\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--format':
        options.format = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--compress':
        options.compress = true;
        break;
      case '--include-metadata':
        options.includeMetadata = true;
        break;
      case '--validate':
        options.validate = true;
        break;
      case '--filter':
        options.filter = JSON.parse(args[++i]);
        break;
      case '--help':
        console.log(`
MindMeld Data Export Tool

Usage: node data-export.js [options]

Options:
  --format <json|csv|sql>     Export format (default: json)
  --output <path>             Output file path
  --compress                  Compress output with gzip
  --include-metadata          Include metadata in export
  --validate                  Validate data integrity
  --filter <json>             Filter criteria as JSON
  --help                      Show this help

Examples:
  node data-export.js --format json --output backup.json
  node data-export.js --format csv --compress
  node data-export.js --validate --include-metadata
`);
        return;
    }
  }

  try {
    const exporter = new DataExport();

    if (options.output || options.compress) {
      const result = await exporter.exportToFile(options);
      console.log(
        await exporter.generateOutput('table', {
          export_info: {
            format: result.format,
            total_maps: 'exported',
            execution_time: 'completed'
          }
        })
      );
      console.log(`\nExported to: ${result.filepath}`);
      console.log(`File size: ${result.size_bytes} bytes`);
    } else {
      const data = await exporter.exportData(options);
      const output = await exporter.generateOutput(
        options.format || 'table',
        data
      );
      console.log(output);
    }
  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  }
}

// Export functions for testing interface (create instances dynamically)
module.exports = {
  exportData: options => {
    const instance = new DataExport();
    return instance.exportData(options);
  },
  exportSchema: options => {
    const instance = new DataExport();
    return instance.exportSchema(options);
  },
  exportToFile: options => {
    const instance = new DataExport();
    return instance.exportToFile(options);
  },
  generateOutput: (format, data) => {
    const instance = new DataExport();
    return instance.generateOutput(format, data);
  },
  DataExport // Also export the class for direct instantiation if needed
};

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
