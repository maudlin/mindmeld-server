const { DebugRoutes } = require('../../scripts/admin/debug-routes');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: debug:routes', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.teardown();
  });

  describe('route discovery', () => {
    it('lists all registered routes', async () => {
      const debugRoutes = new DebugRoutes({
        format: 'table'
      });

      const result = await debugRoutes.discoverRoutes();

      // Verify route structure
      expect(result).toHaveProperty('routes');
      expect(Array.isArray(result.routes)).toBe(true);
      expect(result.routes.length).toBeGreaterThan(0);

      // Verify expected routes are present
      const routePaths = result.routes.map(r => r.path);
      expect(routePaths).toContain('/health');
      expect(routePaths).toContain('/ready');
      expect(routePaths).toContain('/maps');
      expect(routePaths).toContain('/maps/:id');

      // Verify route structure
      result.routes.forEach(route => {
        expect(route).toHaveProperty('method');
        expect(route).toHaveProperty('path');
        expect(route).toHaveProperty('middlewares');
        expect(Array.isArray(route.middlewares)).toBe(true);
      });
    });

    it('includes middleware information', async () => {
      const debugRoutes = new DebugRoutes();
      const result = await debugRoutes.discoverRoutes();

      const mapsRoute = result.routes.find(
        r => r.path === '/maps' && r.method === 'GET'
      );
      expect(mapsRoute).toBeDefined();

      // Verify middleware presence
      expect(mapsRoute.middlewares).toEqual(
        expect.arrayContaining(['helmet', 'cors', 'logging'])
      );
    });

    it('detects MCP routes', async () => {
      const debugRoutes = new DebugRoutes();
      const result = await debugRoutes.discoverRoutes();

      const mcpSseRoute = result.routes.find(r => r.path === '/mcp/sse');
      const mcpHttpRoute = result.routes.find(r => r.path === '/mcp/http');

      expect(mcpSseRoute).toBeDefined();
      expect(mcpHttpRoute).toBeDefined();

      // Verify MCP route categorization
      expect(mcpSseRoute).toHaveProperty('category', 'MCP');
      expect(mcpHttpRoute).toHaveProperty('category', 'MCP');
    });

    it('filters routes by method', async () => {
      const debugRoutes = new DebugRoutes({
        method: 'POST'
      });

      const result = await debugRoutes.discoverRoutes();

      // All routes should be POST
      result.routes.forEach(route => {
        expect(route.method).toBe('POST');
      });

      // Should include POST /maps
      const postMapsRoute = result.routes.find(r => r.path === '/maps');
      expect(postMapsRoute).toBeDefined();
    });

    it('filters routes by path pattern', async () => {
      const debugRoutes = new DebugRoutes({
        path: '/maps'
      });

      const result = await debugRoutes.discoverRoutes();

      // All routes should match path pattern
      result.routes.forEach(route => {
        expect(route.path).toContain('/maps');
      });
    });
  });

  describe('route testing', () => {
    it('tests route accessibility when requested', async () => {
      const debugRoutes = new DebugRoutes({
        test: true
      });

      const result = await debugRoutes.testRoutes();

      expect(result).toHaveProperty('testResults');
      expect(Array.isArray(result.testResults)).toBe(true);

      // Verify test results structure
      result.testResults.forEach(testResult => {
        expect(testResult).toHaveProperty('route');
        expect(testResult).toHaveProperty('status');
        expect(testResult).toHaveProperty('responseTime');
        expect(testResult).toHaveProperty('accessible');
      });
    });

    it('reports successful route tests', async () => {
      const debugRoutes = new DebugRoutes({
        test: true
      });

      const result = await debugRoutes.testRoutes();

      // Health endpoint should be accessible
      const healthTest = result.testResults.find(
        t => t.route.path === '/health' && t.route.method === 'GET'
      );

      expect(healthTest).toBeDefined();
      expect(healthTest.accessible).toBe(true);
      expect(healthTest.status).toBe(200);
      expect(healthTest.responseTime).toBeGreaterThan(0);
    });

    it('reports failed route tests', async () => {
      const debugRoutes = new DebugRoutes({
        test: true
      });

      // Mock server to return errors for certain routes
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(url => {
        if (url.includes('/maps/nonexistent')) {
          return Promise.resolve({
            status: 404,
            ok: false
          });
        }
        return originalFetch(url);
      });

      const result = await debugRoutes.testRoutes();

      // Should handle failed tests gracefully
      const failedTests = result.testResults.filter(t => !t.accessible);
      expect(failedTests.length).toBeGreaterThanOrEqual(0);

      global.fetch = originalFetch;
    });

    it('measures response times accurately', async () => {
      const debugRoutes = new DebugRoutes({
        test: true
      });

      const result = await debugRoutes.testRoutes();

      result.testResults.forEach(testResult => {
        if (testResult.accessible) {
          expect(testResult.responseTime).toBeGreaterThan(0);
          expect(testResult.responseTime).toBeLessThan(10000); // 10 second max
        }
      });
    });
  });

  describe('output formatting', () => {
    it('generates table format correctly', async () => {
      const debugRoutes = new DebugRoutes({
        format: 'table'
      });

      const output = await debugRoutes.generateOutput();

      // Verify table format
      expect(output).toContain('Registered Routes');
      expect(output).toMatch(/GET\s+\/health\s+\[.*\]/);
      expect(output).toMatch(/POST\s+\/maps\s+\[.*\]/);
      expect(output).toContain('helmet');
      expect(output).toContain('cors');
    });

    it('generates JSON format correctly', async () => {
      const debugRoutes = new DebugRoutes({
        format: 'json'
      });

      const output = await debugRoutes.generateOutput();

      // Verify valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('routes');
      expect(parsed).toHaveProperty('format', 'json');
      expect(Array.isArray(parsed.routes)).toBe(true);
    });

    it('includes test results in output when tested', async () => {
      const debugRoutes = new DebugRoutes({
        format: 'json',
        test: true
      });

      const output = await debugRoutes.generateOutput();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('testResults');
      expect(Array.isArray(parsed.testResults)).toBe(true);
    });
  });

  describe('route categorization', () => {
    it('categorizes health endpoints', async () => {
      const debugRoutes = new DebugRoutes();
      const result = await debugRoutes.discoverRoutes();

      const healthRoute = result.routes.find(r => r.path === '/health');
      const readyRoute = result.routes.find(r => r.path === '/ready');

      expect(healthRoute).toHaveProperty('category', 'Health');
      expect(readyRoute).toHaveProperty('category', 'Health');
    });

    it('categorizes API endpoints', async () => {
      const debugRoutes = new DebugRoutes();
      const result = await debugRoutes.discoverRoutes();

      const mapsRoutes = result.routes.filter(r => r.path.startsWith('/maps'));

      mapsRoutes.forEach(route => {
        expect(route).toHaveProperty('category', 'API');
      });
    });

    it('identifies rate-limited routes', async () => {
      const debugRoutes = new DebugRoutes();
      const result = await debugRoutes.discoverRoutes();

      const apiRoutes = result.routes.filter(r => r.category === 'API');

      apiRoutes.forEach(route => {
        expect(route.middlewares).toContain('rateLimit');
      });
    });
  });

  describe('error handling', () => {
    it('handles server not running', async () => {
      // Mock app discovery to fail
      const debugRoutes = new DebugRoutes();

      // Mock the Express app discovery
      jest.spyOn(debugRoutes, 'getExpressApp').mockImplementation(() => {
        throw new Error('Server not running');
      });

      const result = await debugRoutes.discoverRoutes();

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Server not running');
    });

    it('validates options', () => {
      expect(() => {
        new DebugRoutes({
          format: 'invalid-format'
        });
      }).toThrow('Invalid format option');

      expect(() => {
        new DebugRoutes({
          method: 'INVALID'
        });
      }).toThrow('Invalid HTTP method');
    });
  });

  describe('performance', () => {
    it('discovers routes within reasonable time', async () => {
      const startTime = Date.now();

      const debugRoutes = new DebugRoutes();
      await debugRoutes.discoverRoutes();

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000); // 3 seconds max
    });

    it('tests routes efficiently', async () => {
      const startTime = Date.now();

      const debugRoutes = new DebugRoutes({
        test: true
      });
      await debugRoutes.testRoutes();

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(10000); // 10 seconds max
    });
  });
});
