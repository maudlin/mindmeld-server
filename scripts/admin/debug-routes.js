const http = require('http');

class DebugRoutes {
  constructor(options = {}) {
    this.options = this.validateOptions(options);
  }

  validateOptions(options) {
    const validFormats = ['table', 'json'];
    const validMethods = [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'HEAD',
      'OPTIONS'
    ];

    if (options.format && !validFormats.includes(options.format)) {
      throw new Error(
        `Invalid format option: ${options.format}. Valid options: ${validFormats.join(', ')}`
      );
    }

    if (
      options.method &&
      !validMethods.includes(options.method.toUpperCase())
    ) {
      throw new Error(
        `Invalid HTTP method: ${options.method}. Valid methods: ${validMethods.join(', ')}`
      );
    }

    return {
      format: options.format || 'table',
      method: options.method ? options.method.toUpperCase() : null,
      path: options.path || null,
      test: options.test || false,
      ...options
    };
  }

  // Method that would be used to get Express app instance (for testing/mocking)
  getExpressApp() {
    // In a real implementation, this would get the actual Express app instance
    // For now, we'll use static route definitions since we can't easily access the app
    return null;
  }

  async discoverRoutes() {
    try {
      // Try to get the Express app - if it fails, handle gracefully
      try {
        this.getExpressApp();
      } catch (error) {
        return {
          error: error.message,
          routes: [],
          discoveredAt: new Date().toISOString()
        };
      }

      // Since we can't easily introspect Express routes at runtime without the app instance,
      // we'll provide a static definition based on the known MindMeld Server routes
      const routes = this.getKnownRoutes();

      let filteredRoutes = routes;

      // Apply filters
      if (this.options.method) {
        filteredRoutes = filteredRoutes.filter(
          route => route.method === this.options.method
        );
      }

      if (this.options.path) {
        filteredRoutes = filteredRoutes.filter(route =>
          route.path.includes(this.options.path)
        );
      }

      return {
        routes: filteredRoutes,
        total: filteredRoutes.length,
        filtered: routes.length !== filteredRoutes.length,
        discoveredAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        error: error.message,
        routes: [],
        discoveredAt: new Date().toISOString()
      };
    }
  }

  getKnownRoutes() {
    return [
      // Health endpoints
      {
        method: 'GET',
        path: '/health',
        middlewares: ['helmet', 'cors', 'logging'],
        category: 'Health',
        description: 'Basic health check endpoint'
      },
      {
        method: 'GET',
        path: '/ready',
        middlewares: ['helmet', 'cors', 'logging'],
        category: 'Health',
        description: 'Readiness check endpoint'
      },

      // Maps API endpoints
      {
        method: 'GET',
        path: '/maps',
        middlewares: ['helmet', 'cors', 'logging', 'rateLimit'],
        category: 'API',
        description: 'List all maps'
      },
      {
        method: 'POST',
        path: '/maps',
        middlewares: ['helmet', 'cors', 'logging', 'rateLimit'],
        category: 'API',
        description: 'Create a new map'
      },
      {
        method: 'GET',
        path: '/maps/:id',
        middlewares: ['helmet', 'cors', 'logging', 'rateLimit'],
        category: 'API',
        description: 'Get a specific map by ID'
      },
      {
        method: 'PUT',
        path: '/maps/:id',
        middlewares: ['helmet', 'cors', 'logging', 'rateLimit'],
        category: 'API',
        description: 'Update a specific map'
      },
      {
        method: 'DELETE',
        path: '/maps/:id',
        middlewares: ['helmet', 'cors', 'logging', 'rateLimit'],
        category: 'API',
        description: 'Delete a specific map'
      },

      // MCP endpoints
      {
        method: 'GET',
        path: '/mcp/sse',
        middlewares: ['helmet', 'cors', 'logging'],
        category: 'MCP',
        description: 'MCP Server-Sent Events transport'
      },
      {
        method: 'POST',
        path: '/mcp/http',
        middlewares: ['helmet', 'cors', 'logging'],
        category: 'MCP',
        description: 'MCP HTTP transport'
      }
    ];
  }

  async testRoutes() {
    if (!this.options.test) {
      return { testResults: [], tested: false };
    }

    const discovery = await this.discoverRoutes();
    const testResults = [];
    const baseUrl = this.getServerBaseUrl();

    for (const route of discovery.routes) {
      const testResult = await this.testSingleRoute(baseUrl, route);
      testResults.push(testResult);
    }

    return {
      testResults,
      tested: true,
      summary: this.calculateTestSummary(testResults),
      testedAt: new Date().toISOString()
    };
  }

  getServerBaseUrl() {
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
  }

