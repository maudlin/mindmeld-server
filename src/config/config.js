const path = require('path');
const { z } = require('zod');

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3001'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  JSON_LIMIT: z.string().default('50mb'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  // SQLite for /maps
  SQLITE_FILE: z.string().optional(),
  FEATURE_MAPS_API: z.string().optional(),
  LOG_LEVEL: z.string().optional(),
  // Legacy state file (for MCP state resource)
  STATE_FILE: z.string().optional(),
  // MCP (Model Context Protocol)
  FEATURE_MCP: z.string().optional(),
  MCP_TRANSPORT: z.enum(['stdio', 'ws']).optional(),
  MCP_TOKEN: z.string().optional()
});

function buildConfig() {
  const parsed = EnvSchema.parse(process.env);
  const config = {
    port: parseInt(parsed.PORT, 10),
    corsOrigin: parsed.CORS_ORIGIN,
    jsonLimit: parsed.JSON_LIMIT,
    nodeEnv: parsed.NODE_ENV,
    // Planned
    sqliteFile:
      parsed.SQLITE_FILE || path.join(process.cwd(), 'data', 'db.sqlite'),
    // default ON unless explicitly disabled
    featureMapsApi: !(
      parsed.FEATURE_MAPS_API === '0' || parsed.FEATURE_MAPS_API === 'false'
    ),
    logLevel:
      parsed.LOG_LEVEL || (parsed.NODE_ENV === 'production' ? 'info' : 'debug'),
    // Legacy state file path for MCP resource
    stateFile:
      parsed.STATE_FILE || path.join(process.cwd(), 'data', 'state.json'),
    // MCP
    featureMcp: parsed.FEATURE_MCP === '1' || parsed.FEATURE_MCP === 'true',
    mcpTransport: parsed.MCP_TRANSPORT || 'stdio',
    mcpToken: parsed.MCP_TOKEN || null
  };
  return config;
}

const config = buildConfig();

module.exports = { config, buildConfig };
