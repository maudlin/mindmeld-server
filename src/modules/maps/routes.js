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
  router.get('/', async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const items = await service.list({ limit, offset });
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

  // Get map by id (with Y.js integration)
  router.get('/:id', async (req, res, next) => {
    try {
      const map = await service.getById(req.params.id);

      // Handle both Y.js and static data sources
      let payload;
      let etag;

      if (map.dataSource === 'yjs') {
        // Y.js document - data is already in JSON format
        payload = map.data;
        etag = map.etag;
      } else {
        // Static JSON storage
        payload = JSON.parse(map.stateJson);
        etag = computeEtag(payload);
      }

      res.set('ETag', `"${etag}"`);

      // Return with parsed data field for client convenience
      const response = {
        ...map,
        data: payload
      };
      delete response.stateJson; // Remove internal field
      delete response.dataSource; // Remove internal field
      res.json(response);
    } catch (err) {
      next(err);
    }
  });

  // Replace state with optimistic concurrency (If-Match preferred, version fallback)
  router.put('/:id', async (req, res, next) => {
    try {
      const id = req.params.id;
      const ifMatch = req.get('If-Match');

      if (ifMatch) {
        const current = await service.getById(id);
        let currentEtag;

        if (current.dataSource === 'yjs') {
          currentEtag = current.etag;
        } else {
          const currentPayload = JSON.parse(current.stateJson);
          currentEtag = computeEtag(currentPayload);
        }

        const provided = stripQuotes(ifMatch);
        if (provided !== currentEtag) {
          throw new ConflictError('ETag mismatch');
        }
      }

      const updated = await service.update(id, req.body || {});
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
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = req.params.id;
      await service.delete(id);
      res.json({ message: `Map ${id} deleted successfully` });
    } catch (err) {
      next(err);
    }
  });

  // Import JSON data into Y.js document
  router.post('/:id/import', async (req, res, next) => {
    try {
      const id = req.params.id;
      const jsonData = req.body;

      const result = await service.importToYjs(id, jsonData, {
        suppressEvents: true, // Don't broadcast WebSocket events during import
        createStaticRecord: true // Create metadata record in static storage
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createMapsRouter;
