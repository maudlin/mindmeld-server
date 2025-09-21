const http = require('http');

class DebugEndpoints {
  constructor(options = {}) {
    this.options = this.validateOptions(options);
  }

  validateOptions(options) {
    if (options.timeout && options.timeout <= 0) {
      throw new Error('Timeout must be positive');
    }
    if (options.format && !['table', 'json'].includes(options.format)) {
      throw new Error('Invalid format option');
    }

    return {
      timeout: options.timeout || 5000,
      format: options.format || 'table',
      verbose: options.verbose || false,
      parallel: options.parallel || false,
      validateResponse: options.validateResponse || false,
      ...options
    };
  }

  async testAllEndpoints() {
    const endpoints = [
      { method: 'GET', endpoint: '/health' },
      { method: 'GET', endpoint: '/ready' },
      { method: 'GET', endpoint: '/maps' },
      { method: 'POST', endpoint: '/maps' },
      { method: 'GET', endpoint: '/maps/test-id' }
    ];

    const results = [];
    const port = process.env.PORT || 3000;
    const baseUrl = `http://localhost:${port}`;

    if (this.options.parallel) {
      // Run tests in parallel
      const promises = endpoints.map(endpoint =>
        this.testSingleEndpoint(baseUrl, endpoint)
      );
      results.push(...(await Promise.all(promises)));
    } else {
      // Run tests sequentially
      for (const endpoint of endpoints) {
        const result = await this.testSingleEndpoint(baseUrl, endpoint);
        results.push(result);
      }
    }

    const summary = this.calculateSummary(results);

    const data = {
      results,
      summary,
      testedAt: new Date().toISOString()
    };

    // Always add analysis
    data.analysis = this.analyzeResults(results);

    // Add report if needed
    if (
      this.options.verbose ||
      this.options.generateReport ||
      this.options.report
    ) {
      data.report = this.generateDetailedReport(results);
    }

    return data;
  }

  async testSingleEndpoint(baseUrl, endpoint) {
    const startTime = Date.now();

    try {
      const response = await this.makeHttpRequest(
        endpoint.method,
        `${baseUrl}${endpoint.endpoint}`
      );
      const responseTime = Date.now() - startTime;

      const result = {
        endpoint: endpoint.endpoint,
        method: endpoint.method,
        status: response.status,
        responseTime,
        success: response.status < 400,
        error: null
      };

      // Add response validation if requested
      if (this.options.validateResponse && result.success) {
        result.validation = this.validateResponse(response, endpoint.endpoint);
      }

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      let errorMsg = 'Unknown error';
      if (error.message) {
        if (error.message.includes('ECONNREFUSED')) {
          errorMsg = 'Network error: Connection refused';
        } else if (error.message.includes('timeout')) {
          errorMsg = 'Request timeout';
        } else {
          errorMsg = error.message;
        }
      }

      return {
        endpoint: endpoint.endpoint,
        method: endpoint.method,
        status: null,
        responseTime,
        success: false,
        error: errorMsg || 'Unknown error'
      };
    }
  }

  makeHttpRequest(method, url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: method,
        timeout: this.options.timeout
      };

      const req = http.request(options, res => {
        resolve({ status: res.statusCode });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('timeout'));
      });

      req.end();
    });
  }

  calculateSummary(results) {
    const total = results.length;
    const passed = results.filter(r => r.success).length;
    const failed = total - passed;
    const responseTimes = results
      .filter(r => r.responseTime && r.responseTime > 0)
      .map(r => r.responseTime);

    const avgResponseTime = responseTimes.length
      ? Math.round(
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        )
      : 1;

    const minResponseTime = responseTimes.length
      ? Math.min(...responseTimes)
      : 0;
    const maxResponseTime = responseTimes.length
      ? Math.max(...responseTimes)
      : 0;

    return {
      total,
      passed,
      failed,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      parallelExecution: this.options.parallel || false
    };
  }

  async generateOutput() {
    const data = await this.testAllEndpoints();

    if (this.options.format === 'json') {
      data.format = 'json';
      return JSON.stringify(data, null, 2);
    }

    return this.formatAsTable(data);
  }

  validateResponse(response, endpoint) {
    // Basic response validation
    const validation = {
      format: 'unknown',
      valid: true
    };

    if (endpoint === '/health') {
      validation.format = 'json';
      validation.valid = response.status === 200;
      validation.schema = 'health';
    } else if (endpoint === '/ready') {
      validation.format = 'json';
      validation.valid = response.status === 200;
      validation.schema = 'ready';
    } else if (endpoint.startsWith('/maps')) {
      validation.format = 'json';
      validation.valid = response.status < 400;
      if (endpoint === '/maps') {
        validation.schema = 'maps-list';
      } else {
        validation.schema = 'map-details';
      }
    }

    return validation;
  }

  analyzeResults(results) {
    const slowEndpoints = results
      .filter(r => r.responseTime > 1000) // Endpoints slower than 1s
      .map(r => ({ endpoint: r.endpoint, responseTime: r.responseTime }));

    return {
      slowEndpoints,
      performanceIssues: slowEndpoints.length,
      errorRate: results.filter(r => !r.success).length / results.length
    };
  }

  generateDetailedReport(results) {
    return {
      generated: new Date().toISOString(),
      summary: 'Endpoint testing completed',
      details: {
        endpoints: results.length,
        successful: results.filter(r => r.success).length,
        errors: results
          .filter(r => !r.success)
          .map(r => ({
            endpoint: r.endpoint,
            error: r.error
          }))
      }
    };
  }

  formatAsTable(data) {
    let output = [];
    output.push('Endpoint Testing Summary');
    output.push('========================');
    output.push(`Total: ${data.summary.total}`);
    output.push(`Passed: ${data.summary.passed}`);
    output.push(`Failed: ${data.summary.failed}`);
    output.push(`Avg Response Time: ${data.summary.avgResponseTime}ms`);
    output.push('');

    output.push('Endpoint Testing Results');
    output.push('========================');
    data.results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      output.push(
        `${status} ${result.method} ${result.endpoint} - ${result.status || 'ERROR'} (${result.responseTime}ms)`
      );
    });

    if (this.options.verbose) {
      output.push('');
      output.push('Request Details:');
      output.push('Response Details:');
      data.results.forEach(result => {
        if (result.error) {
          output.push(`   ${result.endpoint}: ${result.error}`);
        }
      });
    }

    return output.join('\n');
  }
}

module.exports = { DebugEndpoints };
