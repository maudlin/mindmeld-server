/**
 * Y.Doc Schema Definition for MindMeld
 *
 * Defines the structure and constraints for Y.Doc-based data storage
 * in MindMeld's real-time collaboration system.
 *
 * This schema ensures consistency between client and server implementations
 * and provides a clear contract for data storage and synchronization.
 *
 * NOTE: Y.js imports will be added in MS-63 implementation.
 * This file currently defines the schema structure and provides
 * placeholder implementations for the conversion functions.
 *
 * @see MS-61: Define DataProvider contract and Y.Doc schema
 * @see MS-63: Client YjsProvider + y-indexeddb; converters; performance guards
 * @see MS-64: Server y-websocket /yjs/:mapId and snapshot persistence
 */

/**
 * Content limits and constraints
 */
const NOTE_CONTENT_LIMIT = 10000; // Maximum markdown content length per note
const MAX_NOTES_PER_MAP = 1000; // Performance guard
const MAX_CONNECTIONS_PER_MAP = 2000; // Performance guard

/**
 * Y.Doc Schema Structure
 *
 * The Y.Doc contains three main Y.Map structures:
 * 1. notes: Y.Map<noteId → NoteObject>
 * 2. connections: Y.Map<connectionId → ConnectionObject>
 * 3. meta: Y.Map<metaKey → metaValue>
 */

/**
 * Note Structure in Y.Doc
 * Stored in notes Y.Map with noteId as key
 *
 * @typedef {Object} YjsNoteSchema
 * @property {string} id - Unique note identifier (matches map key)
 * @property {Array<number>} pos - Position [x, y] coordinates
 * @property {string} color - Note color identifier
 * @property {Y.Text} content - Markdown content as Y.Text for CRDT benefits
 */
const NOTE_SCHEMA = {
  // Required fields
  id: 'string', // Must match Y.Map key
  pos: 'array<number>', // [x, y] position
  content: 'Y.Text', // Markdown content (Y.Text for collaboration)

  // Optional fields
  color: 'string', // Color identifier

  // Validation constraints
  constraints: {
    'content.length': `<= ${NOTE_CONTENT_LIMIT}`,
    'pos.length': '=== 2',
    'pos[0]': 'number', // x coordinate
    'pos[1]': 'number' // y coordinate
  }
};

/**
 * Connection Structure in Y.Doc
 * Stored in connections Y.Map with connectionId as key
 *
 * Connection ID format: "${from}:${to}:${type}"
 * This makes connections direction-inclusive and type-specific
 *
 * @typedef {Object} YjsConnectionSchema
 * @property {string} id - Computed connection identifier
 * @property {string} from - Source note ID
 * @property {string} to - Target note ID
 * @property {string} type - Connection type ('arrow', 'line', 'curved', etc.)
 */
const CONNECTION_SCHEMA = {
  // Required fields
  from: 'string', // Source note ID
  to: 'string', // Target note ID
  type: 'string', // Connection type

  // Computed field (not stored, derived from map key)
  id: 'computed', // "${from}:${to}:${type}"

  // Validation constraints
  constraints: {
    from: 'required',
    to: 'required',
    type: 'required',
    'from !== to': true // No self-connections
  }
};

/**
 * Metadata Structure in Y.Doc
 * Stored in meta Y.Map with string keys
 *
 * @typedef {Object} YjsMetaSchema
 * @property {number} zoomLevel - Canvas zoom level
 * @property {string} canvasType - Canvas type identifier
 * @property {string} mapName - Human-readable map name
 * @property {string} version - Schema version for migrations
 * @property {string} created - ISO timestamp of creation
 * @property {string} modified - ISO timestamp of last modification
 */
const META_SCHEMA = {
  // Canvas state
  zoomLevel: 'number', // Current zoom level
  canvasType: 'string', // Canvas configuration

  // Map identity
  mapName: 'string', // Human-readable name

  // Timestamps
  version: 'string', // Schema version
  created: 'string', // ISO timestamp
  modified: 'string', // ISO timestamp

  // Validation constraints
  constraints: {
    zoomLevel: '>= 0.1 && <= 10',
    created: 'ISO8601',
    modified: 'ISO8601'
  }
};

