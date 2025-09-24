# Client Integration Guide

A comprehensive guide for integrating client applications with MindMeld, covering both REST API integration and the new client-side data provider architecture.

## Overview

MindMeld provides flexible client integration options:

- **REST API**: Direct HTTP integration for any client
- **LocalJSONProvider**: Offline-first browser storage with localStorage
- **YjsProvider**: Real-time collaborative editing (coming in MS-63)
- **DataProviderFactory**: Smart provider selection and switching
- **Hydration Suppression**: SSR-safe client initialization

## Quick Start

### Server Setup

```bash
npm install
npm start  # Server runs on http://localhost:3001
```

### Choose Your Integration Method

1. **REST API Only**: Direct HTTP calls (any language/framework)
2. **LocalJSONProvider**: Browser JavaScript with offline support
3. **DataProviderFactory**: Smart switching between providers

---

# REST API Integration

## Configuration

```javascript
const API_BASE_URL = 'http://localhost:3001';
```

## Basic Operations

### Create Map

```javascript
const response = await fetch(`${API_BASE_URL}/maps`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Mind Map',
    data: {
      n: [
        { i: '1', p: [100, 200], c: 'First idea' },
        { i: '2', p: [300, 400], c: 'Second idea' }
      ],
      c: [{ f: '1', t: '2' }]
    }
  })
});

const etag = response.headers.get('ETag');
const map = await response.json();
// Response: { id, name, version, updatedAt, stateJson, sizeBytes }
```

### Load Map

```javascript
const response = await fetch(`${API_BASE_URL}/maps/${mapId}`);
const etag = response.headers.get('ETag');
const map = await response.json();
const data = JSON.parse(map.stateJson);
```

### Save Map (with Optimistic Concurrency)

```javascript
const response = await fetch(`${API_BASE_URL}/maps/${mapId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'If-Match': etag // Prevent conflicts
  },
  body: JSON.stringify({
    data: updatedData,
    version: currentVersion
  })
});

if (response.status === 409) {
  // Handle conflict: reload map or ask user to resolve
  console.log('Map was modified by another user');
}

const newEtag = response.headers.get('ETag');
```

### List Maps

```javascript
const response = await fetch(`${API_BASE_URL}/maps?limit=50&offset=0`);
const maps = await response.json();
// Response: [{ id, name, version, updatedAt, sizeBytes }]
```

### Delete Map

```javascript
const response = await fetch(`${API_BASE_URL}/maps/${mapId}`, {
  method: 'DELETE'
});

if (response.status === 200) {
  const result = await response.json();
  console.log(result.message);
} else if (response.status === 404) {
  console.log('Map not found or already deleted');
}
```

## Error Handling

### HTTP Status Codes

- **200 OK**: Successful operation (GET, PUT, DELETE)
- **201 Created**: Map created successfully (POST)
- **404 Not Found**: Map doesn't exist
- **409 Conflict**: Version/ETag mismatch (conflict)
- **422 Unprocessable Entity**: Invalid data format

### Conflict Resolution

```javascript
async function saveMapWithConflictHandling(mapId, data, version, etag) {
  try {
    return await saveMap(mapId, data, version, etag);
  } catch (error) {
    if (error.status === 409) {
      // Map was modified - reload and merge or ask user
      const fresh = await loadMap(mapId);
      const shouldOverwrite = confirm('Map was modified. Overwrite changes?');

      if (shouldOverwrite) {
        return await saveMap(mapId, data, fresh.version, fresh.etag);
      } else {
        // Handle merge or user resolution
        return handleConflictResolution(fresh, data);
      }
    }
    throw error;
  }
}
```

## Data Format

### Map Data Structure

All MindMeld maps use this JSON format:

```javascript
{
  "n": [  // Notes/Nodes
    {
      "i": "unique-id",       // Node ID
      "c": "Node content",    // Text content
      "p": [x, y],           // Position [x, y]
      "cl": "color",         // Color (optional)
      // ... other node properties
    }
  ],
  "c": [  // Connections
    {
      "f": "from-id",       // From node ID
      "t": "to-id",         // To node ID
      "type": "arrow"       // Connection type (optional)
    }
  ],
  "meta": {                 // Metadata (optional)
    "title": "Map Title",
    "version": 1,
    "created": "2025-09-23T10:30:00.000Z",
    "modified": "2025-09-23T10:30:00.000Z"
  }
}
```

## Integration Patterns

### Auto-Save with Debouncing (REST)

```javascript
import { debounce } from 'lodash';

