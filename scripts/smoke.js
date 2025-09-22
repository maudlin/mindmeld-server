/*
 * Node-only smoke test: create a map, get it, update it, and verify a conflict.
 * Requires the server to be running. No external dependencies.
 */

const BASE =
  process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    body: parsed,
    headers: res.headers,
    etag: res.headers.get('etag')
  };
}

(async () => {
  try {
    // Health
    const health = await req('GET', '/health');
    if (health.status !== 200)
      throw new Error(`Health failed: ${health.status}`);
    console.log('[smoke] Health OK');

    // Create
    const created = await req('POST', '/maps', {
      name: 'Smoke',
      state: { n: [], c: [] }
    });
    if (created.status !== 201)
      throw new Error(`Create failed: ${created.status}`);
    console.log('[smoke] Create OK', created.body);
    const id = created.body.id;

    // Get
    const got = await req('GET', `/maps/${id}`);
    if (got.status !== 200) throw new Error(`Get failed: ${got.status}`);
    console.log('[smoke] Get OK', got.body, 'ETag:', got.etag);

    // Update with version
    const v = got.body.version;
    const upd = await req('PUT', `/maps/${id}`, {
      version: v,
      data: { n: [{ i: 'n1', p: [100, 100], c: 'Test note' }], c: [] }
    });
    if (upd.status !== 200) throw new Error(`Update failed: ${upd.status}`);
    console.log('[smoke] Update OK', upd.body, 'ETag:', upd.etag);

    // Conflict with stale version
    const conflict = await req('PUT', `/maps/${id}`, {
      version: v,
      data: { n: [{ i: 'n2', p: [200, 200], c: 'Conflict note' }], c: [] }
    });
    if (conflict.status !== 409)
      throw new Error(`Conflict expected 409, got ${conflict.status}`);
    console.log('[smoke] Conflict OK (409)');

    console.log('[smoke] All checks passed');
  } catch (err) {
    console.error('[smoke] Failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
