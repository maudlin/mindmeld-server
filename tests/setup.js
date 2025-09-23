/**
 * Jest test setup
 * Global test configuration and utilities
 */

const fs = require('fs').promises;
const path = require('path');
const { cleanupOldTestBackups } = require('./utils/temp-files');

// Global test timeout
jest.setTimeout(10000);

// Clean up test data directory and safety backups after tests
afterAll(async () => {
  const testDataDir = path.join(process.cwd(), 'test-data');
  try {
    await fs.rm(testDataDir, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
  
  // Clean up any safety backups created during tests
  await cleanupOldTestBackups();
});

// Suppress console.log during tests unless VERBOSE is set
if (!process.env.VERBOSE) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn()
    // Keep error for debugging
  };
}
