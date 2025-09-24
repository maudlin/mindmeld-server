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
        `state-${Date.now()}.json`,
      ),
      jsonLimit: '1mb',
      featureMapsApi: true,
      sqliteFile: dbFile,
    });
  });

  afterEach(async () => {
    await fs.unlink(dbFile).catch(() => {
      // ignore missing file
    });
  });

  it('should create, get, update, and detect conflict', async () => {
    // Create - using strict format: state: { n: [], c: [] }
    const createRes = await request(app)
      .post('/maps')
      .send({ name: 'Test Map', state: { n: [], c: [] } })
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

    // Update - using strict format: data: { n: [...], c: [] }
    const putRes = await request(app)
      .put(`/maps/${id}`)
      .send({
        data: { n: [{ i: '1', p: [0, 0], c: 'Note 1' }], c: [] },
        version: 1,
      })
      .expect(200);
    expect(putRes.body.id).toBe(id);
    expect(putRes.body.version).toBe(2);
    expect(putRes.body).toHaveProperty('updatedAt', expect.any(String));
    expect(putRes.headers).toHaveProperty('etag', expect.any(String));

    // Conflict with stale version
    await request(app)
      .put(`/maps/${id}`)
      .send({
        data: { n: [{ i: '2', p: [0, 0], c: 'Note 2' }], c: [] },
        version: 1,
      })
      .expect(409);
  });

  it('should support ETag + If-Match optimistic concurrency', async () => {
    // Create initial map - using strict format
    const createRes = await request(app)
      .post('/maps')
      .send({ name: 'IfMatch Map', state: { n: [], c: [] } })
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
      .send({
        data: { n: [{ i: 'x', p: [10, 20], c: 'Test note' }], c: [] },
        version: 1,
      })
      .expect(200);
    const etag2 = putOk.headers.etag;
    expect(etag2).toEqual(expect.any(String));
    expect(etag2).not.toBe(etag1);

    // Using the old ETag now should fail with 409
    await request(app)
      .put(`/maps/${id}`)
      .set('If-Match', etag1)
      .send({
        data: { n: [{ i: 'y', p: [30, 40], c: 'Another note' }], c: [] },
        version: 2,
      })
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
        state: { n: [{ i: 'n1', p: [0, 0], c: 'First note' }], c: [] },
      })
      .expect(201);
    await request(app)
      .post('/maps')
      .send({ name: 'Map Two', state: { n: [], c: [] } })
      .expect(201);

    const listRes = await request(app).get('/maps').expect(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThanOrEqual(2);
    const item = listRes.body[0];
    expect(item).toHaveProperty('id', expect.any(String));
    expect(item).toHaveProperty('version', expect.any(Number));
    expect(item).toHaveProperty('updatedAt', expect.any(String));
    expect(item).toHaveProperty('sizeBytes', expect.any(Number));
  });

  describe('DELETE /maps/:id', () => {
    it('should delete an existing map and return 200', async () => {
      // Create a map first
      const createRes = await request(app)
        .post('/maps')
        .send({ name: 'To Be Deleted', state: { n: [], c: [] } })
        .expect(201);
      const id = createRes.body.id;

      // Verify it exists
      await request(app).get(`/maps/${id}`).expect(200);

      // Delete the map
      const deleteRes = await request(app).delete(`/maps/${id}`).expect(200);

      expect(deleteRes.body).toEqual({
        message: `Map ${id} deleted successfully`,
      });

      // Verify it's gone
      await request(app).get(`/maps/${id}`).expect(404);
    });

    it('should return 404 when trying to delete non-existent map', async () => {
      const nonExistentId = 'non-existent-uuid';

      const deleteRes = await request(app)
        .delete(`/maps/${nonExistentId}`)
        .expect(404);

      // Accept either problem+json or text/html response for 404
      const contentType = deleteRes.headers['content-type'];
      if (contentType.includes('application/problem+json')) {
        expect(deleteRes.body).toMatchObject({
          type: expect.any(String),
          title: expect.any(String),
          status: 404,
          detail: expect.any(String),
          instance: expect.any(String),
        });
      } else {
        // Generic 404 handler returned HTML
        expect(contentType).toMatch(/text\/html/);
      }
    });

    it('should not affect other maps when deleting one', async () => {
      // Create two maps
      const createRes1 = await request(app)
        .post('/maps')
        .send({ name: 'Keep This', state: { n: [], c: [] } })
        .expect(201);
      const createRes2 = await request(app)
        .post('/maps')
        .send({ name: 'Delete This', state: { n: [], c: [] } })
        .expect(201);

      const keepId = createRes1.body.id;
      const deleteId = createRes2.body.id;

      // Delete one map
      await request(app).delete(`/maps/${deleteId}`).expect(200);

      // Verify the other still exists
      const getRes = await request(app).get(`/maps/${keepId}`).expect(200);
      expect(getRes.body.name).toBe('Keep This');

      // Verify the deleted one is gone
      await request(app).get(`/maps/${deleteId}`).expect(404);
    });
  });
});
