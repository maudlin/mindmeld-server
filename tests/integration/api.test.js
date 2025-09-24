/**
 * API Integration Tests (maps-first)
 * Tests core endpoints like health and CORS. Legacy /api/state tests removed.
 */

const request = require('supertest');
const createServer = require('../../src/factories/server-factory');

describe('API Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = createServer({
      port: 3002, // Different port for tests
      corsOrigin: 'http://localhost:3000',
      jsonLimit: '1mb',
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      });
    });
  });

  describe('CORS', () => {
    it('should include CORS headers for cross-origin requests', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should allow requests without origin header', async () => {
      const response = await request(app).get('/health').expect(200);

      // No CORS headers should be present for same-origin requests
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should allow localhost variants', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://127.0.0.1:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe(
        'http://127.0.0.1:3000',
      );
    });
  });
});
