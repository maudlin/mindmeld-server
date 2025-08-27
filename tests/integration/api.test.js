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
      jsonLimit: '1mb'
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
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
