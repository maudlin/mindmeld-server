#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const { v4: uuidv4 } = require('uuid');

// Import database utilities
const Database = require('better-sqlite3');

class DataImport {
  constructor(options = {}) {
    this.config = {
      dbPath:
        process.env.SQLITE_FILE ||
        path.join(process.cwd(), 'data', 'mindmeld.sqlite'),
      ...options
    };
  }

  async validateImportFile(importData) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      total_maps: 0
    };

    // Check basic structure
    if (!importData.maps || !Array.isArray(importData.maps)) {
      validation.valid = false;
      validation.errors.push('maps must be an array');
      return validation;
    }

    validation.total_maps = importData.maps.length;

    // Validate each map
    for (let i = 0; i < importData.maps.length; i++) {
      const map = importData.maps[i];

      // Check required fields
      const requiredFields = ['id', 'name', 'data'];
      for (const field of requiredFields) {
        if (!map[field]) {
          validation.valid = false;
          validation.errors.push(
            `Map at index ${i} missing required field: ${field}`
          );
        }
      }

      // Validate data structure
      if (map.data && typeof map.data === 'string') {
        try {
          JSON.parse(map.data);
        } catch (error) {
          validation.valid = false;
          validation.errors.push(
            `Map at index ${i} has invalid data structure`
          );
        }
      } else if (map.data && typeof map.data === 'object') {
        // Data is already parsed - convert to string for storage
        importData.maps[i].data = JSON.stringify(map.data);
      } else if (map.data) {
        validation.valid = false;
        validation.errors.push(`Map at index ${i} has invalid data structure`);
      }

      // Validate timestamps
      if (map.created_at && !this.isValidDate(map.created_at)) {
        validation.valid = false;
        validation.errors.push(
          `Map at index ${i} has invalid created_at timestamp`
        );
      }

      if (map.updated_at && !this.isValidDate(map.updated_at)) {
        validation.valid = false;
        validation.errors.push(
          `Map at index ${i} has invalid updated_at timestamp`
        );
      }
    }

    return validation;
  }

  async analyzeImport(importData) {
    const analysis = {
      total_maps: importData.maps.length,
      conflicts: [],
      new_maps: [],
      warnings: []
    };

    const db = new Database(this.config.dbPath, { readonly: true });

    try {
      // Get existing map IDs
      const existingIds = new Set(
        db
          .prepare('SELECT id FROM maps')
          .all()
          .map(row => row.id)
      );

      for (const map of importData.maps) {
        if (existingIds.has(map.id)) {
          analysis.conflicts.push({
            id: map.id,
            name: map.name,
            type: 'id_conflict'
          });
        } else {
          analysis.new_maps.push({
            id: map.id,
            name: map.name
          });
        }
      }
    } finally {
      db.close();
    }

    return analysis;
  }

  async importData(importData, options = {}) {
    const config = {
      conflictResolution: 'skip', // skip, overwrite, merge
      batchSize: 100,
      createBackup: true,
      rollbackOnError: false,
      continueOnError: false,
      dryRun: false,
      onProgress: null,
      ...options
    };

    const startTime = Date.now();
    let backupPath = null;

    const result = {
      success: false,
      imported: 0,
      skipped: 0,
      overwritten: 0,
      merged: 0,
      errors: 0,
      error_details: [],
      conflicts_resolved: [],
      total_execution_time: 0,
      dry_run: config.dryRun
    };

    try {
      // Validate import data first
      const validation = await this.validateImportFile(importData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      if (config.dryRun) {
        result.validation = validation;
        const analysis = await this.analyzeImport(importData);
        result.conflicts = analysis.conflicts;
        result.would_import = analysis.new_maps.length;
        result.would_skip = analysis.conflicts.length;
        return result;
      }

      // Create backup if requested
      if (config.createBackup) {
        backupPath = await this.createBackup();
        result.backup_created = true;
        result.backup_path = backupPath;
      } else {
        result.backup_created = false;
      }

      // Open database for writing
      const db = new Database(this.config.dbPath);

      try {
        db.exec('BEGIN TRANSACTION');

        // Process maps in batches
        const maps = importData.maps;
        const batchCount = Math.ceil(maps.length / config.batchSize);

        for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
          const startIdx = batchIndex * config.batchSize;
          const endIdx = Math.min(startIdx + config.batchSize, maps.length);
          const batch = maps.slice(startIdx, endIdx);

          for (const map of batch) {
            try {
              const imported = await this.importSingleMap(db, map, config);

              if (imported.action === 'imported') result.imported++;
              else if (imported.action === 'skipped') result.skipped++;
              else if (imported.action === 'overwritten') result.overwritten++;
              else if (imported.action === 'merged') result.merged++;

              if (imported.conflict) {
                result.conflicts_resolved.push(imported.conflict);
              }
            } catch (error) {
              result.errors++;
              result.error_details.push({
                map_id: map.id,
                map_name: map.name,
                error: error.message
              });

              if (!config.continueOnError) {
                throw error;
              }
            }
          }

          // Report progress
          if (config.onProgress) {
            const completed = Math.min(endIdx, maps.length);
            const percent = Math.round((completed / maps.length) * 100);
            const elapsed = Date.now() - startTime;
            const estimatedTotal = elapsed * (maps.length / completed);

            config.onProgress({
              phase: 'importing',
              completed,
              total: maps.length,
              percent,
              elapsed,
              estimated_total: estimatedTotal,
              imported: result.imported,
              skipped: result.skipped,
              errors: result.errors
            });
          }
        }

        db.exec('COMMIT');
        result.success = true;
      } catch (error) {
        db.exec('ROLLBACK');

        if (config.rollbackOnError && backupPath) {
          await this.rollbackFromBackup(backupPath);
        }

        throw error;
      } finally {
        db.close();
      }
    } catch (error) {
      result.success = false;
      result.error_message = error.message;
      throw error;
    }

    result.total_execution_time = Date.now() - startTime;
    return result;
  }

  async importSingleMap(db, map, config) {
    // Check if map already exists
    const existing = db
      .prepare('SELECT id, name, updated_at FROM maps WHERE id = ?')
      .get(map.id);

    if (existing) {
      // Handle conflict based on resolution strategy
      switch (config.conflictResolution) {
        case 'skip':
          return {
            action: 'skipped',
            conflict: { id: map.id, resolution: 'skipped' }
          };

        case 'overwrite':
          const updateStmt = db.prepare(`
            UPDATE maps 
            SET name = ?, data = ?, updated_at = ?, size_bytes = ?
            WHERE id = ?
          `);

          updateStmt.run(
            map.name,
            map.data,
            map.updated_at || new Date().toISOString(),
            this.calculateSize(map.data),
            map.id
          );

          return {
            action: 'overwritten',
            conflict: { id: map.id, resolution: 'overwritten' }
          };

        case 'merge':
          // Simple merge strategy - update timestamp and combine data
          const existingData = JSON.parse(
            db.prepare('SELECT data FROM maps WHERE id = ?').get(map.id).data
          );
          const newData = JSON.parse(map.data);

          const mergedData = this.mergeMapData(existingData, newData);

          const mergeStmt = db.prepare(`
            UPDATE maps 
            SET name = ?, data = ?, updated_at = ?, size_bytes = ?
            WHERE id = ?
          `);

          mergeStmt.run(
            map.name,
            JSON.stringify(mergedData),
            new Date().toISOString(),
            this.calculateSize(JSON.stringify(mergedData)),
            map.id
          );

          return {
            action: 'merged',
            conflict: { id: map.id, resolution: 'merged' }
          };

        default:
          throw new Error(
            `Unknown conflict resolution strategy: ${config.conflictResolution}`
          );
      }
    } else {
      // Insert new map
      const insertStmt = db.prepare(`
        INSERT INTO maps (id, name, data, created_at, updated_at, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        map.id,
        map.name,
        map.data,
        map.created_at || new Date().toISOString(),
        map.updated_at || new Date().toISOString(),
        this.calculateSize(map.data)
      );

      return { action: 'imported' };
    }
  }

  async importFromFile(filePath, options = {}) {
    try {
      // Check if file exists
      await fs.access(filePath);

      let fileContent;
      const isCompressed = filePath.endsWith('.gz');

      if (isCompressed) {
        const compressedData = await fs.readFile(filePath);
        fileContent = await gunzip(compressedData);
        fileContent = fileContent.toString('utf8');
      } else {
        fileContent = await fs.readFile(filePath, 'utf8');
      }

      const importData = JSON.parse(fileContent);

      const result = await this.importData(importData, options);
      result.source_file = filePath;
      result.compressed = isCompressed;

      return result;
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Import file not found');
      }
      if (error.code === 'EACCES') {
        throw new Error('Permission denied reading import file');
      }
      throw error;
    }
  }

  async createBackup() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .split('.')[0];

    const backupPath = `pre-import-${timestamp}.sqlite`;

    // Copy database file
    await fs.copyFile(this.config.dbPath, backupPath);

    return backupPath;
  }

  async rollbackFromBackup(backupPath) {
    try {
      await fs.copyFile(backupPath, this.config.dbPath);
      return true;
    } catch (error) {
      throw new Error(`Rollback failed: ${error.message}`);
    }
  }

  mergeMapData(existing, incoming) {
    // Simple merge strategy - combine nodes and connections
    const merged = { ...existing };

    if (incoming.nodes) {
      merged.nodes = merged.nodes || [];
      // Add new nodes, update existing ones by ID
      const existingNodeIds = new Set(merged.nodes.map(n => n.id));

      for (const node of incoming.nodes) {
        if (!existingNodeIds.has(node.id)) {
          merged.nodes.push(node);
        } else {
          // Update existing node
          const index = merged.nodes.findIndex(n => n.id === node.id);
          merged.nodes[index] = { ...merged.nodes[index], ...node };
        }
      }
    }

    if (incoming.connections) {
      merged.connections = merged.connections || [];
      // Add new connections
      merged.connections.push(...incoming.connections);
    }

    // Merge other properties
    Object.keys(incoming).forEach(key => {
      if (!['nodes', 'connections'].includes(key)) {
        merged[key] = incoming[key];
      }
    });

    return merged;
  }

  calculateSize(data) {
    return Buffer.byteLength(data, 'utf8');
  }

  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  async generateOutput(format, data) {
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // Table format
    const lines = [];

    if (data.dry_run) {
      lines.push('Import Analysis (Dry Run)');
      lines.push('=========================');
      lines.push(
        `Total Maps in Import: ${data.total_maps || data.validation?.total_maps}`
      );
      lines.push(`Would Import: ${data.would_import || 0}`);
      lines.push(`Would Skip: ${data.would_skip || 0}`);

      if (data.conflicts && data.conflicts.length > 0) {
        lines.push('');
        lines.push('Conflicts Detected:');
        data.conflicts.forEach(conflict => {
          lines.push(`  - ${conflict.id}: ${conflict.name} (${conflict.type})`);
        });
      }
    } else {
      lines.push('Import Results');
      lines.push('==============');
      lines.push(`Imported: ${data.imported || 0}`);
      lines.push(`Skipped: ${data.skipped || 0}`);
      lines.push(`Overwritten: ${data.overwritten || 0}`);
      lines.push(`Merged: ${data.merged || 0}`);
      lines.push(`Errors: ${data.errors || 0}`);

      if (data.backup_created) {
        lines.push(`Backup: ${data.backup_path}`);
      }

      if (data.total_execution_time) {
        lines.push(`Duration: ${data.total_execution_time}ms`);
      }

      if (data.error_details && data.error_details.length > 0) {
        lines.push('');
        lines.push('Errors:');
        data.error_details.forEach(error => {
          lines.push(`  - ${error.map_name} (${error.map_id}): ${error.error}`);
        });
      }
    }

    return lines.join('\n');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let filePath = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--file':
        filePath = args[++i];
        break;
      case '--conflict':
        options.conflictResolution = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-backup':
        options.createBackup = false;
        break;
      case '--continue-on-error':
        options.continueOnError = true;
        break;
      case '--rollback-on-error':
        options.rollbackOnError = true;
        break;
      case '--help':
        console.log(`
MindMeld Data Import Tool

Usage: node data-import.js [options]

Options:
  --file <path>               Import file path
  --conflict <strategy>       Conflict resolution (skip, overwrite, merge)
  --batch-size <number>       Number of records per batch (default: 100)
  --dry-run                   Preview import without making changes
  --no-backup                 Skip creating backup before import
  --continue-on-error         Continue import even if some records fail
  --rollback-on-error        Rollback all changes if any error occurs
  --help                      Show this help

Examples:
  node data-import.js --file backup.json
  node data-import.js --file backup.json --conflict overwrite
  node data-import.js --file backup.json --dry-run
`);
        return;
    }
  }

  if (!filePath) {
    console.error('Error: --file parameter is required');
    process.exit(1);
  }

  try {
    const importer = new DataImport();

    // Add progress reporting
    options.onProgress = progress => {
      if (progress.phase === 'importing') {
        process.stdout.write(
          `\rImporting: ${progress.completed}/${progress.total} (${progress.percent}%) - ${progress.imported} imported, ${progress.skipped} skipped, ${progress.errors} errors`
        );
      }
    };

    const result = await importer.importFromFile(filePath, options);

    // Clear progress line
    if (!options.dryRun) {
      process.stdout.write('\n');
    }

    const output = await importer.generateOutput('table', result);
    console.log(output);

    if (!result.success && !result.dry_run) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\nImport failed:', error.message);
    process.exit(1);
  }
}

// Export for testing
module.exports = DataImport;

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
