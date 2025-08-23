const express = require('express');
const { createHash } = require('crypto');
const MapsService = require('./service');
const { ConflictError } = require('./errors');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(v => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    k => `${JSON.stringify(k)}:${stableStringify(value[k])}`
  );
  return `{${entries.join(',')}}`;
}

function computeEtag(obj) {
  const canonical = stableStringify(obj);
  return createHash('sha256').update(canonical).digest('hex');
}

function stripQuotes(str) {
  if (typeof str !== 'string') {
    return str;
  }
  return str.replace(/^"|"$/g, '');
}

function createMapsRouter({ sqliteFile }) {
  const router = express.Router();
  const service = new MapsService(sqliteFile);

  // Create map
  router.post('/', (req, res, next) => {
    try {
      const { name, data, state } = req.body || {};
      const created = service.create({ name, data, state });
      const payload = data ?? state ?? {};
      const etag = computeEtag(payload);
      res.set('ETag', `"${etag}"`);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // Get map by id
  router.get('/:id', (req, res, next) => {
    try {
      const map = service.get(req.params.id);
      const payload = map.data ?? map.state ?? {};
      const etag = computeEtag(payload);
      res.set('ETag', `"${etag}"`);
      res.json(map);
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
        const current = service.get(id);
        const currentPayload = current.data ?? current.state ?? {};
        const currentEtag = computeEtag(currentPayload);
        const provided = stripQuotes(ifMatch);
        if (provided !== currentEtag) {
          throw new ConflictError('ETag mismatch');
        }
      }

      const updated = service.update(id, req.body || {});

      const nextPayload = (req.body && (req.body.data ?? req.body.state)) || {};
      const nextEtag = computeEtag(nextPayload);
      res.set('ETag', `"${nextEtag}"`);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createMapsRouter;
