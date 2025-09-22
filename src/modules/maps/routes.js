const express = require('express');
const MapsService = require('./service');
const { ConflictError } = require('./errors');
const { computeEtag } = require('../../utils/etag');

function stripQuotes(str) {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(/^"|"$/g, '');
}

function createMapsRouter({ sqliteFile }) {
  const router = express.Router();
  const service = new MapsService(sqliteFile);

  // List maps
  router.get('/', (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const items = service.list({ limit, offset });
      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  // Create map
  router.post('/', (req, res, next) => {
    try {
      const { name, data, state } = req.body || {};
      const created = service.create({ name, state: data ?? state });
      const payload = data ?? state ?? {};
      const etag = computeEtag(payload);
      res.set('ETag', `"${etag}"`);

      // Return with parsed data field for client convenience
      const response = {
        ...created,
        data: payload
      };
      delete response.stateJson; // Remove internal field
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  });

  // Get map by id
  router.get('/:id', (req, res, next) => {
    try {
      const map = service.getById(req.params.id);
      const payload = JSON.parse(map.stateJson);
      const etag = computeEtag(payload);
      res.set('ETag', `"${etag}"`);

      // Return with parsed data field for client convenience
      const response = {
        ...map,
        data: payload
      };
      delete response.stateJson; // Remove internal field
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Replace state with optimistic concurrency (If-Match preferred, version fallback)
  router.put('/:id', (req, res, next) => {
    try {
      const id = req.params.id;
      const ifMatch = req.get('If-Match');

      if (ifMatch) {
        const current = service.getById(id);
        const currentPayload = JSON.parse(current.stateJson);
        const currentEtag = computeEtag(currentPayload);
        const provided = stripQuotes(ifMatch);
        if (provided !== currentEtag) {
          throw new ConflictError('ETag mismatch');
        }
      }

      const updated = service.update(id, req.body || {});
      const payload = req.body?.data ?? req.body?.state;
      const nextEtag = computeEtag(payload);
      res.set('ETag', `"${nextEtag}"`);

      // Return with parsed data field for client convenience
      const response = {
        ...updated,
        data: payload
      };
      delete response.stateJson; // Remove internal field
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Delete map
  router.delete('/:id', (req, res, next) => {
    try {
      const id = req.params.id;
      service.delete(id);
      res.json({ message: `Map ${id} deleted successfully` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createMapsRouter;
