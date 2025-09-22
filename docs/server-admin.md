# MindMeld Server Administration Guide

This document outlines the comprehensive server administration commands and tools for the MindMeld Server. These commands are designed to provide robust operational management, monitoring, and maintenance capabilities.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Database Management](#database-management)
- [Server Monitoring & Diagnostics](#server-monitoring--diagnostics)
- [Data Management & Migration](#data-management--migration)
- [Development & Debug Tools](#development--debug-tools)
- [Security Considerations](#security-considerations)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The MindMeld Server administration tools are implemented as npm scripts that provide:

- **Database Operations**: Backup (✅ implemented), restore, maintenance, and health monitoring
- **Server Monitoring**: Deep health diagnostics (✅ implemented), real-time metrics, logging
- **Data Management**: Export, import, cleanup, and migration utilities (planned)
- **Development Tools**: Debugging, testing, and profiling capabilities (planned)
- **Documentation**: Interactive help and comprehensive guides

### Implementation Status

✅ **Currently Available:**

- `db:backup` - Complete database backup with compression and verification
- `db:restore` - Database restore with safety backup and validation
- `server:health:deep` - Comprehensive health diagnostics and monitoring
- `test:admin` - Admin command test suite

🔧 **In Development:**

- Additional database maintenance commands
- Data export/import utilities
- Real-time monitoring and metrics
- Debug and profiling tools

### Command Naming Convention

All admin commands follow a consistent naming pattern:

- `npm run <category>:<action>[:<subcategory>]`
- Categories: `db`, `server`, `data`, `debug`, `admin`
- Common options: `--help`, `--verbose`, `--dry-run`

## Getting Started

### Prerequisites

- Node.js 24+ installed
- MindMeld Server configured and accessible
- Appropriate file system permissions
- SQLite database initialized

### Quick Start

```bash
# Check comprehensive server health
npm run server:health:deep

# Check server health with JSON output
npm run server:health:deep -- --format json

# Create database backup
npm run db:backup

# Create compressed backup with custom location
npm run db:backup -- --output ./my-backups --compress

# Run admin command tests
npm run test:admin
```

## Database Management

### Backup Operations

#### `npm run db:backup` ✅ **IMPLEMENTED**

**Purpose**: Create a timestamped backup of the SQLite database

**Usage**:

```bash
npm run db:backup [-- --output=/path/to/backup] [--compress] [--verbose]
```

**Options**:

- `--output`: Custom backup location (default: `./backups/`)
- `--compress`: Enable gzip compression
- `--verbose`: Detailed progress output
- `--name`: Custom backup name prefix

**Behavior**:

- Creates timestamped backup file: `mindmeld-backup-YYYY-MM-DD-HHMMSS.sqlite`
- Verifies database integrity before backup
- Uses SQLite `.backup` command for consistency
- Stores backup metadata (size, duration, checksum)
- Supports compression to reduce file size

**Example Output**:

```
[backup] Starting database backup...
[backup] Database size: 2.1 MB
[backup] Backup location: ./backups/mindmeld-backup-2025-01-10-190223.sqlite.gz
[backup] Backup completed in 1.2s
[backup] Compressed size: 890 KB (57% reduction)
[backup] Checksum: sha256:abc123...
```

#### `npm run db:backup:scheduled` 🔧 **PLANNED**

**Purpose**: Automated backup with retention policy

**Usage**:

```bash
npm run db:backup:scheduled [-- --keep=7] [--compress]
```

**Behavior**:

- Creates backup with timestamp
- Automatically removes backups older than retention period
- Sends notifications on success/failure
- Logs backup operations for audit trail

### Restore Operations

#### `npm run db:restore` ✅ **IMPLEMENTED**

**Purpose**: Restore database from backup file with safety and verification

**Usage**:

```bash
npm run db:restore [-- --backup=/path/to/backup.sqlite] [--no-verify] [--no-safety] [--verbose]
```

**Options**:

- `--backup`: Specific backup file to restore (auto-selects newest if not provided)
- `--backup-dir`: Directory to search for backups (default: `./backups`)
- `--no-verify`: Skip backup file integrity validation
- `--no-safety`: Skip creating safety backup of current database
- `--force`: Skip confirmation prompts
- `--verbose`: Show detailed progress information

**Behavior**:

- Auto-selects newest backup if none specified
- Creates safety backup of current database before restore
- Validates backup file integrity (SQLite PRAGMA integrity_check)
- Supports both compressed (.gz) and uncompressed backups
- Provides automatic rollback on restore failure
- Cleans up temporary files automatically

**Example Output**:

```
[restore] Starting database restore...
[restore] Selected backup: mindmeld-backup-2025-01-10-120000.sqlite.gz
[restore] Safety backup created: safety-backup-2025-01-10-190230.sqlite
[restore] Validating backup file...
[restore] Decompressing backup file...
[restore] Restoring database...
[restore] Restore completed successfully in 2.3s
[restore] Database restored from: mindmeld-backup-2025-01-10-120000.sqlite.gz
```

### Maintenance Operations

#### `npm run db:vacuum`

**Purpose**: Optimize SQLite database

**Usage**:

```bash
npm run db:vacuum [-- --analyze] [--verbose]
```

**Behavior**:

- Reclaims unused space
- Rebuilds database file
- Updates table statistics
- Reports space savings

#### `npm run db:integrity`

**Purpose**: Check database integrity

**Usage**:

```bash
npm run db:integrity [-- --fix] [--verbose]
```

**Behavior**:

- Runs PRAGMA integrity_check
- Reports corruption issues
- Suggests recovery procedures
- Optional automatic fixes for minor issues

### Statistics & Health

#### `npm run db:stats`

**Purpose**: Display comprehensive database statistics

**Usage**:

```bash
npm run db:stats [-- --format=table|json] [--verbose]
```

**Output**:

```
Database Statistics
===================
File Size:      2.1 MB
Tables:         1
Total Records:  150
Map Records:    150
Indexes:        2
Page Size:      4096
WAL Mode:       true
Last Vacuum:    2025-01-09 14:30:22
```

## Server Monitoring & Diagnostics

### Server Information

#### `npm run server:info`

**Purpose**: Display complete server status and configuration

**Usage**:

```bash
npm run server:info [-- --format=table|json] [--sensitive]
```

**Output**:

```
MindMeld Server Information
===========================
Version:        0.1.0
Node.js:        24.1.0
Uptime:         2d 14h 32m
Port:           3001
Environment:    production
Features:
  - Maps API:   enabled
  - MCP:        enabled (SSE transport)
Database:
  - Type:       SQLite
  - Size:       2.1 MB
  - Maps:       150
Memory Usage:
  - RSS:        45.2 MB
  - Heap:       32.1 MB
  - External:   8.5 MB
```

#### `npm run server:config`

**Purpose**: Show resolved configuration (sanitized)

**Usage**:

```bash
npm run server:config [-- --format=json] [--show-defaults]
```

**Behavior**:

- Shows sanitized configuration (no secrets)
- Indicates source of each setting (env, default, config file)
- Validates configuration against schema
- Highlights potential issues

### Performance Metrics

#### `npm run server:metrics`

**Purpose**: Display real-time performance metrics

**Usage**:

```bash
npm run server:metrics [-- --interval=5] [--format=table|json]
```

**Output**:

```
Performance Metrics (Last 5 minutes)
=====================================
Requests:       1,234 req/min
Response Time:
  - Average:    45ms
  - p95:        120ms
  - p99:        280ms
Status Codes:
  - 2xx:        98.5%
  - 4xx:        1.3%
  - 5xx:        0.2%
Memory:         45.2 MB (stable)
CPU:            12% (avg)
Database:       23 queries/min
Active Conns:   8
```

### Real-time Monitoring

#### `npm run server:logs:tail`

**Purpose**: Live log streaming with filtering

**Usage**:

```bash
npm run server:logs:tail [-- --level=info] [--filter="maps"] [--follow]
```

**Options**:

- `--level`: Log level filter (debug, info, warn, error)
- `--filter`: Text filter for log messages
- `--format`: Output format (pretty, json)
- `--follow`: Continue streaming (default: true)

#### `npm run server:events`

**Purpose**: Monitor event bus activity

**Usage**:

```bash
npm run server:events [-- --type=all] [--verbose]
```

**Behavior**:

- Shows real-time event bus activity
- Filters by event type
- Displays event payloads
- Tracks event frequency

### Health Diagnostics

#### `npm run server:health:deep` ✅ **IMPLEMENTED**

**Purpose**: Comprehensive health check

**Usage**:

```bash
npm run server:health:deep [-- --format=json] [--timeout=30]
```

**Checks**:

- Database connectivity and integrity
- File system permissions
- Memory usage and limits
- Network connectivity
- API endpoint availability
- MCP transport health
- Configuration validity

**Output**:

```
Deep Health Check Results
=========================
Overall Status: HEALTHY

✅ Database Connection    (2ms)
✅ File System Access     (1ms)
✅ Memory Usage          (45.2 MB / 512 MB)
✅ API Endpoints         (all responding)
✅ MCP Transport         (SSE active)
⚠️  Disk Space           (85% full - warning)
❌ Backup Age            (last backup: 3 days ago)

Recommendations:
- Schedule regular backups
- Monitor disk space usage
- Consider log rotation
```

## Data Management & Migration

### Data Export

#### `npm run data:export`

**Purpose**: Export all maps to backup format

**Usage**:

```bash
npm run data:export [-- --format=json|csv] [--output=/path/to/export] [--compress]
```

**Options**:

- `--format`: Export format (json, csv, sql)
- `--output`: Output directory or file
- `--compress`: Enable compression
- `--filter`: Export filter criteria
- `--include-metadata`: Include system metadata

**JSON Format**:

```json
{
  "export_info": {
    "version": "1.0.0",
    "exported_at": "2025-01-10T19:02:23Z",
    "server_version": "0.1.0",
    "total_maps": 150,
    "format": "json"
  },
  "maps": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Project Planning",
      "version": 5,
      "created_at": "2025-01-08T10:30:00Z",
      "updated_at": "2025-01-10T14:20:15Z",
      "size_bytes": 2048,
      "data": {
        "nodes": [...],
        "connections": [...]
      }
    }
  ]
}
```

#### `npm run data:export:schema`

**Purpose**: Export database schema

**Usage**:

```bash
npm run data:export:schema [-- --format=sql|json]
```

**Behavior**:

- Exports complete schema definition
- Includes indexes and constraints
- Documents column types and relationships
- Useful for schema migration planning

### Data Import

#### `npm run data:import`

**Purpose**: Import maps from backup files

**Usage**:

```bash
npm run data:import [-- --file=/path/to/export.json] [--merge] [--dry-run]
```

**Options**:

- `--file`: Import file path
- `--merge`: Merge with existing data (vs replace)
- `--conflict`: Conflict resolution (skip, overwrite, merge)
- `--dry-run`: Validate without importing
- `--batch-size`: Number of records per batch

**Behavior**:

- Validates import file format
- Checks for conflicts with existing data
- Creates backup before importing
- Provides detailed progress reporting
- Supports rollback on failure
- Logs all import operations

### Data Migration

#### `npm run data:migrate`

**Purpose**: Handle database schema migrations and data transformations

**Usage**:

```bash
npm run data:migrate [-- --version=latest] [--dry-run] [--force] [--rollback]
```

**Options**:

- `--version`: Target migration version (latest, specific version, or 'up'/'down')
- `--dry-run`: Preview migrations without applying
- `--force`: Override migration safety checks
- `--rollback`: Roll back the last migration
- `--verbose`: Show detailed migration steps
- `--backup`: Create backup before migration

**Behavior**:

- Applies pending database schema changes
- Handles data transformations between versions
- Creates automatic backups before major changes
- Validates data integrity after migration
- Supports rollback to previous versions
- Tracks migration history

**Output**:

```
Migration Status
================
Current Version:   1.2.0
Target Version:    1.3.0
Pending:          2 migrations

Applying Migrations:
✅ 001_add_metadata_columns.sql       (0.12s)
✅ 002_update_size_calculation.sql     (0.35s)

Migration Complete
✅ Database schema updated to v1.3.0
✅ Data integrity validated
✅ Backup created: ./backups/pre-migration-20250120-140255.sqlite
```

### Backup Management

#### `npm run data:backup`

**Purpose**: Create, restore, and manage database backups

**Usage**:

```bash
npm run data:backup [-- --create] [--restore=/path/to/backup] [--list] [--clean]
```

**Options**:

- `--create`: Create new backup (default action)
- `--restore`: Restore from backup file
- `--list`: List available backups
- `--clean`: Remove old backups (keeps last 10)
- `--compress`: Enable compression (gzip)
- `--encrypt`: Encrypt backup file
- `--output`: Custom backup location
- `--name`: Custom backup name

**Behavior**:

- Creates compressed, timestamped backups
- Supports encryption for sensitive data
- Validates backup integrity
- Manages backup retention policies
- Provides restore verification
- Logs all backup operations

**Backup Creation Output**:

```
Backup Creation
===============
Starting backup...
✅ Database locked for consistent backup
✅ Data exported (150 maps, 2.1 MB)
✅ Compression applied (2.1 MB → 524 KB)
✅ Integrity verified

Backup Complete:
File:     ./backups/mindmeld-20250120-140255.sqlite.gz
Size:     524 KB
Maps:     150
Duration: 1.2s
```

**Restore Output**:

```
Backup Restore
==============
Validating backup file...
✅ Backup integrity verified
✅ Compatible version (1.2.0)
✅ Pre-restore backup created

Restoring data...
✅ 150 maps restored
✅ Indexes rebuilt
✅ Data integrity verified

Restore Complete (2.1s)
```

### Data Cleanup

#### `npm run data:cleanup`

**Purpose**: Clean up orphaned or corrupted data

**Usage**:

```bash
npm run data:cleanup [-- --dry-run] [--fix-corruption] [--vacuum] [--verbose]
```

**Options**:

- `--dry-run`: Preview cleanup without making changes
- `--fix-corruption`: Attempt to repair corrupted data
- `--vacuum`: Compact database to reclaim space
- `--orphans`: Remove orphaned records
- `--verbose`: Show detailed cleanup operations

**Operations**:

- Remove orphaned records
- Fix invalid JSON data
- Update missing timestamps
- Recalculate size_bytes
- Validate foreign key constraints
- Clean up temporary files
- Optimize database indexes
- Reclaim unused space

**Output**:

```
Data Cleanup Results
====================
✅ Fixed 3 corrupted JSON records
✅ Removed 12 orphaned references
✅ Updated 8 missing timestamps
✅ Recalculated 150 size values
✅ Vacuumed database (2.1 MB → 1.8 MB)

Space reclaimed: 320 KB
Integrity: 100% valid
```

#### `npm run data:validate`

**Purpose**: Comprehensive data integrity check

**Usage**:

```bash
npm run data:validate [-- --fix] [--report=/path/to/report.json] [--detailed]
```

**Options**:

- `--fix`: Automatically fix repairable issues
- `--report`: Generate detailed validation report
- `--detailed`: Include per-record validation details
- `--format`: Report format (json, html, text)

**Checks**:

- JSON data validity
- Required field presence
- Data type consistency
- Size calculations
- Timestamp formats
- Referential integrity
- Schema compliance
- Version compatibility

**Output**:

```
Data Validation Report
======================
✅ JSON Validity:      150/150 valid
✅ Required Fields:    150/150 complete
✅ Data Types:         150/150 correct
⚠️  Size Calculation:  147/150 accurate (3 recalculated)
✅ Timestamps:         150/150 valid
✅ Schema Compliance:  150/150 compliant

Overall Status: HEALTHY (99.8%)
Issues Fixed:   3
Recommendations: Run cleanup to optimize
```

## Development & Debug Tools

### Configuration Debugging

#### `npm run debug:config` 🔧 **PLANNED**

**Purpose**: Show complete resolved configuration with source tracking and validation

**Usage**:

```bash
npm run debug:config [-- --format=json|table] [--show-env] [--validate]
```

**Options**:

- `--format`: Output format (table for human reading, json for scripts)
- `--show-env`: Include all environment variables (sanitized)
- `--validate`: Run configuration validation checks
- `--defaults`: Show default values for unset options

**Output**:

```
Configuration Debug
===================
Source Priority: env > config > defaults

PORT:
  Value:    3001
  Source:   environment
  Valid:    ✅

CORS_ORIGIN:
  Value:    http://localhost:8080
  Source:   environment
  Valid:    ✅

SQLITE_FILE:
  Value:    ./data/db.sqlite
  Source:   default
  Valid:    ✅ (writable)

Feature Flags:
  MAPS_API: enabled
  MCP:      enabled
```

### API Exploration

#### `npm run debug:routes` 🔧 **PLANNED**

**Purpose**: List all registered routes and middlewares for API debugging

**Usage**:

```bash
npm run debug:routes [-- --format=table|json] [--test] [--method=GET] [--path=/maps]
```

**Options**:

- `--format`: Output format (table, json)
- `--test`: Test route accessibility
- `--method`: Filter by HTTP method
- `--path`: Filter by path pattern

**Output**:

```
Registered Routes
=================
GET    /health          [helmet, cors, logging]
GET    /ready           [helmet, cors, logging]
GET    /maps            [helmet, cors, logging, rateLimit]
POST   /maps            [helmet, cors, logging, rateLimit]
GET    /maps/:id        [helmet, cors, logging, rateLimit]
PUT    /maps/:id        [helmet, cors, logging, rateLimit]
DELETE /maps/:id        [helmet, cors, logging, rateLimit]
GET    /mcp/sse         [helmet, cors, logging] (MCP)
POST   /mcp/http        [helmet, cors, logging] (MCP)
```

#### `npm run debug:endpoints` 🔧 **PLANNED**

**Purpose**: Test all endpoints for basic functionality and performance

**Usage**:

```bash
npm run debug:endpoints [-- --verbose] [--timeout=5000] [--parallel] [--report]
```

**Options**:

- `--verbose`: Show detailed request/response information
- `--timeout`: Request timeout in milliseconds
- `--parallel`: Run tests concurrently
- `--report`: Generate detailed test report

**Behavior**:

- Tests each endpoint with appropriate requests
- Validates response formats
- Checks status codes
- Measures response times
- Identifies broken endpoints

### MCP Testing

#### `npm run debug:mcp` 🔧 **PLANNED**

**Purpose**: Test MCP (Model Context Protocol) integration and functionality

**Usage**:

```bash
npm run debug:mcp [-- --tool=all] [--resource=all] [--verbose] [--transport=sse]
```

**Options**:

- `--tool`: Specific tool to test (or 'all')
- `--resource`: Specific resource to test (or 'all')
- `--verbose`: Show detailed protocol communication
- `--transport`: Test specific transport (sse, http)

**Tests**:

- MCP transport connectivity (SSE, HTTP)
- Tool invocation and responses
- Resource access and data
- Error handling and recovery
- Performance and reliability

### System Diagnostics

#### `npm run debug:system` 🔧 **PLANNED**

**Purpose**: Analyze system environment and dependencies for debugging

**Usage**:

```bash
npm run debug:system [-- --format=table|json] [--check-requirements] [--section=all]
```

**Options**:

- `--format`: Output format (table, json)
- `--check-requirements`: Validate against system requirements
- `--section`: Specific section to show (node, os, network, all)
- `--export`: Export to file

**Information**:

- Node.js version and flags
- Operating system details
- Available memory and disk space
- Network configuration
- Environment variables (sanitized)
- Dependency versions

## Security Considerations

### Access Control

- Admin commands require appropriate file system permissions
- Database operations need read/write access to SQLite file
- Backup operations require write access to backup directory
- Log access requires read permissions on log files

### Data Protection

- Backup files contain sensitive data - secure appropriately
- Configuration dumps exclude sensitive values by default
- Log outputs are sanitized to prevent information disclosure
- Export operations should be restricted in production

### Network Security

- Server monitoring commands may expose internal information
- MCP debug tools should not be used in production
- Health endpoints should be protected with authentication
- Performance metrics may reveal usage patterns

## Best Practices

### Production Operations

1. **Regular Backups**

   ```bash
   # Daily automated backup with 30-day retention
   npm run db:backup:scheduled -- --keep=30 --compress
   ```

2. **Health Monitoring**

   ```bash
   # Automated health checks
   npm run server:health:deep --format=json > health-$(date +%s).json
   ```

3. **Performance Monitoring**
   ```bash
   # Continuous metrics collection
   npm run server:metrics --interval=60 --format=json >> metrics.log
   ```

### Development Workflow

1. **Environment Validation**

   ```bash
   npm run debug:config --validate
   npm run debug:system
   ```

2. **API Testing**

   ```bash
   npm run debug:endpoints --verbose
   npm run debug:mcp --tool=all
   ```

3. **Data Management**
   ```bash
   npm run data:export --format=json --output=./dev-backup.json
   npm run data:validate --fix
   ```

### Disaster Recovery

1. **Backup Strategy**
   - Daily automated backups
   - Weekly full system exports
   - Monthly off-site backup verification
   - Documented restore procedures

2. **Recovery Testing**
   ```bash
   # Test restore procedure
   npm run db:restore --backup=test-backup.sqlite --verify
   npm run data:validate
   npm run server:health:deep
   ```

## Troubleshooting

### Common Issues

#### Database Locked

```bash
# Check for active connections
npm run db:stats
# Force unlock (use with caution)
npm run db:vacuum --force
```

#### High Memory Usage

```bash
# Check memory usage
npm run server:metrics
# Analyze heap dump
npm run debug:profile --heap-dump
```

#### Slow Performance

```bash
# Analyze performance metrics
npm run server:performance --detailed
# Check database performance
npm run db:stats --analyze
```

#### Backup Failures

```bash
# Check disk space
npm run debug:system
# Verify database integrity
npm run db:integrity
# Manual backup
npm run db:backup --verbose
```

### Error Codes

- **EXIT_DB_LOCKED**: Database is locked by another process
- **EXIT_INSUFFICIENT_SPACE**: Not enough disk space for operation
- **EXIT_PERMISSION_DENIED**: Insufficient file system permissions
- **EXIT_BACKUP_CORRUPTED**: Backup file is corrupted or invalid
- **EXIT_CONFIG_INVALID**: Configuration validation failed

### Support Information

For additional support:

- Check server logs: `npm run server:logs:tail --level=error`
- Run health diagnostics: `npm run server:health:deep`
- Export system information: `npm run debug:system --format=json`
- Review configuration: `npm run debug:config --validate`

---

_This guide covers both implemented and planned server administration capabilities._

**Currently Available:**

- ✅ `npm run db:backup` - Full database backup with compression and verification
- ✅ `npm run server:health:deep` - Comprehensive health diagnostics
- ✅ `npm run test:admin` - Admin command test suite with 55+ tests

**In Development:**

- 🔧 Additional database operations (restore, vacuum, integrity checks)
- 🔧 Data management (export, import, cleanup, validation)
- 🔧 Real-time monitoring and metrics
- 🔧 Debug and profiling tools

_Implementation follows TDD approach with comprehensive test coverage - check `tests/admin/` for test specifications._
