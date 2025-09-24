/**
 * Server-side JSON ↔ Y.Doc Conversion Utilities
 *
 * Provides conversion between MindMeld JSON format and Y.js documents
 * without requiring DOM or browser-specific APIs.
 *
 * This is the server-side implementation that mirrors the client-side
 * YjsSchema converters but works in Node.js environment.
 */

const Y = require('yjs');

/**
 * Content limits and constraints (matching client-side schema)
 */
const NOTE_CONTENT_LIMIT = 10000;
const MAX_NOTES_PER_MAP = 1000;
const MAX_CONNECTIONS_PER_MAP = 2000;

/**
 * Generate a connection ID from components
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
 * Initialize Y.Doc with correct schema structure
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
 * Validate note content
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
  return true;
}

/**
 * Validate note position
 */
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
 * Check performance limits
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
 * Convert MindMeld JSON format to Y.Doc structure
 *
 * @param {Object} jsonData - MindMeld JSON format
 * @param {Y.Doc} ydoc - Target Y.Doc
 * @param {Object} options - Conversion options
 */
function jsonToYDoc(jsonData, ydoc, options = {}) {
  const { suppressEvents = false } = options;
  const { notes, connections, meta } = initializeYDoc(ydoc);

  // Apply transaction for atomic update
  ydoc.transact(
    () => {
      // Clear existing data unless merging
      if (!options.merge) {
        notes.clear();
        connections.clear();
      }

      // Import notes
      if (jsonData.n && Array.isArray(jsonData.n)) {
        for (const noteData of jsonData.n) {
          if (!noteData.i || typeof noteData.c !== 'string') {
            console.warn('Skipping invalid note:', noteData);
            continue;
          }

          try {
            validateNoteContent(noteData.c);
            validateNotePosition(noteData.p || [0, 0]);

            // Create note as Y.Map with Y.Text content
            const noteMap = new Y.Map();
            const yText = new Y.Text();

            // Set note properties
            noteMap.set('id', noteData.i);
            noteMap.set('pos', noteData.p || [0, 0]);
            noteMap.set('color', noteData.color || 'default');
            noteMap.set('content', yText);

            // Insert content into Y.Text
            yText.insert(0, noteData.c);

            notes.set(noteData.i, noteMap);
          } catch (error) {
            console.warn(`Skipping invalid note ${noteData.i}:`, error.message);
          }
        }
      }

      // Import connections
      if (jsonData.c && Array.isArray(jsonData.c)) {
        for (const connData of jsonData.c) {
          if (!connData.f || !connData.t) {
            console.warn('Skipping invalid connection:', connData);
            continue;
          }

          try {
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
          } catch (error) {
            console.warn(
              `Skipping invalid connection ${connData.f}→${connData.t}:`,
              error.message
            );
          }
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
    },
    suppressEvents ? 'import' : null
  ); // Use 'import' origin to suppress events
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
    let pos = [0, 0];
    let color = 'default';

    // Handle Y.Map note objects
    if (noteObj && typeof noteObj.get === 'function') {
      // This is a Y.Map
      const yTextContent = noteObj.get('content');
      if (yTextContent && typeof yTextContent.toString === 'function') {
        contentStr = yTextContent.toString();
      }
      pos = noteObj.get('pos') || [0, 0];
      color = noteObj.get('color') || 'default';
    } else if (noteObj) {
      // Fallback for plain object (legacy support)
      if (noteObj.content) {
        if (typeof noteObj.content === 'string') {
          contentStr = noteObj.content;
        } else if (noteObj.content.toString) {
          contentStr = noteObj.content.toString();
        }
      }
      pos = noteObj.pos || [0, 0];
      color = noteObj.color || 'default';
    }

    const noteData = {
      i: noteId,
      c: contentStr,
      p: pos
    };

    if (color && color !== 'default') {
      noteData.color = color;
    }

    jsonData.n.push(noteData);
  }

  // Export connections
  for (const [, connObj] of connections.entries()) {
    const connData = {
      f: connObj.from,
      t: connObj.to
    };

    // Only include type if not default
    if (connObj.type && connObj.type !== 'arrow') {
      connData.type = connObj.type;
    }

    jsonData.c.push(connData);
  }

  // Export metadata
  for (const [key, value] of meta.entries()) {
    jsonData.meta[key] = value;
  }

  return jsonData;
}

/**
 * Check if a Y.Doc has any content (not just empty structure)
 */
function hasYDocContent(ydoc) {
  try {
    const { notes, connections } = initializeYDoc(ydoc);

    // Check if we have actual content, not just empty structures
    if (notes.size > 0) {
      // Check if any note has actual content
      for (const [, noteObj] of notes.entries()) {
        if (noteObj && typeof noteObj.get === 'function') {
          const content = noteObj.get('content');
          if (content && content.toString && content.toString().length > 0) {
            return true;
          }
        }
      }
    }

    return connections.size > 0;
  } catch (_error) {
    return false;
  }
}

/**
 * Create a Y.Doc from JSON data
 */
function createYDocFromJSON(jsonData, options = {}) {
  const ydoc = new Y.Doc();
  jsonToYDoc(jsonData, ydoc, options);
  return ydoc;
}

module.exports = {
  // Conversion functions
  jsonToYDoc,
  yDocToJSON,

  // Y.Doc utilities
  initializeYDoc,
  hasYDocContent,
  createYDocFromJSON,

  // Validation functions
  validateNoteContent,
  validateNotePosition,
  checkPerformanceLimits,

  // Helper functions
  generateConnectionId,

  // Constants
  NOTE_CONTENT_LIMIT,
  MAX_NOTES_PER_MAP,
  MAX_CONNECTIONS_PER_MAP
};
