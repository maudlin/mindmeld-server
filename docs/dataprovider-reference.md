# DataProvider Reference

Technical reference for developers implementing or extending MindMeld's DataProvider system.

## DataProvider Interface

### Core Contract

All DataProvider implementations must extend `DataProviderInterface`:

```javascript
class DataProviderInterface {
  // Core CRUD Operations
  async load(mapId)
  async save(mapId, data, options = {})
  async list(options = {})
  async delete(mapId)

  // Real-time Collaboration
  async subscribe(mapId, callback)
  async unsubscribe(mapId)

  // State Management
  pauseAutosave()
  resumeAutosave()
  isOnline()
}
```

### Method Specifications

#### `load(mapId)`

- **Purpose**: Load a mind map by unique identifier
- **Parameters**: `mapId` (string) - Unique map identifier
- **Returns**: `Promise<Object>` - Map data in MindMeld JSON format
- **Format**: `{n: [...], c: [...], meta?: {...}}`

#### `save(mapId, data, options)`

- **Purpose**: Save mind map data with optimistic locking
- **Parameters**:
  - `mapId` (string) - Unique map identifier
  - `data` (Object) - Map data in MindMeld JSON format
  - `options` (Object) - Save options
    - `autosave` (boolean) - Whether this is automatic save
    - `force` (boolean) - Force save even if autosave paused
    - `expectedVersion` (number) - Version for optimistic locking
- **Returns**: `Promise<Object>` - Save result with updated metadata

#### `list(options)`

- **Purpose**: List available maps with metadata
- **Parameters**: `options` (Object) - Listing options
  - `limit` (number) - Maximum maps to return
  - `offset` (number) - Pagination offset
  - `sortBy` (string) - Sort field ('created', 'modified', 'title')
  - `sortOrder` (string) - Sort direction ('asc', 'desc')
- **Returns**: `Promise<Array>` - Array of map metadata objects

#### State Management Methods

- **`pauseAutosave()`**: Disable automatic saves (critical for migration)
- **`resumeAutosave()`**: Re-enable automatic saves
- **`isOnline()`**: Check if provider can sync with server

## Y.Doc Schema

### Structure Definition

Y.Doc uses three shared types to represent MindMeld data:

```javascript
// Y.Doc Structure
{
  notes: Y.Array,        // Mind map notes/nodes
  connections: Y.Array,  // Connections between notes
  meta: Y.Map           // Document metadata
}

// Maps to MindMeld JSON:
{
  n: [{i: 'id', p: [x, y], c: 'content', ...}],  // notes
  c: [{f: 'fromId', t: 'toId', ...}],           // connections
  meta: {version: 1, title: 'Map Title', ...}   // metadata
}
```

### Data Format Compatibility

**Enhanced Format** (with Y.Doc metadata):

```javascript
{
  n: [...],              // Same notes format
  c: [...],              // Same connections format
  meta: {                // Metadata object
    version: 1,
    created: '2025-09-23T10:30:00.000Z',
    modified: '2025-09-23T10:30:00.000Z',
    title: 'My Mind Map',
    schemaVersion: '1.0'
  }
}
```

## JSON ↔ Y.Doc Conversion

### Using JsonYjsConverter

```javascript
const JsonYjsConverter = require('../shared/converters/JsonYjsConverter');

// Convert MindMeld JSON to Y.Doc
const mindmeldJson = {
  n: [{ i: 'note1', p: [100, 200], c: 'Hello' }],
  c: [{ f: 'note1', t: 'note2' }]
};
const doc = JsonYjsConverter.jsonToYDoc(mindmeldJson);

// Convert Y.Doc back to JSON
const convertedJson = JsonYjsConverter.yDocToJson(doc);

// Test round-trip integrity
const test = JsonYjsConverter.testRoundTrip(originalJson);
console.log('Data integrity:', test.success);
```

### Conversion Features

- **Bidirectional**: Seamless JSON ↔ Y.Doc conversion
- **Data Integrity**: Preserves all data types and structures
- **Round-trip Safe**: Multiple conversions maintain data fidelity
- **Concurrent Safe**: Handles modifications during conversion
- **Error Handling**: Graceful handling of malformed data

## Implementation Examples

### LocalJSONProvider (Simplified)

