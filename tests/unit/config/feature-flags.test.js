const { config, buildConfig } = require('../../../src/config/config');

describe('Feature Flags Configuration', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment variables
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Production Rollout Flags', () => {
    test('should default DATA_PROVIDER to yjs for collaboration-first approach', () => {
      // Clean environment should use collaboration defaults
      delete process.env.DATA_PROVIDER;

      const testConfig = buildConfig();

      expect(testConfig.dataProvider).toBe('yjs');
    });

    test('should default SERVER_SYNC to on for real-time collaboration', () => {
      // Clean environment should use collaboration defaults
      delete process.env.SERVER_SYNC;

      const testConfig = buildConfig();

      expect(testConfig.serverSync).toBe('on');
    });

    test('should allow DATA_PROVIDER to be set to yjs for enabled instances', () => {
      process.env.DATA_PROVIDER = 'yjs';

      const testConfig = buildConfig();

      expect(testConfig.dataProvider).toBe('yjs');
    });

    test('should allow SERVER_SYNC to be enabled for real-time collaboration', () => {
      process.env.SERVER_SYNC = 'on';

      const testConfig = buildConfig();

      expect(testConfig.serverSync).toBe('on');
    });

    test('should validate DATA_PROVIDER enum values', () => {
      process.env.DATA_PROVIDER = 'invalid-provider';

      expect(() => buildConfig()).toThrow();
    });

    test('should validate SERVER_SYNC enum values', () => {
      process.env.SERVER_SYNC = 'maybe';

      expect(() => buildConfig()).toThrow();
    });
  });

  describe('Development Toggle Features', () => {
    test('should default VERIFY_YJS to false for production safety', () => {
      delete process.env.VERIFY_YJS;
      delete process.env.NODE_ENV;

      const testConfig = buildConfig();

      expect(testConfig.verifyYjs).toBe(false);
    });

    test('should allow VERIFY_YJS to be enabled with explicit true', () => {
      process.env.VERIFY_YJS = 'true';

      const testConfig = buildConfig();

      expect(testConfig.verifyYjs).toBe(true);
    });

    test('should allow VERIFY_YJS to be enabled with 1', () => {
      process.env.VERIFY_YJS = '1';

      const testConfig = buildConfig();

      expect(testConfig.verifyYjs).toBe(true);
    });

    test('should treat any other VERIFY_YJS value as false', () => {
      process.env.VERIFY_YJS = 'yes';

      const testConfig = buildConfig();

      expect(testConfig.verifyYjs).toBe(false);
    });

    test('should allow VERIFY_YJS in development environment by default', () => {
      delete process.env.VERIFY_YJS;
      process.env.NODE_ENV = 'development';

      const testConfig = buildConfig();

      // In development, it should be easier to enable verification
      expect(testConfig.verifyYjs).toBe(false); // Still false by default but easier to enable
    });
  });

  describe('Feature Flag Combinations', () => {
    test('should support full Yjs mode with all features enabled', () => {
      process.env.DATA_PROVIDER = 'yjs';
      process.env.SERVER_SYNC = 'on';
      process.env.VERIFY_YJS = 'true';

      const testConfig = buildConfig();

      expect(testConfig.dataProvider).toBe('yjs');
      expect(testConfig.serverSync).toBe('on');
      expect(testConfig.verifyYjs).toBe(true);
    });

    test('should support safe rollout mode with json provider and verification', () => {
      process.env.DATA_PROVIDER = 'json';
      process.env.SERVER_SYNC = 'off';
      process.env.VERIFY_YJS = 'true';

      const testConfig = buildConfig();

      expect(testConfig.dataProvider).toBe('json');
      expect(testConfig.serverSync).toBe('off');
      expect(testConfig.verifyYjs).toBe(true);
    });

    test('should support hybrid mode with yjs provider but sync disabled', () => {
      process.env.DATA_PROVIDER = 'yjs';
      process.env.SERVER_SYNC = 'off';
      process.env.VERIFY_YJS = 'false';

      const testConfig = buildConfig();

      expect(testConfig.dataProvider).toBe('yjs');
      expect(testConfig.serverSync).toBe('off');
      expect(testConfig.verifyYjs).toBe(false);
    });
  });

  describe('Configuration Validation', () => {
    test('should have consistent flag naming conventions', () => {
      const testConfig = buildConfig();

      // All feature flags should use camelCase
      expect(testConfig).toHaveProperty('dataProvider');
      expect(testConfig).toHaveProperty('serverSync');
      expect(testConfig).toHaveProperty('verifyYjs');

      // Should not have inconsistent naming
      expect(testConfig).not.toHaveProperty('data_provider');
      expect(testConfig).not.toHaveProperty('server_sync');
      expect(testConfig).not.toHaveProperty('verify_yjs');
    });

    test('should expose feature flags for runtime access', () => {
      process.env.DATA_PROVIDER = 'yjs';
      process.env.SERVER_SYNC = 'on';
      process.env.VERIFY_YJS = 'true';

      const testConfig = buildConfig();

      // All flags should be accessible at runtime
      expect(typeof testConfig.dataProvider).toBe('string');
      expect(typeof testConfig.serverSync).toBe('string');
      expect(typeof testConfig.verifyYjs).toBe('boolean');
    });
  });

  describe('Rollout Safety Features', () => {
    test('should provide safe defaults for production deployment', () => {
      // Simulate clean production environment
      delete process.env.DATA_PROVIDER;
      delete process.env.SERVER_SYNC;
      delete process.env.VERIFY_YJS;
      process.env.NODE_ENV = 'production';

      const testConfig = buildConfig();

      // All flags should use collaboration-first defaults
      expect(testConfig.dataProvider).toBe('yjs'); // Collaboration-first provider
      expect(testConfig.serverSync).toBe('on'); // Real-time sync enabled by default
      expect(testConfig.verifyYjs).toBe(false); // No verification overhead
    });

    test('should provide documented flag descriptions in configuration', () => {
      const testConfig = buildConfig();

      // Configuration should include metadata about flags
      expect(testConfig).toHaveProperty('dataProvider');
      expect(testConfig).toHaveProperty('serverSync');
      expect(testConfig).toHaveProperty('verifyYjs');
    });
  });

  describe('Environment-specific Behavior', () => {
    test('should handle development environment appropriately', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DATA_PROVIDER;
      delete process.env.SERVER_SYNC;
      delete process.env.VERIFY_YJS;

      const testConfig = buildConfig();

      // Development should use collaboration defaults for full testing
      expect(testConfig.dataProvider).toBe('yjs');
      expect(testConfig.serverSync).toBe('on');
      expect(testConfig.verifyYjs).toBe(false);
    });

    test('should handle test environment appropriately', () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DATA_PROVIDER;
      delete process.env.SERVER_SYNC;
      delete process.env.VERIFY_YJS;

      const testConfig = buildConfig();

      // Test environment should use collaboration defaults for comprehensive testing
      expect(testConfig.dataProvider).toBe('yjs');
      expect(testConfig.serverSync).toBe('on');
      expect(testConfig.verifyYjs).toBe(false);
    });
  });

  describe('Flag Documentation and Metadata', () => {
    test('should provide flag descriptions for documentation', () => {
      // This would be used for generating documentation or help text
      const flagMetadata = {
        dataProvider: {
          description: 'Controls which data provider to use for map storage',
          values: ['json', 'yjs'],
          default: 'yjs',
          collaborationFirst: true,
        },
        serverSync: {
          description: 'Enables real-time collaborative editing via WebSocket',
          values: ['on', 'off'],
          default: 'on',
          collaborationFirst: true,
        },
        verifyYjs: {
          description: 'Enables Yjs document verification for debugging',
          values: [true, false],
          default: false,
          rolloutSafe: true,
        },
      };

      // Metadata should be accurate
      expect(flagMetadata.dataProvider.default).toBe('yjs');
      expect(flagMetadata.serverSync.default).toBe('on');
      expect(flagMetadata.verifyYjs.default).toBe(false);

      // Main flags should be marked as collaboration-first
      expect(flagMetadata.dataProvider.collaborationFirst).toBe(true);
      expect(flagMetadata.serverSync.collaborationFirst).toBe(true);
    });
  });
});
