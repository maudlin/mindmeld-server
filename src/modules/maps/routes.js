const express = require('express');
const MapsService = require('./service');

function createMapsRouter({ sqliteFile }) {
  const router = express.Router();
  const service = new MapsService(sqliteFile);

  // Create map
  router.post('/', (req, res, next) => {
    try {
      const { name, state } = req.body || {};
      const created = service.create({ name, state });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // Get map by id
  router.get('/:id', (req, res, next) => {
    try {
      const map = service.get(req.params.id);
      // Optionally add ETag header based on version
      res.set('ETag', `W/"v-${map.version}"`);
      res.json(map);
    } catch (err) {
      next(err);
    }
  });

  // Replace state with optimistic concurrency
  router.put('/:id', (req, res, next) => {
    try {
      const updated = service.update(req.params.id, req.body || {});
      res.set('ETag', `W/"v-${updated.version}"`);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createMapsRouter;
