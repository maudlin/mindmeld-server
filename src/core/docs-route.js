const path = require('path');
const express = require('express');

function createDocsRouter() {
  const router = express.Router();

  // Serve the to-be OpenAPI yaml
  router.get('/openapi/to-be', (req, res) => {
    const filePath = path.join(
      process.cwd(),
      'design',
      'to-be',
      'openapi.yaml'
    );
    res.sendFile(filePath);
  });

  // Simple Redoc page
  router.get('/docs', (req, res) => {
    const redocHtml = `<!DOCTYPE html>
<html>
<head>
  <title>MindMeld API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body { margin: 0; padding: 0; }</style>
</head>
<body>
  <redoc spec-url='/openapi/to-be'></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`;
    res.type('html').send(redocHtml);
  });

  return router;
}

module.exports = createDocsRouter;
