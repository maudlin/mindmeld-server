# MindMeld Server

Production-ready Express.js server for MindMeld mind mapping application, built following MindMeld client standards.

## Features

- **Event-Driven Architecture**: Central event bus with "noun.verb" event naming
- **Service Layer Pattern**: Clean separation with dependency injection  
- **Atomic Writes**: Prevents state corruption during concurrent saves
- **Comprehensive Validation**: State structure and content validation
- **Production Ready**: ESLint, Prettier, Jest testing, graceful shutdown
- **Monitoring**: Health checks, statistics, and detailed logging
- **CORS Enabled**: Ready for frontend integration

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start server**:
   ```bash
   npm start
   ```

3. **Development mode** (auto-reload):
   ```bash
   npm run dev
   ```

4. **Run tests**:
   ```bash
   npm test
   ```

5. **Code quality**:
   ```bash
   npm run validate  # lint + format + test
   ```

## API Endpoints

### GET /health
Returns server status, uptime, and state statistics.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-07-31T17:45:23.456Z",
  "uptime": 12.345,
  "stats": {
    "notesCount": 5,
    "connectionsCount": 3,
    "zoomLevel": 5,
    "isEmpty": false
  }
}
```

### GET /api/state
Returns current mind map state. Returns empty state if no data exists.

**Response**:
```json
{
  "notes": [
    { "id": "1", "content": "Note 1", "left": "100px", "top": "50px" }
  ],
  "connections": [
    { "from": "1", "to": "2" }
  ],
  "zoomLevel": 5
}
```

### PUT /api/state
Saves mind map state with validation and atomic writes.

**Request Body**: JSON state object  
**Response**:
```json
{
  "success": true,
  "timestamp": "2025-07-31T17:45:23.456Z",
  "notes": 5,
  "connections": 3,
  "zoomLevel": 3
}
```

### GET /api/state/stats
Returns state statistics for monitoring.

**Response**:
```json
{
  "notesCount": 5,
  "connectionsCount": 3,
  "zoomLevel": 5,
  "isEmpty": false
}
```

## Architecture

### Project Structure
```
src/
├── core/           # Core application logic
│   ├── api-routes.js      # RESTful API endpoints
│   └── middleware.js      # Express middleware configuration
├── services/       # Business logic layer
│   └── state-service.js   # State management and validation
├── data/          # Data persistence layer
│   └── file-storage.js    # Atomic file operations
├── utils/         # Utility functions
│   ├── logger.js          # Centralized logging
│   └── event-bus.js       # Event-driven architecture
├── factories/     # Configuration factories
│   └── server-factory.js  # Server creation with DI
└── index.js       # Main entry point

tests/
├── integration/   # API integration tests
├── unit/         # Unit tests for services
└── setup.js      # Test configuration

docs/             # Documentation
data/             # State storage (created at runtime)
```

### Event System

The server uses an event-driven architecture with standardized event naming:

```javascript
// State events
eventBus.emit('state.saving', { notesCount: 5 });
eventBus.emit('state.saved', { success: true, stats });
eventBus.emit('state.error', { operation: 'save', error });

// Request events  
eventBus.emit('request.started', { method: 'PUT', path: '/api/state' });
eventBus.emit('request.completed', { statusCode: 200, duration: 45 });

// Health events
eventBus.emit('health.checked', { healthy: true, stats });
```

## Configuration

Environment variables:
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - CORS origin (default: http://localhost:8080)
- `STATE_FILE_PATH` - State file location (default: ./data/state.json)  
- `JSON_LIMIT` - Max JSON payload size (default: 50mb)
- `NODE_ENV` - Environment (development/production)

## Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Development mode with auto-reload
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run validate` - Run all quality checks

### Code Standards
- **ESLint**: Enforces MindMeld coding standards
- **Prettier**: Consistent code formatting
- **Jest**: Unit and integration testing
- **Naming**: camelCase functions, PascalCase classes, UPPER_SNAKE_CASE constants
- **Events**: "noun.verb" format (e.g., "state.saved")

## Testing

### Test Types
- **Unit Tests**: Business logic and validation (`tests/unit/`)
- **Integration Tests**: Full API endpoints (`tests/integration/`)
- **Coverage**: Comprehensive test coverage reporting

### Running Tests
```bash
npm test                # Run all tests
npm run test:watch      # Watch mode for development
npm run test:coverage   # Generate coverage report
VERBOSE=true npm test   # Enable console logging
```

## Production Deployment

### Features
- **Graceful Shutdown**: Handles SIGTERM/SIGINT signals
- **Error Handling**: Global uncaught exception handling
- **Process Management**: Ready for PM2, Docker, or systemd
- **Health Monitoring**: `/health` endpoint for load balancers
- **Structured Logging**: JSON logs with correlation IDs

### Docker Example
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3001
CMD ["npm", "start"]
```

## Technical Notes

- **Node.js**: Requires Node.js 18+
- **Atomic Writes**: Uses temporary files to prevent corruption
- **State Validation**: Comprehensive validation of notes and connections
- **CORS**: Configurable origin support
- **File Storage**: Automatic data directory creation
- **Event Bus**: Singleton event emitter for loose coupling

## Related

Part of MS-14 (Technical Proof of Concept) - validates core client-server integration patterns before full MindMeld implementation.