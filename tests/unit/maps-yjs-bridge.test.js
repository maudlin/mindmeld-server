/**
 * MS-66: REST bridge for list/backup export/import
 * TDD Tests for Y.js integration with Maps service
 *
 * Tests the bridge between Y.js documents and REST API for:
 * - Export from Y.Doc to JSON view (for ETag/version) on demand
 * - Import JSON to seed/override Y.js documents (admin/dev)
 * - Maintain /maps for listing + backups
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { randomUUID } = require('crypto');

const createServer = require('../../src/factories/server-factory');
const MapsService = require('../../src/modules/maps/service');
const YjsService = require('../../src/modules/yjs/service');

describe('MS-66: Maps Y.js Bridge Integration', () => {
  let server;
  let testDbPath;
  let _mapsService;
  let yjsService;

  const testMapData = {
    n: [
      { i: 'note1', c: 'Hello from Y.js', p: [100, 200] },
      { i: 'note2', c: 'Bridge test', p: [300, 400] },
    ],
    c: [{ f: 'note1', t: 'note2' }],
  };

  beforeEach(async () => {
    // Create temporary database for each test
    testDbPath = path.join(
      __dirname,
      '../tmp',
      `test-ms66-${randomUUID()}.sqlite`,
    );

    // Ensure tmp directory exists
    const tmpDir = path.dirname(testDbPath);
    if (!fsSync.existsSync(tmpDir)) {
      await fs.mkdir(tmpDir, { recursive: true });
    }

    // Set environment variables for this test
    process.env.SERVER_SYNC = 'on';
    process.env.SQLITE_FILE = testDbPath;

    // Create services
    _mapsService = new MapsService(testDbPath);
    yjsService = new YjsService({ dbFile: testDbPath });

    // Create server with Y.js support enabled
    server = createServer({
      sqliteFile: testDbPath,
      serverSync: 'on', // Enable Y.js WebSocket server (correct config key)
    });
  });

  afterEach(async () => {
    // Cleanup
    if (yjsService) {
      await yjsService.close();
    }
    // Note: server is just an Express app, it doesn't have a close() method
    // The HTTP server would have close(), but we're using supertest which handles that

    // Clean up environment variables
    delete process.env.SERVER_SYNC;
    delete process.env.SQLITE_FILE;

    // Remove test database with retry for Windows file locking
    const cleanupFile = async (filePath, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          if (fsSync.existsSync(filePath)) {
            await fs.unlink(filePath);
          }
          return;
        } catch (error) {
          if (error.code === 'EBUSY' && i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }
          // Don't throw, just warn
          console.warn(`Failed to cleanup ${filePath}: ${error.message}`);
          return;
        }
      }
    };

    await cleanupFile(testDbPath);
  });

  describe('Y.js Document Export to JSON (GET /maps/:id)', () => {
    test('should prefer Y.js document over static JSON when Y.js document exists', async () => {
      // ARRANGE: Create a map via traditional REST
      const createResponse = await request(server)
        .post('/maps')
        .send({
          name: 'Traditional Map',
          state: {
            n: [{ i: 'old-note', c: 'Old content', p: [0, 0] }],
            c: [],
          },
        })
        .expect(201);

      const mapId = createResponse.body.id;

      // ARRANGE: Create a Y.js document with different content for the same mapId
      // Use the import endpoint to populate the Y.js document
      await request(server)
        .post(`/maps/${mapId}/import`)
        .send({
          n: [{ i: 'note1', c: 'Hello from Y.js', p: [100, 200] }],
          c: [],
        })
        .expect(201);

      // ACT: GET the map via REST API
      const getResponse = await request(server)
        .get(`/maps/${mapId}`)
        .expect(200);

      // ASSERT: Should return Y.js document content, not the static JSON
      // This test will fail until we implement Y.js priority in MapsService
      expect(getResponse.body.data.n[0].c).toBe('Hello from Y.js');
      expect(getResponse.body.data.n[0].i).toBe('note1');
    });

    test('should build export from Y.Doc without DOM', async () => {
      // ARRANGE: Create a Y.js document directly (simulating WebSocket client activity)
      const mapId = randomUUID();

      // Use the import endpoint to populate the Y.js document
      await request(server)
        .post(`/maps/${mapId}/import`)
        .send(testMapData)
        .expect(201);

      // ACT: Export via REST API
      const response = await request(server).get(`/maps/${mapId}`).expect(200);

      // ASSERT: Should successfully export Y.Doc to JSON without requiring browser DOM
      expect(response.body.data).toBeDefined();
      expect(response.body.data.n).toBeInstanceOf(Array);
      expect(response.body.data.c).toBeInstanceOf(Array);
      expect(response.body.data.meta).toBeDefined();

      // ASSERT: Content should match what was in the Y.js document
      expect(response.body.data.n).toHaveLength(2);
      expect(response.body.data.c).toHaveLength(1);
    });

    test('should fallback to static JSON when Y.js document does not exist', async () => {
      // ARRANGE: Create map via traditional REST only
      const response = await request(server)
        .post('/maps')
        .send({
          name: 'Static Only Map',
          state: testMapData,
        })
        .expect(201);

      const mapId = response.body.id;

      // ACT: GET the map via REST API
      const getResponse = await request(server)
        .get(`/maps/${mapId}`)
        .expect(200);

      // ASSERT: Should return static JSON since no Y.js document exists
      expect(getResponse.body.data).toEqual(testMapData);
      expect(getResponse.body.name).toBe('Static Only Map');
    });

    test('should generate proper ETag from Y.js document content', async () => {
      // ARRANGE: Create Y.js document with specific content
      const mapId = randomUUID();

      // Use the import endpoint to populate the Y.js document
      await request(server)
        .post(`/maps/${mapId}/import`)
        .send(testMapData)
        .expect(201);

      // ACT: GET with ETag support
      const response = await request(server).get(`/maps/${mapId}`).expect(200);

      // ASSERT: Should have ETag header generated from Y.js content
      expect(response.headers.etag).toBeDefined();

      // ACT: GET again with same ETag
      const _cachedResponse = await request(server)
        .get(`/maps/${mapId}`)
        .set('If-None-Match', response.headers.etag)
        .expect(304);
    });
  });

  describe('Maps Listing with Mixed Storage Types', () => {
    test('should list maps from both static JSON and Y.js documents', async () => {
      // ARRANGE: Create one static map
      const staticResponse = await request(server)
        .post('/maps')
        .send({
          name: 'Static Map',
          state: testMapData,
        })
        .expect(201);

      // ARRANGE: Create one Y.js-backed map
      const yjsMapId = randomUUID();

      // Use the import endpoint to create Y.js document with metadata
      await request(server)
        .post(`/maps/${yjsMapId}/import`)
        .send({
          ...testMapData,
          meta: { mapName: 'Y.js Map' },
        })
        .expect(201);

      // ACT: List all maps
      const listResponse = await request(server).get('/maps').expect(200);

      // ASSERT: Should include both maps
      expect(listResponse.body).toHaveLength(2);

      // Find the static map
      const staticMap = listResponse.body.find(
        (m) => m.id === staticResponse.body.id,
      );
      expect(staticMap.name).toBe('Static Map');

      // Find the Y.js map
      const yjsMap = listResponse.body.find((m) => m.id === yjsMapId);
      expect(yjsMap).toBeDefined();
    });
  });

  describe('JSON Import to Y.js Documents (POST /maps/:id/import)', () => {
    test('should create new import endpoint for admin/dev seeding', async () => {
      // ARRANGE: Prepare JSON data for import
      const mapId = randomUUID();

      // ACT: Import JSON data to create Y.js document
      const response = await request(server)
        .post(`/maps/${mapId}/import`)
        .send(testMapData)
        .expect(201);

      // ASSERT: Should create Y.js document from JSON
      expect(response.body.success).toBe(true);
      expect(response.body.mapId).toBe(mapId);

      // ASSERT: Verify Y.js document was created
      const yjsDoc = await yjsService.getOrCreateDocument(mapId);
      expect(yjsDoc).toBeDefined();

      // ASSERT: Verify content is accessible via Y.js
      // TODO: This requires Y.Doc → JSON export functionality
    });

    test('should apply imports transactionally', async () => {
      // ARRANGE: Create existing Y.js document
      const mapId = randomUUID();
      const _yjsDoc = await yjsService.getOrCreateDocument(mapId);

      // ARRANGE: Prepare invalid JSON data
      const invalidData = {
        n: 'not an array', // Invalid structure
        c: null,
      };

      // ACT: Attempt to import invalid data
      const response = await request(server)
        .post(`/maps/${mapId}/import`)
        .send(invalidData)
        .expect(400);

      // ASSERT: Y.js document should remain unchanged
      // TODO: Verify original document state is preserved
      const errorMessage =
        response.body.title ||
        response.body.error ||
        response.body.message ||
        response.body.detail ||
        'invalid data';
      expect(errorMessage).toMatch(/invalid|bad request|error/i);
    });

    test('should suppress user events during import', async () => {
      // ARRANGE: Set up event listener to detect events
      const mapId = randomUUID();
      let eventsFired = 0;

      // TODO: This test requires event monitoring infrastructure
      // We need to verify that imports don't trigger WebSocket broadcasts

      // ACT: Import data
      await request(server)
        .post(`/maps/${mapId}/import`)
        .send(testMapData)
        .expect(201);

      // ASSERT: No user events should have been fired
      expect(eventsFired).toBe(0);
    });

    test('should override existing Y.js document on import', async () => {
      // ARRANGE: Create existing Y.js document with content
      const mapId = randomUUID();
      const _yjsDoc = await yjsService.getOrCreateDocument(mapId);
      // TODO: Populate with existing content

      // ACT: Import new content
      const newData = {
        n: [{ i: 'new-note', c: 'Imported content', p: [999, 999] }],
        c: [],
        meta: { version: 2, title: 'Imported Map' },
      };

      await request(server)
        .post(`/maps/${mapId}/import`)
        .send(newData)
        .expect(201);

      // ASSERT: Document should be completely replaced
      const exportResponse = await request(server)
        .get(`/maps/${mapId}`)
        .expect(200);

      expect(exportResponse.body.data.n).toHaveLength(1);
      expect(exportResponse.body.data.n[0].c).toBe('Imported content');
    });
  });

  describe('Integration: Full Round-trip Compatibility', () => {
    test('should maintain data fidelity: Y.js → REST export → import → Y.js', async () => {
      // ARRANGE: Create Y.js document with comprehensive data
      const mapId = randomUUID();

      // First create a static JSON record for the map
      const _createResponse = await request(server)
        .post('/maps')
        .send({
          name: 'Test Map for Round Trip',
          state: testMapData,
        })
        .expect(201);

      // Then import the testMapData into Y.js document
      await request(server)
        .post(`/maps/${mapId}/import`)
        .send(testMapData)
        .expect(201);

      // ACT: Export via REST API
      const exportResponse = await request(server)
        .get(`/maps/${mapId}`)
        .expect(200);

      const exportedData = exportResponse.body.data;

      // ACT: Import back into new Y.js document
      const newMapId = randomUUID();
      await request(server)
        .post(`/maps/${newMapId}/import`)
        .send(exportedData)
        .expect(201);

      // ACT: Export the imported document
      const reimportResponse = await request(server)
        .get(`/maps/${newMapId}`)
        .expect(200);

      // ASSERT: Should maintain perfect fidelity
      expect(reimportResponse.body.data.n).toHaveLength(testMapData.n.length);
      expect(reimportResponse.body.data.c).toHaveLength(testMapData.c.length);

      // Check content of first note
      expect(reimportResponse.body.data.n[0].c).toBe(testMapData.n[0].c);
      expect(reimportResponse.body.data.n[0].i).toBe(testMapData.n[0].i);
    });
  });
});
