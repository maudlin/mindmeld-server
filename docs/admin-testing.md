# Server Administration Commands Testing Guide

This document outlines the testing strategy and implementation for MindMeld Server administration commands. It provides guidelines for maintaining quality while being pragmatic about testing overhead.

## Current Implementation Status

### ✅ Implemented and Tested

**Database Backup (`db:backup`)**

- Full integration test suite with 55+ comprehensive tests
- Real SQLite database testing with test environment isolation
- Error condition testing, performance validation, edge cases
- Command line interface testing with all options
- Test files: `tests/admin/db-backup.test.js`, `tests/admin/helpers/admin-test-env.js`

**Server Health Diagnostics (`server:health:deep`)**

- Comprehensive test suite with 55+ tests covering all health checks
- Individual check validation (database, filesystem, memory, configuration, etc.)
- Timeout handling, error resilience, output format testing
- Mock-based testing with real process metrics validation
- Test files: `tests/admin/server-health.test.js`

**Admin Test Infrastructure**

- `AdminTestEnvironment` class for isolated testing
- Temporary directory and database management
- Helper utilities for file system and database operations
- npm script: `npm run test:admin`

### 🔧 Planned for Implementation

- Database restore, vacuum, integrity check commands
- Data export/import utilities
- Real-time monitoring and metrics
- Debug and profiling tools

## Testing Philosophy

### Pragmatic Testing Approach

Rather than strict TDD for all admin scripts, we use a **risk-based testing strategy**:

- **High-risk operations**: Full integration testing
- **Medium complexity**: Focused testing on critical paths
- **Simple utilities**: Manual testing with smoke tests

### Risk-Based Command Classification

#### **Tier 1: Critical Commands (Full Testing Required)**

```bash
db:backup       # Data loss risk - backup failure
db:restore      # Corruption risk - restore failure
data:import     # Integrity risk - invalid data import
data:cleanup    # Deletion risk - removing valid data
db:vacuum       # Corruption risk - database rebuilding
```

**Testing Requirements:**

- Complete integration test coverage
- Error condition testing
- Data integrity verification
- Recovery scenario testing

#### **Tier 2: Important Commands (Focused Testing)**

```bash
server:health:deep  # Complex validation logic
data:export         # Data transformation accuracy
data:validate       # Validation logic correctness
db:integrity        # Database analysis accuracy
debug:config        # Configuration validation
server:metrics      # Data collection accuracy
```

**Testing Requirements:**

- Key functionality testing
- Primary error paths
- Data accuracy verification
- Integration with core systems

#### **Tier 3: Simple Commands (Smoke Testing)**

```bash
server:info         # Data display only
server:logs:tail    # Log streaming
debug:routes        # Route enumeration
debug:system        # System information display
admin:help          # Help text display
```

**Testing Requirements:**

- Command executes without error
- Output format validation
- Basic functionality verification

## Testing Infrastructure

### Test Environment Setup

#### **Directory Structure**

```
tests/
├── admin/                    # Admin command tests
│   ├── helpers/             # Test utilities
│   │   ├── admin-test-env.js   # Test environment setup
│   │   ├── database-helpers.js # Database test utilities
│   │   └── file-helpers.js     # File system test utilities
│   ├── db-backup.test.js       # Database backup tests
│   ├── db-restore.test.js      # Database restore tests
│   ├── data-export.test.js     # Data export tests
│   └── smoke-tests.test.js     # Smoke tests for all commands
└── setup-admin.js           # Admin test configuration
```

#### **Test Environment Class**

```javascript
// tests/admin/helpers/admin-test-env.js
class AdminTestEnvironment {
  constructor() {
    this.tempDir = null;
    this.testDb = null;
    this.backupDir = null;
  }

  async setup() {
    // Create temporary directories
    // Setup in-memory test database
    // Initialize test data
  }

  async teardown() {
    // Cleanup temporary files
    // Close database connections
    // Reset environment
  }

  createTestMaps(count = 5) {
    // Insert test map data
  }

  verifyBackupIntegrity(backupFile) {
    // Validate backup file
  }

  runAdminCommand(command, options = {}) {
    // Execute admin command with test environment
  }
}
```

