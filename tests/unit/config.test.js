const { buildConfig } = require('../../src/config/config');

describe('config', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment variables
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('default values', () => {
    it('sets correct defaults for all config values', () => {
      // Clear relevant env vars to test defaults
      delete process.env.PORT;
      delete process.env.CORS_ORIGIN;
      delete process.env.JSON_LIMIT;
      delete process.env.NODE_ENV;
      delete process.env.DATA_PROVIDER;
      delete process.env.SERVER_SYNC;

      const config = buildConfig();

      expect(config.port).toBe(3001);
      expect(config.corsOrigin).toBe('http://localhost:8080');
      expect(config.jsonLimit).toBe('50mb');
      expect(config.nodeEnv).toBe('development');
      expect(config.dataProvider).toBe('json');
      expect(config.serverSync).toBe('off');
    });
  });

  describe('Yjs feature flags (MS-60)', () => {
    it('defaults DATA_PROVIDER to json', () => {
      delete process.env.DATA_PROVIDER;
      const config = buildConfig();
      expect(config.dataProvider).toBe('json');
    });

    it('defaults SERVER_SYNC to off', () => {
      delete process.env.SERVER_SYNC;
      const config = buildConfig();
      expect(config.serverSync).toBe('off');
    });

    it('accepts yjs as DATA_PROVIDER value', () => {
      process.env.DATA_PROVIDER = 'yjs';
      const config = buildConfig();
      expect(config.dataProvider).toBe('yjs');
    });

    it('accepts on as SERVER_SYNC value', () => {
      process.env.SERVER_SYNC = 'on';
      const config = buildConfig();
      expect(config.serverSync).toBe('on');
    });

    it('rejects invalid DATA_PROVIDER values', () => {
      process.env.DATA_PROVIDER = 'invalid';
      expect(() => buildConfig()).toThrow();
    });

    it('rejects invalid SERVER_SYNC values', () => {
      process.env.SERVER_SYNC = 'invalid';
      expect(() => buildConfig()).toThrow();
    });

    describe('feature flag combinations', () => {
      it('supports json provider with sync off (default)', () => {
        process.env.DATA_PROVIDER = 'json';
        process.env.SERVER_SYNC = 'off';
        const config = buildConfig();
        expect(config.dataProvider).toBe('json');
        expect(config.serverSync).toBe('off');
      });

      it('supports yjs provider with sync on', () => {
        process.env.DATA_PROVIDER = 'yjs';
        process.env.SERVER_SYNC = 'on';
        const config = buildConfig();
        expect(config.dataProvider).toBe('yjs');
        expect(config.serverSync).toBe('on');
      });

      it('supports yjs provider with sync off (offline-first only)', () => {
        process.env.DATA_PROVIDER = 'yjs';
        process.env.SERVER_SYNC = 'off';
        const config = buildConfig();
        expect(config.dataProvider).toBe('yjs');
        expect(config.serverSync).toBe('off');
      });
    });
  });

  describe('existing functionality', () => {
    it('handles FEATURE_MAPS_API correctly', () => {
      process.env.FEATURE_MAPS_API = '1';
      const config = buildConfig();
      expect(config.featureMapsApi).toBe(true);

      process.env.FEATURE_MAPS_API = '0';
      const config2 = buildConfig();
      expect(config2.featureMapsApi).toBe(false);
    });

    it('handles FEATURE_MCP correctly', () => {
      process.env.FEATURE_MCP = '1';
      const config = buildConfig();
      expect(config.featureMcp).toBe(true);

      process.env.FEATURE_MCP = 'false';
      const config2 = buildConfig();
      expect(config2.featureMcp).toBe(false);
    });
  });
});
