const { z } = require('zod');
const { randomUUID } = require('crypto');
const crypto = require('crypto');
const MapsRepo = require('./repo');
const { NotFoundError, ConflictError, BadRequestError } = require('./errors');

// Y.js integration
const YjsService = require('../yjs/service');
const {
  yDocToJSON,
  jsonToYDoc,
  hasYDocContent,
  validateNoteContent: _validateNoteContent,
  validateNotePosition: _validateNotePosition
} = require('../yjs/json-converter');

// Strict schema definitions for mind map data structures
const NoteSchema = z
  .object({
    i: z.string().min(1), // Note ID
    p: z.tuple([z.number(), z.number()]), // Position [x, y]
    c: z.string() // Content
  })
  .passthrough(); // Allow additional properties for future extensibility

const ConnectionSchema = z
  .object({
    f: z.string().min(1), // From note ID
    t: z.string().min(1) // To note ID
  })
  .passthrough(); // Allow additional properties for future extensibility

// Map data structure (for both create.state and update.data)
const MapDataSchema = z
  .object({
    n: z.array(NoteSchema), // Notes array
    c: z.array(ConnectionSchema) // Connections array
  })
  .strict();

// Import data schema (allows metadata)
const MapImportSchema = z
  .object({
    n: z.array(NoteSchema), // Notes array
    c: z.array(ConnectionSchema) // Connections array
  })
  .passthrough(); // Allow additional properties including meta

// CREATE: { name: string, state: MapData }
const MapCreateSchema = z
  .object({
    name: z.string().min(1),
    state: MapDataSchema
  })
  .strict();

// UPDATE: { data: MapData, version: number }
const MapUpdateSchema = z
  .object({
    data: MapDataSchema,
    version: z.number().int().min(1)
  })
  .strict();

class MapsService {
  constructor(sqliteFile, options = {}) {
    this.repo = new MapsRepo(sqliteFile);
    this.options = options;

    // Initialize Y.js service for document integration
    // Use separate Y.js database file to avoid conflicts
    const yjsDbFile = sqliteFile.replace('.sqlite', '-yjs.sqlite');
    this.yjsService = new YjsService({
      dbFile: yjsDbFile,
      logger: options.logger || console
    });
  }

  create({ name, state }) {
    const parsed = MapCreateSchema.safeParse({ name, state });
    if (!parsed.success) {
      const error = new BadRequestError('Invalid create request');
      error.zodErrors = parsed.error.errors;
      throw error;
    }

    const payload = parsed.data.state;
    const id = randomUUID();
    const version = 1;
    const updatedAt = new Date().toISOString();
    const stateJson = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(stateJson, 'utf8');

    this.repo.create({
      id,
      name,
      version,
      updatedAt,
      stateJson,
      sizeBytes
    });

    // Update successful, return the updated resource
    return this.repo.get(id);
  }

  async getById(id) {
    // First, try to get Y.js document if it exists and has content
    try {
      const yjsDoc = await this.yjsService.getOrCreateDocument(id);
      if (hasYDocContent(yjsDoc)) {
        // Y.js document has content, export it as JSON
        const yjsData = yDocToJSON(yjsDoc);

        // Get static map record for metadata
        const staticMap = this.repo.get(id);

        if (staticMap) {
          // Combine Y.js data with static metadata
          return {
            ...staticMap,
            data: yjsData,
            // Generate ETag from Y.js content for proper caching
            etag: this.generateETagFromData(yjsData),
            dataSource: 'yjs'
          };
        } else {
          // Y.js document exists but no static record - create minimal metadata
          const now = new Date().toISOString();
          return {
            id,
            name: yjsData.meta?.mapName || 'Untitled Map',
            version: 1,
            updated_at: yjsData.meta?.modified || now,
            data: yjsData,
            etag: this.generateETagFromData(yjsData),
            dataSource: 'yjs'
          };
        }
      }
    } catch (error) {
      // Y.js document doesn't exist or failed to load - fall back to static
      console.debug(
        `Failed to load Y.js document for ${id}, falling back to static:`,
        error.message
      );
    }

    // Fall back to static JSON storage
    const result = this.repo.get(id);
    if (!result) {
      throw new NotFoundError('Map not found');
    }

    return {
      ...result,
      dataSource: 'static'
    };
  }

