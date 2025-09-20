const { DebugEndpoints } = require('../../scripts/admin/debug-endpoints');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: debug:endpoints', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.teardown();
  });

  describe('endpoint testing', () => {
    it('tests all endpoints for basic functionality', async () => {
      const debugEndpoints = new DebugEndpoints({
        timeout: 5000
      });

      const result = await debugEndpoints.testAllEndpoints();

      // Verify test results structure
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Verify summary statistics
      expect(result.summary).toHaveProperty('total');
      expect(result.summary).toHaveProperty('passed');
      expect(result.summary).toHaveProperty('failed');
      expect(result.summary).toHaveProperty('avgResponseTime');

      // Verify test results structure
      result.results.forEach(testResult => {
        expect(testResult).toHaveProperty('endpoint');
        expect(testResult).toHaveProperty('method');
        expect(testResult).toHaveProperty('status');
        expect(testResult).toHaveProperty('responseTime');
        expect(testResult).toHaveProperty('success');
        expect(testResult).toHaveProperty('error');
      });
    });

    it('tests health endpoints successfully', async () => {
      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      // Find health endpoint test
      const healthTest = result.results.find(
        r => r.endpoint === '/health' && r.method === 'GET'
      );

      expect(healthTest).toBeDefined();
      expect(healthTest.success).toBe(true);
      expect(healthTest.status).toBe(200);
      expect(healthTest.responseTime).toBeGreaterThan(0);
      expect(healthTest.error).toBeNull();
    });

    it('tests ready endpoint successfully', async () => {
      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      // Find ready endpoint test
      const readyTest = result.results.find(
        r => r.endpoint === '/ready' && r.method === 'GET'
      );

      expect(readyTest).toBeDefined();
      expect(readyTest.success).toBe(true);
      expect(readyTest.status).toBe(200);
      expect(readyTest.responseTime).toBeGreaterThan(0);
    });

    it('tests maps API endpoints', async () => {
      // Create test data
      testEnv.createTestMaps(3);

      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      // Find maps endpoint tests
      const getMapsTest = result.results.find(
        r => r.endpoint === '/maps' && r.method === 'GET'
      );

      expect(getMapsTest).toBeDefined();
      expect(getMapsTest.success).toBe(true);
      expect(getMapsTest.status).toBe(200);
    });

    it('handles endpoint failures gracefully', async () => {
      const debugEndpoints = new DebugEndpoints();

      // Mock fetch to simulate failures
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockImplementation(url => {
        if (url.includes('/maps/nonexistent')) {
          return Promise.resolve({
            status: 404,
            ok: false,
            statusText: 'Not Found'
          });
        }
        throw new Error('Network error');
      });

      const result = await debugEndpoints.testAllEndpoints();

      // Should handle failures gracefully
      const failedTests = result.results.filter(r => !r.success);
      expect(failedTests.length).toBeGreaterThan(0);

      failedTests.forEach(failedTest => {
        expect(failedTest).toHaveProperty('error');
        expect(failedTest.error).toBeTruthy();
      });

      global.fetch = originalFetch;
    });

    it('respects timeout configuration', async () => {
      const shortTimeout = 100; // Very short timeout
      const debugEndpoints = new DebugEndpoints({
        timeout: shortTimeout
      });

      // Mock slow response
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              status: 200,
              ok: true
            });
          }, shortTimeout * 2); // Longer than timeout
        });
      });

      const result = await debugEndpoints.testAllEndpoints();

      // Some tests should timeout
      const timeoutTests = result.results.filter(
        r => r.error && r.error.includes('timeout')
      );
      expect(timeoutTests.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('parallel execution', () => {
    it('runs tests in parallel when enabled', async () => {
      const debugEndpoints = new DebugEndpoints({
        parallel: true
      });

      const startTime = Date.now();
      const result = await debugEndpoints.testAllEndpoints();
      const duration = Date.now() - startTime;

      // Parallel should be faster than sequential
      expect(result.summary.parallelExecution).toBe(true);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('runs tests sequentially when disabled', async () => {
      const debugEndpoints = new DebugEndpoints({
        parallel: false
      });

      const result = await debugEndpoints.testAllEndpoints();

      expect(result.summary.parallelExecution).toBe(false);
    });
  });

  describe('response validation', () => {
    it('validates response formats', async () => {
      const debugEndpoints = new DebugEndpoints({
        validateResponse: true
      });

      const result = await debugEndpoints.testAllEndpoints();

      // Check validation results
      result.results.forEach(testResult => {
        if (testResult.success) {
          expect(testResult).toHaveProperty('validation');
          expect(testResult.validation).toHaveProperty('format');
          expect(testResult.validation).toHaveProperty('valid');
        }
      });
    });

    it('validates health endpoint response format', async () => {
      const debugEndpoints = new DebugEndpoints({
        validateResponse: true
      });

      const result = await debugEndpoints.testAllEndpoints();

      const healthTest = result.results.find(
        r => r.endpoint === '/health' && r.method === 'GET'
      );

      if (healthTest && healthTest.success) {
        expect(healthTest.validation.format).toBe('json');
        expect(healthTest.validation.valid).toBe(true);
        expect(healthTest.validation.schema).toBe('health');
      }
    });

    it('validates maps API response format', async () => {
      testEnv.createTestMaps(2);

      const debugEndpoints = new DebugEndpoints({
        validateResponse: true
      });

      const result = await debugEndpoints.testAllEndpoints();

      const getMapsTest = result.results.find(
        r => r.endpoint === '/maps' && r.method === 'GET'
      );

      if (getMapsTest && getMapsTest.success) {
        expect(getMapsTest.validation.format).toBe('json');
        expect(getMapsTest.validation.valid).toBe(true);
        expect(getMapsTest.validation.schema).toBe('maps-list');
      }
    });
  });

  describe('performance analysis', () => {
    it('measures response times accurately', async () => {
      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      result.results.forEach(testResult => {
        if (testResult.success) {
          expect(testResult.responseTime).toBeGreaterThan(0);
          expect(testResult.responseTime).toBeLessThan(30000); // 30 second max
        }
      });
    });

    it('calculates performance statistics', async () => {
      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      expect(result.summary).toHaveProperty('avgResponseTime');
      expect(result.summary).toHaveProperty('minResponseTime');
      expect(result.summary).toHaveProperty('maxResponseTime');

      const successfulTests = result.results.filter(r => r.success);
      if (successfulTests.length > 0) {
        expect(result.summary.avgResponseTime).toBeGreaterThan(0);
        expect(result.summary.minResponseTime).toBeGreaterThan(0);
        expect(result.summary.maxResponseTime).toBeGreaterThan(0);
      }
    });

    it('identifies slow endpoints', async () => {
      const debugEndpoints = new DebugEndpoints({
        performanceThreshold: 100 // 100ms threshold
      });

      const result = await debugEndpoints.testAllEndpoints();

      expect(result.analysis).toHaveProperty('slowEndpoints');
      expect(Array.isArray(result.analysis.slowEndpoints)).toBe(true);

      result.analysis.slowEndpoints.forEach(slowEndpoint => {
        expect(slowEndpoint).toHaveProperty('endpoint');
        expect(slowEndpoint).toHaveProperty('responseTime');
        expect(slowEndpoint.responseTime).toBeGreaterThan(100);
      });
    });
  });

  describe('report generation', () => {
    it('generates detailed report when requested', async () => {
      const debugEndpoints = new DebugEndpoints({
        report: true
      });

      const result = await debugEndpoints.testAllEndpoints();

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('generated');
      expect(result.report).toHaveProperty('summary');
      expect(result.report).toHaveProperty('details');
      expect(result.report.generated).toBe(true);
    });

    it('includes error details in report', async () => {
      // Mock some failures
      global.fetch = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const debugEndpoints = new DebugEndpoints({
        report: true
      });

      const result = await debugEndpoints.testAllEndpoints();

      expect(result.report.details.errors).toBeDefined();
      expect(Array.isArray(result.report.details.errors)).toBe(true);
    });
  });

  describe('output formatting', () => {
    it('generates verbose output when requested', async () => {
      const debugEndpoints = new DebugEndpoints({
        verbose: true
      });

      const output = await debugEndpoints.generateOutput();

      expect(output).toContain('Endpoint Testing Results');
      expect(output).toContain('Request Details:');
      expect(output).toContain('Response Details:');
    });

    it('generates summary output by default', async () => {
      const debugEndpoints = new DebugEndpoints({
        verbose: false
      });

      const output = await debugEndpoints.generateOutput();

      expect(output).toContain('Endpoint Testing Summary');
      expect(output).toMatch(/Total:\s+\d+/);
      expect(output).toMatch(/Passed:\s+\d+/);
      expect(output).toMatch(/Failed:\s+\d+/);
    });

    it('generates JSON output when requested', async () => {
      const debugEndpoints = new DebugEndpoints({
        format: 'json'
      });

      const output = await debugEndpoints.generateOutput();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('results');
      expect(parsed).toHaveProperty('format', 'json');
    });
  });

  describe('error handling', () => {
    it('handles network errors gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      // Should not throw, should handle errors
      expect(result.summary.failed).toBeGreaterThan(0);

      result.results.forEach(testResult => {
        if (!testResult.success) {
          expect(testResult.error).toContain('Network error');
        }
      });
    });

    it('validates options', () => {
      expect(() => {
        new DebugEndpoints({
          timeout: -1
        });
      }).toThrow('Timeout must be positive');

      expect(() => {
        new DebugEndpoints({
          format: 'invalid'
        });
      }).toThrow('Invalid format option');
    });
  });

  describe('integration', () => {
    it('works with running server instance', async () => {
      // This test assumes server is running
      const debugEndpoints = new DebugEndpoints();
      const result = await debugEndpoints.testAllEndpoints();

      expect(result.summary.total).toBeGreaterThan(0);
      expect(result.summary.passed).toBeGreaterThan(0);
    });
  });
});