### Testing Utilities

#### **Database Helpers**

```javascript
// tests/admin/helpers/database-helpers.js
const Database = require('better-sqlite3');

function createTestDatabase(path = ':memory:') {
  const db = new Database(path);
  // Setup schema
  // Insert test data
  return db;
}

function insertTestMaps(db, count) {
  const stmt = db.prepare(`
    INSERT INTO maps (id, name, version, updated_at, state_json, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 0; i < count; i++) {
    const map = generateTestMap(i);
    stmt.run(
      map.id,
      map.name,
      map.version,
      map.updated_at,
      JSON.stringify(map.data),
      map.size_bytes
    );
  }
}

function verifyDatabaseIntegrity(dbPath) {
  const db = new Database(dbPath);
  const result = db.prepare('PRAGMA integrity_check').get();
  return result.integrity_check === 'ok';
}
```

#### **File System Helpers**

```javascript
// tests/admin/helpers/file-helpers.js
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

async function createTempDirectory(prefix = 'mindmeld-admin-test') {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function cleanupDirectory(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

function getBackupFiles(directory) {
  return fs
    .readdir(directory)
    .then(files => files.filter(f => f.includes('mindmeld-backup')));
}

async function getFileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function parseBackupFilename(filename) {
  const match = filename.match(
    /mindmeld-backup-(\d{4}-\d{2}-\d{2}-\d{6})\.(sqlite|sqlite\.gz)$/
  );
  if (!match) return null;

  return {
    timestamp: match[1],
    compressed: match[2] === 'sqlite.gz'
  };
}
```

## Test Implementation Guidelines

### Integration Test Pattern

#### **Test Structure Template**

```javascript
describe('Admin Command: command-name', () => {
  let testEnv;

  beforeEach(async () => {
    testEnv = new AdminTestEnvironment();
    await testEnv.setup();
  });

  afterEach(async () => {
    await testEnv.teardown();
  });

  describe('successful operations', () => {
    it('performs expected operation', async () => {
      // Setup test data
      // Execute command
      // Verify results
      // Check side effects
    });
  });

  describe('error conditions', () => {
    it('handles expected errors gracefully', async () => {
      // Create error condition
      // Execute command
      // Verify error handling
      // Check cleanup
    });
  });

  describe('edge cases', () => {
    it('handles boundary conditions', async () => {
      // Test edge cases
      // Verify robustness
    });
  });
});
```

### Testing Best Practices

#### **1. Use Real Dependencies**

- Actual SQLite databases (in-memory for speed)
- Real file system operations (in temp directories)
- Minimal mocking to avoid test brittleness

#### **2. Test Side Effects**

```javascript
it('creates backup with correct permissions', async () => {
  await testEnv.runAdminCommand('db:backup');

  const backupFiles = await getBackupFiles(testEnv.backupDir);
  expect(backupFiles).toHaveLength(1);

  const stats = await fs.stat(path.join(testEnv.backupDir, backupFiles[0]));
  expect(stats.mode & 0o777).toBe(0o644); // Check file permissions
});
```

#### **3. Verify Data Integrity**

```javascript
it('backup contains exact copy of data', async () => {
  // Insert known test data
  const originalData = await testEnv.getAllMaps();

  // Create backup
  await testEnv.runAdminCommand('db:backup');

  // Verify backup data
  const backupFile = await testEnv.getLatestBackup();
  const backupData = await testEnv.getMapsFromBackup(backupFile);

  expect(backupData).toEqual(originalData);
});
```

#### **4. Test Error Recovery**

```javascript
it('cleans up on failure', async () => {
  // Simulate failure condition
  const mockError = jest
    .spyOn(fs, 'writeFile')
    .mockRejectedValue(new Error('Disk full'));

  await expect(testEnv.runAdminCommand('db:backup')).rejects.toThrow(
    'Disk full'
  );

  // Verify cleanup
  const backupFiles = await getBackupFiles(testEnv.backupDir);
  expect(backupFiles).toHaveLength(0); // No partial files left

  mockError.mockRestore();
});
```

## Command-Specific Testing Requirements

### Database Backup (`db:backup`)

#### **Critical Test Cases** (✅ **IMPLEMENTED - 55 TESTS**)

- ✅ Creates timestamped backup file
- ✅ Backup contains complete data copy
- ✅ Compression option works correctly
- ✅ Custom output directory respected
- ✅ Handles database locks gracefully
- ✅ Verifies backup integrity after creation
- ✅ Reports accurate progress and statistics
- ✅ Handles insufficient disk space
- ✅ Cleans up on failure
- ✅ Performance and timing validation
- ✅ Error resilience testing
- ✅ Edge case handling

#### **Test Data Requirements**

- Empty database
- Single map database
- Multiple maps with various sizes
- Database with corrupted data
- Very large database (performance testing)

### Database Restore (`db:restore`)

#### **Critical Test Cases**

- ✅ Restores from valid backup
- ✅ Validates backup before restore
- ✅ Creates safety backup of current data
- ✅ Rollback on restore failure
- ✅ Interactive backup selection works
- ✅ Handles compressed backups
- ✅ Preserves data integrity
- ✅ Updates database statistics post-restore

### Data Export (`data:export`)

#### **Critical Test Cases**

- ✅ Exports all maps in JSON format
- ✅ Exports specific maps by filter
- ✅ CSV export format accuracy
- ✅ Compression reduces file size
- ✅ Metadata included correctly
- ✅ Large dataset handling
- ✅ Invalid data handling

### Server Health Check (`server:health:deep`)

#### **Critical Test Cases** (✅ **IMPLEMENTED - 55 TESTS**)

- ✅ All health checks execute (8 different checks)
- ✅ Accurate status reporting (HEALTHY/WARNING/UNHEALTHY)
- ✅ Timeout handling works (configurable timeouts)
- ✅ JSON/table output formats
- ✅ Recommendations generated correctly
- ✅ Performance within acceptable limits
- ✅ Individual check validation (database, filesystem, memory, config, etc.)
- ✅ Error resilience and graceful degradation

## Performance Testing

### Benchmarking Critical Operations

#### **Database Operations**

```javascript
describe('Performance Tests', () => {
  it('backup completes within time limit', async () => {
    // Create large test database
    await testEnv.createLargeDatabase(1000); // 1000 maps

    const startTime = Date.now();
    await testEnv.runAdminCommand('db:backup');
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(30000); // 30 second limit
  });
});
```

### Memory Usage Testing

#### **Large Dataset Handling**

```javascript
it('handles large exports without memory issues', async () => {
  const initialMemory = process.memoryUsage().heapUsed;

  await testEnv.runAdminCommand('data:export', { format: 'json' });

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;

  expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB limit
});
```

## Continuous Integration

### Test Configuration

#### **Jest Configuration for Admin Tests**

```javascript
// jest.admin.config.js
module.exports = {
  displayName: 'Admin Commands',
  testMatch: ['<rootDir>/tests/admin/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-admin.js'],
  testTimeout: 30000, // Longer timeout for admin operations
  maxConcurrency: 1 // Sequential execution for file system tests
};
```

#### **CI Pipeline Integration**

```yaml
# .github/workflows/admin-tests.yml
- name: Run Admin Command Tests
  run: |
    npm run test:admin
    npm run test:admin:smoke
```

### Test Data Management

#### **Test Database Setup**

```javascript
// tests/setup-admin.js
beforeAll(async () => {
  // Ensure clean test environment
  await cleanupTestDirectories();

  // Setup test database templates
  await createTestDatabaseTemplates();
});

afterAll(async () => {
  // Cleanup all test resources
  await cleanupTestDirectories();
});
```

## Maintenance and Updates

### Test Maintenance Schedule

- **Weekly**: Run full admin test suite
- **Before releases**: Complete regression testing
- **After infrastructure changes**: Update test environments
- **Quarterly**: Review and update test coverage

### Documentation Updates

This testing guide should be updated when:

- New admin commands are added
- Testing infrastructure changes
- New testing patterns are established
- Performance requirements change

---

_This guide ensures that server administration commands are tested appropriately while maintaining development velocity and avoiding unnecessary testing overhead._
