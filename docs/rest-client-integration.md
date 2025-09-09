# Client Integration Guide

## Overview

This guide shows how to integrate client applications with the MindMeld server's **Maps API** - a production-ready REST API with optimistic concurrency control.

## Quick Start

### Server Setup

See [Developer Guide](developer-guide.md#get-started) for complete server setup.

Quick start:

```bash
npm install
npm start  # Server runs on http://localhost:3001
```

### Client Configuration

```javascript
const API_BASE_URL = 'http://localhost:3001';
```

## REST API Integration

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

## Data Format

### Map Data Structure

```javascript
{
  "n": [  // Notes
    {
      "i": "unique-id",       // Node ID
      "c": "Node content",    // Text content
      "p": [x, y],           // Position [x, y]
      "cl": "color"          // Color (optional)
    }
  ],
  "c": [  // Connections
    { "f": "from-id", "t": "to-id" }  // From/To node IDs
  ]
}
```

## Error Handling

### HTTP Status Codes

- **200 OK**: Successful operation
- **201 Created**: Map created successfully
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

## Integration Patterns

### Auto-Save with Debouncing

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

### Optimistic UI Updates

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

### Health Monitoring

```javascript
async function checkServerHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const health = await response.json();
    return health.status === 'ok';
  } catch {
    return false;
  }
}

// Check server status periodically
setInterval(async () => {
  const isHealthy = await checkServerHealth();
  updateServerStatus(isHealthy);
}, 30000);
```

## CORS Configuration

The server supports CORS for browser clients:

- **Default**: `http://localhost:8080`
- **Custom**: Set `CORS_ORIGIN=http://localhost:3000` environment variable

## Common Issues

### ETag Mismatch (409 Conflict)

**Cause**: Another client modified the map  
**Solution**: Reload map and resolve conflicts or overwrite

### Large Payload (413 Entity Too Large)

**Cause**: Map data exceeds size limit  
**Solution**: Check `sizeBytes` field and optimize data structure

### Network Errors

**Cause**: Server offline or network issues  
**Solution**: Implement retry logic with exponential backoff

```javascript
async function saveMapWithRetry(mapId, data, version, etag, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await saveMap(mapId, data, version, etag);
    } catch (error) {
      if (attempt === maxRetries || error.status === 409) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

This integration approach provides reliable, conflict-safe persistence for mind mapping applications with excellent user experience through optimistic updates and proper error handling.

## Related Guides

- **MCP Integration**: See [MCP Client Integration Guide](mcp-quick-start.md) for AI assistant access
- **Manual Testing**: See [Testing Guide](testing-guide.md) for API testing workflows
- **Development**: See [Developer Guide](developer-guide.md) for server development