  async testSingleRoute(baseUrl, route) {
    const startTime = Date.now();

    try {
      // For parameterized routes, use test values
      let testPath = route.path;
      if (testPath.includes(':id')) {
        testPath = testPath.replace(':id', 'test-id-123');
      }

      const url = `${baseUrl}${testPath}`;
      const response = await this.makeRequest(route.method, url);

      const responseTime = Date.now() - startTime;

      return {
        route: {
          method: route.method,
          path: route.path,
          category: route.category
        },
        url: url,
        status: response.status,
        statusText: response.statusText,
        responseTime,
        accessible: response.status < 500,
        success: response.status < 400,
        error: null
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      return {
        route: {
          method: route.method,
          path: route.path,
          category: route.category
        },
        url: `${baseUrl}${route.path}`,
        status: null,
        statusText: null,
        responseTime,
        accessible: false,
        success: false,
        error: error.message
      };
    }
  }

  async makeRequest(method, url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: method,
        timeout: 5000,
        headers: {
          'User-Agent': 'MindMeld-Debug-Routes/1.0'
        }
      };

      const req = http.request(options, res => {
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers
        });
      });

      req.on('error', error => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  calculateTestSummary(testResults) {
    const total = testResults.length;
    const passed = testResults.filter(r => r.success).length;
    const failed = testResults.filter(r => !r.success).length;
    const accessible = testResults.filter(r => r.accessible).length;

    const responseTimes = testResults
      .filter(r => r.responseTime > 0)
      .map(r => r.responseTime);

    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          )
        : 0;

    return {
      total,
      passed,
      failed,
      accessible,
      avgResponseTime,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0
    };
  }

  async generateOutput() {
    const discovery = await this.discoverRoutes();
    let testResults = null;

    if (this.options.test) {
      const testData = await this.testRoutes();
      testResults = testData.testResults;
    }

    if (this.options.format === 'json') {
      return JSON.stringify(
        {
          format: 'json',
          ...discovery,
          testResults,
          generatedAt: new Date().toISOString()
        },
        null,
        2
      );
    }

    return this.formatAsTable(discovery, testResults);
  }

  formatAsTable(discovery, testResults) {
    let output = [];

    output.push('Registered Routes');
    output.push('=================');

    if (discovery.error) {
      output.push(`Error: ${discovery.error}`);
      return output.join('\n');
    }

    if (discovery.filtered) {
      output.push(
        `Showing ${discovery.routes.length} routes (filtered from ${discovery.total} total)`
      );
    } else {
      output.push(`Total routes: ${discovery.routes.length}`);
    }
    output.push('');

    // Group routes by category
    const categories = {};
    discovery.routes.forEach(route => {
      if (!categories[route.category]) {
        categories[route.category] = [];
      }
      categories[route.category].push(route);
    });

    Object.keys(categories).forEach(category => {
      output.push(`${category} Routes:`);
      output.push('-'.repeat(category.length + 8));

      categories[category].forEach(route => {
        const middlewareStr = route.middlewares.join(', ');
        let routeLine = `${route.method.padEnd(6)} ${route.path.padEnd(20)} [${middlewareStr}]`;

        // Add test results if available
        if (testResults) {
          const testResult = testResults.find(
            t => t.route.method === route.method && t.route.path === route.path
          );

          if (testResult) {
            const status = testResult.success
              ? '✅'
              : testResult.accessible
                ? '⚠️'
                : '❌';
            const timing =
              testResult.responseTime > 0
                ? `${testResult.responseTime}ms`
                : 'N/A';
            routeLine += ` ${status} ${timing}`;
          }
        }

        output.push(routeLine);
      });

      output.push('');
    });

    // Add test summary if tests were run
    if (testResults) {
      const summary = this.calculateTestSummary(testResults);
      output.push('Test Results Summary:');
      output.push('====================');
      output.push(`Total Tests: ${summary.total}`);
      output.push(`Passed: ${summary.passed} (${summary.passRate}%)`);
      output.push(`Failed: ${summary.failed}`);
      output.push(`Accessible: ${summary.accessible}`);
      output.push(`Avg Response Time: ${summary.avgResponseTime}ms`);
      output.push('');
    }

    return output.join('\n');
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--format') {
      options.format = args[++i];
    } else if (arg === '--method') {
      options.method = args[++i];
    } else if (arg === '--path') {
      options.path = args[++i];
    } else if (arg === '--test') {
      options.test = true;
    } else if (arg === '--help') {
      console.log(`
Usage: node debug-routes.js [options]

Options:
  --format <format>    Output format (table, json) [default: table]
  --method <method>    Filter by HTTP method (GET, POST, PUT, DELETE)
  --path <pattern>     Filter by path pattern
  --test               Test route accessibility
  --help               Show this help message

Examples:
  node debug-routes.js --test
  node debug-routes.js --method GET --test
  node debug-routes.js --path /maps --format json
`);
      process.exit(0);
    }
  }

  try {
    const debugRoutes = new DebugRoutes(options);
    const output = await debugRoutes.generateOutput();
    console.log(output);
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { DebugRoutes };
