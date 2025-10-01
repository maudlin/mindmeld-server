/**
 * Client Bundle Route
 * Serves the pre-built Yjs client bundle to browser clients
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

function createClientBundleRouter() {
  const router = express.Router();
  const bundlePath = path.join(
    __dirname,
    '../../../dist/mindmeld-yjs-client.js',
  );
  const sourcemapPath = path.join(
    __dirname,
    '../../../dist/mindmeld-yjs-client.js.map',
  );

  // Serve the main bundle
  router.get('/mindmeld-yjs-client.js', (req, res) => {
    // Check if bundle exists
    if (!fs.existsSync(bundlePath)) {
      return res.status(404).json({
        error: 'Client bundle not built',
        message: 'Run "npm run build:client" to generate the Yjs client bundle',
      });
    }

    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.set('Access-Control-Allow-Origin', '*'); // Allow from any origin
    res.sendFile(bundlePath);
  });

  // Serve the sourcemap
  router.get('/mindmeld-yjs-client.js.map', (req, res) => {
    if (!fs.existsSync(sourcemapPath)) {
      return res.status(404).send('Sourcemap not found');
    }

    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');
    res.sendFile(sourcemapPath);
  });

  // Info endpoint
  router.get('/info', (req, res) => {
    const exists = fs.existsSync(bundlePath);

    if (exists) {
      const stats = fs.statSync(bundlePath);
      res.json({
        available: true,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        modified: stats.mtime,
        url: '/client/mindmeld-yjs-client.js',
      });
    } else {
      res.json({
        available: false,
        message: 'Run "npm run build:client" to generate bundle',
      });
    }
  });

  return router;
}

module.exports = createClientBundleRouter;
