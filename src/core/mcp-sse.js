/**
 * src/core/mcp-sse.js
 * Server-Sent Events (SSE) endpoint for MCP remote connections
 * Compatible with mcp-remote and standard MCP HTTP transport
 */

const express = require('express');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

// Helper to create MCP JSON-RPC response
function createMcpResponse(id, result, error = null) {
  const response = {
    jsonrpc: '2.0',
    id
  };

  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }

  return response;
}

// Helper to create MCP error
function createMcpError(code, message, data = null) {
  const error = { code, message };
  if (data) {
    error.data = data;
  }
  return error;
}

function createMcpSseEndpoint(apiServices) {
  const router = express.Router();
  const { mapsService } = apiServices;

  // Store active SSE connections
  const connections = new Map();

  // SSE endpoint for MCP remote connections
  router.get('/sse', (req, res) => {
    const connectionId = randomUUID();

    logger.info(`MCP SSE connection established: ${connectionId}`);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Store connection
    connections.set(connectionId, { res, req });

    // Send initial connection event
    res.write(
      `data: ${JSON.stringify({
        type: 'connection',
        id: connectionId,
        timestamp: new Date().toISOString()
      })}\n\n`
    );

    // Handle client disconnect
    req.on('close', () => {
      logger.info(`MCP SSE connection closed: ${connectionId}`);
      connections.delete(connectionId);
    });

    req.on('error', error => {
      logger.error(`MCP SSE connection error: ${connectionId}`, error);
      connections.delete(connectionId);
    });

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      if (connections.has(connectionId)) {
        res.write(': ping\n\n');
      } else {
        clearInterval(keepAlive);
      }
    }, 30000);
  });

  // POST endpoint for JSON-RPC messages (used by mcp-remote)
  router.post('/sse', express.json(), async (req, res) => {
    try {
      const { jsonrpc, id, method, params = {} } = req.body;

      if (jsonrpc !== '2.0') {
        return res
          .status(400)
          .json(
            createMcpResponse(
              id,
              null,
              createMcpError(
                -32600,
                'Invalid Request',
                'Not a valid JSON-RPC 2.0 request'
              )
            )
          );
      }

      logger.info(`MCP SSE JSON-RPC call: ${method}`, { id, params });

      switch (method) {
        case 'initialize': {
          const response = createMcpResponse(id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              resources: {},
              tools: {},
              logging: {}
            },
            serverInfo: {
              name: 'mindmeld-server',
              version: '0.1.0',
              description: 'MindMeld mind mapping server with MCP SSE support'
            }
          });
          res.json(response);
          break;
        }

        case 'tools/list': {
          const tools = [
            {
              name: 'maps.list',
              description:
                'List all mind maps accessible to the user with pagination',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description:
                      'Maximum number of maps to return (1-100, default: 50)',
                    minimum: 1,
                    maximum: 100
                  },
                  offset: {
                    type: 'number',
                    description: 'Number of maps to skip (default: 0)',
                    minimum: 0
                  }
                }
              }
            },
            {
              name: 'maps.get',
              description: 'Get a specific map by ID',
              inputSchema: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'UUID of the map to retrieve'
                  }
                },
                required: ['id']
              }
            },
            {
              name: 'maps.create',
              description: 'Create a new mind map',
              inputSchema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    minLength: 1,
                    description: 'Name of the new map'
                  },
                  data: {
                    type: 'object',
                    description:
                      'Initial map data structure (nodes and connections)'
                  }
                },
                required: ['name', 'data']
              }
            }
          ];

          const response = createMcpResponse(id, { tools });
          res.json(response);
          break;
        }

        case 'tools/call': {
          const { name, arguments: args = {} } = params;

          switch (name) {
            case 'maps.list': {
              const limit = Math.min(Math.max(args.limit || 50, 1), 100);
              const offset = Math.max(args.offset || 0, 0);

              const maps = mapsService.list({ limit, offset });

              const result = {
                maps,
                total: maps.length,
                limit,
                offset,
                hasMore: maps.length === limit
              };

              const response = createMcpResponse(id, {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              });
              res.json(response);
              break;
            }

            case 'maps.get': {
              if (!args.id) {
                const response = createMcpResponse(
                  id,
                  null,
                  createMcpError(-32602, 'Invalid params', 'Map ID is required')
                );
                res.json(response);
                return;
              }

              try {
                const map = mapsService.get(args.id);
                const response = createMcpResponse(id, {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify(map, null, 2)
                    }
                  ]
                });
                res.json(response);
              } catch (serviceError) {
                if (serviceError.name === 'NotFoundError') {
                  const response = createMcpResponse(
                    id,
                    null,
                    createMcpError(
                      -32602,
                      'Map not found',
                      `Map ${args.id} not found or not accessible`
                    )
                  );
                  res.json(response);
                  return;
                }
                throw serviceError;
              }
              break;
            }

            case 'maps.create': {
              if (!args.name || !args.data) {
                const response = createMcpResponse(
                  id,
                  null,
                  createMcpError(
                    -32602,
                    'Invalid params',
                    'Name and data are required'
                  )
                );
                res.json(response);
                return;
              }

              const newMap = mapsService.create({
                name: args.name,
                data: args.data
              });

              const response = createMcpResponse(id, {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      {
                        success: true,
                        map: newMap,
                        message: `Created map "${newMap.name}" with ID ${newMap.id}`
                      },
                      null,
                      2
                    )
                  }
                ]
              });
              res.json(response);
              break;
            }

            default: {
              const response = createMcpResponse(
                id,
                null,
                createMcpError(
                  -32601,
                  'Method not found',
                  `Unknown tool: ${name}`
                )
              );
              res.json(response);
              break;
            }
          }
          break;
        }

        case 'resources/list': {
          const resources = [
            {
              uri: 'mindmeld://health',
              name: 'Server Health',
              description: 'Server status and health information',
              mimeType: 'application/json'
            },
            {
              uri: 'mindmeld://maps',
              name: 'All Maps',
              description: 'List of all mind maps accessible to the user',
              mimeType: 'application/json'
            }
          ];

          const response = createMcpResponse(id, { resources });
          res.json(response);
          break;
        }

        case 'resources/read': {
          const { uri } = params;

          if (uri === 'mindmeld://health') {
            const content = {
              status: 'ok',
              timestamp: new Date().toISOString(),
              version: '0.1.0',
              transport: 'sse',
              features: {
                maps: true,
                mcp: true,
                auth: false
              }
            };

            const response = createMcpResponse(id, {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(content, null, 2)
                }
              ]
            });
            res.json(response);
            return;
          }

          if (uri === 'mindmeld://maps') {
            const maps = mapsService.list({ limit: 50, offset: 0 });

            const response = createMcpResponse(id, {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(
                    {
                      maps,
                      total: maps.length,
                      message: 'All mind maps accessible to the user'
                    },
                    null,
                    2
                  )
                }
              ]
            });
            res.json(response);
            return;
          }

          // Unknown resource
          const response = createMcpResponse(
            id,
            null,
            createMcpError(
              -32602,
              'Invalid params',
              `Unknown resource URI: ${uri}`
            )
          );
          res.json(response);
          break;
        }

        default: {
          const response = createMcpResponse(
            id,
            null,
            createMcpError(
              -32601,
              'Method not found',
              `Unknown method: ${method}`
            )
          );
          res.json(response);
          break;
        }
      }
    } catch (error) {
      logger.error('MCP SSE JSON-RPC error:', error);
      const response = createMcpResponse(
        req.body.id,
        null,
        createMcpError(-32603, 'Internal error', error.message)
      );
      res.status(500).json(response);
    }
  });

  // Handle CORS preflight for SSE
  router.options('/sse', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
    res.sendStatus(200);
  });

  return router;
}

module.exports = { createMcpSseEndpoint };
