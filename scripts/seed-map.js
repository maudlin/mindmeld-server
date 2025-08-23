/*
 * Seed a single map and print the id to stdout
 */

const http = require('http');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: process.env.PORT ? Number(process.env.PORT) : 3001,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      },
      res => {
        let chunks = '';
        res.setEncoding('utf8');
        res.on('data', d => (chunks += d));
        res.on('end', () => {
          try {
            const json = chunks ? JSON.parse(chunks) : null;
            resolve({ status: res.statusCode, body: json });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const res = await postJson('/maps', { name: 'Seeded Map', state: {} });
    if (res.status !== 201) {
      console.error('Seeding failed with status', res.status);
      process.exit(1);
    }
    console.log(res.body.id);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
