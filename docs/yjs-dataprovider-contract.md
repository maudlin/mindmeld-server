# DataProvider Contract and Y.Doc Schema - MS-61

**Document Status**: DRAFT - Awaiting approval from client and server teams  
**Epic**: MS-60 Yjs migration: offline-first and real-time sync  
**Ticket**: MS-61 Define DataProvider contract and Y.Doc schema  
**Last Updated**: 2025-09-24

## Overview

This document defines the DataProvider interface contract and Y.Doc schema structure for MindMeld's Yjs migration. It establishes the foundation for offline-first data management with optional real-time collaboration capabilities.

## Key Design Principles

1. **Offline-first**: All providers must work without server connection
2. **Idempotent writes**: Same operation can be applied multiple times safely
3. **No DOM assumptions**: Pure data operations only
4. **Normalized change events**: Consistent delta format across providers
5. **Markdown-only content**: HTML disallowed for security
6. **Performance guards**: Built-in limits to prevent performance degradation

## DataProvider Interface Contract

### Core Methods (Existing)

These methods are already implemented in the DataProvider interface:

```javascript
// Map lifecycle
async load(mapId) -> Object
async save(mapId, data, options = {}) -> Object
async list(options = {}) -> Array
async delete(mapId) -> boolean
async create(initialData, options = {}) -> string
async exists(mapId) -> boolean

// Real-time features
async subscribe(mapId, callback) -> void
async unsubscribe(mapId) -> void

// Autosave control
pauseAutosave() -> void
resumeAutosave() -> void
isOnline() -> boolean
```

### New Methods (MS-61 Requirements)

These methods are newly added for granular operations:

```javascript
// Provider initialization
async init(mapId, options = {}) -> Function|Array<Function>
  // options.serverSync: boolean (default: true)
  // options.offlineMode: boolean (default: false)
  // Returns: unsubscribe function(s)

// Change subscription
subscribeToChanges(onChange) -> Function
  // onChange: ({ type, payload }) => void
  // type: 'note'|'connection'|'meta'|'snapshot'
  // payload: change delta or compact snapshot hash
  // Returns: unsubscribe function

// Note operations
async upsertNote(noteData) -> void
  // noteData: { id, content, pos, color? }
  // content: Markdown string (enforces NOTE_CONTENT_LIMIT)
  // pos: [x, y] position array

async deleteNote(noteId) -> boolean

// Connection operations
async upsertConnection(connectionData) -> void
  // connectionData: { id, from, to, type? }
  // id: computed as "${from}:${to}:${type}"

async deleteConnection(connectionId) -> boolean

// Metadata operations
async setMeta(metaUpdates) -> void
  // metaUpdates: { zoomLevel?, canvasType?, mapName? }

// Data access
async getSnapshot() -> Object
  // Returns: { n: notes[], c: connections[], meta }

// Import/Export
async importJSON(jsonData, options = {}) -> void
  // Suppresses user events during import
  // options.merge: boolean (default: false)

async exportJSON() -> Object
  // Returns: MindMeld JSON format
```

### Data Format Specification

#### MindMeld JSON Format (Current)

```javascript
{
  n: [  // notes array
    {
      i: "note-id",           // id: string (required)
      c: "markdown content",  // content: string (required)
      p: [100, 200],         // pos: [x, y] (required)
      color: "blue"          // color: string (optional)
    }
  ],
  c: [  // connections array
    {
      f: "note-1",           // from: string (required)
      t: "note-2",           // to: string (required)
      type: "arrow"          // type: string (optional, default: "arrow")
    }
  ],
  meta: {  // metadata object
    version: 1,
    created: "2025-09-24T10:00:00Z",
    modified: "2025-09-24T10:30:00Z",
    title: "My Mind Map",
    zoomLevel: 1.5,
    canvasType: "default"
  }
}
```

## Y.Doc Schema Structure

### Overview

The Y.Doc contains three main Y.Map structures:

1. **notes**: `Y.Map<noteId → NoteObject>`
2. **connections**: `Y.Map<connectionId → ConnectionObject>`
3. **meta**: `Y.Map<metaKey → metaValue>`

### Note Schema

**Storage**: `notes` Y.Map with noteId as key

```javascript
{
  id: "note-123",              // string (matches Y.Map key)
  pos: [100, 200],            // Array<number> [x, y] coordinates
  color: "blue",              // string (optional, default: "default")
  content: Y.Text("markdown") // Y.Text for CRDT collaboration
}
```

**Constraints**:

- `content.length <= NOTE_CONTENT_LIMIT` (10,000 characters)
- `pos.length === 2` (exactly x,y coordinates)
- Content must be Markdown (no HTML)
- Maximum notes per map: 1,000

### Connection Schema

**Storage**: `connections` Y.Map with connectionId as key

**Connection ID Format**: `"${from}:${to}:${type}"`

- Direction-inclusive (A→B different from B→A)
- Type-specific (A→B:arrow different from A→B:line)

```javascript
{
  from: "note-1",    // string (source note ID)
  to: "note-2",      // string (target note ID)
  type: "arrow"      // string (connection type)
}
```

