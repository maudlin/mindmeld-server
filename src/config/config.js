const path = require('path');
const { z } = require('zod');

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3001'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  JSON_LIMIT: z.string().default('50mb'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  STATE_FILE_PATH: z
    .string()
    .default(path.join(process.cwd(), 'data', 'state.json')),
  // Planned (to-be): SQLite for /maps
  SQLITE_FILE: z.string().optional(),
  FEATURE_MAPS_API: z.string().optional(),
  LOG_LEVEL: z.string().optional()
});

function buildConfig() {
  const parsed = EnvSchema.parse(process.env);
  const config = {
    port: parseInt(parsed.PORT, 10),
    corsOrigin: parsed.CORS_ORIGIN,
    stateFilePath: parsed.STATE_FILE_PATH,
    jsonLimit: parsed.JSON_LIMIT,
    nodeEnv: parsed.NODE_ENV,
    // Planned
    sqliteFile:
      parsed.SQLITE_FILE || path.join(process.cwd(), 'data', 'db.sqlite'),
    featureMapsApi:
      parsed.FEATURE_MAPS_API === '1' || parsed.FEATURE_MAPS_API === 'true',
    logLevel:
      parsed.LOG_LEVEL || (parsed.NODE_ENV === 'production' ? 'info' : 'debug')
  };
  return config;
}

const config = buildConfig();

module.exports = { config, buildConfig };
