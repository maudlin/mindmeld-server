const { test, expect } = require('@playwright/test');

test.describe('Maps API E2E', () => {
  test('should handle complete CRUD workflow', async ({ request }) => {
    // Step 1: CREATE map
    const createResponse = await request.post('/maps', {
      data: {
        name: 'E2E Test Map',
        data: {
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
          c: [['note1', 'note2', 1]]
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
      data: { name: 'Conflict Test', data: { n: [], c: [] } }
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
});
