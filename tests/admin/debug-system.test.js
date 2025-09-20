const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { DebugSystem } = require('../../scripts/admin/debug-system');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: debug:system', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.teardown();
  });

  describe('system information gathering', () => {
    it('gathers complete system information', async () => {
      const debugSystem = new DebugSystem({
        section: 'all'
      });

      const result = await debugSystem.gatherSystemInfo();

      // Verify main sections
      expect(result).toHaveProperty('node');
      expect(result).toHaveProperty('os');
      expect(result).toHaveProperty('memory');
      expect(result).toHaveProperty('disk');
      expect(result).toHaveProperty('network');
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('environment');
    });

    it('gathers Node.js information', async () => {
      const debugSystem = new DebugSystem({
        section: 'node'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.node).toHaveProperty('version');
      expect(result.node).toHaveProperty('platform');
      expect(result.node).toHaveProperty('architecture');
      expect(result.node).toHaveProperty('execPath');
      expect(result.node).toHaveProperty('flags');
      expect(result.node).toHaveProperty('features');

      // Verify version format
      expect(result.node.version).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it('gathers operating system information', async () => {
      const debugSystem = new DebugSystem({
        section: 'os'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.os).toHaveProperty('platform');
      expect(result.os).toHaveProperty('release');
      expect(result.os).toHaveProperty('type');
      expect(result.os).toHaveProperty('uptime');
      expect(result.os).toHaveProperty('hostname');
      expect(result.os).toHaveProperty('cpus');

      // Verify CPU information
      expect(Array.isArray(result.os.cpus)).toBe(true);
      expect(result.os.cpus.length).toBeGreaterThan(0);
      result.os.cpus.forEach(cpu => {
        expect(cpu).toHaveProperty('model');
        expect(cpu).toHaveProperty('speed');
      });
    });

    it('gathers memory information', async () => {
      const debugSystem = new DebugSystem({
        section: 'memory'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.memory).toHaveProperty('total');
      expect(result.memory).toHaveProperty('free');
      expect(result.memory).toHaveProperty('used');
      expect(result.memory).toHaveProperty('process');

      // Verify process memory
      expect(result.memory.process).toHaveProperty('rss');
      expect(result.memory.process).toHaveProperty('heapTotal');
      expect(result.memory.process).toHaveProperty('heapUsed');
      expect(result.memory.process).toHaveProperty('external');

      // Verify values are positive numbers
      expect(result.memory.total).toBeGreaterThan(0);
      expect(result.memory.free).toBeGreaterThan(0);
      expect(result.memory.process.rss).toBeGreaterThan(0);
    });

    it('gathers disk space information', async () => {
      const debugSystem = new DebugSystem({
        section: 'disk'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.disk).toHaveProperty('drives');
      expect(Array.isArray(result.disk.drives)).toBe(true);

      result.disk.drives.forEach(drive => {
        expect(drive).toHaveProperty('path');
        expect(drive).toHaveProperty('total');
        expect(drive).toHaveProperty('free');
        expect(drive).toHaveProperty('used');
        expect(drive).toHaveProperty('percentUsed');
      });
    });

    it('gathers network configuration', async () => {
      const debugSystem = new DebugSystem({
        section: 'network'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.network).toHaveProperty('interfaces');
      expect(result.network).toHaveProperty('hostname');
      expect(typeof result.network.interfaces).toBe('object');

      // Check network interfaces structure
      Object.values(result.network.interfaces).forEach(interfaceList => {
        expect(Array.isArray(interfaceList)).toBe(true);
        interfaceList.forEach(iface => {
          expect(iface).toHaveProperty('address');
          expect(iface).toHaveProperty('family');
          expect(iface).toHaveProperty('internal');
        });
      });
    });

    it('gathers dependency information', async () => {
      const debugSystem = new DebugSystem({
        section: 'dependencies'
      });

      const result = await debugSystem.gatherSystemInfo();

      expect(result.dependencies).toHaveProperty('production');
      expect(result.dependencies).toHaveProperty('development');
      expect(result.dependencies).toHaveProperty('packageJson');

      expect(typeof result.dependencies.production).toBe('object');
      expect(typeof result.dependencies.development).toBe('object');

      // Verify key dependencies are present
      expect(result.dependencies.production).toHaveProperty('express');
      expect(result.dependencies.production).toHaveProperty('better-sqlite3');
    });
  });

  describe('system requirements validation', () => {
    it('validates system requirements when requested', async () => {
      const debugSystem = new DebugSystem({
        checkRequirements: true
      });

      const result = await debugSystem.validateSystemRequirements();

      expect(result).toHaveProperty('requirements');
      expect(result).toHaveProperty('validation');

      expect(result.validation).toHaveProperty('passed');
      expect(result.validation).toHaveProperty('failed');
      expect(result.validation).toHaveProperty('warnings');

      expect(Array.isArray(result.validation.passed)).toBe(true);
      expect(Array.isArray(result.validation.failed)).toBe(true);
      expect(Array.isArray(result.validation.warnings)).toBe(true);
    });

    it('validates Node.js version requirement', async () => {
      const debugSystem = new DebugSystem({
        checkRequirements: true
      });

      const result = await debugSystem.validateSystemRequirements();

      const nodeValidation =
        result.validation.passed.find(
          v => v.requirement === 'Node.js version'
        ) ||
        result.validation.failed.find(v => v.requirement === 'Node.js version');

      expect(nodeValidation).toBeDefined();
      expect(nodeValidation).toHaveProperty('actual');
      expect(nodeValidation).toHaveProperty('expected');
      expect(nodeValidation.expected).toContain('>=24');
    });

    it('validates available memory', async () => {
      const debugSystem = new DebugSystem({
        checkRequirements: true
      });

      const result = await debugSystem.validateSystemRequirements();

      const memoryValidation =
        result.validation.passed.find(
          v => v.requirement === 'Available memory'
        ) ||
        result.validation.warnings.find(
          v => v.requirement === 'Available memory'
        );

      if (memoryValidation) {
        expect(memoryValidation).toHaveProperty('actual');
        expect(memoryValidation).toHaveProperty('expected');
        expect(memoryValidation.actual).toMatch(/\d+(\.\d+)?\s*(MB|GB)/);
      }
    });

    it('validates disk space', async () => {
      const debugSystem = new DebugSystem({
        checkRequirements: true
      });

      const result = await debugSystem.validateSystemRequirements();

      const diskValidation =
        result.validation.passed.find(v => v.requirement === 'Disk space') ||
        result.validation.warnings.find(v => v.requirement === 'Disk space');

      if (diskValidation) {
        expect(diskValidation).toHaveProperty('actual');
        expect(diskValidation).toHaveProperty('expected');
        expect(diskValidation.actual).toMatch(/\d+(\.\d+)?\s*(MB|GB)/);
      }
    });
  });

  describe('environment analysis', () => {
    it('analyzes environment variables', async () => {
      process.env.TEST_DEBUG_VAR = 'test-value';
      process.env.SECRET_KEY = 'secret-value';

      const debugSystem = new DebugSystem({
        analyzeEnvironment: true
      });

      const result = await debugSystem.analyzeEnvironment();

      expect(result.environment).toHaveProperty('variables');
      expect(result.environment).toHaveProperty('sanitized');
      expect(result.environment).toHaveProperty('analysis');

      // Verify sanitization
      expect(result.environment.sanitized).toHaveProperty(
        'TEST_DEBUG_VAR',
        'test-value'
      );
      expect(result.environment.sanitized.SECRET_KEY).toBe('[REDACTED]');

      // Verify analysis
      expect(result.environment.analysis).toHaveProperty('total');
      expect(result.environment.analysis).toHaveProperty('sensitive');
      expect(result.environment.analysis).toHaveProperty('application');
    });

    it('identifies sensitive environment variables', async () => {
      process.env.API_KEY = 'test-api-key';
      process.env.DATABASE_PASSWORD = 'test-password';
      process.env.PORT = '3001';

      const debugSystem = new DebugSystem({
        analyzeEnvironment: true
      });

      const result = await debugSystem.analyzeEnvironment();

      const sensitiveVars = result.environment.analysis.sensitiveVariables;
      expect(Array.isArray(sensitiveVars)).toBe(true);
      expect(sensitiveVars).toContain('API_KEY');
      expect(sensitiveVars).toContain('DATABASE_PASSWORD');
      expect(sensitiveVars).not.toContain('PORT');
    });

    it('categorizes environment variables', async () => {
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3001';
      process.env.CORS_ORIGIN = 'http://localhost:8080';

      const debugSystem = new DebugSystem({
        analyzeEnvironment: true
      });

      const result = await debugSystem.analyzeEnvironment();

      expect(result.environment.analysis).toHaveProperty('categories');
      expect(result.environment.analysis.categories).toHaveProperty(
        'application'
      );
      expect(result.environment.analysis.categories).toHaveProperty('system');
      expect(result.environment.analysis.categories).toHaveProperty('unknown');

      expect(result.environment.analysis.categories.application).toContain(
        'PORT'
      );
      expect(result.environment.analysis.categories.application).toContain(
        'CORS_ORIGIN'
      );
    });
  });

  describe('performance analysis', () => {
    it('analyzes system performance', async () => {
      const debugSystem = new DebugSystem({
        analyzePerformance: true
      });

      const result = await debugSystem.analyzePerformance();

      expect(result.performance).toHaveProperty('cpu');
      expect(result.performance).toHaveProperty('memory');
      expect(result.performance).toHaveProperty('disk');
      expect(result.performance).toHaveProperty('overall');

      // Verify performance scores
      expect(result.performance.overall).toHaveProperty('score');
      expect(result.performance.overall.score).toBeGreaterThanOrEqual(0);
      expect(result.performance.overall.score).toBeLessThanOrEqual(100);
    });

    it('identifies performance bottlenecks', async () => {
      const debugSystem = new DebugSystem({
        analyzePerformance: true
      });

      const result = await debugSystem.analyzePerformance();

      expect(result.performance).toHaveProperty('bottlenecks');
      expect(Array.isArray(result.performance.bottlenecks)).toBe(true);

      result.performance.bottlenecks.forEach(bottleneck => {
        expect(bottleneck).toHaveProperty('component');
        expect(bottleneck).toHaveProperty('severity');
        expect(bottleneck).toHaveProperty('description');
        expect(bottleneck).toHaveProperty('recommendation');
      });
    });

    it('provides performance recommendations', async () => {
      const debugSystem = new DebugSystem({
        analyzePerformance: true
      });

      const result = await debugSystem.analyzePerformance();

      expect(result.performance).toHaveProperty('recommendations');
      expect(Array.isArray(result.performance.recommendations)).toBe(true);

      result.performance.recommendations.forEach(rec => {
        expect(rec).toHaveProperty('category');
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('action');
        expect(rec).toHaveProperty('impact');
      });
    });
  });

  describe('file export functionality', () => {
    it('exports system information to file when requested', async () => {
      const exportPath = path.join(testEnv.tempDir, 'system-debug.json');

      const debugSystem = new DebugSystem({
        export: exportPath
      });

      const result = await debugSystem.exportSystemInfo();

      expect(result).toHaveProperty('exported', true);
      expect(result).toHaveProperty('path', exportPath);

      // Verify file was created
      const fileExists = await fs
        .access(exportPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file content
      const content = await fs.readFile(exportPath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('node');
      expect(parsed).toHaveProperty('os');
      expect(parsed).toHaveProperty('exportedAt');
    });

    it('exports specific sections only', async () => {
      const exportPath = path.join(testEnv.tempDir, 'node-info.json');

      const debugSystem = new DebugSystem({
        section: 'node',
        export: exportPath
      });

      await debugSystem.exportSystemInfo();

      const content = await fs.readFile(exportPath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('node');
      expect(parsed).not.toHaveProperty('os');
      expect(parsed).not.toHaveProperty('memory');
    });
  });

  describe('output formatting', () => {
    it('generates table format correctly', async () => {
      const debugSystem = new DebugSystem({
        format: 'table'
      });

      const output = await debugSystem.generateOutput();

      expect(output).toContain('System Debug Information');
      expect(output).toContain('Node.js Information');
      expect(output).toContain('Operating System');
      expect(output).toContain('Memory Usage');
      expect(output).toMatch(/Version:\s+v\d+\.\d+\.\d+/);
    });

    it('generates JSON format correctly', async () => {
      const debugSystem = new DebugSystem({
        format: 'json'
      });

      const output = await debugSystem.generateOutput();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('format', 'json');
      expect(parsed).toHaveProperty('node');
      expect(parsed).toHaveProperty('os');
      expect(parsed).toHaveProperty('memory');
      expect(parsed).toHaveProperty('generatedAt');
    });

    it('includes requirements validation in output', async () => {
      const debugSystem = new DebugSystem({
        format: 'table',
        checkRequirements: true
      });

      const output = await debugSystem.generateOutput();

      expect(output).toContain('Requirements Validation');
      expect(output).toMatch(/(✅|❌|⚠️)/); // Status indicators
      expect(output).toContain('Node.js version');
    });
  });

  describe('error handling', () => {
    it('handles missing system information gracefully', async () => {
      // Mock os module to throw errors
      jest.spyOn(os, 'totalmem').mockImplementation(() => {
        throw new Error('System information unavailable');
      });

      const debugSystem = new DebugSystem();
      const result = await debugSystem.gatherSystemInfo();

      // Should handle error gracefully
      expect(result.memory).toHaveProperty('error');
      expect(result.memory.error).toContain('System information unavailable');
    });

    it('validates options', () => {
      expect(() => {
        new DebugSystem({
          format: 'invalid-format'
        });
      }).toThrow('Invalid format option');

      expect(() => {
        new DebugSystem({
          section: 'invalid-section'
        });
      }).toThrow('Invalid section option');
    });

    it('handles file system errors during export', async () => {
      const invalidPath = '/invalid/path/system-debug.json';

      const debugSystem = new DebugSystem({
        export: invalidPath
      });

      const result = await debugSystem.exportSystemInfo();

      expect(result).toHaveProperty('exported', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
    });
  });

  describe('integration', () => {
    it('provides comprehensive system overview', async () => {
      const debugSystem = new DebugSystem({
        section: 'all',
        checkRequirements: true,
        analyzePerformance: true
      });

      const result = await debugSystem.generateSystemOverview();

      expect(result).toHaveProperty('system');
      expect(result).toHaveProperty('validation');
      expect(result).toHaveProperty('performance');
      expect(result).toHaveProperty('recommendations');

      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('works in different environments', async () => {
      const originalEnv = process.env.NODE_ENV;

      // Test in production mode
      process.env.NODE_ENV = 'production';

      const debugSystem = new DebugSystem();
      const result = await debugSystem.gatherSystemInfo();

      expect(result.environment).toHaveProperty('nodeEnv', 'production');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('performance', () => {
    it('gathers system information efficiently', async () => {
      const startTime = Date.now();

      const debugSystem = new DebugSystem({
        section: 'all'
      });
      await debugSystem.gatherSystemInfo();

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});
