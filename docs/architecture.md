# MindMeld Server Architecture

## Overview

MindMeld Server is a production-ready backend for mind mapping applications built around the **Maps API** - a modern REST API with SQLite persistence, optimistic concurrency control, and MCP integration for AI assistants.

## Core Architecture Patterns

### 1. Layered Architecture

- **HTTP Layer**: Express routes, middleware, error handling
- **Service Layer**: Business logic, validation, orchestration
- **Repository Layer**: Data access, SQL operations, field mapping
- **Database Layer**: SQLite with WAL mode, transactions, schemas

### 2. Repository Pattern

Clean separation between business logic and data access:

- Services handle business rules and validation
- Repositories handle SQL operations and data mapping
- Database schemas managed via migrations

### 3. Optimistic Concurrency

Prevents lost updates via:

- **Version Numbers**: Integer version field increments on updates
- **ETags**: SHA-256 hash of content for HTTP cache validation
- **Conflict Detection**: 409 responses when version/ETag mismatches

## Maps API Architecture

```
HTTP Request → Routes → Service → Repository → SQLite
     ↓           ↓         ↓          ↓
  Validation  Business   SQL Ops   Data Store
  ETag Check   Logic    Prepared    WAL Mode
  Error Map              Statements
```

### Data Flow

1. **Create**: POST /maps → validate → generate ID → insert → return with ETag
2. **Read**: GET /maps/:id → query → field mapping → compute ETag → respond
3. **Update**: PUT /maps/:id → check version/ETag → update → increment version → respond
4. **List**: GET /maps → query → pagination → summary fields → respond

### Database Schema

```sql
CREATE TABLE maps (
  id TEXT PRIMARY KEY,           -- UUID
  name TEXT NOT NULL,            -- User-friendly name
  version INTEGER NOT NULL,      -- Optimistic concurrency
  updated_at TEXT NOT NULL,      -- ISO timestamp
  state_json TEXT NOT NULL,      -- Serialized map data
  size_bytes INTEGER NOT NULL    -- Content size for monitoring
);
```

## MCP Integration Architecture

Model Context Protocol endpoints share the same service layer:

```
AI Assistant → mcp-remote → MindMeld Server
                                ├── SSE Transport (/mcp/sse)
                                └── HTTP JSON-RPC (/mcp/*)
                                      ↓
                                  MapsService (shared)
                                      ↓
                                  Same Repository & DB
```

### Tools & Resources

- **Tools**: `maps.list`, `maps.get`, `maps.create`, `maps.update`, `maps.delete`
- **Resources**: `mindmeld://health`, `mindmeld://maps`
- **Transports**: Server-Sent Events (primary), HTTP JSON-RPC (fallback)

## Production Architecture

### Concurrency & Performance

- **SQLite WAL Mode**: Non-blocking reads during writes
- **Prepared Statements**: SQL injection prevention + performance
- **Connection Pooling**: Single connection per process (SQLite limitation)
- **ETag Caching**: Content-based cache invalidation

### Reliability

- **Atomic Operations**: Database transactions prevent partial updates
- **Graceful Error Handling**: Structured error responses (RFC 7807)
- **Data Validation**: Zod schemas prevent malformed data
- **Version Conflict Resolution**: Clear conflict detection and resolution

### Monitoring

- **Structured Logging**: JSON logs with request IDs
- **Health Endpoints**: `/health` and `/ready` for load balancers
- **Error Tracking**: Comprehensive error logging and metrics
- **Performance Metrics**: Request timing and database operation stats

## Scalability Considerations

### Current Design (Single User)

- **SQLite**: Perfect for personal/small team use
- **File-based storage**: Simple deployment and backup
- **In-memory processing**: Fast operations

### Future Scaling Options

- **Database**: PostgreSQL for multi-user scenarios
- **Caching**: Redis for session/frequently accessed data
- **Message Queue**: For async operations and background processing
- **Load Balancing**: Horizontal scaling with stateless design

## Client Architecture

### Data Provider System

MindMeld's client architecture supports multiple data storage strategies through a unified interface:

```
Client Application
     ↓
DataProviderFactory ← Feature Flags & Environment Detection
     ↓
DataProviderInterface
     ├── LocalJSONProvider (localStorage)
     ├── YjsProvider (real-time collaboration)
     └── RestAPIProvider (future: direct HTTP)
```

### Provider Selection Logic

1. **Environment Detection**: Browser vs server-side rendering
2. **Feature Flags**: Enable/disable collaboration features
3. **Fallback Strategy**: Graceful degradation when features unavailable
4. **Migration Support**: Seamless switching between providers

### LocalJSONProvider Architecture

```
LocalJSONProvider
     ├── localStorage (map data)
     ├── localStorage (metadata)
     ├── Subscription System (change notifications)
     ├── Autosave Control (pause/resume)
     └── Storage Management (quota, cleanup)
```

### Real-time Collaboration (YjsProvider)

```
YjsProvider → Y.Doc (local) → IndexedDB (persistence)
     ↓              ↓
WebSocket    Conflict Resolution
     ↓              ↓
YJS Server ← → SQLite (snapshots)
```

### Y.js Document Lifecycle Management

The YjsService manages document cleanup to prevent resource leaks:

- **Document Creation**: Creates Y.js documents with persistence and connection tracking
- **Document Deletion**: Comprehensive cleanup when maps are deleted:
  - Closes all active WebSocket connections for the document
  - Destroys the Y.js document instance to free memory
  - Removes document metadata and connection tracking
  - Deletes persisted snapshots from the database
  - Creates audit trail entries for deletion events
- **Resource Management**: Automatic cleanup prevents memory leaks and orphaned data

### Data Format Consistency

All providers use the same JSON format:

```javascript
{
  n: [...],  // Notes/nodes
  c: [...],  // Connections
  meta: {    // Metadata
    version: 1,
    created: "2025-09-23T10:30:00.000Z",
    modified: "2025-09-23T10:30:00.000Z",
    title: "Map Title"
  }
}
```

### Hydration Suppression

For server-side rendering frameworks:

- **Server Detection**: Prevents localStorage access during SSR
- **Hydration Markers**: Tracks when client-side is ready
- **Safe Initialization**: Defers provider creation until browser ready
- **Fallback Handling**: Graceful degradation when APIs unavailable

---

This architecture provides a solid foundation for production deployment while maintaining clean separation of concerns and comprehensive data integrity guarantees.