const autoSave = debounce(async (mapId, data, version, etag) => {
  try {
    const result = await saveMap(mapId, data, version, etag);
    showSaveStatus('saved');
    return result;
  } catch (error) {
    showSaveStatus('error');
    console.error('Auto-save failed:', error);
  }
}, 1000);

// Usage in your state management
function updateMapData(newData) {
  setMapData(newData);
  autoSave(currentMapId, newData, currentVersion, currentEtag);
}
```

### Optimistic UI Updates (REST)

```javascript
function updateNodeOptimistically(nodeId, newContent) {
  // 1. Update UI immediately
  setNodes(prev =>
    prev.map(node => (node.i === nodeId ? { ...node, c: newContent } : node))
  );

  // 2. Save to server in background
  const updatedData = { ...currentData };
  updatedData.n = updatedData.n.map(node =>
    node.i === nodeId ? { ...node, c: newContent } : node
  );

  autoSave(mapId, updatedData, currentVersion, currentEtag).catch(() => {
    // Revert on failure (optional)
    loadMap(mapId).then(setMapData);
  });
}
```

---

# Client Provider Architecture

## Architecture Components

### 1. LocalJSONProvider

The `LocalJSONProvider` is an offline-first implementation of the DataProvider interface using browser localStorage.

#### Features

- **Offline persistence**: Works without server connection
- **Automatic cleanup**: Manages storage quota and removes old maps
- **Version control**: Increments versions for change tracking
- **Subscription system**: Notifies subscribers of local changes
- **Export/Import**: Full data portability
- **Autosave control**: Can pause/resume for migration scenarios

#### Usage

```javascript
const LocalJSONProvider = require('./src/client/providers/LocalJSONProvider');

// Basic initialization
const provider = new LocalJSONProvider({
  storagePrefix: 'myapp_map_',
  metaPrefix: 'myapp_meta_',
  maxMaps: 100,
  storageQuotaWarning: 5 * 1024 * 1024 // 5MB
});

// Save a map
await provider.save('my-map-id', {
  n: [{ i: 'note1', c: 'My Note', p: [100, 200] }],
  c: [],
  meta: { title: 'My Mind Map' }
});

// Load a map
const mapData = await provider.load('my-map-id');
console.log('Loaded:', mapData.meta.title);

// List all maps
const maps = await provider.list({
  sortBy: 'modified',
  sortOrder: 'desc',
  limit: 20
});

// Subscribe to changes
await provider.subscribe('my-map-id', update => {
  console.log('Map updated:', update.type, update.data);
});
```

#### Configuration Options

| Option                | Type    | Default          | Description                 |
| --------------------- | ------- | ---------------- | --------------------------- |
| `storagePrefix`       | string  | 'mindmeld*map*'  | Prefix for map data keys    |
| `metaPrefix`          | string  | 'mindmeld*meta*' | Prefix for metadata keys    |
| `maxMaps`             | number  | 100              | Maximum maps before cleanup |
| `storageQuotaWarning` | number  | 5MB              | Storage warning threshold   |
| `enableCompression`   | boolean | true             | Enable data compression     |

### 2. DataProviderFactory

The factory manages provider creation and switching based on environment and configuration.

#### Features

- **Environment detection**: Browser vs server-side
- **Feature flag integration**: Enable/disable providers
- **Provider caching**: Reuse instances
- **Fallback handling**: Graceful degradation
- **Migration support**: Seamless switching

#### Usage

```javascript
const {
  DataProviderFactory,
  PROVIDER_TYPES
} = require('./src/client/providers/DataProviderFactory');

// Initialize factory
const factory = new DataProviderFactory({
  defaultProvider: PROVIDER_TYPES.LOCAL,
  localStoragePrefix: 'myapp_',
  featureFlags: {
    enableCollaboration: false,
    enableYjsProvider: false
  }
});

// Create provider (auto-detects best option)
const provider = await factory.createProvider();

// Force specific provider type
const localProvider = await factory.createProvider({
  type: PROVIDER_TYPES.LOCAL,
  maxMaps: 50
});

// Switch provider types
const newProvider = await factory.switchProvider(PROVIDER_TYPES.YJS, {
  pauseAutosave: true,
  resumeAutosave: true
});

// Get environment info
const envInfo = factory.getEnvironmentInfo();
console.log('Available providers:', envInfo.availableProviders);
console.log('Recommended provider:', envInfo.recommendedProvider);
```

#### Provider Selection Logic

```
1. Check explicit type override
2. Use configured default (if not AUTO)
3. AUTO mode:
   - Server-side: null (if hydration suppression enabled) or LOCAL
   - Browser:
     - If collaboration + YJS enabled + WebSocket available: YJS
     - If localStorage available: LOCAL
     - Fallback to configured fallback provider
