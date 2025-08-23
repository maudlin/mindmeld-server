#!/usr/bin/env node
/* Simple seed script for Maps API */
const path = require('path');
const { config } = require('../src/config/config');
const createServer = require('../src/factories/server-factory');
const supertest = require('supertest');

(async () => {
  const app = createServer({
    port: config.port,
    corsOrigin: config.corsOrigin,
    stateFilePath: config.stateFilePath,
    jsonLimit: config.jsonLimit,
    featureMapsApi: true,
    sqliteFile: config.sqliteFile
  });

  const request = supertest(app);

  const samples = [
    {
      name: 'Welcome Map',
      data: { n: [{ i: '1', p: [100, 100], c: 'Hello' }], c: [] }
    },
    {
      name: 'Demo Map',
      data: { n: [{ i: 'a', p: [200, 120], c: 'Demo' }], c: [] }
    }
  ];

  for (const s of samples) {
    const res = await request.post('/maps').send(s);
    if (res.status !== 201) {
      console.error('Seed failed:', res.status, res.body);
      process.exit(1);
    }
    console.log(`[seed] Created map: ${res.body.id} (${s.name})`);
  }

  console.log('[seed] Done.');
})();
