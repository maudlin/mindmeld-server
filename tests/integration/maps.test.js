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
    // ETag should be present on create
    expect(createRes.headers).toHaveProperty('etag', expect.any(String));
    const id = createRes.body.id;

    // Get
    const getRes = await request(app).get(`/maps/${id}`).expect(200);
    expect(getRes.body.id).toBe(id);
    expect(getRes.body.name).toBe('Test Map');
    expect(getRes.body.version).toBe(1);
    expect(getRes.body).toHaveProperty('updatedAt', expect.any(String));
    // ETag should be present on GET
    expect(getRes.headers).toHaveProperty('etag', expect.any(String));

    // Update ok (version-only path still works)
    const putRes = await request(app)
      .put(`/maps/${id}`)
      .send({ state: { notes: [{ id: '1' }], connections: [] }, version: 1 })
      .expect(200);
    expect(putRes.body.id).toBe(id);
    expect(putRes.body.version).toBe(2);
    expect(putRes.body).toHaveProperty('updatedAt', expect.any(String));
    expect(putRes.headers).toHaveProperty('etag', expect.any(String));

    // Conflict with stale version
    await request(app)
      .put(`/maps/${id}`)
      .send({ state: { notes: [{ id: '2' }], connections: [] }, version: 1 })
      .expect(409);
  });

  it('should support ETag + If-Match optimistic concurrency', async () => {
    // Create initial map
    const createRes = await request(app)
      .post('/maps')
      .send({ name: 'IfMatch Map', data: { n: [], c: [] } })
      .expect(201);
    const id = createRes.body.id;
    const etag1 = createRes.headers.etag; // quoted value

    // Load and verify same ETag
    const getRes1 = await request(app).get(`/maps/${id}`).expect(200);
    expect(getRes1.headers.etag).toBe(etag1);

    // Update with If-Match should succeed and produce a new ETag
    const putOk = await request(app)
      .put(`/maps/${id}`)
      .set('If-Match', etag1)
      .send({ data: { n: [{ id: 'x' }], c: [] }, version: 1 })
      .expect(200);
    const etag2 = putOk.headers.etag;
    expect(etag2).toEqual(expect.any(String));
    expect(etag2).not.toBe(etag1);

    // Using the old ETag now should fail with 409
    await request(app)
      .put(`/maps/${id}`)
      .set('If-Match', etag1)
      .send({ data: { n: [{ id: 'y' }], c: [] }, version: 2 })
      .expect(409);

    // GET now returns the new ETag
    const getRes2 = await request(app).get(`/maps/${id}`).expect(200);
    expect(getRes2.headers.etag).toBe(etag2);
  });

  it('should list maps with id, name, version, updatedAt, size', async () => {
    await request(app)
      .post('/maps')
      .send({
        name: 'Map One',
        state: { notes: [{ id: 'n1' }], connections: [] }
      })
      .expect(201);
    await request(app)
      .post('/maps')
      .send({ name: 'Map Two', state: { notes: [], connections: [] } })
      .expect(201);

    const listRes = await request(app).get('/maps').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(2);
    const item = listRes.body[0];
    expect(item).toHaveProperty('id', expect.any(String));
    expect(item).toHaveProperty('version', expect.any(Number));
    expect(item).toHaveProperty('updatedAt', expect.any(String));
    expect(item).toHaveProperty('size', expect.any(Number));
  });
});
