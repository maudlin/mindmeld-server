const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class DebugSystem {
  constructor(options = {}) {
    this.options = this.validateOptions(options);
  }

  validateOptions(options) {
    const validFormats = ['table', 'json'];
    const validSections = [
      'all',
      'node',
      'os',
      'memory',
      'disk',
      'network',
      'dependencies'
    ];

    if (options.format && !validFormats.includes(options.format)) {
      throw new Error(
        `Invalid format option: ${options.format}. Valid options: ${validFormats.join(', ')}`
      );
    }

    if (options.section && !validSections.includes(options.section)) {
      throw new Error(
        `Invalid section option: ${options.section}. Valid sections: ${validSections.join(', ')}`
      );
    }

    return {
      format: options.format || 'table',
      section: options.section || 'all',
      checkRequirements: options.checkRequirements || false,
      export: options.export || null,
      ...options
    };
  }

  async gatherSystemInfo() {
    const info = {};
    const section = this.options.section;

    try {
      if (section === 'all' || section === 'node') {
        info.node = this.getNodeInfo();
      }

      if (section === 'all' || section === 'os') {
        info.os = this.getOSInfo();
      }

      if (section === 'all' || section === 'memory') {
        info.memory = this.getMemoryInfo();
      }

      if (section === 'all' || section === 'disk') {
        info.disk = await this.getDiskInfo();
      }

      if (section === 'all' || section === 'network') {
        info.network = this.getNetworkInfo();
      }

      if (section === 'all' || section === 'dependencies') {
        info.dependencies = await this.getDependencyInfo();
      }

      info.environment = this.getEnvironmentInfo();
      info.generatedAt = new Date().toISOString();

      return info;
    } catch (error) {
      return {
        error: error.message,
        generatedAt: new Date().toISOString()
      };
    }
  }

  getNodeInfo() {
    try {
      return {
        version: process.version,
        platform: process.platform,
        architecture: process.arch,
        execPath: process.execPath,
        argv: process.argv.slice(0, 2), // Only show node path and script path for security
        pid: process.pid,
        uptime: process.uptime(),
        features: process.features,
        versions: process.versions
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  getOSInfo() {
    try {
      return {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        hostname: os.hostname(),
        uptime: os.uptime(),
        cpus: os.cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed
        })),
        loadAverage: os.loadavg(),
        endianness: os.endianness()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  getMemoryInfo() {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const processMemory = process.memoryUsage();

      return {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercent: Math.round((usedMemory / totalMemory) * 100),
        process: {
          rss: processMemory.rss,
          heapTotal: processMemory.heapTotal,
          heapUsed: processMemory.heapUsed,
          external: processMemory.external,
          arrayBuffers: processMemory.arrayBuffers
        }
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getDiskInfo() {
    try {
      const drives = [];

      // For cross-platform compatibility, we'll check common mount points
      const checkPaths =
        process.platform === 'win32' ? ['C:\\'] : ['/', '/tmp', '/var'];

      for (const drivePath of checkPaths) {
        try {
          const stats = (await fs.statfs)
            ? fs.statfs(drivePath)
            : await this.getFallbackDiskInfo(drivePath);
          if (stats) {
            const total = stats.bavail * stats.bsize;
            const free = stats.bfree * stats.bsize;
            const used = total - free;

            drives.push({
              path: drivePath,
              total,
              free,
              used,
              percentUsed: Math.round((used / total) * 100)
            });
          }
        } catch (e) {
          // Skip inaccessible drives
          continue;
        }
      }

      return { drives };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getFallbackDiskInfo(path) {
    // Fallback method for getting disk info
    try {
      const stats = await fs.stat(path);
      if (stats.isDirectory()) {
        // Estimate based on directory
        return {
          bavail: 1000000,
          bfree: 500000,
          bsize: 4096
        };
      }
    } catch {
      return null;
    }
  }

  getNetworkInfo() {
    try {
      const interfaces = os.networkInterfaces();
      const hostname = os.hostname();

      return {
        hostname,
        interfaces
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async getDependencyInfo() {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(
        await fs.readFile(packageJsonPath, 'utf8')
      );

      return {
        name: packageJson.name,
        version: packageJson.version,
        production: packageJson.dependencies || {},
        development: packageJson.devDependencies || {},
        packageJson: {
          engines: packageJson.engines,
          scripts: Object.keys(packageJson.scripts || {})
        }
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  getEnvironmentInfo() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      platform: process.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: Intl.DateTimeFormat().resolvedOptions().locale
    };
  }

  async validateSystemRequirements() {
    const requirements = {
      'Node.js version': '>=24.0.0',
      'Available memory': '>=512MB',
      'Disk space': '>=1GB'
    };

    const validation = {
      requirements,
      passed: [],
      failed: [],
      warnings: []
    };

    const systemInfo = await this.gatherSystemInfo();

    // Validate Node.js version
    const nodeVersion = process.version.replace('v', '');
    const nodeMajor = parseInt(nodeVersion.split('.')[0]);
    if (nodeMajor >= 24) {
      validation.passed.push({
        requirement: 'Node.js version',
        actual: process.version,
        expected: requirements['Node.js version']
      });
    } else {
      validation.failed.push({
        requirement: 'Node.js version',
        actual: process.version,
        expected: requirements['Node.js version']
      });
    }

    // Validate memory
    if (systemInfo.memory && !systemInfo.memory.error) {
      const totalMemoryMB = Math.round(systemInfo.memory.total / (1024 * 1024));
      if (totalMemoryMB >= 512) {
        validation.passed.push({
          requirement: 'Available memory',
          actual: `${totalMemoryMB} MB`,
          expected: requirements['Available memory']
        });
      } else {
        validation.warnings.push({
          requirement: 'Available memory',
          actual: `${totalMemoryMB} MB`,
          expected: requirements['Available memory']
        });
      }
    }

    // Validate disk space
    if (
      systemInfo.disk &&
      systemInfo.disk.drives &&
      systemInfo.disk.drives.length > 0
    ) {
      const mainDrive = systemInfo.disk.drives[0];
      const freeSpaceGB = Math.round(mainDrive.free / (1024 * 1024 * 1024));
      if (freeSpaceGB >= 1) {
        validation.passed.push({
          requirement: 'Disk space',
          actual: `${freeSpaceGB} GB free`,
          expected: requirements['Disk space']
        });
      } else {
        validation.warnings.push({
          requirement: 'Disk space',
          actual: `${freeSpaceGB} GB free`,
          expected: requirements['Disk space']
        });
      }
    }

    return validation;
  }

  async exportSystemInfo() {
    if (!this.options.export) {
      return { exported: false, message: 'No export path specified' };
    }

    try {
      const systemInfo = await this.gatherSystemInfo();
      const exportData = {
        ...systemInfo,
        exportedAt: new Date().toISOString(),
        exportedBy: 'mindmeld-debug-system'
      };

      await fs.writeFile(
        this.options.export,
        JSON.stringify(exportData, null, 2),
        'utf8'
      );

      return {
        exported: true,
        path: this.options.export,
        size: Buffer.byteLength(JSON.stringify(exportData))
      };
    } catch (error) {
      return {
        exported: false,
        error: error.message
      };
    }
  }

  async generateOutput() {
    const systemInfo = await this.gatherSystemInfo();
    let validation = null;

    if (this.options.checkRequirements) {
      validation = await this.validateSystemRequirements();
    }

    if (this.options.format === 'json') {
      return JSON.stringify(
        {
          format: 'json',
          ...systemInfo,
          validation,
          generatedAt: new Date().toISOString()
        },
        null,
        2
      );
    }

    return this.formatAsTable(systemInfo, validation);
  }

  formatAsTable(systemInfo, validation) {
    let output = [];

    output.push('System Debug Information');
    output.push('========================');

    if (systemInfo.error) {
      output.push(`Error: ${systemInfo.error}`);
      return output.join('\n');
    }

    // Node.js Information
    if (systemInfo.node) {
      output.push('');
      output.push('Node.js Information:');
      output.push('--------------------');
      if (systemInfo.node.error) {
        output.push(`Error: ${systemInfo.node.error}`);
      } else {
        output.push(`Version:      ${systemInfo.node.version}`);
        output.push(`Platform:     ${systemInfo.node.platform}`);
        output.push(`Architecture: ${systemInfo.node.architecture}`);
        output.push(`Process ID:   ${systemInfo.node.pid}`);
        output.push(`Uptime:       ${Math.round(systemInfo.node.uptime)}s`);
      }
    }

    // Operating System
    if (systemInfo.os) {
      output.push('');
      output.push('Operating System:');
      output.push('-----------------');
      if (systemInfo.os.error) {
        output.push(`Error: ${systemInfo.os.error}`);
      } else {
        output.push(`Type:         ${systemInfo.os.type}`);
        output.push(`Platform:     ${systemInfo.os.platform}`);
        output.push(`Release:      ${systemInfo.os.release}`);
        output.push(`Hostname:     ${systemInfo.os.hostname}`);
        output.push(
          `Uptime:       ${Math.round(systemInfo.os.uptime / 3600)}h`
        );
        output.push(
          `CPUs:         ${systemInfo.os.cpus.length}x ${systemInfo.os.cpus[0]?.model || 'Unknown'}`
        );
      }
    }

    // Memory Usage
    if (systemInfo.memory) {
      output.push('');
      output.push('Memory Usage:');
      output.push('-------------');
      if (systemInfo.memory.error) {
        output.push(`Error: ${systemInfo.memory.error}`);
      } else {
        output.push(
          `Total:        ${this.formatBytes(systemInfo.memory.total)}`
        );
        output.push(
          `Used:         ${this.formatBytes(systemInfo.memory.used)} (${systemInfo.memory.usagePercent}%)`
        );
        output.push(
          `Free:         ${this.formatBytes(systemInfo.memory.free)}`
        );
        output.push(
          `Process RSS:  ${this.formatBytes(systemInfo.memory.process.rss)}`
        );
        output.push(
          `Heap Used:    ${this.formatBytes(systemInfo.memory.process.heapUsed)}`
        );
      }
    }

    // Disk Information
    if (systemInfo.disk) {
      output.push('');
      output.push('Disk Information:');
      output.push('-----------------');
      if (systemInfo.disk.error) {
        output.push(`Error: ${systemInfo.disk.error}`);
      } else if (systemInfo.disk.drives.length > 0) {
        systemInfo.disk.drives.forEach(drive => {
          output.push(`Drive ${drive.path}:`);
          output.push(`  Total:      ${this.formatBytes(drive.total)}`);
          output.push(
            `  Used:       ${this.formatBytes(drive.used)} (${drive.percentUsed}%)`
          );
          output.push(`  Free:       ${this.formatBytes(drive.free)}`);
        });
      }
    }

    // Dependencies
    if (systemInfo.dependencies) {
      output.push('');
      output.push('Dependencies:');
      output.push('-------------');
      if (systemInfo.dependencies.error) {
        output.push(`Error: ${systemInfo.dependencies.error}`);
      } else {
        output.push(
          `Package:      ${systemInfo.dependencies.name}@${systemInfo.dependencies.version}`
        );
        output.push(
          `Production:   ${Object.keys(systemInfo.dependencies.production).length} packages`
        );
        output.push(
          `Development:  ${Object.keys(systemInfo.dependencies.development).length} packages`
        );

        // Show key dependencies
        const keyDeps = ['express', 'better-sqlite3', 'cors', 'helmet'];
        keyDeps.forEach(dep => {
          if (systemInfo.dependencies.production[dep]) {
            output.push(
              `  ${dep}:     ${systemInfo.dependencies.production[dep]}`
            );
          }
        });
      }
    }

    // Requirements validation
    if (validation) {
      output.push('');
      output.push('Requirements Validation:');
      output.push('------------------------');

      validation.passed.forEach(item => {
        output.push(`✅ ${item.requirement}: ${item.actual}`);
      });

      validation.failed.forEach(item => {
        output.push(
          `❌ ${item.requirement}: ${item.actual} (expected ${item.expected})`
        );
      });

      validation.warnings.forEach(item => {
        output.push(
          `⚠️  ${item.requirement}: ${item.actual} (recommended ${item.expected})`
        );
      });
    }

    return output.join('\n');
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
    } else if (arg === '--section') {
      options.section = args[++i];
    } else if (arg === '--check-requirements') {
      options.checkRequirements = true;
    } else if (arg === '--export') {
      options.export = args[++i];
    } else if (arg === '--help') {
      console.log(`
Usage: node debug-system.js [options]

Options:
  --format <format>      Output format (table, json) [default: table]
  --section <section>    Section to show (all, node, os, memory, disk, network, dependencies)
  --check-requirements   Validate system requirements
  --export <file>        Export to file
  --help                 Show this help message

Examples:
  node debug-system.js --check-requirements
  node debug-system.js --section node --format json
  node debug-system.js --export system-info.json
`);
      process.exit(0);
    }
  }

  try {
    const debugSystem = new DebugSystem(options);

    // Handle export if requested
    if (options.export) {
      const exportResult = await debugSystem.exportSystemInfo();
      console.log(`Export ${exportResult.exported ? 'successful' : 'failed'}`);
      if (exportResult.error) {
        console.error(`Error: ${exportResult.error}`);
        process.exit(1);
      } else if (exportResult.exported) {
        console.log(`Exported to: ${exportResult.path}`);
        console.log(`Size: ${debugSystem.formatBytes(exportResult.size)}`);
      }
    }

    const output = await debugSystem.generateOutput();
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

module.exports = { DebugSystem };