**Constraints**:

- `from !== to` (no self-connections)
- `from`, `to`, `type` all required
- Maximum connections per map: 2,000

### Metadata Schema

**Storage**: `meta` Y.Map with string keys

```javascript
{
  // Canvas state
  zoomLevel: 1.5,           // number (0.1 - 10.0)
  canvasType: "default",    // string

  // Map identity
  mapName: "My Mind Map",   // string

  // Timestamps
  version: "1.0",           // string (schema version)
  created: "2025-09-24...", // string (ISO8601)
  modified: "2025-09-24..." // string (ISO8601)
}
```

## Connection ID Management

### Generation

```javascript
generateConnectionId(from, to, (type = 'arrow'));
// Returns: "note-1:note-2:arrow"
```

### Parsing

```javascript
parseConnectionId('note-1:note-2:arrow');
// Returns: { from: "note-1", to: "note-2", type: "arrow" }
```

### Examples

- Same notes, different directions: `A:B:arrow` vs `B:A:arrow`
- Same notes, different types: `A:B:arrow` vs `A:B:line`
- All are distinct connections with separate IDs

## Content Validation & Performance Guards

### Note Content

- **Limit**: 10,000 characters per note
- **Format**: Markdown only (no HTML)
- **Validation**: Automatic HTML detection and warning

### Performance Limits

- **Notes**: Maximum 1,000 per map
- **Connections**: Maximum 2,000 per map
- **Enforcement**: Checked during operations, throws errors if exceeded

## JSON ↔ Y.Doc Conversion

### JSON to Y.Doc

1. Clear existing Y.Doc maps
2. Import notes with Y.Text content
3. Import connections with generated IDs
4. Import/merge metadata
5. Validate performance limits
6. Update modified timestamp

### Y.Doc to JSON

1. Extract notes (convert Y.Text to string)
2. Extract connections
3. Extract metadata
4. Format as MindMeld JSON structure

## Provider Event Suppression

### During Import/Hydration

- Mark doc-applied updates with `origin=system`
- UI listeners ignore system-originated changes
- Prevents feedback loops during data loading

### During Migration

- `pauseAutosave()` before provider switching
- `resumeAutosave()` after migration complete
- Force saves with `{ force: true }` still work

## Error Handling

### Common Error Cases

1. **Storage quota exceeded**: localStorage limits
2. **Content limit exceeded**: NOTE_CONTENT_LIMIT validation
3. **Performance limits exceeded**: Too many notes/connections
4. **Invalid data format**: Schema validation failures
5. **Network issues**: WebSocket connection failures (YjsProvider)

### Error Response Format

```javascript
{
  success: false,
  error: "error_code",
  message: "Human readable message",
  details: { /* additional context */ }
}
```

## Feature Flags Integration

### Configuration Options

```javascript
{
  DATA_PROVIDER: "json|yjs",     // Provider type selection
  SERVER_SYNC: "on|off",         // Enable server synchronization
  enableCollaboration: boolean,  // Enable real-time features
  enableYjsProvider: boolean     // Allow YjsProvider usage
}
```

### Default Values (Rollout Strategy)

- `DATA_PROVIDER=json` (safe default)
- `SERVER_SYNC=off` (offline-first)
- Progressive rollout after validation

## Implementation Checklist

### MS-62: LocalJSONProvider

- [ ] Implement new granular methods
- [ ] Add hydration suppression
- [ ] Add autosave pause/resume hooks
- [ ] Ensure all tests pass

### MS-63: YjsProvider

- [ ] Implement Y.Doc schema
- [ ] Add y-indexeddb persistence
- [ ] Implement JSON ↔ Y.Doc converters
- [ ] Add performance guards
- [ ] Feature flag integration

### MS-64: Server Integration

- [ ] SQLite migration for Y.Doc persistence
- [ ] WebSocket endpoint enhancements
- [ ] Snapshot persistence policy
- [ ] REST export boundary

## Team Approvals

### Client Team Approval

**Status**: ⏳ Pending Review  
**Reviewer**: [Client Team Lead]  
**Date**: [Pending]  
**Comments**: [Pending]

### Server Team Approval

**Status**: ⏳ Pending Review  
**Reviewer**: [Server Team Lead]  
**Date**: [Pending]  
**Comments**: [Pending]

---

## Questions for Review

1. **Content Limits**: Are 10,000 characters per note and the map size limits appropriate?

2. **Connection ID Format**: Is the `"${from}:${to}:${type}"` format acceptable for stable connection identification?

3. **Schema Versioning**: Should we include explicit schema version handling for future migrations?

4. **HTML Handling**: Should HTML content be stripped, rejected, or just warned about?

5. **Performance**: Are the performance guards (1000 notes, 2000 connections) sufficient?

6. **Error Handling**: Are there any specific error scenarios we should address?

Please review and provide feedback on:

- Interface completeness
- Schema design
- Performance considerations
- Security implications
- Integration points

**Next Steps**: Once approved, proceed with MS-62 (LocalJSONProvider) implementation.
