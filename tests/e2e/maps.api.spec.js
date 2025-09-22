const { test, expect } = require('@playwright/test');

test.describe('Maps API E2E', () => {
  test('should handle complete CRUD workflow', async ({ request }) => {
    // Step 1: CREATE map
    const createResponse = await request.post('/maps', {
      data: {
        name: 'E2E Test Map',
        state: {
          n: [{ i: 'note1', p: [100, 100], c: 'Initial note', cl: 'blue' }],
          c: []
        }
      }
    });

    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const etag = createResponse.headers()['etag'];

    // Step 2: READ map
    const readResponse = await request.get(`/maps/${created.id}`);
    expect(readResponse.status()).toBe(200);

    const readMap = await readResponse.json();
    expect(readMap.name).toBe('E2E Test Map');
    expect(readMap.data.n).toHaveLength(1);

    // Step 3: UPDATE map
    const updateResponse = await request.put(`/maps/${created.id}`, {
      data: {
        data: {
          n: [
            { i: 'note1', p: [100, 100], c: 'Initial note', cl: 'blue' },
            { i: 'note2', p: [200, 200], c: 'Updated note', cl: 'green' }
          ],
          c: [{ f: 'note1', t: 'note2' }]
        },
        version: 1
      },
      headers: { 'If-Match': etag }
    });

    expect(updateResponse.status()).toBe(200);

    // Step 4: Verify update
    const finalResponse = await request.get(`/maps/${created.id}`);
    const finalMap = await finalResponse.json();
    expect(finalMap.data.n).toHaveLength(2);
    expect(finalMap.version).toBe(2);
  });

  test('should handle conflicts properly', async ({ request }) => {
    const createResponse = await request.post('/maps', {
      data: { name: 'Conflict Test', state: { n: [], c: [] } }
    });

    const created = await createResponse.json();
    const staleEtag = createResponse.headers()['etag'];

    // Update once to change ETag
    await request.put(`/maps/${created.id}`, {
      data: {
        data: { n: [{ i: '1', p: [0, 0], c: 'First', cl: 'red' }], c: [] },
        version: 1
      },
      headers: { 'If-Match': staleEtag }
    });

    // Try to update with stale ETag - should get 409
    const conflictResponse = await request.put(`/maps/${created.id}`, {
      data: {
        data: { n: [{ i: '2', p: [0, 0], c: 'Second', cl: 'blue' }], c: [] },
        version: 2
      },
      headers: { 'If-Match': staleEtag }
    });

    expect(conflictResponse.status()).toBe(409);
  });

  test('should delete maps and handle not found properly', async ({
    request
  }) => {
    // Create a map to delete
    const createResponse = await request.post('/maps', {
      data: {
        name: 'To Be Deleted',
        state: {
          n: [{ i: 'temp1', p: [50, 50], c: 'Temporary note' }],
          c: []
        }
      }
    });

    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const mapId = created.id;

    // Verify the map exists
    const getResponse = await request.get(`/maps/${mapId}`);
    expect(getResponse.status()).toBe(200);

    // DELETE the map
    const deleteResponse = await request.delete(`/maps/${mapId}`);
    expect(deleteResponse.status()).toBe(200);

    const deleteResult = await deleteResponse.json();
    expect(deleteResult).toEqual({
      message: `Map ${mapId} deleted successfully`
    });

    // Verify the map is gone - GET should return 404
    const getAfterDeleteResponse = await request.get(`/maps/${mapId}`);
    expect(getAfterDeleteResponse.status()).toBe(404);

    // Try to delete non-existent map - should return 404
    const deleteNonExistentResponse = await request.delete(
      '/maps/non-existent-id'
    );
    expect(deleteNonExistentResponse.status()).toBe(404);

    const notFoundError = await deleteNonExistentResponse.json();
    expect(notFoundError).toMatchObject({
      type: expect.any(String),
      title: expect.any(String),
      status: 404,
      detail: expect.any(String)
    });
  });

  test('should handle complete CRUD+Delete workflow', async ({ request }) => {
    // Create map
    const createResponse = await request.post('/maps', {
      data: {
        name: 'Full Lifecycle Map',
        state: { n: [], c: [] }
      }
    });

    const created = await createResponse.json();
    const mapId = created.id;
    const etag = createResponse.headers()['etag'];

    // Read (verify creation)
    const readResponse = await request.get(`/maps/${mapId}`);
    expect(readResponse.status()).toBe(200);

    // Update
    const updateResponse = await request.put(`/maps/${mapId}`, {
      data: {
        data: { n: [{ i: 'final', p: [10, 10], c: 'Final note' }], c: [] },
        version: 1
      },
      headers: { 'If-Match': etag }
    });
    expect(updateResponse.status()).toBe(200);

    // Read again (verify update)
    const readUpdatedResponse = await request.get(`/maps/${mapId}`);
    expect(readUpdatedResponse.status()).toBe(200);
    const updatedMap = await readUpdatedResponse.json();
    expect(updatedMap.version).toBe(2);
    expect(updatedMap.data.n).toHaveLength(1);

    // Delete
    const deleteResponse = await request.delete(`/maps/${mapId}`);
    expect(deleteResponse.status()).toBe(200);

    // Verify deletion
    const finalReadResponse = await request.get(`/maps/${mapId}`);
    expect(finalReadResponse.status()).toBe(404);
  });
});