/**
 * Connection ID Generation
 *
 * Generates a stable, direction-inclusive connection identifier
 *
 * @param {string} from - Source note ID
 * @param {string} to - Target note ID
 * @param {string} type - Connection type
 * @returns {string} Connection ID
 */
function generateConnectionId(from, to, type = 'arrow') {
  if (!from || !to || !type) {
    throw new Error('Missing required connection fields: from, to, type');
  }
  if (from === to) {
    throw new Error('Self-connections not allowed');
  }
  return `${from}:${to}:${type}`;
}

/**
 * Parse Connection ID
 *
 * Extracts components from a connection ID
 *
 * @param {string} connectionId - Connection identifier
 * @returns {Object} { from, to, type }
 */
function parseConnectionId(connectionId) {
  if (!connectionId || typeof connectionId !== 'string') {
    throw new Error('Invalid connection ID');
  }

  const parts = connectionId.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid connection ID format. Expected: "from:to:type"');
  }

  const [from, to, type] = parts;
  if (!from || !to || !type) {
    throw new Error('Invalid connection ID: empty components');
  }

  return { from, to, type };
}

/**
 * Y.Doc Initialization Helper
 *
 * Creates and configures a new Y.Doc with the correct schema structure
 *
 * @param {Y.Doc} ydoc - Y.Doc instance to configure
 * @returns {Object} Maps for notes, connections, and meta
 */
function initializeYDoc(ydoc) {
  if (!ydoc || typeof ydoc.getMap !== 'function') {
    throw new Error('Invalid Y.Doc instance');
  }

  const notes = ydoc.getMap('notes');
  const connections = ydoc.getMap('connections');
  const meta = ydoc.getMap('meta');

  // Set default metadata if not present
  if (meta.size === 0) {
    const now = new Date().toISOString();
    meta.set('version', '1.0');
    meta.set('created', now);
    meta.set('modified', now);
    meta.set('zoomLevel', 1.0);
    meta.set('canvasType', 'default');
    meta.set('mapName', 'Untitled Map');
  }

  return { notes, connections, meta };
}

/**
 * Content Validation
 */
function validateNoteContent(content) {
  if (typeof content !== 'string') {
    throw new Error('Note content must be a string');
  }
  if (content.length > NOTE_CONTENT_LIMIT) {
    throw new Error(
      `Note content exceeds limit of ${NOTE_CONTENT_LIMIT} characters`
    );
  }
  // Check for HTML content (markdown only allowed)
  if (/<[^>]+>/.test(content)) {
    console.warn('HTML content detected in note. Only Markdown is allowed.');
    // You might want to strip HTML or reject entirely based on security policy
  }
  return true;
}

function validateNotePosition(pos) {
  if (!Array.isArray(pos) || pos.length !== 2) {
    throw new Error('Note position must be [x, y] array');
  }
  if (typeof pos[0] !== 'number' || typeof pos[1] !== 'number') {
    throw new Error('Note position coordinates must be numbers');
  }
  return true;
}

/**
 * Performance Guards
 */
function checkPerformanceLimits(notes, connections) {
  if (notes.size > MAX_NOTES_PER_MAP) {
    throw new Error(`Too many notes: ${notes.size}/${MAX_NOTES_PER_MAP}`);
  }
  if (connections.size > MAX_CONNECTIONS_PER_MAP) {
    throw new Error(
      `Too many connections: ${connections.size}/${MAX_CONNECTIONS_PER_MAP}`
    );
  }
}

/**
 * JSON ↔ Y.Doc Conversion Helpers
 * Used by YjsProvider for full fidelity conversion between formats
 */

/**
 * Convert MindMeld JSON format to Y.Doc structure
 *
 * @param {Object} jsonData - MindMeld JSON format
 * @param {Y.Doc} ydoc - Target Y.Doc
 */
