const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'test-results/html' }]],
  timeout: 30 * 1000,

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    extraHTTPHeaders: {
      Accept: 'application/json'
    }
  }
});
