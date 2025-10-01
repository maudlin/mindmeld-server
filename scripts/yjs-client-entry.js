/**
 * MindMeld Yjs Client Bundle Entry Point
 *
 * This creates a browser-friendly bundle of Yjs + WebSocket provider
 * that can be loaded via <script> tag by clients who don't use npm.
 *
 * The server provides this as a "pseudo-module" so clients can upgrade
 * from REST polling to real-time WebSocket collaboration.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

/**
 * MindMeld WebSocket Client
 * Wraps Yjs with a simple API for MindMeld map data
 */
class MindMeldWebSocketClient {
  constructor(serverUrl, mapId, options = {}) {
    // Remove protocol from server URL if present
    const wsUrl = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const protocol = serverUrl.startsWith('https') ? 'wss' : 'ws';

    // Create Y.Doc
    this.doc = new Y.Doc();

    // Connect WebSocket provider
    // y-websocket appends the room name to the URL, so we need: ws://host/yjs + /mapId
    this.provider = new WebsocketProvider(
      `${protocol}://${wsUrl}`,
      `yjs/${mapId}`,
      this.doc,
      options,
    );

    // Access MindMeld data structures
    this.notes = this.doc.getMap('notes');
    this.connections = this.doc.getMap('connections');
    this.meta = this.doc.getMap('meta');

    // Track sync status
    this.synced = false;
    this.provider.on('sync', (isSynced) => {
      this.synced = isSynced;
    });
  }

  /**
   * Wait for initial sync to complete
   * @returns {Promise<void>}
   */
  whenSynced() {
    return new Promise((resolve) => {
      if (this.synced) {
        resolve();
      } else {
        this.provider.once('sync', () => resolve());
      }
    });
  }

  /**
   * Listen for sync status changes
   * @param {function} callback - Called with (isSynced: boolean)
   */
  onSync(callback) {
    this.provider.on('sync', callback);
  }

  /**
   * Listen for connection status changes
   * @param {function} callback - Called with status object
   */
  onStatus(callback) {
    this.provider.on('status', callback);
  }

  /**
   * Observe changes to notes
   * @param {function} callback - Called when notes change
   */
  onNotesChange(callback) {
    this.notes.observe(callback);
  }

  /**
   * Observe changes to connections
   * @param {function} callback - Called when connections change
   */
  onConnectionsChange(callback) {
    this.connections.observe(callback);
  }

  /**
   * Export current state to JSON (MindMeld format)
   * @returns {Object} Map data in JSON format
   */
  toJSON() {
    const json = {
      n: [], // notes
      c: [], // connections
      meta: {},
    };

    // Export notes
    for (const [noteId, noteMap] of this.notes.entries()) {
      const note = {
        i: noteId,
        c: noteMap.get('content')?.toString() || '',
        p: noteMap.get('pos') || [0, 0],
      };

      const color = noteMap.get('color');
      if (color && color !== 'default') {
        note.color = color;
      }

      json.n.push(note);
    }

    // Export connections
    for (const [, conn] of this.connections.entries()) {
      const connObj = {
        f: conn.from,
        t: conn.to,
      };

      if (conn.type && conn.type !== 'arrow') {
        connObj.type = conn.type;
      }

      json.c.push(connObj);
    }

    // Export metadata
    for (const [key, value] of this.meta.entries()) {
      json.meta[key] = value;
    }

    return json;
  }

  /**
   * Import JSON data into Y.Doc (merges with existing)
   * @param {Object} jsonData - MindMeld JSON format
   */
  fromJSON(jsonData) {
    this.doc.transact(() => {
      // Import notes
      if (jsonData.n && Array.isArray(jsonData.n)) {
        for (const noteData of jsonData.n) {
          if (!noteData.i) continue;

          const noteMap = new Y.Map();
          noteMap.set('id', noteData.i);

          // Set content as Y.Text
          const yText = new Y.Text();
          yText.insert(0, noteData.c || '');
          noteMap.set('content', yText);

          noteMap.set('pos', noteData.p || [0, 0]);
          noteMap.set('color', noteData.color || 'default');

          this.notes.set(noteData.i, noteMap);
        }
      }

      // Import connections
      if (jsonData.c && Array.isArray(jsonData.c)) {
        for (const connData of jsonData.c) {
          if (!connData.f || !connData.t) continue;

          const connId = `${connData.f}:${connData.t}:${connData.type || 'arrow'}`;
          this.connections.set(connId, {
            from: connData.f,
            to: connData.t,
            type: connData.type || 'arrow',
          });
        }
      }

      // Import metadata
      if (jsonData.meta) {
        for (const [key, value] of Object.entries(jsonData.meta)) {
          this.meta.set(key, value);
        }
      }
    });
  }

  /**
   * Disconnect and clean up
   */
  destroy() {
    if (this.provider) {
      this.provider.destroy();
    }
    if (this.doc) {
      this.doc.destroy();
    }
  }
}

// Export to global window object
window.MindMeldWebSocketClient = MindMeldWebSocketClient;

// Also export Y for advanced users
window.Y = Y;

console.log('MindMeld WebSocket Client loaded');
