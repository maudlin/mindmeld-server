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

    for (const endpoint of endpoints) {
      const result = await this.testSingleEndpoint(baseUrl, endpoint);
      results.push(result);
    }

    const summary = this.calculateSummary(results);

    return {
      results,
      summary,
      testedAt: new Date().toISOString()
    };
  }

  async testSingleEndpoint(baseUrl, endpoint) {
    const startTime = Date.now();

    try {
      const response = await this.makeHttpRequest(
        endpoint.method,
        `${baseUrl}${endpoint.endpoint}`
      );
      const responseTime = Date.now() - startTime;

      return {
        endpoint: endpoint.endpoint,
        method: endpoint.method,
        status: response.status,
        responseTime,
        success: response.status < 400,
        error: null
      };
    } catch (error) {
      return {
        endpoint: endpoint.endpoint,
        method: endpoint.method,
        status: null,
        responseTime: Date.now() - startTime,
        success: false,
        error: error.message
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
      .filter(r => r.responseTime)
      .map(r => r.responseTime);
    const avgResponseTime = responseTimes.length
      ? Math.round(
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        )
      : 0;

    return { total, passed, failed, avgResponseTime };
  }

  async generateOutput() {
    const data = await this.testAllEndpoints();

    if (this.options.format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    return this.formatAsTable(data);
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

    if (this.options.verbose) {
      output.push('Endpoint Testing Results');
      output.push('========================');
      data.results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        output.push(
          `${status} ${result.method} ${result.endpoint} - ${result.status || 'ERROR'} (${result.responseTime}ms)`
        );
        if (result.error) {
          output.push(`   Error: ${result.error}`);
        }
      });
    }

    return output.join('\n');
  }
}

module.exports = { DebugEndpoints };
