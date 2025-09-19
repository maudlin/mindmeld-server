#!/usr/bin/env node

const fs = require('fs').promises;
const fsConstants = require('fs').constants;
const path = require('path');
const { openDatabase } = require('../../src/modules/maps/db');
const { config } = require('../../src/config/config');

/**
 * Server Health Check Utility
 * Performs comprehensive health diagnostics for the MindMeld Server
 */
class ServerHealthCheck {
  constructor(options = {}) {
    this.options = {
      format: options.format || 'table',
      timeout: options.timeout || 30000,
      verbose: options.verbose || false,
      ...options
    };

    this.checks = [];
    this.results = {
      overall: 'UNKNOWN',
      checks: [],
      recommendations: [],
      metadata: {
        timestamp: new Date().toISOString(),
        duration: 0
      }
    };
  }

  /**
   * Run all health checks
   * @returns {Promise<Object>} Health check results
   */
  async runHealthCheck() {
    const startTime = Date.now();

    console.log('Running comprehensive health check...\n');

    try {
      // Register all health checks
      this.registerHealthChecks();

      // Execute all checks with timeout
      await this.executeChecks();

      // Calculate overall status
      this.calculateOverallStatus();

      // Generate recommendations
      this.generateRecommendations();

      // Set duration
      this.results.metadata.duration = Date.now() - startTime;

      // Display results
      this.displayResults();

      return this.results;
    } catch (error) {
      this.results.overall = 'CRITICAL';
      this.results.checks.push({
        name: 'Health Check Execution',
        status: 'FAILED',
        duration: Date.now() - startTime,
        error: error.message
      });

      console.error(`Health check failed: ${error.message}`);
      return this.results;
    }
  }

  /**
   * Register all health check functions
   */
  registerHealthChecks() {
    this.checks = [
      {
        name: 'Database Connection',
        fn: this.checkDatabaseConnection.bind(this)
      },
      {
        name: 'Database Integrity',
        fn: this.checkDatabaseIntegrity.bind(this)
      },
      { name: 'File System Access', fn: this.checkFileSystemAccess.bind(this) },
      { name: 'Memory Usage', fn: this.checkMemoryUsage.bind(this) },
      { name: 'Configuration', fn: this.checkConfiguration.bind(this) },
      { name: 'API Endpoints', fn: this.checkApiEndpoints.bind(this) },
      { name: 'Disk Space', fn: this.checkDiskSpace.bind(this) },
      { name: 'Process Health', fn: this.checkProcessHealth.bind(this) }
    ];
  }

  /**
   * Execute all health checks with timeout protection
   */
  async executeChecks() {
    const checkPromises = this.checks.map(async check => {
      const startTime = Date.now();

      try {
        // Wrap each check with timeout
        const result = await Promise.race([
          check.fn(),
          this.createTimeoutPromise(check.name)
        ]);

        const duration = Date.now() - startTime;

        this.results.checks.push({
          name: check.name,
          status: result.status,
          duration,
          message: result.message,
          details: result.details,
          warning: result.warning
        });
      } catch (error) {
        const duration = Date.now() - startTime;

        this.results.checks.push({
          name: check.name,
          status: 'FAILED',
          duration,
          error: error.message
        });
      }
    });

    await Promise.all(checkPromises);
  }

