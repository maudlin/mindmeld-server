# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with auto-reload (nodemon)
- `npm start` - Start production server
- `npm run validate` - Run all quality checks (lint + format:check + test)

### Testing
- `npm test` - Run all tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm test -- path/to/specific.test.js` - Run a single test file

### Code Quality
- `npm run lint` - Check ESLint rules
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check Prettier formatting
- `npm run openapi:lint` - Lint OpenAPI spec with Spectral

### Database & Utilities
- `npm run smoke` - Run smoke tests against running server
- `npm run seed` - Seed database with sample data

### MCP (Model Context Protocol)
- `npm run mcp:stdio` - Start MCP server over stdio
- `npm run mcp:setup` - Setup MCP configuration
- `npm run mcp:test` - Test MCP functionality

## Architecture Overview

### Core Philosophy
MindMeld Server follows **event-driven architecture** with strict separation of concerns:
- **Event Bus**: Central communication via singleton EventEmitter using "noun.verb" naming
- **Service Layer**: Business logic with dependency injection
- **Factory Pattern**: Clean dependency wiring and configuration management

### Layer Structure
```
API Layer (Express)     → Routes, middleware, error handling
Service Layer           → Business logic, validation, events  
Data Layer             → SQLite (better-sqlite3), file storage
Utility Layer          → Logger, EventBus, configuration
```

### Key Components
- **Maps API**: Core REST API with optimistic concurrency (ETag/If-Match)
- **State Service**: Legacy state management (being migrated to Maps)
- **MCP Server**: Model Context Protocol integration for AI agents
- **Event Bus**: Central communication hub using standardized events

## Technology Stack

### Runtime & Database
- **Node.js**: Version 24 (see .nvmrc)
- **Database**: SQLite with better-sqlite3 (synchronous, fast)
- **API**: Express 4 with production middleware (helmet, CORS, rate limiting)

### Development Tools
- **Testing**: Jest for unit/integration tests, Supertest for HTTP tests
- **Linting**: ESLint with custom rules matching MindMeld client standards
- **Formatting**: Prettier with lint-staged pre-commit hooks
- **API**: OpenAPI 3.1 spec linted with Spectral

## Project Structure

```
src/
├── core/                 # Core API routes and middleware
├── modules/maps/         # Maps domain (routes, services, repos)
├── services/            # Business logic services
├── data/                # Data access layer
├── utils/               # Logger, event-bus, helpers
├── factories/           # Dependency injection and server creation
└── mcp/                 # Model Context Protocol server

tests/
├── unit/                # Unit tests for services/utilities
├── integration/         # API integration tests
└── setup.js             # Global test configuration

design/
├── as-is/              # Current API state
└── to-be/              # Target API design (OpenAPI)
```

## Development Workflow

### Branch Naming
Always include Jira ticket IDs in branch names when working on tickets:
- `feat/PROJ-1234-remove-legacy-state`
- `fix/PROJ-5678-db-path-default`

### Pre-commit Quality Gates
Husky runs these checks before every commit:
- ESLint + Prettier fixes on staged files
- Full lint check
- Format verification
- OpenAPI spec linting
- Full test suite

### Environment Configuration
Key environment variables:
- `PORT` (default: 3001)
- `CORS_ORIGIN` (default: http://localhost:8080)
- `SQLITE_FILE` (default: ./data/db.sqlite)
- `FEATURE_MAPS_API` (default: true)
- `NODE_ENV` (development/production/test)

## API Design Patterns

### Maps API (Production)
- **Optimistic Concurrency**: ETag/If-Match headers + integer version field
- **Error Format**: RFC 7807 Problem Details (application/problem+json)
- **Resource Pattern**: RESTful with proper HTTP status codes
- **Data Validation**: Zod schemas for all inputs

### Legacy State API (Deprecated)
- File-based state storage (being migrated to Maps)
- Event-driven updates via EventBus
- Atomic file writes with temporary files

## Testing Strategy

### Unit Tests (`tests/unit/`)
- Test business logic in isolation
- Mock dependencies (storage, external services)
- Focus on service layer and utilities

### Integration Tests (`tests/integration/`)
- Full HTTP request/response cycles
- Real database interactions
- Test optimistic concurrency scenarios
- Validate error handling and status codes

## Docker & Deployment

### Local Docker Build
```bash
docker build -t mindmeld-server:local .
docker run --rm -p 3001:3001 \
  -e CORS_ORIGIN=http://localhost:3000 \
  -v "$(pwd)/data:/app/data" \
  mindmeld-server:local
```

### Health Checks
- `/health` - Server status and uptime
- `/ready` - Readiness probe (simple OK)

## MCP Integration

The server includes experimental Model Context Protocol support:
- **Resources**: `mindmeld://health`, `mindmeld://state`
- **Transport**: stdio (configurable to WebSocket)
- **Usage**: Enables AI agents to interact with server state

## Pull Request Requirements

Always raise PRs to merge into main - direct pushes are not allowed. When working on Jira tickets, include ticket IDs in branch names for traceability.
