const path = require('path');
const { z } = require('zod');

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3001'),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:8080'), // Updated default for better localhost compatibility
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
  // MCP (Model Context Protocol) - enabled by default for AI assistant integration
  FEATURE_MCP: z.string().default('true'),
  MCP_TOKEN: z.string().optional(),
  // Yjs feature flags - enabled by default for real-time collaboration
  DATA_PROVIDER: z.enum(['json', 'yjs']).default('yjs'),
  SERVER_SYNC: z.enum(['on', 'off']).default('on'),
  VERIFY_YJS: z.string().optional(),
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
    // MCP - integrated SSE + HTTP transports (no separate transport config needed)
    featureMcp: parsed.FEATURE_MCP === '1' || parsed.FEATURE_MCP === 'true',
    mcpToken: parsed.MCP_TOKEN || null,
    // Yjs feature flags (MS-60/MS-68)
    dataProvider: parsed.DATA_PROVIDER,
    serverSync: parsed.SERVER_SYNC,
    verifyYjs: parsed.VERIFY_YJS === '1' || parsed.VERIFY_YJS === 'true',
  };
  return config;
}

const config = buildConfig();

module.exports = { config, buildConfig };
