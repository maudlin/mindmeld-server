/**
 * API Integration Tests
 * Tests the complete API endpoints with real HTTP requests
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const createServer = require('../../src/factories/server-factory');

describe('API Integration Tests', () => {
  let app;
  let testStateFile;

  beforeEach(() => {
    // Create unique test state file for each test
    testStateFile = path.join(
      process.cwd(),
      'test-data',
      `state-${Date.now()}.json`
    );

    app = createServer({
      port: 3002, // Different port for tests
      corsOrigin: 'http://localhost:3000',
      stateFilePath: testStateFile,
      jsonLimit: '1mb'
    });
  });

  afterEach(async () => {
    // Clean up test file
    try {
      await fs.unlink(testStateFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        stats: expect.any(Object)
      });
    });
  });

  describe('GET /api/state', () => {
    it('should return empty state when no file exists', async () => {
      const response = await request(app).get('/api/state').expect(200);

      expect(response.body).toEqual({
        notes: [],
        connections: [],
        zoomLevel: 5
      });
    });

    it('should return saved state when file exists', async () => {
      const testState = {
        notes: [{ id: '1', content: 'Test Note' }],
        connections: [],
        zoomLevel: 3
      };

      // First save state
      await request(app).put('/api/state').send(testState).expect(200);

      // Then retrieve it
      const response = await request(app).get('/api/state').expect(200);

      expect(response.body).toEqual(testState);
    });
  });

  describe('PUT /api/state', () => {
    it('should save valid state', async () => {
      const testState = {
        notes: [
          { id: '1', content: 'Test Note 1' },
          { id: '2', content: 'Test Note 2' }
        ],
        connections: [{ from: '1', to: '2' }],
        zoomLevel: 4
      };

      const response = await request(app)
        .put('/api/state')
        .send(testState)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        timestamp: expect.any(String),
        notes: 2,
        connections: 1,
        zoomLevel: 4
      });
    });

    it('should reject invalid state - missing notes array', async () => {
      const invalidState = {
        connections: [],
        zoomLevel: 5
      };

      const response = await request(app)
        .put('/api/state')
        .send(invalidState)
        .expect(400);

      expect(response.body.error).toContain('Invalid state');
    });

    it('should reject invalid state - non-object', async () => {
      const response = await request(app)
        .put('/api/state')
        .send('invalid')
        .expect(400);

      expect(response.body.error).toContain('Invalid state');
    });

    it('should handle rapid saves (atomic writes)', async () => {
      const testState = {
        notes: [{ id: '1', content: 'Test' }],
        connections: [],
        zoomLevel: 5
      };

      // Fire multiple rapid saves
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .put('/api/state')
          .send({
            ...testState,
            notes: [{ id: '1', content: `Test ${i}` }]
          })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      responses.forEach((response, index) => {
        if (response.status !== 200) {
          console.error(
            `Response ${index} failed:`,
            response.status,
            response.body
          );
          console.error(
            `Response ${index} error details:`,
            JSON.stringify(response.body, null, 2)
          );
        }
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Final state should be one of the saved states
      const finalResponse = await request(app).get('/api/state').expect(200);

      expect(finalResponse.body.notes).toHaveLength(1);
      expect(finalResponse.body.notes[0].content).toMatch(/Test \d/);
    });
  });

  describe('GET /api/state/stats', () => {
    it('should return empty stats initially', async () => {
      const response = await request(app).get('/api/state/stats').expect(200);

      expect(response.body).toEqual({
        notesCount: 0,
        connectionsCount: 0,
        zoomLevel: 5,
        isEmpty: true
      });
    });

    it('should return correct stats after saving state', async () => {
      const testState = {
        notes: [
          { id: '1', content: 'Note 1' },
          { id: '2', content: 'Note 2' },
          { id: '3', content: 'Note 3' }
        ],
        connections: [
          { from: '1', to: '2' },
          { from: '2', to: '3' }
        ],
        zoomLevel: 7
      };

      await request(app).put('/api/state').send(testState).expect(200);

      const response = await request(app).get('/api/state/stats').expect(200);

      expect(response.body).toEqual({
        notesCount: 3,
        connectionsCount: 2,
        zoomLevel: 7,
        isEmpty: false
      });
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000'
      );
    });
  });
});
