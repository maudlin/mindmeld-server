# MindMeld Server Architecture

## Overview

MindMeld Server follows the architectural patterns established by the MindMeld client, emphasizing clean separation of concerns, event-driven design, and production readiness.

## Architectural Principles

### 1. Event-Driven Architecture
- **Central Event Bus**: All components communicate through a singleton event bus
- **Loose Coupling**: Components don't directly depend on each other
- **Standardized Events**: "noun.verb" naming convention (e.g., `state.saved`, `request.completed`)

### 2. Service Layer Pattern
- **Business Logic Separation**: Core logic isolated in service classes
- **Dependency Injection**: Services receive dependencies via constructor
- **Single Responsibility**: Each service handles one domain area

### 3. Factory Pattern
- **Configuration Management**: Server factory handles dependency wiring
- **Environment Abstraction**: Different configurations for dev/test/prod
- **Testability**: Easy to create configured instances for testing

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Express)                     │
├─────────────────────────────────────────────────────────────┤
│  Middleware  │  Routes  │  Error Handling  │  CORS/Logging │
├─────────────────────────────────────────────────────────────┤
│                   Service Layer                             │
├─────────────────────────────────────────────────────────────┤
│  StateService │  Validation │  Business Logic │  Events    │
├─────────────────────────────────────────────────────────────┤
│                   Data Layer                                │
├─────────────────────────────────────────────────────────────┤
│  FileStorage  │  Atomic Writes │  Error Handling            │
├─────────────────────────────────────────────────────────────┤
│                   Utility Layer                             │
├─────────────────────────────────────────────────────────────┤
│  Logger      │  EventBus     │  Configuration              │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### Core Components

#### `src/core/api-routes.js`
- **Purpose**: RESTful API endpoint definitions
- **Dependencies**: StateService (injected)
- **Events**: Emits request lifecycle events
- **Responsibility**: HTTP request/response handling

#### `src/core/middleware.js`
- **Purpose**: Express middleware configuration
- **Features**: CORS, JSON parsing, logging, error handling
- **Events**: Request tracking and error reporting
- **Security**: Payload size limits, request validation

### Service Layer

#### `src/services/state-service.js`
- **Purpose**: Mind map state business logic
- **Features**: Validation, statistics, error handling
- **Dependencies**: Storage (injected)
- **Events**: State lifecycle events (`state.saving`, `state.saved`, `state.error`)

### Data Layer

#### `src/data/file-storage.js`
- **Purpose**: File-based state persistence
- **Features**: Atomic writes, error recovery
- **Events**: Storage operation events
- **Safety**: Temporary file pattern prevents corruption

### Utility Layer

#### `src/utils/event-bus.js`
- **Purpose**: Central event communication
- **Pattern**: Singleton EventEmitter
- **Features**: Error handling, debug logging
- **Convention**: "noun.verb" event naming

#### `src/utils/logger.js`
- **Purpose**: Centralized logging
- **Features**: Structured logging, environment-aware
- **Levels**: INFO, ERROR, WARN, DEBUG
- **Format**: ISO timestamps, consistent formatting

### Factory Layer

#### `src/factories/server-factory.js`
- **Purpose**: Server creation and dependency injection
- **Configuration**: Environment-based settings
- **Dependencies**: Wires all components together
- **Testability**: Configurable for different environments

## Event Flow

### State Save Operation
```
1. PUT /api/state request received
2. api-routes.js emits 'api.state.put-requested'
3. StateService validates state
4. StateService emits 'state.validated'
5. FileStorage performs atomic write
6. FileStorage emits 'state.saving'
7. FileStorage emits 'state.saved' (success)
8. StateService emits operation completion
9. api-routes.js emits 'api.state.put-completed'
10. HTTP response sent
```

### Error Flow
```
1. Error occurs in any component
2. Component emits specific error event
3. Logger captures error details
4. EventBus handles error propagation
5. Middleware sends appropriate HTTP response
6. Graceful degradation where possible
```

## Data Flow

### Request Processing
```
HTTP Request → Middleware → Routes → Service → Storage → File System
                    ↓
              Event Bus ← Event Bus ← Event Bus ← Event Bus
                    ↓
                  Logger
```

### State Management
```
Client JSON → Validation → Business Logic → Atomic Write → File System
                ↓              ↓               ↓
            Error Events   State Events   Storage Events
                ↓              ↓               ↓
                        Event Bus
                            ↓
                        Logger
```

## Testing Strategy

### Unit Tests
- **Service Logic**: Business rules and validation
- **Mocking**: Mock dependencies, test in isolation
- **Coverage**: All business logic paths

### Integration Tests
- **API Endpoints**: Full HTTP request/response cycle
- **Real Dependencies**: Test with actual file system
- **Error Scenarios**: Network failures, disk errors

### Test Organization
```
tests/
├── unit/              # Isolated component tests
├── integration/       # Full API tests
└── setup.js          # Global test configuration
```

## Configuration Management

### Environment Variables
- `PORT`: Server listening port
- `CORS_ORIGIN`: Allowed CORS origin
- `STATE_FILE_PATH`: State file location
- `JSON_LIMIT`: Maximum JSON payload size
- `NODE_ENV`: Environment (development/production)

### Configuration Pattern
```javascript
const CONFIG = {
  port: process.env.PORT || 3001,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  // ... other config
};
```

## Production Considerations

### Scalability
- **File Storage**: Single-user design, suitable for personal use
- **Event Bus**: In-memory, single process
- **Future**: Can be extended to database + message queue

### Reliability
- **Atomic Writes**: Prevent data corruption
- **Graceful Shutdown**: Clean process termination
- **Error Recovery**: Fallback to empty state when needed

### Monitoring
- **Health Endpoint**: `/health` for load balancers
- **Statistics**: `/api/state/stats` for monitoring
- **Structured Logging**: JSON logs for aggregation
- **Event Tracking**: All operations emit trackable events

### Security
- **Input Validation**: Comprehensive state validation
- **CORS Configuration**: Configurable origin restrictions
- **Error Sanitization**: No internal details in production
- **Payload Limits**: Prevent memory exhaustion

## Standards Alignment

### MindMeld Client Standards
- ✅ **Event-Driven Architecture**: Central event bus
- ✅ **Service Layer Pattern**: Dependency injection
- ✅ **Factory Pattern**: Object creation
- ✅ **Naming Conventions**: camelCase, PascalCase, event naming
- ✅ **Project Structure**: Organized by function
- ✅ **Code Quality**: ESLint, Prettier, comprehensive testing

### Production Readiness
- ✅ **Error Handling**: Global handlers, graceful degradation
- ✅ **Logging**: Structured, configurable
- ✅ **Testing**: Unit, integration, coverage
- ✅ **Documentation**: Comprehensive, up-to-date
- ✅ **Configuration**: Environment-based
- ✅ **Process Management**: Graceful shutdown

This architecture provides a solid foundation for evolving from PoC to production while maintaining the standards and patterns established by the MindMeld ecosystem.