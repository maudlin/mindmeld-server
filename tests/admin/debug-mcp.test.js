const { DebugMcp } = require('../../scripts/admin/debug-mcp');
const AdminTestEnvironment = require('./helpers/admin-test-env');

describe('Admin Command: debug:mcp', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.teardown();
  });

  describe('MCP transport testing', () => {
    it('tests SSE transport connectivity', async () => {
      const debugMcp = new DebugMcp({
        transport: 'sse',
      });

      const result = await debugMcp.testMcpTransport();

      // Verify transport test structure
      expect(result).toHaveProperty('transport', 'sse');
      expect(result).toHaveProperty('connectivity');
      expect(result).toHaveProperty('performance');

      // Verify connectivity test results
      expect(result.connectivity).toHaveProperty('endpoint');
      expect(result.connectivity).toHaveProperty('accessible');
      expect(result.connectivity).toHaveProperty('responseTime');
      expect(result.connectivity.endpoint).toBe('/mcp/sse');
    });

    it('tests HTTP transport connectivity', async () => {
      const debugMcp = new DebugMcp({
        transport: 'http',
      });

      const result = await debugMcp.testMcpTransport();

      expect(result.transport).toBe('http');
      expect(result.connectivity.endpoint).toBe('/mcp/http');
    });

    it('tests all transports when transport=all', async () => {
      const debugMcp = new DebugMcp({
        transport: 'all',
      });

      const result = await debugMcp.testMcpTransport();

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBeGreaterThanOrEqual(2);

      // Should include both SSE and HTTP
      const transportNames = result.results.map((r) => r.transport);
      expect(transportNames).toContain('sse');
      expect(transportNames).toContain('http');
    });

    it('measures transport performance', async () => {
      const debugMcp = new DebugMcp();
      const result = await debugMcp.testMcpTransport();

      expect(result.performance).toHaveProperty('latency');
      expect(result.performance).toHaveProperty('throughput');
      expect(result.performance).toHaveProperty('reliability');

      if (result.connectivity.accessible) {
        expect(result.performance.latency).toBeGreaterThan(0);
      }
    });
  });

  describe('MCP tool testing', () => {
    it('tests all available tools', async () => {
      const debugMcp = new DebugMcp({
        tool: 'all',
      });

      const result = await debugMcp.testMcpTools();

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);

      result.tools.forEach((tool) => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('tested');
        expect(tool).toHaveProperty('success');
        expect(tool).toHaveProperty('responseTime');
        expect(tool).toHaveProperty('error');
      });
    });

    it('tests specific tool when provided', async () => {
      const debugMcp = new DebugMcp({
        tool: 'listMaps',
      });

      const result = await debugMcp.testMcpTools();

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('listMaps');
    });

    it('validates tool responses', async () => {
      const debugMcp = new DebugMcp({
        tool: 'all',
        validateResponses: true,
      });

      const result = await debugMcp.testMcpTools();

      result.tools.forEach((tool) => {
        if (tool.success) {
          expect(tool).toHaveProperty('validation');
          expect(tool.validation).toHaveProperty('valid');
          expect(tool.validation).toHaveProperty('schema');
        }
      });
    });

    it('handles tool invocation errors', async () => {
      const debugMcp = new DebugMcp({
        tool: 'nonexistentTool',
      });

      const result = await debugMcp.testMcpTools();

      // Should handle gracefully
      expect(result.tools[0].success).toBe(false);
      expect(result.tools[0].error).toBeTruthy();
      expect(result.tools[0].error).toContain('Tool not found');
    });

    it('measures tool performance', async () => {
      const debugMcp = new DebugMcp({
        tool: 'listMaps',
      });

      const result = await debugMcp.testMcpTools();

      const listMapsTool = result.tools.find((t) => t.name === 'listMaps');
      if (listMapsTool && listMapsTool.success) {
        expect(listMapsTool.responseTime).toBeGreaterThan(0);
        expect(listMapsTool.responseTime).toBeLessThan(10000); // 10 second max
      }
    });
  });

  describe('MCP resource testing', () => {
    it('tests all available resources', async () => {
      const debugMcp = new DebugMcp({
        resource: 'all',
      });

      const result = await debugMcp.testMcpResources();

      expect(result).toHaveProperty('resources');
      expect(Array.isArray(result.resources)).toBe(true);

      result.resources.forEach((resource) => {
        expect(resource).toHaveProperty('uri');
        expect(resource).toHaveProperty('accessible');
        expect(resource).toHaveProperty('responseTime');
        expect(resource).toHaveProperty('error');
      });
    });

    it('tests specific resource when provided', async () => {
      const debugMcp = new DebugMcp({
        resource: 'mindmeld://maps',
      });

      const result = await debugMcp.testMcpResources();

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('mindmeld://maps');
    });

    it('validates resource content', async () => {
      testEnv.createTestMaps(3);

      const debugMcp = new DebugMcp({
        resource: 'mindmeld://maps',
        validateContent: true,
      });

      const result = await debugMcp.testMcpResources();

      const mapsResource = result.resources.find(
        (r) => r.uri === 'mindmeld://maps',
      );
      if (mapsResource && mapsResource.accessible) {
        expect(mapsResource).toHaveProperty('validation');
        expect(mapsResource.validation).toHaveProperty('format');
        expect(mapsResource.validation).toHaveProperty('valid');
        expect(mapsResource.validation.format).toBe('json');
      }
    });

    it('handles resource access errors', async () => {
      const debugMcp = new DebugMcp({
        resource: 'mindmeld://nonexistent',
      });

      const result = await debugMcp.testMcpResources();

      expect(result.resources[0].accessible).toBe(false);
      expect(result.resources[0].error).toBeTruthy();
    });
  });

  describe('protocol communication', () => {
    it('shows detailed protocol communication when verbose', async () => {
      const debugMcp = new DebugMcp({
        verbose: true,
      });

      const result = await debugMcp.testMcpTransport();

      expect(result).toHaveProperty('communication');
      expect(result.communication).toHaveProperty('messages');
      expect(Array.isArray(result.communication.messages)).toBe(true);

      result.communication.messages.forEach((message) => {
        expect(message).toHaveProperty('direction'); // 'send' or 'receive'
        expect(message).toHaveProperty('timestamp');
        expect(message).toHaveProperty('payload');
      });
    });

    it('tracks message flow', async () => {
      const debugMcp = new DebugMcp({
        verbose: true,
        tool: 'listMaps',
      });

      const result = await debugMcp.testMcpTools();

      const listMapsTool = result.tools.find((t) => t.name === 'listMaps');
      if (listMapsTool && listMapsTool.success) {
        expect(listMapsTool).toHaveProperty('communication');
        expect(listMapsTool.communication.messages.length).toBeGreaterThan(0);
      }
    });

    it('measures protocol overhead', async () => {
      const debugMcp = new DebugMcp({
        measureOverhead: true,
      });

      const result = await debugMcp.testMcpTransport();

      expect(result.performance).toHaveProperty('protocolOverhead');
      expect(result.performance.protocolOverhead).toHaveProperty('bytes');
      expect(result.performance.protocolOverhead).toHaveProperty('percentage');
    });
  });

  describe('error handling and recovery', () => {
    it('tests error handling capabilities', async () => {
      const debugMcp = new DebugMcp({
        testErrorHandling: true,
      });

      const result = await debugMcp.testErrorHandling();

      expect(result).toHaveProperty('errorTests');
      expect(Array.isArray(result.errorTests)).toBe(true);

      result.errorTests.forEach((errorTest) => {
        expect(errorTest).toHaveProperty('scenario');
        expect(errorTest).toHaveProperty('handled');
        expect(errorTest).toHaveProperty('recovery');
      });
    });

    it('tests connection recovery', async () => {
      const debugMcp = new DebugMcp({
        testRecovery: true,
      });

      const result = await debugMcp.testConnectionRecovery();

      expect(result).toHaveProperty('recovery');
      expect(result.recovery).toHaveProperty('automatic');
      expect(result.recovery).toHaveProperty('timeToRecover');
      expect(result.recovery).toHaveProperty('success');
    });

    it('handles malformed responses', async () => {
      // Mock malformed response
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            malformed: 'response without proper MCP structure',
          }),
      });

      const debugMcp = new DebugMcp();
      const result = await debugMcp.testMcpTransport();

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid MCP response');

      global.fetch = originalFetch;
    });
  });

  describe('performance and reliability', () => {
    it('measures performance metrics', async () => {
      const debugMcp = new DebugMcp({
        measurePerformance: true,
      });

      const result = await debugMcp.testMcpTransport();

      expect(result.performance).toHaveProperty('metrics');
      expect(result.performance.metrics).toHaveProperty('requests');
      expect(result.performance.metrics).toHaveProperty('responses');
      expect(result.performance.metrics).toHaveProperty('errors');
    });

    it('tests reliability under load', async () => {
      const debugMcp = new DebugMcp({
        loadTest: true,
        loadTestRequests: 10,
      });

      const result = await debugMcp.testReliability();

      expect(result).toHaveProperty('reliability');
      expect(result.reliability).toHaveProperty('totalRequests');
      expect(result.reliability).toHaveProperty('successfulRequests');
      expect(result.reliability).toHaveProperty('failedRequests');
      expect(result.reliability).toHaveProperty('successRate');

      expect(result.reliability.totalRequests).toBe(10);
      expect(result.reliability.successRate).toBeGreaterThanOrEqual(0);
      expect(result.reliability.successRate).toBeLessThanOrEqual(1);
    });

    it('identifies performance bottlenecks', async () => {
      const debugMcp = new DebugMcp({
        analyzeBottlenecks: true,
      });

      const result = await debugMcp.analyzePerformance();

      expect(result).toHaveProperty('bottlenecks');
      expect(Array.isArray(result.bottlenecks)).toBe(true);

      result.bottlenecks.forEach((bottleneck) => {
        expect(bottleneck).toHaveProperty('component');
        expect(bottleneck).toHaveProperty('impact');
        expect(bottleneck).toHaveProperty('suggestion');
      });
    });
  });

  describe('output formatting', () => {
    it('generates comprehensive report', async () => {
      const debugMcp = new DebugMcp({
        generateReport: true,
      });

      const output = await debugMcp.generateOutput();

      expect(output).toContain('MCP Debug Report');
      expect(output).toContain('Transport Tests');
      expect(output).toContain('Tool Tests');
      expect(output).toContain('Resource Tests');
    });

    it('generates JSON output when requested', async () => {
      const debugMcp = new DebugMcp({
        format: 'json',
      });

      const output = await debugMcp.generateOutput();

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('transport');
      expect(parsed).toHaveProperty('tools');
      expect(parsed).toHaveProperty('resources');
      expect(parsed).toHaveProperty('format', 'json');
    });

    it('includes verbose details when requested', async () => {
      const debugMcp = new DebugMcp({
        verbose: true,
        format: 'table',
      });

      const output = await debugMcp.generateOutput();

      expect(output).toContain('Communication Details');
      expect(output).toContain('Protocol Messages');
      expect(output).toContain('Performance Metrics');
    });
  });

  describe('integration testing', () => {
    it('works with live MCP server', async () => {
      const debugMcp = new DebugMcp();

      // This assumes MCP is properly configured
      const result = await debugMcp.testMcpTransport();

      // Should at least attempt connection
      expect(result).toHaveProperty('connectivity');
      expect(result.connectivity).toHaveProperty('attempted');
      expect(result.connectivity.attempted).toBe(true);
    });

    it('detects MCP configuration issues', async () => {
      // Mock missing MCP configuration
      const originalEnv = process.env.MCP_ENABLED;
      process.env.MCP_ENABLED = 'false';

      const debugMcp = new DebugMcp();
      const result = await debugMcp.testMcpTransport();

      expect(result).toHaveProperty('configurationIssues');
      expect(result.configurationIssues).toContain('MCP is disabled');

      process.env.MCP_ENABLED = originalEnv;
    });
  });

  describe('error handling', () => {
    it('validates options', () => {
      expect(() => {
        new DebugMcp({
          transport: 'invalid',
        });
      }).toThrow('Invalid transport option');

      expect(() => {
        new DebugMcp({
          format: 'invalid',
        });
      }).toThrow('Invalid format option');
    });

    it('handles MCP server unavailable', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Connection refused'));

      const debugMcp = new DebugMcp();
      const result = await debugMcp.testMcpTransport();

      expect(result.connectivity.accessible).toBe(false);
      expect(result.connectivity.error).toContain('Connection refused');
    });
  });
});
