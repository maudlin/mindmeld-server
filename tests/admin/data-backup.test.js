const path = require('path');
const { promises: fs } = require('fs');
const { AdminTestEnvironment } = require('../helpers/admin-test-environment');

describe('Admin Command: data:backup', () => {
  let testEnv;
  let dataBackup;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();

    // Import the data backup module
    dataBackup = require('../../scripts/admin/data-backup');

    // Create some test data to backup
    await testEnv.createTestMaps([
      { name: 'Backup Test 1', data: { nodes: [{ id: 1, label: 'Node 1' }] } },
      { name: 'Backup Test 2', data: { nodes: [{ id: 2, label: 'Node 2' }] } },
      { name: 'Backup Test 3', data: { nodes: [{ id: 3, label: 'Node 3' }] } }
    ]);
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('backup creation', () => {
    it('creates basic backup with default settings', async () => {
      const result = await dataBackup.createBackup();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('backup_path');
      expect(result).toHaveProperty('size_bytes');
      expect(result).toHaveProperty('maps_count', 3);
      expect(result).toHaveProperty('created_at');

      // Verify backup file exists
      const backupExists = await fs
        .access(result.backup_path)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('creates backup with custom name', async () => {
      const customName = 'my-custom-backup';

      const result = await dataBackup.createBackup({
        name: customName
      });

      expect(result.backup_path).toContain(customName);
      expect(path.basename(result.backup_path, '.sqlite')).toContain(
        customName
      );
    });

    it('creates backup in custom output directory', async () => {
      const customOutput = path.join(testEnv.tempDir, 'custom-backups');
      await fs.mkdir(customOutput, { recursive: true });

      const result = await dataBackup.createBackup({
        output: customOutput
      });

      expect(result.backup_path).toContain(customOutput);

      const backupExists = await fs
        .access(result.backup_path)
        .then(() => true)
        .catch(() => false);
      expect(backupExists).toBe(true);
    });

    it('creates compressed backup when requested', async () => {
      const result = await dataBackup.createBackup({
        compress: true
      });

      expect(result).toHaveProperty('compressed', true);
      expect(result.backup_path).toEndWith('.sqlite.gz');
      expect(result).toHaveProperty('compression_ratio');
      expect(result.compression_ratio).toBeGreaterThan(0);
    });

    it('creates encrypted backup when requested', async () => {
      const result = await dataBackup.createBackup({
        encrypt: true,
        password: 'test-password-123'
      });

      expect(result).toHaveProperty('encrypted', true);
      expect(result).toHaveProperty('encryption_algorithm');
      expect(result.backup_path).toEndWith('.sqlite.enc');
    });

    it('includes metadata in backup', async () => {
      const result = await dataBackup.createBackup();

      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('server_version');
      expect(result.metadata).toHaveProperty('backup_version');
      expect(result.metadata).toHaveProperty('schema_version');
      expect(result.metadata).toHaveProperty('created_at');
      expect(result.metadata).toHaveProperty('total_maps');
    });

    it('validates database integrity before backup', async () => {
      const result = await dataBackup.createBackup({
        validate: true
      });

      expect(result).toHaveProperty('validation');
      expect(result.validation).toHaveProperty('integrity_check', true);
      expect(result.validation).toHaveProperty('corruption_detected', false);
      expect(result.validation).toHaveProperty('validated_records', 3);
    });
  });

  describe('backup restoration', () => {
    let backupPath;

    beforeEach(async () => {
      // Create a backup to restore from
      const backupResult = await dataBackup.createBackup();
      backupPath = backupResult.backup_path;

      // Clear the current data
      await testEnv.clearAllMaps();
    });

    it('restores basic backup', async () => {
      const result = await dataBackup.restoreBackup(backupPath);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('restored_maps', 3);
      expect(result).toHaveProperty('restored_at');

      // Verify data was restored
      const maps = await testEnv.getAllMaps();
      expect(maps).toHaveLength(3);
      expect(maps.map(m => m.name)).toContain('Backup Test 1');
      expect(maps.map(m => m.name)).toContain('Backup Test 2');
      expect(maps.map(m => m.name)).toContain('Backup Test 3');
    });

    it('creates pre-restore backup by default', async () => {
      // Add some current data first
      await testEnv.createTestMaps([
        { name: 'Current Data', data: { nodes: [] } }
      ]);

      const result = await dataBackup.restoreBackup(backupPath);

      expect(result).toHaveProperty('pre_restore_backup_created', true);
      expect(result).toHaveProperty('pre_restore_backup_path');

      const preBackupExists = await fs
        .access(result.pre_restore_backup_path)
        .then(() => true)
        .catch(() => false);
      expect(preBackupExists).toBe(true);
    });

    it('skips pre-restore backup when disabled', async () => {
      const result = await dataBackup.restoreBackup(backupPath, {
        createPreRestoreBackup: false
      });

      expect(result).toHaveProperty('pre_restore_backup_created', false);
    });

    it('validates backup before restoration', async () => {
      const result = await dataBackup.restoreBackup(backupPath, {
        validate: true
      });

      expect(result).toHaveProperty('validation');
      expect(result.validation).toHaveProperty('backup_valid', true);
      expect(result.validation).toHaveProperty('compatible_version', true);
      expect(result.validation).toHaveProperty('integrity_verified', true);
    });

    it('handles compressed backup restoration', async () => {
      // Create compressed backup
      const compressedBackup = await dataBackup.createBackup({
        compress: true
      });

      await testEnv.clearAllMaps();

      const result = await dataBackup.restoreBackup(
        compressedBackup.backup_path
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('decompressed', true);
      expect(result.restored_maps).toBe(3);
    });

    it('handles encrypted backup restoration', async () => {
      const password = 'test-restore-password';

      // Create encrypted backup
      const encryptedBackup = await dataBackup.createBackup({
        encrypt: true,
        password: password
      });

      await testEnv.clearAllMaps();

      const result = await dataBackup.restoreBackup(
        encryptedBackup.backup_path,
        {
          password: password
        }
      );

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('decrypted', true);
      expect(result.restored_maps).toBe(3);
    });

    it('fails gracefully with wrong password', async () => {
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';

      // Create encrypted backup
      const encryptedBackup = await dataBackup.createBackup({
        encrypt: true,
        password: correctPassword
      });

      await expect(
        dataBackup.restoreBackup(encryptedBackup.backup_path, {
          password: wrongPassword
        })
      ).rejects.toThrow('Incorrect password');
    });
  });

  describe('backup management', () => {
    let backupPaths;

    beforeEach(async () => {
      // Create multiple backups for testing
      backupPaths = [];
      for (let i = 0; i < 5; i++) {
        const result = await dataBackup.createBackup({
          name: `test-backup-${i}`
        });
        backupPaths.push(result.backup_path);

        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    it('lists available backups', async () => {
      const result = await dataBackup.listBackups();

      expect(result).toHaveProperty('backups');
      expect(Array.isArray(result.backups)).toBe(true);
      expect(result.backups.length).toBeGreaterThanOrEqual(5);

      result.backups.forEach(backup => {
        expect(backup).toHaveProperty('path');
        expect(backup).toHaveProperty('name');
        expect(backup).toHaveProperty('created_at');
        expect(backup).toHaveProperty('size_bytes');
      });
    });

    it('lists backups sorted by creation date (newest first)', async () => {
      const result = await dataBackup.listBackups({
        sortBy: 'created_at',
        order: 'desc'
      });

      const createdDates = result.backups.map(b => new Date(b.created_at));
      for (let i = 1; i < createdDates.length; i++) {
        expect(createdDates[i - 1]).toBeInstanceOf(Date);
        expect(createdDates[i]).toBeInstanceOf(Date);
        expect(createdDates[i - 1].getTime()).toBeGreaterThanOrEqual(
          createdDates[i].getTime()
        );
      }
    });

    it('filters backups by name pattern', async () => {
      const result = await dataBackup.listBackups({
        filter: 'test-backup-1'
      });

      expect(result.backups).toHaveLength(1);
      expect(result.backups[0].name).toContain('test-backup-1');
    });

    it('cleans up old backups keeping specified count', async () => {
      const result = await dataBackup.cleanupBackups({
        keep: 3
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('deleted_count', 2);
      expect(result).toHaveProperty('kept_count', 3);
      expect(result).toHaveProperty('deleted_backups');
      expect(result.deleted_backups).toHaveLength(2);

      // Verify only 3 backups remain
      const remainingBackups = await dataBackup.listBackups();
      expect(remainingBackups.backups).toHaveLength(3);
    });

    it('cleans up backups older than specified age', async () => {
      // Mock old backup by modifying file timestamps
      const oldBackupPath = backupPaths[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await testEnv.setFileTimestamp(oldBackupPath, yesterday);

      const result = await dataBackup.cleanupBackups({
        maxAge: '12h' // Remove backups older than 12 hours
      });

      expect(result.deleted_count).toBeGreaterThan(0);
      expect(
        result.deleted_backups.some(b =>
          b.includes(path.basename(oldBackupPath))
        )
      ).toBe(true);
    });

    it('validates backup integrity during listing', async () => {
      const result = await dataBackup.listBackups({
        validate: true
      });

      result.backups.forEach(backup => {
        expect(backup).toHaveProperty('integrity_status');
        expect(['valid', 'corrupted', 'unknown']).toContain(
          backup.integrity_status
        );
      });
    });
  });

  describe('backup verification', () => {
    let testBackupPath;

    beforeEach(async () => {
      const backupResult = await dataBackup.createBackup();
      testBackupPath = backupResult.backup_path;
    });

    it('verifies backup integrity', async () => {
      const result = await dataBackup.verifyBackup(testBackupPath);

      expect(result).toHaveProperty('valid', true);
      expect(result).toHaveProperty('checksum_verified', true);
      expect(result).toHaveProperty('structure_valid', true);
      expect(result).toHaveProperty('compatible_version', true);
      expect(result).toHaveProperty('total_maps', 3);
    });

    it('detects corrupted backup files', async () => {
      // Corrupt the backup file
      await testEnv.corruptFile(testBackupPath);

      const result = await dataBackup.verifyBackup(testBackupPath);

      expect(result).toHaveProperty('valid', false);
      expect(result).toHaveProperty('corruption_detected', true);
      expect(result).toHaveProperty('errors');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates backup metadata', async () => {
      const result = await dataBackup.verifyBackup(testBackupPath, {
        checkMetadata: true
      });

      expect(result).toHaveProperty('metadata_valid', true);
      expect(result).toHaveProperty('metadata');
      expect(result.metadata).toHaveProperty('server_version');
      expect(result.metadata).toHaveProperty('backup_version');
      expect(result.metadata).toHaveProperty('total_maps');
    });

    it('checks version compatibility', async () => {
      const result = await dataBackup.verifyBackup(testBackupPath, {
        checkCompatibility: true
      });

      expect(result).toHaveProperty('compatible_version', true);
      expect(result).toHaveProperty('server_version_match');
      expect(result).toHaveProperty('schema_version_compatible', true);
    });
  });

  describe('progress tracking', () => {
    beforeEach(async () => {
      // Create more test data for progress tracking
      const largeBatch = Array.from({ length: 50 }, (_, i) => ({
        name: `Progress Map ${i}`,
        data: {
          nodes: Array.from({ length: 10 }, (_, j) => ({
            id: j,
            label: `Node ${j}`
          }))
        }
      }));
      await testEnv.createTestMaps(largeBatch);
    });

    it('reports progress during backup creation', async () => {
      const progressUpdates = [];

      const result = await dataBackup.createBackup({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      progressUpdates.forEach(update => {
        expect(update).toHaveProperty('phase');
        expect(update).toHaveProperty('completed');
        expect(update).toHaveProperty('total');
        expect(update).toHaveProperty('percent');
        expect(update).toHaveProperty('elapsed');
      });

      expect(result.success).toBe(true);
    });

    it('reports progress during backup restoration', async () => {
      const backupResult = await dataBackup.createBackup();
      await testEnv.clearAllMaps();

      const progressUpdates = [];

      const result = await dataBackup.restoreBackup(backupResult.backup_path, {
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(result.success).toBe(true);
    });

    it('includes timing estimates in progress updates', async () => {
      const progressUpdates = [];

      await dataBackup.createBackup({
        onProgress: progress => {
          progressUpdates.push(progress);
        }
      });

      const finalUpdate = progressUpdates[progressUpdates.length - 1];
      expect(finalUpdate).toHaveProperty('estimated_total');
      expect(finalUpdate).toHaveProperty('elapsed');
    });
  });

  describe('scheduled backups', () => {
    it('creates backup with retention policy', async () => {
      const result = await dataBackup.createBackup({
        retention: {
          daily: 7, // Keep 7 daily backups
          weekly: 4, // Keep 4 weekly backups
          monthly: 12 // Keep 12 monthly backups
        }
      });

      expect(result).toHaveProperty('retention_applied', true);
      expect(result).toHaveProperty('retention_policy');
      expect(result.retention_policy).toHaveProperty('daily', 7);
      expect(result.retention_policy).toHaveProperty('weekly', 4);
      expect(result.retention_policy).toHaveProperty('monthly', 12);
    });

    it('applies retention policy during backup creation', async () => {
      // Create several backups with timestamps to simulate daily backups
      for (let i = 0; i < 10; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const result = await dataBackup.createBackup({
          name: `daily-backup-${i}`,
          timestamp: date
        });

        // Mock file timestamp to match the date
        await testEnv.setFileTimestamp(result.backup_path, date);
      }

      // Create new backup with retention policy
      const result = await dataBackup.createBackup({
        retention: {
          daily: 5 // Only keep 5 daily backups
        }
      });

      expect(result).toHaveProperty('retention_cleanup');
      expect(result.retention_cleanup).toHaveProperty('removed_count');
      expect(result.retention_cleanup.removed_count).toBe(5); // Should remove 5 old backups
    });

    it('schedules automatic backups', async () => {
      const schedule = {
        enabled: true,
        frequency: 'daily',
        time: '02:00',
        retention: {
          daily: 7,
          weekly: 4
        }
      };

      const result = await dataBackup.scheduleBackups(schedule);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('schedule_id');
      expect(result).toHaveProperty('next_backup');
      expect(result.next_backup).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });
  });

  describe('error handling', () => {
    it('handles insufficient disk space gracefully', async () => {
      // Mock file system to simulate no space left
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(
        Object.assign(new Error('ENOSPC: no space left on device'), {
          code: 'ENOSPC'
        })
      );

      await expect(dataBackup.createBackup()).rejects.toThrow(
        'Insufficient disk space'
      );
    });

    it('handles database lock errors', async () => {
      // Mock database to be locked
      jest.spyOn(testEnv.db, 'all').mockRejectedValueOnce(
        Object.assign(new Error('database is locked'), {
          code: 'SQLITE_BUSY'
        })
      );

      await expect(dataBackup.createBackup()).rejects.toThrow(
        'Database is currently locked'
      );
    });

    it('handles non-existent backup file errors', async () => {
      const nonExistentPath = '/nonexistent/backup.sqlite';

      await expect(dataBackup.restoreBackup(nonExistentPath)).rejects.toThrow(
        'Backup file not found'
      );
    });

    it('handles backup file permission errors', async () => {
      const backupResult = await dataBackup.createBackup();

      // Make backup file unreadable
      await testEnv.makeFileUnreadable(backupResult.backup_path);

      await expect(
        dataBackup.restoreBackup(backupResult.backup_path)
      ).rejects.toThrow('Permission denied');
    });

    it('provides detailed error context', async () => {
      try {
        await dataBackup.createBackup({
          output: '/root/protected-directory' // Should fail on most systems
        });
      } catch (error) {
        expect(error).toHaveProperty('operation', 'backup_creation');
        expect(error).toHaveProperty('context');
        expect(error.context).toHaveProperty('output_path');
      }
    });
  });

  describe('output formatting', () => {
    it('formats backup creation output as table', async () => {
      const result = await dataBackup.createBackup();
      const output = await dataBackup.generateOutput('table', result);

      expect(output).toContain('Backup Creation');
      expect(output).toContain('File:');
      expect(output).toContain('Size:');
      expect(output).toContain('Maps:');
      expect(output).toContain('Duration:');
    });

    it('formats backup listing output as table', async () => {
      await dataBackup.createBackup({ name: 'test-1' });
      await dataBackup.createBackup({ name: 'test-2' });

      const result = await dataBackup.listBackups();
      const output = await dataBackup.generateOutput('table', result);

      expect(output).toContain('Available Backups');
      expect(output).toContain('Name');
      expect(output).toContain('Created');
      expect(output).toContain('Size');
      expect(output).toMatch(/test-1|test-2/);
    });

    it('formats output as JSON when requested', async () => {
      const result = await dataBackup.createBackup();
      const output = await dataBackup.generateOutput('json', result);

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('success', true);
      expect(parsed).toHaveProperty('backup_path');
      expect(parsed).toHaveProperty('maps_count');
    });

    it('includes summary statistics in output', async () => {
      const result = await dataBackup.createBackup();
      const output = await dataBackup.generateOutput('table', result);

      expect(output).toMatch(/Duration: \d+(\.\d+)?s/);
      expect(output).toMatch(/Size: \d+(\.\d+)? [KMGT]?B/);
      expect(output).toContain('Maps: 3');
    });
  });

  describe('integration', () => {
    it('works with real database backup and restore cycle', async () => {
      // Create initial test data
      await testEnv.createTestMaps([
        {
          name: 'Integration Test Map',
          data: {
            nodes: [
              { id: 'node1', label: 'Test Node 1', x: 100, y: 200 },
              { id: 'node2', label: 'Test Node 2', x: 300, y: 400 }
            ],
            connections: [{ from: 'node1', to: 'node2', type: 'arrow' }]
          }
        }
      ]);

      const originalMaps = await testEnv.getAllMaps();
      const originalCount = originalMaps.length;

      // Create backup
      const backupResult = await dataBackup.createBackup();
      expect(backupResult.success).toBe(true);

      // Modify the database
      await testEnv.createTestMaps([
        { name: 'Additional Map', data: { nodes: [] } }
      ]);

      const modifiedCount = await testEnv.getMapCount();
      expect(modifiedCount).toBe(originalCount + 1);

      // Restore from backup
      const restoreResult = await dataBackup.restoreBackup(
        backupResult.backup_path
      );
      expect(restoreResult.success).toBe(true);

      // Verify restoration
      const restoredMaps = await testEnv.getAllMaps();
      expect(restoredMaps).toHaveLength(originalCount);

      const integrationMap = restoredMaps.find(
        m => m.name === 'Integration Test Map'
      );
      expect(integrationMap).toBeDefined();
      expect(JSON.parse(integrationMap.data)).toHaveProperty('nodes');
      expect(JSON.parse(integrationMap.data)).toHaveProperty('connections');
    });

    it('maintains data consistency across compressed backup cycle', async () => {
      const originalMaps = await testEnv.getAllMaps();

      // Create compressed backup
      const backupResult = await dataBackup.createBackup({
        compress: true
      });

      expect(backupResult.compressed).toBe(true);
      expect(backupResult.backup_path).toEndWith('.gz');

      // Clear and restore
      await testEnv.clearAllMaps();

      const restoreResult = await dataBackup.restoreBackup(
        backupResult.backup_path
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.decompressed).toBe(true);

      // Verify data integrity
      const restoredMaps = await testEnv.getAllMaps();
      expect(restoredMaps).toHaveLength(originalMaps.length);

      restoredMaps.forEach((restoredMap, index) => {
        const originalMap = originalMaps[index];
        expect(restoredMap.name).toBe(originalMap.name);
        expect(restoredMap.data).toBe(originalMap.data);
      });
    });

    it('handles backup and restore with active server connections', async () => {
      // Simulate active connections by keeping database transactions open
      const transaction = testEnv.db.prepare('BEGIN');
      transaction.run();

      try {
        const backupResult = await dataBackup.createBackup({
          waitForLocks: true,
          timeout: 5000
        });

        expect(backupResult.success).toBe(true);
        expect(backupResult).toHaveProperty('waited_for_locks', true);
      } finally {
        // Clean up transaction
        const rollback = testEnv.db.prepare('ROLLBACK');
        rollback.run();
      }
    });
  });
});