function jsonToYDoc(jsonData, ydoc) {
  // Import Y.js only when actually converting (for better error handling)
  let Y;
  try {
    Y = require('yjs');
  } catch (_error) {
    // Fallback for environments without Y.js (e.g., server-side testing)
    console.warn('Y.js not available, using simplified conversion');
  }

  const { notes, connections, meta } = initializeYDoc(ydoc);

  // Clear existing data
  notes.clear();
  connections.clear();

  // Import notes
  if (jsonData.n && Array.isArray(jsonData.n)) {
    for (const noteData of jsonData.n) {
      if (!noteData.i || typeof noteData.c !== 'string') {
        console.warn('Skipping invalid note:', noteData);
        continue;
      }

      validateNoteContent(noteData.c);
      validateNotePosition(noteData.p || [0, 0]);

      const noteObj = {
        id: noteData.i,
        pos: noteData.p || [0, 0],
        color: noteData.color || 'default'
      };

      // Create Y.Text for collaborative editing if Y.js is available
      if (Y) {
        const yText = new Y.Text();
        yText.insert(0, noteData.c);
        noteObj.content = yText;
      } else {
        // Fallback to string for testing environments
        noteObj.content = noteData.c;
      }

      notes.set(noteData.i, noteObj);
    }
  }

  // Import connections
  if (jsonData.c && Array.isArray(jsonData.c)) {
    for (const connData of jsonData.c) {
      if (!connData.f || !connData.t) {
        console.warn('Skipping invalid connection:', connData);
        continue;
      }

      const connId = generateConnectionId(
        connData.f,
        connData.t,
        connData.type || 'arrow'
      );
      const connObj = {
        from: connData.f,
        to: connData.t,
        type: connData.type || 'arrow'
      };

      connections.set(connId, connObj);
    }
  }

  // Import metadata
  if (jsonData.meta) {
    for (const [key, value] of Object.entries(jsonData.meta)) {
      meta.set(key, value);
    }
  }

  // Update modified timestamp
  meta.set('modified', new Date().toISOString());

  // Check performance limits
  checkPerformanceLimits(notes, connections);
}

/**
 * Convert Y.Doc structure to MindMeld JSON format
 *
 * @param {Y.Doc} ydoc - Source Y.Doc
 * @returns {Object} MindMeld JSON format
 */
function yDocToJSON(ydoc) {
  const { notes, connections, meta } = initializeYDoc(ydoc);

  const jsonData = {
    n: [], // notes
    c: [], // connections
    meta: {} // metadata
  };

  // Export notes
  for (const [noteId, noteObj] of notes.entries()) {
    let contentStr = '';

    // Handle Y.Text content or fallback string
    if (noteObj.content) {
      if (typeof noteObj.content === 'string') {
        contentStr = noteObj.content;
      } else if (noteObj.content.toString) {
        // Y.Text has toString() method
        contentStr = noteObj.content.toString();
      } else {
        // Fallback for unknown content types
        contentStr = String(noteObj.content);
      }
    }

    const noteData = {
      i: noteId,
      c: contentStr,
      p: noteObj.pos || [0, 0]
    };

    if (noteObj.color && noteObj.color !== 'default') {
      noteData.color = noteObj.color;
    }

    jsonData.n.push(noteData);
  }

  // Export connections
  for (const [, connObj] of connections.entries()) {
    const connData = {
      f: connObj.from,
      t: connObj.to,
      type: connObj.type || 'arrow'
    };

    // Only include type if not default
    if (connData.type === 'arrow') {
      delete connData.type;
    }

    jsonData.c.push(connData);
  }

  // Export metadata
  for (const [key, value] of meta.entries()) {
    jsonData.meta[key] = value;
  }

  return jsonData;
}

// Export schema definitions and utilities
module.exports = {
  // Schema definitions
  NOTE_SCHEMA,
  CONNECTION_SCHEMA,
  META_SCHEMA,

  // Constants
  NOTE_CONTENT_LIMIT,
  MAX_NOTES_PER_MAP,
  MAX_CONNECTIONS_PER_MAP,

  // Utilities
  generateConnectionId,
  parseConnectionId,
  initializeYDoc,

  // Validation
  validateNoteContent,
  validateNotePosition,
  checkPerformanceLimits,

  // Converters (will be expanded in MS-63)
  jsonToYDoc,
  yDocToJSON
};