```

### 3. Hydration Suppression

Utilities to prevent server-side execution of client-only features.

#### Components

- **HydrationChecker**: Environment detection
- **HydrationSuppressor**: Execution suppression
- **HydrationUtils**: Common patterns and utilities

#### Usage

```javascript
const {
  HydrationChecker,
  HydrationSuppressor
} = require('./src/client/utils/HydrationSuppression');

// Environment detection
if (HydrationChecker.isServerSide()) {
  console.log('Running on server');
}

if (HydrationChecker.isHydrating()) {
  console.log('Currently hydrating on client');
}

// Suppress execution
const suppressor = new HydrationSuppressor({
  suppressOnServer: true,
  suppressDuringHydration: true
});

const result = suppressor.suppress(() => {
  // This won't run on server or during hydration
  return window.localStorage.getItem('key');
}, 'fallback value');

// Async suppression
const data = await suppressor.suppressAsync(async () => {
  const provider = await factory.createProvider();
  return await provider.load('map-id');
});

// Initialize provider safely
const provider = await suppressor.initializeDataProvider(factory, {
  type: PROVIDER_TYPES.LOCAL
});
```

## Framework Integration

### React Integration (with LocalJSONProvider)

```jsx
import {
  DataProviderFactory,
  PROVIDER_TYPES
} from './src/client/providers/DataProviderFactory';
import { HydrationSuppressor } from './src/client/utils/HydrationSuppression';

const useDataProvider = () => {
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const factory = new DataProviderFactory({
      defaultProvider: PROVIDER_TYPES.LOCAL,
      enableHydrationSuppression: true
    });

    const suppressor = new HydrationSuppressor();

    suppressor
      .initializeDataProvider(factory)
      .then(setProvider)
      .catch(setError)
      .finally(() => setLoading(false));

    return () => factory.cleanup();
  }, []);

  return { provider, loading, error };
};

// Usage in component
const MindMapEditor = () => {
  const { provider, loading, error } = useDataProvider();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!provider) return <div>Provider not available</div>;

  return <MindMapComponent provider={provider} />;
};
```

### Next.js Integration

```javascript
// pages/_app.js
import { DataProviderFactory } from '../src/client/providers/DataProviderFactory';

// Create factory on client-side only
let dataProviderFactory = null;

if (typeof window !== 'undefined') {
  dataProviderFactory = new DataProviderFactory({
    enableHydrationSuppression: true
  });
}

export { dataProviderFactory };

// pages/map/[id].js
import { useEffect, useState } from 'react';
import { dataProviderFactory } from '../_app';

export default function MapPage({ mapId }) {
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    if (dataProviderFactory) {
      dataProviderFactory
        .createProvider()
        .then(setProvider)
        .catch(console.error);
    }
  }, []);

  // Server-side rendering safe
  if (!provider) {
    return <div>Loading mind map...</div>;
  }

  return <MindMapEditor provider={provider} mapId={mapId} />;
}
```

### Migration Patterns

#### From Server-only to Client Boundary

1. **Phase 1**: Install client boundary (this PR)

   ```javascript
   // Start with LocalJSONProvider for all users
   const factory = new DataProviderFactory({
     defaultProvider: PROVIDER_TYPES.LOCAL
   });
   ```

2. **Phase 2**: Selective YJS rollout (MS-63)

   ```javascript
   const factory = new DataProviderFactory({
     defaultProvider: PROVIDER_TYPES.AUTO,
     featureFlags: {
       enableYjsProvider: user.isInYjsBeta
     }
   });
   ```

3. **Phase 3**: Full migration
   ```javascript
   const factory = new DataProviderFactory({
     defaultProvider: PROVIDER_TYPES.YJS,
     fallbackProvider: PROVIDER_TYPES.LOCAL
   });
   ```

#### Provider Switching During Runtime

```javascript
const switchToCollaborative = async () => {
  // Pause autosave on current provider
  const oldProvider = factory.getCurrentProvider();
  if (oldProvider) oldProvider.pauseAutosave();

  // Switch to collaborative provider
  const newProvider = await factory.switchProvider(PROVIDER_TYPES.YJS);

  // Optional: Migrate existing data
  const localMaps = await oldProvider.exportAllMaps();
  await newProvider.importMaps(localMaps);

  return newProvider;
};
```

## Storage Management

### Quota Monitoring

```javascript
const provider = new LocalJSONProvider();

