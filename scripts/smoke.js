/*
 * Simple smoke test: create a map, get it, update it, and attempt a stale update.
 */

const http = require('http');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: process.env.PORT ? Number(process.env.PORT) : 3001,
        path,
        method,
        headers: data
          ? {
              'Content-Type': 'application/json',
              'Content-Length': data.length
            }
          : {}
      },
      res => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', d => (chunks += d));
        res.on('end', () => {
          const etag = res.headers.etag;
          try {
            const json = chunks ? JSON.parse(chunks) : null;
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: json,
              etag
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: chunks,
              etag
            });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log('Creating map...');
    const created = await request('POST', '/maps', {
      name: 'Smoke',
      state: {}
    });
    console.log('Create:', created.status, created.body);
    const id = created.body.id;

    console.log('Fetching map...');
    const fetched = await request('GET', `/maps/${id}`);
    console.log('Get:', fetched.status, fetched.body, 'ETag:', fetched.etag);

    console.log('Updating map...');
    const v1 = fetched.body.version;
    const updated = await request('PUT', `/maps/${id}`, {
      version: v1,
      state: { nodes: [{ id: 'n1' }] }
    });
    console.log('Update:', updated.status, updated.body, 'ETag:', updated.etag);

    console.log('Updating map with stale version (expect 409)...');
    const conflict = await request('PUT', `/maps/${id}`, {
      version: v1,
      state: { nodes: [{ id: 'n2' }] }
    });
    console.log('Conflict:', conflict.status);
  } catch (err) {
    console.error('Smoke failed:', err);
    process.exit(1);
  }
})();
