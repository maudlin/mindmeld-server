const { z } = require('zod');
const { randomUUID } = require('crypto');
const MapsRepo = require('./repo');
const { NotFoundError, ConflictError, BadRequestError } = require('./errors');

const MapCreateSchema = z
  .object({
    name: z.string().min(1),
    data: z.object({}).passthrough().optional(),
    state: z.object({}).passthrough().optional()
  })
  .refine(v => v.data || v.state, {
    message: 'Invalid create request: missing data',
    path: ['data']
  });

const MapUpdateSchema = z
  .object({
    data: z.object({}).passthrough().optional(),
    state: z.object({}).passthrough().optional(),
    version: z.number().int().min(1)
  })
  .refine(v => v.data || v.state, {
    message: 'Invalid update request: missing data',
    path: ['data']
  });

class MapsService {
  constructor(sqliteFile) {
    this.repo = new MapsRepo(sqliteFile);
  }

  create({ name, data, state }) {
    const parsed = MapCreateSchema.safeParse({ name, data, state });
    if (!parsed.success) {
      throw new BadRequestError('Invalid create request');
    }
    const payload = parsed.data.data ?? parsed.data.state;
    const id = randomUUID();
    const version = 1;
    const updatedAt = new Date().toISOString();
    const stateJson = JSON.stringify(payload);
    const result = this.repo.create({
      id,
      name,
      version,
      updatedAt,
      stateJson
    });
    return { id: result.id, name, version, updatedAt };
  }

  get(id) {
    const row = this.repo.get(id);
    if (!row) {
      throw new NotFoundError('Map not found');
    }
    const parsed = JSON.parse(row.stateJson);
    // Back-compat: return both data and state for a transition period
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updatedAt,
      data: parsed,
      state: parsed
    };
  }

  update(id, body) {
    const parsed = MapUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid update request');
    }
    const current = this.repo.get(id);
    if (!current) {
      throw new NotFoundError('Map not found');
    }

    const expectedVersion = parsed.data.version;
    if (current.version !== expectedVersion) {
      throw new ConflictError('Version conflict');
    }

    const nextVersion = expectedVersion + 1;
    const updatedAt = new Date().toISOString();
    const payload = parsed.data.data ?? parsed.data.state;
    const stateJson = JSON.stringify(payload);
    const name = current.name; // unchanged here

    const changes = this.repo.update({
      id,
      nextVersion,
      updatedAt,
      stateJson,
      name,
      expectedVersion
    });
    if (changes !== 1) {
      // Another writer updated between read and update
      throw new ConflictError('Concurrent update');
    }

    return {
      id,
      name,
      version: nextVersion,
      updatedAt
    };
  }
}

module.exports = MapsService;