// Check storage usage
const stats = provider.getStorageStats();
console.log(`Using ${stats.storageUsed} bytes for ${stats.totalMaps} maps`);

if (stats.quotaWarning) {
  console.warn('Storage quota warning - consider cleanup');
}

// Manual cleanup
provider.cleanupStorage();
```

### Export/Import for Backup

```javascript
// Export all data
const backup = await provider.exportAllMaps();
localStorage.setItem('mindmeld_backup', JSON.stringify(backup));

// Import from backup
const backupData = JSON.parse(localStorage.getItem('mindmeld_backup'));
const results = await provider.importMaps(backupData);
console.log(`Imported ${results.imported} maps, ${results.failed} failed`);
```

## Testing

### Unit Testing LocalJSONProvider

```javascript
describe('LocalJSONProvider', () => {
  let provider;

  beforeEach(() => {
    // Mock localStorage
    global.localStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(),
      length: 0
    };

    provider = new LocalJSONProvider({
      storagePrefix: 'test_',
      metaPrefix: 'test_meta_'
    });
  });

  test('should save and load maps', async () => {
    const mapData = { n: [], c: [], meta: { title: 'Test' } };

    await provider.save('test-map', mapData);
    const loaded = await provider.load('test-map');

    expect(loaded.meta.title).toBe('Test');
    expect(loaded.meta.version).toBe(2); // Incremented
  });
});
```

### Integration Testing

```javascript
describe('DataProvider Integration', () => {
  test('should switch providers seamlessly', async () => {
    const factory = new DataProviderFactory();

    const localProvider = await factory.createProvider({
      type: PROVIDER_TYPES.LOCAL
    });

    await localProvider.save('test', { n: [], c: [] });

    // Switch providers
    const newProvider = await factory.switchProvider(PROVIDER_TYPES.LOCAL, {
      storagePrefix: 'new_',
      forceNew: true
    });

    expect(newProvider).not.toBe(localProvider);
  });
});
```

## Performance Considerations

### Memory Management

- **Provider caching**: Factory reuses provider instances
- **Subscription cleanup**: Automatically removed on map deletion
- **Storage cleanup**: Removes old maps when quota exceeded

### Storage Optimization

- **Separate storage**: Maps and metadata stored separately
- **JSON serialization**: Efficient data format
- **Compression**: Optional data compression (future enhancement)

### Browser Compatibility

- **localStorage**: Required for LocalJSONProvider
- **WebSocket**: Required for YjsProvider (MS-63)
- **Fallback handling**: Graceful degradation when features unavailable

## Error Handling

### Common Error Scenarios

1. **localStorage unavailable**

   ```javascript
   // Provider throws during initialization
   try {
     const provider = new LocalJSONProvider();
   } catch (error) {
     console.error('localStorage not available:', error);
   }
   ```

2. **Storage quota exceeded**

   ```javascript
   try {
     await provider.save('large-map', largeData);
   } catch (error) {
     if (error.message.includes('quota')) {
       // Handle quota exceeded
       await provider.cleanupStorage();
       await provider.save('large-map', largeData);
     }
   }
   ```

3. **Invalid data**
   ```javascript
   try {
     await provider.save('map-id', invalidData);
   } catch (error) {
     console.error('Validation failed:', error);
   }
   ```

## Security Considerations

- **No sensitive data**: LocalJSONProvider uses localStorage (not secure)
- **Data validation**: Validates map structure before saving
- **Error boundaries**: Prevents client crashes from storage errors
- **Cleanup**: Removes data when maps deleted

## Future Enhancements (MS-63+)

- **YjsProvider**: Real-time collaborative editing
- **IndexedDB**: Alternative storage for large datasets
- **Data encryption**: Secure local storage
- **Background sync**: Offline-to-online synchronization
- **Conflict resolution**: Handle concurrent edits

## Next Steps

### Planning for Collaboration

When you're ready for real-time collaborative editing, you'll be able to:

- Switch from LocalJSONProvider to YjsProvider
- Enable real-time synchronization across multiple users
- Maintain offline functionality with automatic conflict resolution
- Use the same DataProvider interface without code changes

### Related Guides

- **MCP Integration**: [MCP Client Integration Guide](mcp-client-integration.md)
- **Server Development**: [Developer Guide](developer-guide.md)
- **Testing**: [Testing Guide](testing-guide.md)
- **Architecture**: [Architecture Overview](architecture.md)

---

_This guide covers both REST API integration and the new LocalJSONProvider for offline-first applications. Real-time collaborative editing with YjsProvider is coming soon._