  async list() {
    // Get static maps
    const staticMaps = this.repo.list();

    // TODO: In the future, we might want to also list Y.js-only documents
    // that don't have static records, but for now the import functionality
    // creates static records for all Y.js documents, so this is sufficient

    return staticMaps;
  }

  async update(id, { data, version }) {
    const parsed = MapUpdateSchema.safeParse({ data, version });
    if (!parsed.success) {
      const error = new BadRequestError('Invalid update request');
      error.zodErrors = parsed.error.errors;
      throw error;
    }

    const existing = this.repo.get(id);
    if (!existing) {
      throw new NotFoundError('Map not found');
    }

    if (existing.version !== version) {
      throw new ConflictError('Version conflict');
    }

    const payload = parsed.data.data;
    const newVersion = version + 1;
    const updatedAt = new Date().toISOString();
    const stateJson = JSON.stringify(payload);
    const sizeBytes = Buffer.byteLength(stateJson, 'utf8');

    const result = this.repo.update({
      id,
      nextVersion: newVersion,
      expectedVersion: version,
      updatedAt,
      stateJson,
      name: existing.name, // preserve existing name
      sizeBytes
    });

    if (result === 0) {
      throw new ConflictError('Version conflict');
    }

    // Update successful, return the updated resource
    return this.repo.get(id);
  }

  async delete(id) {
    const existing = this.repo.get(id);
    if (!existing) {
      throw new NotFoundError('Map not found');
    }

    // Also clean up any Y.js document for this map
    try {
      // TODO: Add cleanup method to YjsService
      // await this.yjsService.deleteDocument(id);
    } catch (error) {
      console.warn(`Failed to cleanup Y.js document for ${id}:`, error.message);
    }

    return this.repo.delete(id);
  }

  /**
   * Import JSON data into Y.js document
   * Creates or overwrites Y.js document with provided data
   */
  async importToYjs(mapId, jsonData, options = {}) {
    const { suppressEvents = true, createStaticRecord = true } = options;

    // Validate the JSON data structure (use more flexible import schema)
    const parsed = MapImportSchema.safeParse(jsonData);
    if (!parsed.success) {
      const error = new BadRequestError('Invalid import data');
      error.zodErrors = parsed.error.errors;
      throw error;
    }

    try {
      // Get or create Y.js document
      const yjsDoc = await this.yjsService.getOrCreateDocument(mapId);

      // Import JSON data into Y.js document
      jsonToYDoc(jsonData, yjsDoc, {
        suppressEvents,
        merge: false // Replace existing content
      });

      // Optionally create/update static record for metadata tracking
      if (createStaticRecord) {
        const existingStatic = this.repo.get(mapId);
        const mapName = jsonData.meta?.mapName || 'Imported Map';
        const now = new Date().toISOString();

        if (existingStatic) {
          // Update existing record
          const stateJson = JSON.stringify(jsonData);
          this.repo.update({
            id: mapId,
            nextVersion: existingStatic.version + 1,
            expectedVersion: existingStatic.version,
            updatedAt: now,
            stateJson,
            name: mapName,
            sizeBytes: Buffer.byteLength(stateJson, 'utf8')
          });
        } else {
          // Create new record
          const stateJson = JSON.stringify(jsonData);
          this.repo.create({
            id: mapId,
            name: mapName,
            version: 1,
            updatedAt: now,
            stateJson,
            sizeBytes: Buffer.byteLength(stateJson, 'utf8')
          });
        }
      }

      return {
        success: true,
        mapId,
        message: 'Successfully imported data to Y.js document',
        dataSource: 'yjs'
      };
    } catch (error) {
      throw new BadRequestError(`Import failed: ${error.message}`);
    }
  }

  /**
   * Generate ETag from map data for proper HTTP caching
   */
  generateETagFromData(data) {
    const dataStr = JSON.stringify(data);
    return crypto
      .createHash('sha256')
      .update(dataStr)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Close Y.js service resources
   */
  async close() {
    if (this.yjsService) {
      await this.yjsService.close();
    }
  }
}

module.exports = MapsService;
