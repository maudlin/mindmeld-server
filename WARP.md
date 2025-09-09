# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

MindMeld Server is a production-ready REST API for mind mapping applications with integrated MCP (Model Context Protocol) support for AI assistants. It features SQLite persistence, optimistic concurrency control, and comprehensive AI assistant integration.

## Quick Start Commands

### Development

```bash
npm install                # Install dependencies
npm run dev               # Start development server with auto-reload
npm start                 # Production start
npm run validate          # Run all checks (lint + format + tests)
```

### Testing

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Generate coverage report
npm run mcp:test          # Test MCP integration specifically
```

### Code Quality

```bash
npm run lint              # Check linting
npm run lint:fix          # Fix linting issues
npm run format            # Format code with Prettier
npm run format:check      # Check formatting without changes
```

### MCP Integration

```bash
FEATURE_MCP=1 npm start   # Start server with MCP enabled
node test-mcp.js          # Test MCP functionality
```

## Architecture

### High-Level Structure

```
src/
├── core/                 # HTTP layer, middleware, error handling
├── modules/maps/         # Maps API (routes → service → repo → db)
├── mcp/                  # MCP protocol implementation
├── services/             # Legacy state service (being phased out)
├── utils/                # Logging, event bus, ETag utilities
├── factories/            # Server composition and DI
└── config/               # Environment and configuration
```

### Key Patterns

**Modern Maps API (Follow this pattern for new features):**

- **Routes Layer**: Express handlers, ETag computation, HTTP status codes
- **Service Layer**: Zod validation, business logic, orchestration
- **Repository Layer**: SQL operations, data mapping, prepared statements
- **Database Layer**: SQLite with WAL mode, schemas, transactions

**MCP Integration:**

- Dual transport: Server-Sent Events (primary) + HTTP JSON-RPC (fallback)
- Tools: `maps.list`, `maps.get`, `maps.create`, `maps.update`, `maps.delete`
- Resources: `mindmeld://health`, `mindmeld://maps`

## Development Guidelines

### Adding New API Endpoints

1. **Follow Maps API pattern**: Routes → Service → Repository → Database
2. **Use Zod validation** for all inputs with strict schemas
3. **Implement optimistic concurrency** with version numbers + ETags
4. **Add comprehensive tests** (unit + integration)
5. **Update documentation** for any behavior changes

### Database Operations

- Use prepared statements for all SQL operations
- SQLite WAL mode is configured for better concurrency
- Field naming: `snake_case` in DB, `camelCase` in responses
- Always use transactions for multi-step operations

### Error Handling

- Custom error types: `BadRequestError → 400`, `NotFoundError → 404`, `ConflictError → 409`
- RFC 7807 Problem Details format for structured errors
- Zod validation errors include detailed field-level feedback

### Code Quality Standards

- **Node 24 baseline** - use modern JavaScript features
- **ESLint + Prettier** - enforced via Husky pre-commit hooks
- **Structured logging** - use pino logger, never console.log
- **Repository pattern** - clean separation of data access from business logic

## Configuration

### Environment Variables

```bash
# Core settings
PORT=3001                           # Server port
CORS_ORIGIN=http://localhost:8080   # CORS configuration
JSON_LIMIT=50mb                     # Request payload limit

# Database
SQLITE_FILE=./data/db.sqlite        # SQLite database file

# Feature flags
FEATURE_MAPS_API=true               # Maps API (default: enabled)
FEATURE_MCP=true                    # MCP integration

# Development
NODE_ENV=development                # Environment
LOG_LEVEL=debug                     # Logging level
```

### MCP Configuration (for AI assistants)

```json
{
  "mindmeld-server": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "http://localhost:3001/mcp/sse"],
    "env": {},
    "working_directory": null
  }
}
```

## Testing Strategy

### Unit Tests (`tests/unit/`)

- Service logic, validation, error handling
- Repository layer data access and field mapping
- Utilities (ETag computation, event bus, logging)

### Integration Tests (`tests/integration/`)

- Full HTTP request/response cycles
- Database integration with real SQLite data
- Concurrency testing (version conflicts, ETag mismatches)
- Error scenarios and edge cases

### Test Database

- Use `:memory:` SQLite for tests (fast, isolated)
- Each test gets fresh database instance
- No persistent state between tests

## Common Development Tasks

### Running Single Tests

```bash
npm test -- path/to/specific.test.js
npm test -- --testNamePattern="should handle version conflicts"
```

### Database Inspection

```bash
sqlite3 ./data/db.sqlite
.schema maps
SELECT * FROM maps LIMIT 5;
```

### Debug Logging

```bash
DEBUG=mindmeld-server:* npm start
LOG_LEVEL=debug npm start
```

### Health Checks

```bash
curl http://localhost:3001/health          # Basic health
curl http://localhost:3001/ready           # Readiness probe
curl http://localhost:3001/maps            # API health
```

## Important Implementation Details

### Optimistic Concurrency Control

- Every update requires version number and current ETag
- Version conflicts return 409 Conflict with detailed error message
- ETags computed from content hash for cache invalidation

### Double-Wrap Prevention

The API actively rejects double-wrapped data structures:

```javascript
// ❌ REJECTED - Double-wrapped
{ state: { data: { n: [], c: [] } } }

// ✅ ACCEPTED - Correct format
{ state: { n: [], c: [] } }
```

### Data Validation

- Strict Zod schemas reject invalid data at API boundary
- All required fields must be present and correctly typed
- Short-form field names: `n` (notes), `c` (connections), `i` (id), `p` (position)

## Legacy Components (Being Phased Out)

- **State API**: Simple file-based storage, use Maps API for new features
- **StateService**: Legacy service layer, follow Maps service patterns instead

## Production Considerations

- **WAL mode**: Non-blocking reads during writes
- **Rate limiting**: 60 req/min by default, configurable
- **CORS**: Configurable origin restrictions
- **Payload limits**: Prevent memory exhaustion attacks
- **Structured logging**: pino with request IDs for tracing
- **Docker ready**: Multi-stage build with health checks

## Documentation

Comprehensive guides available in `docs/`:

- `mcp-quick-start.md` - 30-second MCP setup
- `mcp-developer-guide.md` - Complete integration reference
- `architecture.md` - System design and patterns
- `developer-guide.md` - Development workflows and best practices
- `client-integration.md` - Client-server integration patterns
- `testing-guide.md` - Testing strategies and examples
- `warp-mcp-config.md` - Warp Terminal configuration

Always update documentation when making architectural changes or adding new features.