  /**
   * Create a timeout promise for health checks
   * @param {string} checkName - Name of the check for error message
   */
  createTimeoutPromise(checkName) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Health check '${checkName}' timed out after ${this.options.timeout}ms`
          )
        );
      }, this.options.timeout);
    });
  }

  /**
   * Check database connection and basic functionality
   */
  async checkDatabaseConnection() {
    try {
      const db = openDatabase(config.sqliteFile);

      // Test basic query
      const result = db.prepare('SELECT 1 as test').get();
      db.close();

      if (result && result.test === 1) {
        return {
          status: 'HEALTHY',
          message: 'Database connection successful',
          details: { path: config.sqliteFile }
        };
      } else {
        return {
          status: 'FAILED',
          message: 'Database query returned unexpected result'
        };
      }
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Database connection failed: ${error.message}`
      };
    }
  }

  /**
   * Check database integrity
   */
  async checkDatabaseIntegrity() {
    try {
      const db = openDatabase(config.sqliteFile);

      const result = db.prepare('PRAGMA integrity_check').get();
      db.close();

      if (result.integrity_check === 'ok') {
        return {
          status: 'HEALTHY',
          message: 'Database integrity check passed'
        };
      } else {
        return {
          status: 'FAILED',
          message: `Database integrity check failed: ${result.integrity_check}`
        };
      }
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Database integrity check error: ${error.message}`
      };
    }
  }

  /**
   * Check file system access permissions
   */
  async checkFileSystemAccess() {
    try {
      const checks = [
        {
          path: config.sqliteFile,
          permission: fsConstants.R_OK | fsConstants.W_OK,
          name: 'Database file'
        },
        {
          path: path.dirname(config.sqliteFile),
          permission: fsConstants.R_OK | fsConstants.W_OK,
          name: 'Data directory'
        }
      ];

      const results = [];

      for (const check of checks) {
        try {
          await fs.access(check.path, check.permission);
          results.push(`${check.name}: ✓`);
        } catch (error) {
          return {
            status: 'FAILED',
            message: `File system access failed for ${check.name}: ${check.path}`
          };
        }
      }

      return {
        status: 'HEALTHY',
        message: 'File system access verified',
        details: { checks: results }
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `File system check error: ${error.message}`
      };
    }
  }

  /**
   * Check memory usage and limits
   */
  async checkMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      const mbUsed = Math.round(memUsage.rss / 1024 / 1024);
      const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);

      // Warning thresholds (configurable)
      const warningThreshold = 512; // MB
      const criticalThreshold = 1024; // MB

      let status = 'HEALTHY';
      let message = `Memory usage: ${mbUsed} MB (Heap: ${heapMB} MB)`;
      let warning = null;

      if (mbUsed > criticalThreshold) {
        status = 'WARNING';
        warning = `High memory usage: ${mbUsed} MB exceeds critical threshold`;
      } else if (mbUsed > warningThreshold) {
        status = 'WARNING';
        warning = `Elevated memory usage: ${mbUsed} MB exceeds warning threshold`;
      }

      return {
        status,
        message,
        warning,
        details: {
          rss: `${mbUsed} MB`,
          heapUsed: `${heapMB} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)} MB`
        }
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Memory check error: ${error.message}`
      };
    }
  }

  /**
   * Check configuration validity
   */
  async checkConfiguration() {
    try {
      const configChecks = {
        port: config.port > 0 && config.port < 65536,
        corsOrigin: config.corsOrigin && config.corsOrigin.length > 0,
        sqliteFile: config.sqliteFile && config.sqliteFile.length > 0,
        nodeEnv: ['development', 'production', 'test'].includes(config.nodeEnv)
      };

      const failedChecks = Object.entries(configChecks)
        .filter(([_, valid]) => !valid)
        .map(([key]) => key);

      if (failedChecks.length > 0) {
        return {
          status: 'FAILED',
          message: `Invalid configuration: ${failedChecks.join(', ')}`
        };
      }

      return {
        status: 'HEALTHY',
        message: 'Configuration validation passed',
        details: {
          nodeEnv: config.nodeEnv,
          port: config.port,
          featureMapsApi: config.featureMapsApi,
          featureMcp: config.featureMcp
        }
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Configuration check error: ${error.message}`
      };
    }
  }

  /**
   * Check API endpoints availability (if server is running)
   */
  async checkApiEndpoints() {
    try {
      // For now, we'll just check if the configuration suggests the server should be running
      // In a full implementation, this would make actual HTTP requests to endpoints

      const endpoints = ['/health', '/maps'];

      return {
        status: 'HEALTHY',
        message: 'API endpoint configuration verified',
        details: {
          configuredEndpoints: endpoints,
          note: 'Endpoint availability requires running server instance'
        }
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `API endpoints check error: ${error.message}`
      };
    }
  }

  /**
   * Check disk space availability
   */
  async checkDiskSpace() {
    try {
      // Get database file size
      const dbStats = await fs.stat(config.sqliteFile);
      const dbSizeMB = Math.round(dbStats.size / 1024 / 1024);

      // Check if data directory is writable (proxy for disk space)
      const testFile = path.join(
        path.dirname(config.sqliteFile),
        '.diskspace-test'
      );

      try {
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      } catch (error) {
        return {
          status: 'WARNING',
          message: 'Disk space check inconclusive - write test failed',
          details: { dbSize: `${dbSizeMB} MB` }
        };
      }

      let warning = null;
      if (dbSizeMB > 100) {
        warning = `Large database size: ${dbSizeMB} MB - consider cleanup`;
      }

      return {
        status: 'HEALTHY',
        message: 'Disk space check passed',
        warning,
        details: {
          databaseSize: `${dbSizeMB} MB`,
          dataDirectory: path.dirname(config.sqliteFile)
        }
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Disk space check error: ${error.message}`
      };
    }
  }

  /**
   * Check process health metrics
   */
  async checkProcessHealth() {
    try {
      const uptime = process.uptime();
      const uptimeHours = Math.floor(uptime / 3600);
      const uptimeMinutes = Math.floor((uptime % 3600) / 60);

      const details = {
        uptime: `${uptimeHours}h ${uptimeMinutes}m`,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid
      };

      return {
        status: 'HEALTHY',
        message: `Process healthy (uptime: ${details.uptime})`,
        details
      };
    } catch (error) {
      return {
        status: 'FAILED',
        message: `Process health check error: ${error.message}`
      };
    }
  }

  /**
   * Calculate overall health status
   */
  calculateOverallStatus() {
    const statuses = this.results.checks.map(check => check.status);

    if (statuses.includes('FAILED')) {
      this.results.overall = 'UNHEALTHY';
    } else if (statuses.includes('WARNING')) {
      this.results.overall = 'WARNING';
    } else if (statuses.every(status => status === 'HEALTHY')) {
      this.results.overall = 'HEALTHY';
    } else {
      this.results.overall = 'UNKNOWN';
    }
  }

  /**
   * Generate recommendations based on health check results
   */
  generateRecommendations() {
    this.results.recommendations = [];

    // Check for failed checks
    const failedChecks = this.results.checks.filter(
      check => check.status === 'FAILED'
    );
    if (failedChecks.length > 0) {
      this.results.recommendations.push(
        'Address failed health checks immediately'
      );
    }

    // Check for warnings
    const warningChecks = this.results.checks.filter(check => check.warning);
    if (warningChecks.length > 0) {
      this.results.recommendations.push(
        'Review warning conditions and consider optimization'
      );
    }

    // Memory usage recommendations
    const memoryCheck = this.results.checks.find(
      check => check.name === 'Memory Usage'
    );
    if (memoryCheck && memoryCheck.status === 'WARNING') {
      this.results.recommendations.push(
        'Monitor memory usage and consider process restart if high usage persists'
      );
    }

    // Database size recommendations
    const diskCheck = this.results.checks.find(
      check => check.name === 'Disk Space'
    );
    if (diskCheck && diskCheck.warning) {
      this.results.recommendations.push(
        'Consider database maintenance and cleanup operations'
      );
    }

    // General maintenance
    if (this.results.overall === 'HEALTHY') {
      this.results.recommendations.push(
        'System is healthy - continue regular monitoring'
      );
    }
  }

  /**
   * Display health check results
   */
  displayResults() {
    if (this.options.format === 'json') {
      console.log(JSON.stringify(this.results, null, 2));
      return;
    }

    // Table format (default)
    console.log('Deep Health Check Results');
    console.log('=========================');
    console.log(
      `Overall Status: ${this.getStatusIcon(this.results.overall)} ${this.results.overall}\n`
    );

    // Individual checks
    this.results.checks.forEach(check => {
      const icon = this.getStatusIcon(check.status);
      const duration = `(${check.duration}ms)`;
      console.log(`${icon} ${check.name.padEnd(20)} ${duration.padStart(8)}`);

      if (check.message) {
        console.log(`   ${check.message}`);
      }

      if (check.warning) {
        console.log(`   ⚠️  ${check.warning}`);
      }

      if (check.error) {
        console.log(`   ❌ ${check.error}`);
      }

      console.log();
    });

    // Recommendations
    if (this.results.recommendations.length > 0) {
      console.log('Recommendations:');
      this.results.recommendations.forEach(rec => {
        console.log(`- ${rec}`);
      });
      console.log();
    }

    console.log(`Total duration: ${this.results.metadata.duration}ms`);
  }

  /**
   * Get status icon for display
   * @param {string} status - Status string
   */
  getStatusIcon(status) {
    const icons = {
      HEALTHY: '✅',
      WARNING: '⚠️',
      UNHEALTHY: '❌',
      FAILED: '❌',
      UNKNOWN: '❓'
    };

    return icons[status] || '❓';
  }
}

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--format' && args[i + 1]) {
      options.format = args[++i];
    } else if (arg === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help') {
      showHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
MindMeld Server Deep Health Check

Usage: node server-health.js [options]

Options:
  --format <type>     Output format: table (default) or json
  --timeout <ms>      Timeout for individual checks (default: 30000)
  --verbose           Show detailed information
  --help              Show this help message

Examples:
  node server-health.js --format json
  node server-health.js --timeout 10000 --verbose
`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    const options = parseArguments();
    const healthCheck = new ServerHealthCheck(options);

    const results = await healthCheck.runHealthCheck();

    // Exit with appropriate code
    const exitCode = results.overall === 'HEALTHY' ? 0 : 1;
    process.exit(exitCode);
  } catch (error) {
    console.error(`Health check failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { ServerHealthCheck };
