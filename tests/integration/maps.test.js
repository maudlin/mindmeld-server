const request = require('supertest');
const path = require('path');
const fs = require('fs').promises;
const createServer = require('../../src/factories/server-factory');

describe('Maps API (to-be) integration', () => {
  let app;
  let dbFile;

  beforeEach(async () => {
    dbFile = path.join(process.cwd(), 'test-data', `maps-${Date.now()}.sqlite`);
    app = createServer({
      port: 3003,
      corsOrigin: 'http://localhost:3000',
      stateFilePath: path.join(
        process.cwd(),
        'test-data',
        `state-${Date.now()}.json`
      ),
      jsonLimit: '1mb',
      featureMapsApi: true,
      sqliteFile: dbFile
    });
  });

  afterEach(async () => {
    await fs.unlink(dbFile).catch(() => {
      // ignore missing file
    });
  });

  it('should create, get, update, and detect conflict', async () => {
    // Create
    const createRes = await request(app)
      .post('/maps')
      .send({ name: 'Test Map', state: { notes: [], connections: [] } })
      .expect(201);

    expect(createRes.body.id).toEqual(expect.any(String));
    expect(createRes.body.version).toBe(1);
    expect(createRes.body).toHaveProperty('updatedAt', expect.any(String));
    const id = createRes.body.id;

    // Get
    const getRes = await request(app).get(`/maps/${id}`).expect(200);
    expect(getRes.body.id).toBe(id);
    expect(getRes.body.name).toBe('Test Map');
    expect(getRes.body.version).toBe(1);
    expect(getRes.body).toHaveProperty('updatedAt', expect.any(String));

    // Update ok
    const putRes = await request(app)
      .put(`/maps/${id}`)
      .send({ state: { notes: [{ id: '1' }], connections: [] }, version: 1 })
      .expect(200);
    expect(putRes.body.id).toBe(id);
    expect(putRes.body.version).toBe(2);
    expect(putRes.body).toHaveProperty('updatedAt', expect.any(String));

    // Conflict with stale version
    await request(app)
      .put(`/maps/${id}`)
      .send({ state: { notes: [{ id: '2' }], connections: [] }, version: 1 })
      .expect(409);
  });
});
