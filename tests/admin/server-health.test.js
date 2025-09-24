const fs = require('fs').promises;
const { ServerHealthCheck } = require('../../scripts/admin/server-health');
const { openDatabase } = require('../../src/modules/maps/db');
const { config } = require('../../src/config/config');

// Mock external dependencies
jest.mock('better-sqlite3', () => {
  return jest.fn(() => ({
    prepare: jest.fn(),
    close: jest.fn(),
    pragma: jest.fn(),
    exec: jest.fn(),
  }));
});
jest.mock('../../src/modules/maps/db');

jest.mock('../../src/config/config', () => ({
  config: {
    port: 3000,
    corsOrigin: 'http://localhost:3000',
    sqliteFile: '/test/path/database.db',
    nodeEnv: 'development',
    featureMapsApi: true,
    featureMcp: true,
  },
}));
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    access: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
  constants: {
    R_OK: 4,
    W_OK: 2,
  },
}));

describe('ServerHealthCheck', () => {
  let healthCheck;
  let mockDb;
  let consoleSpy;
  let processExitSpy;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset config to defaults
    Object.assign(config, {
      port: 3000,
      corsOrigin: 'http://localhost:3000',
      sqliteFile: '/test/path/database.db',
      nodeEnv: 'development',
      featureMapsApi: true,
      featureMcp: true,
    });

    // Mock console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };

    // Mock process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Setup mock database
    mockDb = {
      prepare: jest.fn(),
      close: jest.fn(),
    };

    openDatabase.mockReturnValue(mockDb);

    // Setup default options
    healthCheck = new ServerHealthCheck({
      format: 'table',
      timeout: 1000,
      verbose: false,
    });
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const hc = new ServerHealthCheck();

      expect(hc.options.format).toBe('table');
      expect(hc.options.timeout).toBe(30000);
      expect(hc.options.verbose).toBe(false);
    });

    it('should override default options with provided ones', () => {
      const hc = new ServerHealthCheck({
        format: 'json',
        timeout: 5000,
        verbose: true,
      });

      expect(hc.options.format).toBe('json');
      expect(hc.options.timeout).toBe(5000);
      expect(hc.options.verbose).toBe(true);
    });

    it('should initialize results structure', () => {
      expect(healthCheck.results.overall).toBe('UNKNOWN');
      expect(healthCheck.results.checks).toEqual([]);
      expect(healthCheck.results.recommendations).toEqual([]);
      expect(healthCheck.results.metadata.timestamp).toBeDefined();
      expect(healthCheck.results.metadata.duration).toBe(0);
    });
  });

  describe('runHealthCheck', () => {
    it('should complete successfully with all healthy checks', async () => {
      // Mock all checks to pass
      setupHealthyMocks();

      const results = await healthCheck.runHealthCheck();

      expect(results.overall).toBe('HEALTHY');
      expect(results.checks).toHaveLength(8);
      expect(results.metadata.duration).toBeGreaterThan(0);
      expect(results.recommendations).toContain(
        'System is healthy - continue regular monitoring',
      );
    });

    it('should handle failed checks and set overall status to UNHEALTHY', async () => {
      // Mock database connection to fail
      openDatabase.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const results = await healthCheck.runHealthCheck();

      expect(results.overall).toBe('UNHEALTHY');
      const dbCheck = results.checks.find(
        (check) => check.name === 'Database Connection',
      );
      expect(dbCheck.status).toBe('FAILED');
      expect(dbCheck.message).toContain('Database connection failed');
    });

    it('should handle warning conditions and set overall status to WARNING', async () => {
      setupHealthyMocks();

      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        rss: 600 * 1024 * 1024, // 600 MB (above warning threshold)
        heapUsed: 300 * 1024 * 1024,
        heapTotal: 400 * 1024 * 1024,
        external: 50 * 1024 * 1024,
      });

      const results = await healthCheck.runHealthCheck();

      expect(results.overall).toBe('WARNING');
      const memoryCheck = results.checks.find(
        (check) => check.name === 'Memory Usage',
      );
      expect(memoryCheck.status).toBe('WARNING');
      expect(memoryCheck.warning).toContain('Elevated memory usage');

      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle catastrophic failures during execution', async () => {
      // Mock registerHealthChecks to throw
      healthCheck.registerHealthChecks = jest.fn().mockImplementation(() => {
        throw new Error('Critical system error');
      });

      const results = await healthCheck.runHealthCheck();

      expect(results.overall).toBe('CRITICAL');
      expect(results.checks).toHaveLength(1);
      expect(results.checks[0].name).toBe('Health Check Execution');
      expect(results.checks[0].status).toBe('FAILED');
    });

    it('should respect timeout settings for individual checks', async () => {
      healthCheck.options.timeout = 100;

      // Mock a slow check
      healthCheck.checkDatabaseConnection = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 200)),
        );

      const results = await healthCheck.runHealthCheck();

      const dbCheck = results.checks.find(
        (check) => check.name === 'Database Connection',
      );
      expect(dbCheck.status).toBe('FAILED');
      expect(dbCheck.error).toContain('timed out');
    }, 1000);
  });

  describe('individual health checks', () => {
    describe('checkDatabaseConnection', () => {
      it('should pass when database connection works', async () => {
        mockDb.prepare.mockReturnValue({
          get: jest.fn().mockReturnValue({ test: 1 }),
        });

        const result = await healthCheck.checkDatabaseConnection();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('Database connection successful');
        expect(result.details.path).toBe(config.sqliteFile);
        expect(mockDb.close).toHaveBeenCalled();
      });

      it('should fail when database cannot be opened', async () => {
        openDatabase.mockImplementation(() => {
          throw new Error('Cannot open database');
        });

        const result = await healthCheck.checkDatabaseConnection();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Database connection failed');
      });

      it('should fail when database query returns unexpected result', async () => {
        mockDb.prepare.mockReturnValue({
          get: jest.fn().mockReturnValue({ test: 2 }),
        });

        const result = await healthCheck.checkDatabaseConnection();

        expect(result.status).toBe('FAILED');
        expect(result.message).toBe(
          'Database query returned unexpected result',
        );
      });

      it('should fail when database query throws error', async () => {
        mockDb.prepare.mockImplementation(() => {
          throw new Error('SQL error');
        });

        const result = await healthCheck.checkDatabaseConnection();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Database connection failed');
      });
    });

    describe('checkDatabaseIntegrity', () => {
      it('should pass when integrity check returns ok', async () => {
        mockDb.prepare.mockReturnValue({
          get: jest.fn().mockReturnValue({ integrity_check: 'ok' }),
        });

        const result = await healthCheck.checkDatabaseIntegrity();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('Database integrity check passed');
      });

      it('should fail when integrity check returns error', async () => {
        mockDb.prepare.mockReturnValue({
          get: jest
            .fn()
            .mockReturnValue({ integrity_check: 'corruption detected' }),
        });

        const result = await healthCheck.checkDatabaseIntegrity();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Database integrity check failed');
      });

      it('should fail when integrity check throws error', async () => {
        openDatabase.mockImplementation(() => {
          throw new Error('Cannot access database');
        });

        const result = await healthCheck.checkDatabaseIntegrity();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Database integrity check error');
      });
    });

    describe('checkFileSystemAccess', () => {
      it('should pass when all file access checks succeed', async () => {
        fs.access.mockResolvedValue();

        const result = await healthCheck.checkFileSystemAccess();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('File system access verified');
        expect(result.details.checks).toHaveLength(2);
        expect(fs.access).toHaveBeenCalledTimes(2);
      });

      it('should fail when database file access fails', async () => {
        fs.access
          .mockRejectedValueOnce(new Error('Permission denied'))
          .mockResolvedValueOnce();

        const result = await healthCheck.checkFileSystemAccess();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain(
          'File system access failed for Database file',
        );
      });

      it('should fail when data directory access fails', async () => {
        // Clear any previous mocks
        fs.access.mockReset();
        fs.access
          .mockResolvedValueOnce()
          .mockRejectedValueOnce(new Error('Permission denied'));

        const result = await healthCheck.checkFileSystemAccess();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain(
          'File system access failed for Data directory',
        );
      });
    });

    describe('checkMemoryUsage', () => {
      let originalMemoryUsage;

      beforeEach(() => {
        originalMemoryUsage = process.memoryUsage;
      });

      afterEach(() => {
        process.memoryUsage = originalMemoryUsage;
      });

      it('should pass with healthy memory usage', async () => {
        process.memoryUsage = jest.fn().mockReturnValue({
          rss: 100 * 1024 * 1024, // 100 MB
          heapUsed: 50 * 1024 * 1024,
          heapTotal: 75 * 1024 * 1024,
          external: 10 * 1024 * 1024,
        });

        const result = await healthCheck.checkMemoryUsage();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toContain('Memory usage: 100 MB');
        expect(result.warning).toBeNull();
      });

      it('should warn with elevated memory usage', async () => {
        process.memoryUsage = jest.fn().mockReturnValue({
          rss: 600 * 1024 * 1024, // 600 MB (above warning threshold)
          heapUsed: 300 * 1024 * 1024,
          heapTotal: 400 * 1024 * 1024,
          external: 50 * 1024 * 1024,
        });

        const result = await healthCheck.checkMemoryUsage();

        expect(result.status).toBe('WARNING');
        expect(result.warning).toContain('Elevated memory usage');
        expect(result.details.rss).toBe('600 MB');
      });

      it('should warn with critical memory usage', async () => {
        process.memoryUsage = jest.fn().mockReturnValue({
          rss: 1200 * 1024 * 1024, // 1200 MB (above critical threshold)
          heapUsed: 600 * 1024 * 1024,
          heapTotal: 800 * 1024 * 1024,
          external: 100 * 1024 * 1024,
        });

        const result = await healthCheck.checkMemoryUsage();

        expect(result.status).toBe('WARNING');
        expect(result.warning).toContain('High memory usage');
      });
    });

    describe('checkConfiguration', () => {
      it('should pass with valid configuration', async () => {
        const result = await healthCheck.checkConfiguration();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('Configuration validation passed');
        expect(result.details.nodeEnv).toBe('development');
        expect(result.details.port).toBe(3000);
      });

      it('should fail with invalid port', async () => {
        config.port = 0;

        const result = await healthCheck.checkConfiguration();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Invalid configuration: port');
      });

      it('should fail with invalid node environment', async () => {
        config.nodeEnv = 'invalid';

        const result = await healthCheck.checkConfiguration();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Invalid configuration: nodeEnv');
      });

      it('should fail with missing cors origin', async () => {
        config.corsOrigin = '';

        const result = await healthCheck.checkConfiguration();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Invalid configuration: corsOrigin');
      });

      it('should fail with multiple configuration issues', async () => {
        config.port = -1;
        config.sqliteFile = '';
        config.nodeEnv = 'invalid';

        const result = await healthCheck.checkConfiguration();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('port');
        expect(result.message).toContain('sqliteFile');
        expect(result.message).toContain('nodeEnv');
      });
    });

    describe('checkApiEndpoints', () => {
      it('should pass with endpoint configuration check', async () => {
        const result = await healthCheck.checkApiEndpoints();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('API endpoint configuration verified');
        expect(result.details.configuredEndpoints).toContain('/health');
        expect(result.details.configuredEndpoints).toContain('/maps');
      });
    });

    describe('checkDiskSpace', () => {
      it('should pass with adequate disk space', async () => {
        fs.stat.mockResolvedValue({
          size: 10 * 1024 * 1024, // 10 MB database
        });
        fs.writeFile.mockResolvedValue();
        fs.unlink.mockResolvedValue();

        const result = await healthCheck.checkDiskSpace();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toBe('Disk space check passed');
        expect(result.details.databaseSize).toBe('10 MB');
      });

      it('should warn with large database size', async () => {
        fs.stat.mockResolvedValue({
          size: 150 * 1024 * 1024, // 150 MB database
        });
        fs.writeFile.mockResolvedValue();
        fs.unlink.mockResolvedValue();

        const result = await healthCheck.checkDiskSpace();

        expect(result.status).toBe('HEALTHY');
        expect(result.warning).toContain('Large database size');
        expect(result.details.databaseSize).toBe('150 MB');
      });

      it('should warn when write test fails', async () => {
        fs.stat.mockResolvedValue({
          size: 10 * 1024 * 1024,
        });
        fs.writeFile.mockRejectedValue(new Error('No space left'));

        const result = await healthCheck.checkDiskSpace();

        expect(result.status).toBe('WARNING');
        expect(result.message).toBe(
          'Disk space check inconclusive - write test failed',
        );
      });

      it('should fail when file stat fails', async () => {
        fs.stat.mockRejectedValue(new Error('File not found'));

        const result = await healthCheck.checkDiskSpace();

        expect(result.status).toBe('FAILED');
        expect(result.message).toContain('Disk space check error');
      });
    });

    describe('checkProcessHealth', () => {
      let originalUptime;
      let originalVersion;
      let originalPlatform;
      let originalArch;
      let originalPid;

      beforeEach(() => {
        originalUptime = process.uptime;
        originalVersion = process.version;
        originalPlatform = process.platform;
        originalArch = process.arch;
        originalPid = process.pid;
      });

      afterEach(() => {
        process.uptime = originalUptime;
        process.version = originalVersion;
        process.platform = originalPlatform;
        process.arch = originalArch;
        process.pid = originalPid;
      });

      it('should pass with healthy process metrics', async () => {
        const originalUptime = process.uptime;
        process.uptime = jest.fn().mockReturnValue(3661); // 1h 1m 1s

        const result = await healthCheck.checkProcessHealth();

        expect(result.status).toBe('HEALTHY');
        expect(result.message).toContain('Process healthy');
        expect(result.details.uptime).toBe('1h 1m');
        expect(result.details.nodeVersion).toBeDefined();
        expect(result.details.platform).toBeDefined();
        expect(result.details.arch).toBeDefined();
        expect(result.details.pid).toBeDefined();

        process.uptime = originalUptime;
      });

      it('should handle short uptime correctly', async () => {
        process.uptime = jest.fn().mockReturnValue(30); // 30 seconds

        const result = await healthCheck.checkProcessHealth();

        expect(result.status).toBe('HEALTHY');
        expect(result.details.uptime).toBe('0h 0m');
      });
    });
  });

  describe('status calculation and recommendations', () => {
    beforeEach(() => {
      healthCheck.results.checks = [];
    });

    describe('calculateOverallStatus', () => {
      it('should set HEALTHY when all checks are HEALTHY', () => {
        healthCheck.results.checks = [
          { status: 'HEALTHY' },
          { status: 'HEALTHY' },
          { status: 'HEALTHY' },
        ];

        healthCheck.calculateOverallStatus();

        expect(healthCheck.results.overall).toBe('HEALTHY');
      });

      it('should set UNHEALTHY when any check FAILED', () => {
        healthCheck.results.checks = [
          { status: 'HEALTHY' },
          { status: 'FAILED' },
          { status: 'WARNING' },
        ];

        healthCheck.calculateOverallStatus();

        expect(healthCheck.results.overall).toBe('UNHEALTHY');
      });

      it('should set WARNING when some checks have WARNING but none FAILED', () => {
        healthCheck.results.checks = [
          { status: 'HEALTHY' },
          { status: 'WARNING' },
          { status: 'HEALTHY' },
        ];

        healthCheck.calculateOverallStatus();

        expect(healthCheck.results.overall).toBe('WARNING');
      });

      it('should set UNKNOWN for mixed or unknown statuses', () => {
        healthCheck.results.checks = [
          { status: 'HEALTHY' },
          { status: 'UNKNOWN' },
          { status: 'HEALTHY' },
        ];

        healthCheck.calculateOverallStatus();

        expect(healthCheck.results.overall).toBe('UNKNOWN');
      });
    });

    describe('generateRecommendations', () => {
      it('should recommend addressing failed checks', () => {
        healthCheck.results.checks = [
          { status: 'FAILED', name: 'Database Connection' },
        ];

        healthCheck.generateRecommendations();

        expect(healthCheck.results.recommendations).toContain(
          'Address failed health checks immediately',
        );
      });

      it('should recommend reviewing warnings', () => {
        healthCheck.results.checks = [
          { status: 'HEALTHY', warning: 'High memory usage' },
        ];

        healthCheck.generateRecommendations();

        expect(healthCheck.results.recommendations).toContain(
          'Review warning conditions and consider optimization',
        );
      });

      it('should recommend memory monitoring for memory warnings', () => {
        healthCheck.results.checks = [
          { name: 'Memory Usage', status: 'WARNING' },
        ];

        healthCheck.generateRecommendations();

        expect(healthCheck.results.recommendations).toContain(
          'Monitor memory usage and consider process restart if high usage persists',
        );
      });

      it('should recommend database cleanup for disk warnings', () => {
        healthCheck.results.checks = [
          { name: 'Disk Space', status: 'HEALTHY', warning: 'Large database' },
        ];

        healthCheck.generateRecommendations();

        expect(healthCheck.results.recommendations).toContain(
          'Consider database maintenance and cleanup operations',
        );
      });

      it('should provide positive recommendation when healthy', () => {
        healthCheck.results.overall = 'HEALTHY';

        healthCheck.generateRecommendations();

        expect(healthCheck.results.recommendations).toContain(
          'System is healthy - continue regular monitoring',
        );
      });
    });
  });

  describe('output formatting', () => {
    beforeEach(() => {
      healthCheck.results = {
        overall: 'HEALTHY',
        checks: [
          {
            name: 'Database Connection',
            status: 'HEALTHY',
            duration: 45,
            message: 'Connection successful',
          },
          {
            name: 'Memory Usage',
            status: 'WARNING',
            duration: 23,
            message: 'Memory usage normal',
            warning: 'Usage approaching limit',
          },
        ],
        recommendations: ['System is healthy'],
        metadata: { duration: 150 },
      };
    });

    describe('displayResults', () => {
      it('should display table format by default', () => {
        healthCheck.options.format = 'table';

        healthCheck.displayResults();

        expect(consoleSpy.log).toHaveBeenCalledWith(
          'Deep Health Check Results',
        );
        expect(consoleSpy.log).toHaveBeenCalledWith(
          expect.stringContaining('Overall Status:'),
        );
        expect(consoleSpy.log).toHaveBeenCalledWith(
          expect.stringContaining('Database Connection'),
        );
        expect(consoleSpy.log).toHaveBeenCalledWith(
          expect.stringContaining('Total duration: 150ms'),
        );
      });

      it('should display JSON format when requested', () => {
        healthCheck.options.format = 'json';

        healthCheck.displayResults();

        expect(consoleSpy.log).toHaveBeenCalledWith(
          JSON.stringify(healthCheck.results, null, 2),
        );
      });

      it('should show warning messages with appropriate icon', () => {
        healthCheck.options.format = 'table';

        healthCheck.displayResults();

        expect(consoleSpy.log).toHaveBeenCalledWith(
          expect.stringContaining('⚠️  Usage approaching limit'),
        );
      });

      it('should show recommendations section', () => {
        healthCheck.options.format = 'table';

        healthCheck.displayResults();

        expect(consoleSpy.log).toHaveBeenCalledWith('Recommendations:');
        expect(consoleSpy.log).toHaveBeenCalledWith('- System is healthy');
      });
    });

    describe('getStatusIcon', () => {
      it('should return correct icons for each status', () => {
        expect(healthCheck.getStatusIcon('HEALTHY')).toBe('✅');
        expect(healthCheck.getStatusIcon('WARNING')).toBe('⚠️');
        expect(healthCheck.getStatusIcon('UNHEALTHY')).toBe('❌');
        expect(healthCheck.getStatusIcon('FAILED')).toBe('❌');
        expect(healthCheck.getStatusIcon('UNKNOWN')).toBe('❓');
        expect(healthCheck.getStatusIcon('INVALID')).toBe('❓');
      });
    });
  });

  describe('timeout handling', () => {
    it('should timeout individual checks that take too long', async () => {
      healthCheck.options.timeout = 50;

      // Mock a slow check
      healthCheck.checkDatabaseConnection = jest
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 100)),
        );

      // Run only the database check
      healthCheck.checks = [
        {
          name: 'Database Connection',
          fn: healthCheck.checkDatabaseConnection,
        },
      ];

      await healthCheck.executeChecks();

      const dbCheck = healthCheck.results.checks.find(
        (check) => check.name === 'Database Connection',
      );
      expect(dbCheck.status).toBe('FAILED');
      expect(dbCheck.error).toContain('timed out');
    }, 200);

    it('should create appropriate timeout promises', async () => {
      healthCheck.options.timeout = 50;
      const timeoutPromise = healthCheck.createTimeoutPromise('Test Check');

      const startTime = Date.now();
      try {
        await timeoutPromise;
        throw new Error('Should have timed out');
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThan(40);
        expect(error.message).toContain('Test Check');
        expect(error.message).toContain('timed out');
      }
    }, 100);
  });

  describe('error resilience', () => {
    it('should handle errors in individual checks gracefully', async () => {
      setupHealthyMocks();

      // Make one check throw an error
      healthCheck.checkMemoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory check failed');
      });

      const results = await healthCheck.runHealthCheck();

      // Should still complete other checks
      expect(results.checks.length).toBeGreaterThan(0);

      const memoryCheck = results.checks.find(
        (check) => check.name === 'Memory Usage',
      );
      expect(memoryCheck.status).toBe('FAILED');
      expect(memoryCheck.error).toBe('Memory check failed');
    });

    it('should handle missing database gracefully', async () => {
      config.sqliteFile = '/nonexistent/path/database.db';

      const result = await healthCheck.checkDatabaseConnection();

      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('Database connection failed');
    });

    it('should handle configuration errors gracefully', async () => {
      // Make config undefined
      delete config.port;

      const result = await healthCheck.checkConfiguration();

      expect(result.status).toBe('FAILED');
      expect(result.message).toContain('Invalid configuration');
    });
  });

  describe('performance and timing', () => {
    it('should track duration for overall health check', async () => {
      setupHealthyMocks();

      const startTime = Date.now();
      const results = await healthCheck.runHealthCheck();
      const endTime = Date.now();

      expect(results.metadata.duration).toBeGreaterThanOrEqual(0);
      expect(results.metadata.duration).toBeLessThanOrEqual(
        endTime - startTime + 50,
      ); // Allow larger margin
    });

    it('should track duration for individual checks', async () => {
      setupHealthyMocks();

      await healthCheck.runHealthCheck();

      healthCheck.results.checks.forEach((check) => {
        expect(check.duration).toBeGreaterThanOrEqual(0);
        expect(typeof check.duration).toBe('number');
      });
    });

    it('should run checks in parallel for better performance', async () => {
      setupHealthyMocks();

      const startTime = Date.now();
      await healthCheck.runHealthCheck();
      const duration = Date.now() - startTime;

      // With 8 checks, parallel execution should be significantly faster than serial
      // Even with small delays, should complete much faster than 8 * timeout
      expect(duration).toBeLessThan(healthCheck.options.timeout * 8);
    }, 2000);
  });

  // Helper function to setup healthy mocks for all checks
  function setupHealthyMocks() {
    // Database mocks
    mockDb.prepare.mockReturnValue({
      get: jest
        .fn()
        .mockReturnValueOnce({ test: 1 })
        .mockReturnValueOnce({ integrity_check: 'ok' }),
    });

    // File system mocks
    fs.access.mockResolvedValue();
    fs.stat.mockResolvedValue({ size: 10 * 1024 * 1024 });
    fs.writeFile.mockResolvedValue();
    fs.unlink.mockResolvedValue();

    // Process mocks
    const originalMemoryUsage = process.memoryUsage;
    const originalUptime = process.uptime;

    process.memoryUsage = jest.fn().mockReturnValue({
      rss: 100 * 1024 * 1024,
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 75 * 1024 * 1024,
      external: 10 * 1024 * 1024,
    });

    process.uptime = jest.fn().mockReturnValue(3661);

    // Restore after test
    setTimeout(() => {
      process.memoryUsage = originalMemoryUsage;
      process.uptime = originalUptime;
    }, 0);
  }
});
