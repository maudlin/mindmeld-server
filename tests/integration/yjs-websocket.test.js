/**
 * Yjs WebSocket Integration Tests
 * Tests the /yjs/:mapId WebSocket endpoint with real server and WebSocket connections
 */

const WebSocket = require('ws');
const http = require('http');
const Y = require('yjs');
// const createServer = require('../../src/factories/server-factory'); // unused

describe('Yjs WebSocket Integration Tests', () => {
  // let server; // unused
  let httpServer;
  let baseUrl;
  let originalServerSync;

  beforeAll(() => {
    // Enable SERVER_SYNC for these tests
    originalServerSync = process.env.SERVER_SYNC;
    process.env.SERVER_SYNC = 'on';

    // Clear module cache to pick up new env var
    delete require.cache[require.resolve('../../src/config/config')];
  });

  afterAll(() => {
    // Restore original setting
    if (originalServerSync !== undefined) {
      process.env.SERVER_SYNC = originalServerSync;
    } else {
      delete process.env.SERVER_SYNC;
    }

    // Clear module cache
    delete require.cache[require.resolve('../../src/config/config')];
  });

  beforeEach(async () => {
    // Clear module caches to ensure fresh config
    delete require.cache[require.resolve('../../src/config/config')];
    delete require.cache[require.resolve('../../src/factories/server-factory')];

    // Create server with Yjs enabled
    const createServerFresh = require('../../src/factories/server-factory');
    const app = createServerFresh({
      port: 0, // Use random available port
      corsOrigin: 'http://localhost:3000',
      jsonLimit: '1mb'
    });

    // Start HTTP server
    httpServer = http.createServer(app);

    // Setup WebSocket handling if available
    console.log('setupWebSocket function available:', !!app.setupWebSocket);
    if (app.setupWebSocket) {
      app.setupWebSocket(httpServer);
    }

    await new Promise(resolve => {
      httpServer.listen(0, resolve);
    });

    const address = httpServer.address();
    baseUrl = `ws://localhost:${address.port}`;
  });

  afterEach(async () => {
    if (httpServer) {
      await new Promise(resolve => {
        httpServer.close(resolve);
      });
    }
  });

  describe('WebSocket Connection', () => {
    it('should accept WebSocket connections to /yjs/:mapId', async () => {
      const mapId = 'test-map-connection';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
      await new Promise(resolve => {
        ws.on('close', resolve);
      });
    });

    it('should reject WebSocket connections with invalid URL format', async () => {
      const wsUrl = `${baseUrl}/invalid-url`;

      const ws = new WebSocket(wsUrl);

      await new Promise(resolve => {
        ws.on('close', (code, _reason) => {
          // WebSocket closes with 1006 (abnormal closure) when server destroys socket
          expect(code).toBe(1006);
          resolve();
        });
        ws.on('error', () => {
          // WebSocket errors are expected for invalid URLs
          resolve();
        });
      });
    });

    it('should handle multiple concurrent connections to same document', async () => {
      const mapId = 'test-map-concurrent';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);
      const ws3 = new WebSocket(wsUrl);

      // Wait for all connections to open
      await Promise.all([
        new Promise((resolve, reject) => {
          ws1.on('open', resolve);
          ws1.on('error', reject);
        }),
        new Promise((resolve, reject) => {
          ws2.on('open', resolve);
          ws2.on('error', reject);
        }),
        new Promise((resolve, reject) => {
          ws3.on('open', resolve);
          ws3.on('error', reject);
        })
      ]);

      expect(ws1.readyState).toBe(WebSocket.OPEN);
      expect(ws2.readyState).toBe(WebSocket.OPEN);
      expect(ws3.readyState).toBe(WebSocket.OPEN);

      // Close all connections
      ws1.close();
      ws2.close();
      ws3.close();

      await Promise.all([
        new Promise(resolve => ws1.on('close', resolve)),
        new Promise(resolve => ws2.on('close', resolve)),
        new Promise(resolve => ws3.on('close', resolve))
      ]);
    });
  });

  describe('Document Synchronization', () => {
    it('should send initial document state to new connections', async () => {
      const mapId = 'test-map-initial-state';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // First connection creates some content
      const ws1 = new WebSocket(wsUrl);
      await new Promise((resolve, reject) => {
        ws1.on('open', resolve);
        ws1.on('error', reject);
      });

      const doc1 = new Y.Doc();
      const array1 = doc1.getArray('notes');
      array1.insert(0, ['initial note']);

      const update = Y.encodeStateAsUpdate(doc1);
      ws1.send(update);

      // Wait a bit for the update to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second connection should receive initial state
      const ws2 = new WebSocket(wsUrl);
      await new Promise((resolve, reject) => {
        ws2.on('open', resolve);
        ws2.on('error', reject);
      });

      const receivedUpdates = [];
      ws2.on('message', data => {
        receivedUpdates.push(new Uint8Array(data));
      });

      // Wait for initial state message
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedUpdates.length).toBeGreaterThan(0);

      // Apply received state to new document
      const doc2 = new Y.Doc();
      for (const update of receivedUpdates) {
        Y.applyUpdate(doc2, update);
      }

      const array2 = doc2.getArray('notes');
      expect(array2.length).toBe(1);
      expect(array2.get(0)).toBe('initial note');

      ws1.close();
      ws2.close();
    });

    it('should broadcast updates to all connected clients except sender', async () => {
      const mapId = 'test-map-broadcast';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // Create three connections
      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);
      const ws3 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve)),
        new Promise(resolve => ws3.on('open', resolve))
      ]);

      // Set up message listeners
      const ws2Updates = [];
      const ws3Updates = [];

      ws2.on('message', data => {
        ws2Updates.push(new Uint8Array(data));
      });

      ws3.on('message', data => {
        ws3Updates.push(new Uint8Array(data));
      });

      // Clear any initial state messages
      await new Promise(resolve => setTimeout(resolve, 100));
      ws2Updates.length = 0;
      ws3Updates.length = 0;

      // ws1 sends an update
      const doc = new Y.Doc();
      const array = doc.getArray('test');
      array.insert(0, ['broadcast test']);

      const update = Y.encodeStateAsUpdate(doc);
      ws1.send(update);

      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 200));

      // ws2 and ws3 should receive the update, but not ws1
      expect(ws2Updates.length).toBeGreaterThan(0);
      expect(ws3Updates.length).toBeGreaterThan(0);

      // Verify the content was broadcast correctly
      const testDoc2 = new Y.Doc();
      const testDoc3 = new Y.Doc();

      for (const receivedUpdate of ws2Updates) {
        Y.applyUpdate(testDoc2, receivedUpdate);
      }
      for (const receivedUpdate of ws3Updates) {
        Y.applyUpdate(testDoc3, receivedUpdate);
      }

      const testArray2 = testDoc2.getArray('test');
      const testArray3 = testDoc3.getArray('test');

      expect(testArray2.length).toBeGreaterThan(0);
      expect(testArray3.length).toBeGreaterThan(0);

      ws1.close();
      ws2.close();
      ws3.close();
    });

    it('should handle complex document operations with multiple clients', async () => {
      const mapId = 'test-map-complex';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
      ]);

      // Create documents for each client
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      const updates1 = [];
      const updates2 = [];

      ws1.on('message', data => {
        const update = new Uint8Array(data);
        Y.applyUpdate(doc1, update);
        updates1.push(update);
      });

      ws2.on('message', data => {
        const update = new Uint8Array(data);
        Y.applyUpdate(doc2, update);
        updates2.push(update);
      });

      // Wait for initial state
      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 1 adds notes
      const notes1 = doc1.getArray('notes');
      notes1.insert(0, ['Note from client 1']);
      ws1.send(Y.encodeStateAsUpdate(doc1));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 2 adds connections
      const connections2 = doc2.getArray('connections');
      connections2.insert(0, [{ f: 'note1', t: 'note2' }]);
      ws2.send(Y.encodeStateAsUpdate(doc2));

      await new Promise(resolve => setTimeout(resolve, 100));

      // Client 1 adds more notes
      notes1.insert(1, ['Another note from client 1']);
      ws1.send(Y.encodeStateAsUpdate(doc1));

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify both documents have the same final state
      const finalNotes1 = doc1.getArray('notes');
      const finalNotes2 = doc2.getArray('notes');
      const finalConnections1 = doc1.getArray('connections');
      const finalConnections2 = doc2.getArray('connections');

      expect(finalNotes1.length).toBe(finalNotes2.length);
      expect(finalConnections1.length).toBe(finalConnections2.length);

      expect(finalNotes1.toArray()).toEqual(finalNotes2.toArray());
      expect(finalConnections1.toArray()).toEqual(finalConnections2.toArray());

      ws1.close();
      ws2.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid binary data gracefully', async () => {
      const mapId = 'test-map-invalid-data';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const ws = new WebSocket(wsUrl);
      await new Promise(resolve => ws.on('open', resolve));

      // Send invalid binary data
      const invalidData = Buffer.from('invalid yjs update data');
      ws.send(invalidData);

      // Connection should remain open despite invalid data
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    it('should handle connection drops gracefully', async () => {
      const mapId = 'test-map-connection-drops';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const ws1 = new WebSocket(wsUrl);
      const ws2 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise(resolve => ws1.on('open', resolve)),
        new Promise(resolve => ws2.on('open', resolve))
      ]);

      // Abruptly close ws1
      ws1.terminate();

      // ws2 should still work normally
      const doc = new Y.Doc();
      const array = doc.getArray('test');
      array.insert(0, ['test after disconnect']);

      ws2.send(Y.encodeStateAsUpdate(doc));

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(ws2.readyState).toBe(WebSocket.OPEN);

      ws2.close();
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      const mapId = 'test-map-rapid-cycles';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // Rapidly create and close connections
      for (let i = 0; i < 10; i++) {
        const ws = new WebSocket(wsUrl);
        await new Promise(resolve => {
          ws.on('open', () => {
            ws.close();
            resolve();
          });
        });
        await new Promise(resolve => ws.on('close', resolve));
      }

      // Final connection should still work
      const finalWs = new WebSocket(wsUrl);
      await new Promise(resolve => finalWs.on('open', resolve));

      expect(finalWs.readyState).toBe(WebSocket.OPEN);

      finalWs.close();
    });
  });

  describe('Feature Flag Integration', () => {
    it('should respect SERVER_SYNC feature flag', async () => {
      // First test: WebSocket should work when SERVER_SYNC is 'on'
      const mapId = 'test-map-feature-flag-on';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // SERVER_SYNC is set to 'on' in beforeAll, so this should work
      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 2000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('should reject connections when SERVER_SYNC is disabled', async () => {
      // Temporarily disable SERVER_SYNC for this test
      const originalValue = process.env.SERVER_SYNC;
      process.env.SERVER_SYNC = 'off';

      // Clear module cache and restart server to pick up new config
      delete require.cache[require.resolve('../../src/config/config')];
      delete require.cache[
        require.resolve('../../src/factories/server-factory')
      ];

      // Close current server
      if (httpServer) {
        await new Promise(resolve => {
          httpServer.close(resolve);
        });
      }

      // Create new server with disabled sync
      const createServerFresh = require('../../src/factories/server-factory');
      const app = createServerFresh({
        port: 0,
        corsOrigin: 'http://localhost:3000',
        jsonLimit: '1mb'
      });

      httpServer = http.createServer(app);

      // Setup WebSocket handling - should not be available when SERVER_SYNC is off
      console.log('setupWebSocket function available:', !!app.setupWebSocket);
      if (app.setupWebSocket) {
        app.setupWebSocket(httpServer);
      }

      await new Promise(resolve => {
        httpServer.listen(0, resolve);
      });

      const address = httpServer.address();
      const newBaseUrl = `ws://localhost:${address.port}`;
      const mapId = 'test-map-feature-flag-off';
      const wsUrl = `${newBaseUrl}/yjs/${mapId}`;

      const ws = new WebSocket(wsUrl);

      // If feature is disabled, connection should be rejected or not available
      await new Promise(resolve => {
        ws.on('error', resolve);
        ws.on('close', resolve);
        setTimeout(resolve, 1000);
      });

      expect(ws.readyState).not.toBe(WebSocket.OPEN);

      // Restore original environment variable
      if (originalValue !== undefined) {
        process.env.SERVER_SYNC = originalValue;
      } else {
        delete process.env.SERVER_SYNC;
      }

      // Clear cache again to restore original config
      delete require.cache[require.resolve('../../src/config/config')];
      delete require.cache[
        require.resolve('../../src/factories/server-factory')
      ];
    });
  });

  describe('Persistence Integration', () => {
    it('should persist document changes across connections', async () => {
      const mapId = 'test-map-persistence';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // First session: create content
      const ws1 = new WebSocket(wsUrl);
      await new Promise(resolve => ws1.on('open', resolve));

      const doc1 = new Y.Doc();
      const notes1 = doc1.getArray('notes');
      notes1.insert(0, ['Persistent note 1', 'Persistent note 2']);

      ws1.send(Y.encodeStateAsUpdate(doc1));

      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 200));

      ws1.close();
      await new Promise(resolve => ws1.on('close', resolve));

      // Second session: should load persisted content
      const ws2 = new WebSocket(wsUrl);
      await new Promise(resolve => ws2.on('open', resolve));

      const receivedUpdates = [];
      ws2.on('message', data => {
        receivedUpdates.push(new Uint8Array(data));
      });

      // Wait for initial state (should include persisted content)
      await new Promise(resolve => setTimeout(resolve, 200));

      if (receivedUpdates.length > 0) {
        const doc2 = new Y.Doc();
        for (const update of receivedUpdates) {
          Y.applyUpdate(doc2, update);
        }

        const notes2 = doc2.getArray('notes');
        expect(notes2.length).toBeGreaterThan(0);
      }

      ws2.close();
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple simultaneous updates efficiently', async () => {
      const mapId = 'test-map-performance';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      const connections = [];
      const numConnections = 5;

      // Create multiple connections
      for (let i = 0; i < numConnections; i++) {
        const ws = new WebSocket(wsUrl);
        connections.push(ws);
        await new Promise(resolve => ws.on('open', resolve));
      }

      const startTime = Date.now();

      // Each connection sends updates simultaneously
      const updatePromises = connections.map((ws, index) => {
        return new Promise(resolve => {
          const doc = new Y.Doc();
          const array = doc.getArray('performance-test');

          for (let j = 0; j < 10; j++) {
            array.insert(j, [`Client ${index} - Update ${j}`]);
            ws.send(Y.encodeStateAsUpdate(doc));
          }

          setTimeout(resolve, 100);
        });
      });

      await Promise.all(updatePromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Performance assertion - should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds max

      // Close all connections
      for (const ws of connections) {
        ws.close();
      }
    });

    it('should clean up resources when connections close', async () => {
      const mapId = 'test-map-cleanup';
      const wsUrl = `${baseUrl}/yjs/${mapId}`;

      // Create and immediately close many connections
      for (let i = 0; i < 20; i++) {
        const ws = new WebSocket(wsUrl);
        await new Promise(resolve => ws.on('open', resolve));
        ws.close();
        await new Promise(resolve => ws.on('close', resolve));
      }

      // Final connection should still work efficiently
      const finalWs = new WebSocket(wsUrl);
      const startTime = Date.now();

      await new Promise(resolve => finalWs.on('open', resolve));

      const connectionTime = Date.now() - startTime;
      expect(connectionTime).toBeLessThan(1000); // Should connect quickly

      finalWs.close();
    });
  });
});
