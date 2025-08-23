const { z } = require('zod');
const { randomUUID } = require('crypto');
const MapsRepo = require('./repo');
const { NotFoundError, ConflictError, BadRequestError } = require('./errors');

const MapCreateSchema = z.object({
  name: z.string().min(1),
  state: z.object({}).passthrough()
});

const MapUpdateSchema = z.object({
  state: z.object({}).passthrough(),
  version: z.number().int().min(1)
});

class MapsService {
  constructor(sqliteFile) {
    this.repo = new MapsRepo(sqliteFile);
  }

  create({ name, state }) {
    const parsed = MapCreateSchema.safeParse({ name, state });
    if (!parsed.success) {
      throw new BadRequestError('Invalid create request');
    }
    const id = randomUUID();
    const version = 1;
    const updatedAt = new Date().toISOString();
    const stateJson = JSON.stringify(state);
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
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      updatedAt: row.updatedAt,
      state: JSON.parse(row.stateJson)
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
    const stateJson = JSON.stringify(parsed.data.state);
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
