const fs = require('fs').promises;
const path = require('path');
const { DebugConfig } = require('../../scripts/admin/debug-config');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: debug:config', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.teardown();
  });

  describe('configuration resolution', () => {
    it('shows complete configuration with sources', async () => {
      // Set test environment variables
      process.env.PORT = '3001';
      process.env.CORS_ORIGIN = 'http://localhost:8080';

      const debugConfig = new DebugConfig({
        format: 'table'
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify configuration structure
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('validation');

      // Verify key configurations are present
      expect(result.config).toHaveProperty('PORT');
      expect(result.config).toHaveProperty('CORS_ORIGIN');
      expect(result.config).toHaveProperty('SQLITE_FILE');

      // Verify source tracking
      expect(result.sources.PORT).toBe('environment');
      expect(result.sources.CORS_ORIGIN).toBe('environment');
      expect(result.sources.SQLITE_FILE).toBe('default');
    });

    it('formats output as JSON when requested', async () => {
      const debugConfig = new DebugConfig({
        format: 'json'
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify JSON structure
      expect(typeof result).toBe('object');
      expect(result).toHaveProperty('format', 'json');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('sources');
    });

    it('includes environment variables when requested', async () => {
      process.env.TEST_DEBUG_VAR = 'test-value';
      process.env.SECRET_KEY = 'should-be-sanitized';

      const debugConfig = new DebugConfig({
        showEnv: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify environment variables are included
      expect(result).toHaveProperty('environment');
      expect(result.environment).toHaveProperty('TEST_DEBUG_VAR', 'test-value');

      // Verify sensitive values are sanitized
      expect(result.environment.SECRET_KEY).toBe('[REDACTED]');
    });

    it('validates configuration when requested', async () => {
      // Set invalid configuration
      process.env.PORT = 'invalid-port';
      process.env.CORS_ORIGIN = 'invalid-url';

      const debugConfig = new DebugConfig({
        validate: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify validation results
      expect(result).toHaveProperty('validation');
      expect(result.validation).toHaveProperty('valid', false);
      expect(result.validation).toHaveProperty('errors');
      expect(result.validation.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'PORT',
            message: expect.stringContaining('must be a number')
          }),
          expect.objectContaining({
            field: 'CORS_ORIGIN',
            message: expect.stringContaining('invalid URL')
          })
        ])
      );
    });

    it('shows default values when requested', async () => {
      const debugConfig = new DebugConfig({
        defaults: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify defaults are included
      expect(result).toHaveProperty('defaults');
      expect(result.defaults).toHaveProperty('PORT', 3000);
      expect(result.defaults).toHaveProperty('SQLITE_FILE', './data/db.sqlite');
    });

    it('handles missing configuration gracefully', async () => {
      // Remove database file to test file system checks
      delete process.env.SQLITE_FILE;

      const debugConfig = new DebugConfig({
        validate: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify graceful handling
      expect(result.validation).toHaveProperty('warnings');
      expect(result.validation.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'SQLITE_FILE',
            message: expect.stringContaining('using default')
          })
        ])
      );
    });
  });

  describe('output formatting', () => {
    it('generates table format correctly', async () => {
      const debugConfig = new DebugConfig({
        format: 'table'
      });

      const output = await debugConfig.generateOutput();

      // Verify table format
      expect(output).toContain('Configuration Debug');
      expect(output).toContain('Source Priority: env > config > defaults');
      expect(output).toMatch(/PORT:\s+Value:/);
      expect(output).toMatch(/Source:\s+(environment|default)/);
    });

    it('generates JSON format correctly', async () => {
      const debugConfig = new DebugConfig({
        format: 'json'
      });

      const output = await debugConfig.generateOutput();

      // Verify valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('config');
      expect(parsed).toHaveProperty('sources');
      expect(parsed).toHaveProperty('format', 'json');
    });
  });

  describe('file system validation', () => {
    it('validates database file accessibility', async () => {
      // Create test database
      const testDbPath = path.join(testEnv.tempDir, 'test.sqlite');
      await fs.writeFile(testDbPath, 'test');

      process.env.SQLITE_FILE = testDbPath;

      const debugConfig = new DebugConfig({
        validate: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify file system validation
      expect(result.validation.filesystem).toHaveProperty('SQLITE_FILE');
      expect(result.validation.filesystem.SQLITE_FILE).toMatchObject({
        exists: true,
        readable: true,
        writable: true
      });
    });

    it('detects inaccessible files', async () => {
      const nonExistentPath = path.join(testEnv.tempDir, 'nonexistent.sqlite');
      process.env.SQLITE_FILE = nonExistentPath;

      const debugConfig = new DebugConfig({
        validate: true
      });

      const result = await debugConfig.getConfigurationDebug();

      // Verify file system validation detects issues
      expect(result.validation.filesystem.SQLITE_FILE).toMatchObject({
        exists: false,
        readable: false,
        writable: false
      });
    });
  });

  describe('error handling', () => {
    it('handles corrupted environment gracefully', async () => {
      // Mock process.env to throw error
      const originalEnv = process.env;
      Object.defineProperty(process, 'env', {
        get: () => {
          throw new Error('Environment access error');
        }
      });

      const debugConfig = new DebugConfig();

      const result = await debugConfig.getConfigurationDebug();

      // Should handle error gracefully
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Environment access error');

      // Restore environment
      Object.defineProperty(process, 'env', {
        value: originalEnv
      });
    });

    it('validates required options', () => {
      expect(() => {
        new DebugConfig({
          format: 'invalid-format'
        });
      }).toThrow('Invalid format option');
    });
  });

  describe('performance', () => {
    it('completes configuration debug within reasonable time', async () => {
      const startTime = Date.now();

      const debugConfig = new DebugConfig({
        showEnv: true,
        validate: true,
        defaults: true
      });

      await debugConfig.getConfigurationDebug();

      const duration = Date.now() - startTime;

      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});