```javascript
class LocalJSONProvider extends DataProviderInterface {
  constructor(options = {}) {
    super();
    this.storagePrefix = options.storagePrefix || 'mindmeld_map_';
    this.metaPrefix = options.metaPrefix || 'mindmeld_meta_';
    this.maxMaps = options.maxMaps || 100;
    this.autosavePaused = false;
    this.subscribers = new Map();
  }

  async load(mapId) {
    const mapKey = this.storagePrefix + mapId;
    const metaKey = this.metaPrefix + mapId;
    
    const mapData = localStorage.getItem(mapKey);
    const metaData = localStorage.getItem(metaKey);
    
    if (!mapData) {
      throw new Error(`Map not found: ${mapId}`);
    }
    
    const parsedMapData = JSON.parse(mapData);
    const parsedMetaData = metaData ? JSON.parse(metaData) : {};
    
    return {
      ...parsedMapData,
      meta: {
        version: parsedMetaData.version || 1,
        created: parsedMetaData.created || new Date().toISOString(),
        modified: parsedMetaData.modified || parsedMetaData.created || new Date().toISOString(),
        title: parsedMetaData.title || 'Untitled Map',
        ...parsedMapData.meta,
        ...parsedMetaData
      }
    };
  }

  async save(mapId, data, options = {}) {
    if (this.autosavePaused && options.autosave && !options.force) {
      return { success: false, reason: 'autosave_paused' };
    }

    const mapKey = this.storagePrefix + mapId;
    const metaKey = this.metaPrefix + mapId;
    const now = new Date().toISOString();
    
    const metadata = {
      ...data.meta,
      version: (data.meta?.version || 1) + (options.expectedVersion ? 0 : 1),
      created: data.meta?.created || now,
      modified: now,
      title: data.meta?.title || 'Untitled Map',
      localSaved: now,
      autosave: Boolean(options.autosave)
    };
    
    const mapData = {
      n: data.n || [],
      c: data.c || []
    };
    
    localStorage.setItem(mapKey, JSON.stringify(mapData));
    localStorage.setItem(metaKey, JSON.stringify(metadata));
    
    this.notifySubscribers(mapId, {
      type: 'saved',
      mapId,
      data: { ...mapData, meta: metadata },
      options
    });
    
    return {
      success: true,
      version: metadata.version,
      modified: metadata.modified
    };
  }

  async subscribe(mapId, callback) {
    if (!this.subscribers.has(mapId)) {
      this.subscribers.set(mapId, new Set());
    }
    this.subscribers.get(mapId).add(callback);
    
    // Immediately notify with current state
    try {
      const currentData = await this.load(mapId);
      callback({ type: 'subscribed', mapId, data: currentData });
    } catch (error) {
      callback({ type: 'subscribed', mapId, data: null });
    }
  }

  pauseAutosave() {
    this.autosavePaused = true;
  }
  
  resumeAutosave() {
    this.autosavePaused = false;
  }
  
  isOnline() {
    return true; // LocalProvider is always "online"
  }
}
```

### YjsProvider (Future Implementation)

```javascript
class YjsProvider extends DataProviderInterface {
  constructor(options = {}) {
    super();
    this.serverUrl = options.serverUrl || 'ws://localhost:3001/yjs';
    this.indexedDbProvider = new IndexeddbPersistence('mindmeld_yjs', doc);
    this.websocketProvider = null;
    this.docs = new Map();
  }

  async load(mapId) {
    const doc = await this.getOrCreateDocument(mapId);
    return JsonYjsConverter.yDocToJson(doc);
  }

  async save(mapId, data, options = {}) {
    const doc = await this.getOrCreateDocument(mapId);
    
    // Convert JSON to Y.Doc structure
    const tempDoc = JsonYjsConverter.jsonToYDoc(data);
    
    // Apply changes to managed document
    JsonYjsConverter.applyPartialUpdates(doc, {
      updateNotes: tempDoc.getArray('notes').toArray(),
      updateConnections: tempDoc.getArray('connections').toArray(),
      updateMeta: tempDoc.getMap('meta').toJSON()
    });
    
    return JsonYjsConverter.yDocToJson(doc);
  }

  async subscribe(mapId, callback) {
    const doc = await this.getOrCreateDocument(mapId);
    doc.on('update', () => {
      const currentData = JsonYjsConverter.yDocToJson(doc);
      callback({ type: 'updated', mapId, data: currentData });
    });
  }

  isOnline() {
    return this.websocketProvider?.wsConnected || false;
  }
}
```

## Error Handling Patterns

### Common Error Scenarios

```javascript
try {
  await provider.save(mapId, data);
} catch (error) {
  if (error.name === 'ConflictError') {
    // Handle optimistic locking conflict
    const currentData = await provider.load(mapId);
    // Implement merge strategy
  } else if (error.name === 'NetworkError') {
    // Handle offline scenario
    provider.pauseAutosave();
    // Queue for retry when online
  }
}
```

### Data Validation

```javascript
const DataProviderInterface = require('./DataProviderInterface');

// Built-in validation
const isValid = provider.validateMapData(data);
if (!isValid) {
  throw new Error('Invalid map data structure');
}
```

## Performance Considerations

### LocalJSONProvider

- **Pros**: Instant offline access, no network dependency
- **Cons**: No real-time collaboration, manual conflict resolution

### YjsProvider

- **Pros**: Real-time sync, automatic conflict resolution, offline persistence
- **Cons**: Initial load time, network dependency for sync

### Optimization Strategies

- Implement lazy loading for large maps
- Use IndexedDB for offline Y.Doc persistence
- Batch updates to reduce network traffic
- Cache frequently accessed maps

## API Reference

### YDocSchema Class

```javascript
class YDocSchema {
  static createDocument(initialJson = null)
  static toJSON(doc)
  static fromJSON(json, doc)
  static validateSchema(doc)
  static migrateSchema(doc, fromVersion, toVersion)
  static getSchemaVersion(doc)
  static clone(doc)
}
```

### JsonYjsConverter Class

```javascript
class JsonYjsConverter {
  static jsonToYDoc(mindmeldJson)
  static yDocToJson(doc)
  static testRoundTrip(originalJson)
  static mergeDocs(baseDoc, incomingDoc)
  static applyPartialUpdates(doc, updates)
  static getDocumentStats(doc)
}
```

## Testing

### Unit Tests

```bash
# Test DataProvider contract
npm test -- tests/unit/data-provider-contract.test.js

# Test Y.Doc schema and conversion
npm test -- tests/unit/ydoc-schema.test.js

# Test LocalJSONProvider
npm test -- tests/unit/local-json-provider.test.js
```

### Integration Tests

```bash
# Test provider integration
npm test -- tests/integration/data-provider-integration.test.js

# Test with server YJS infrastructure
npm test -- tests/integration/yjs-websocket.test.js
```

---

*For usage examples and integration patterns, see the [Client Integration Guide](client-integration.md).*