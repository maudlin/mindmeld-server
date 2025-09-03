/**
 * src/core/mcp-routes.js
 * MCP (Model Context Protocol) HTTP endpoints for LLM agents
 * Uses existing API services to ensure shared auth and business logic
 */

const express = require('express');
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
  if (data) error.data = data;
  return error;
}

// Extract user context from request (for future auth integration)
function extractUserContext(req) {
  // TODO: Extract user from JWT/session/OAuth token
  // For now, return null (no auth)
  return {
    userId: null,
    isAuthenticated: false,
    scopes: []
  };
}

function createMcpRoutes(apiServices) {
  const router = express.Router();
  const { mapsService } = apiServices;

  // Middleware to parse MCP JSON-RPC requests
  router.use((req, res, next) => {
    // Validate JSON-RPC structure
    if (!req.body.jsonrpc || req.body.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: createMcpError(-32600, 'Invalid Request', 'Not a valid JSON-RPC 2.0 request'),
        id: null
      });
    }
    
    // Attach user context for auth (future)
    req.userContext = extractUserContext(req);
    next();
  });

  // MCP Server Initialization
  router.post('/initialize', (req, res) => {
    logger.info('MCP client initializing');
    
    const response = createMcpResponse(req.body.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        resources: {},
        tools: {},
        logging: {}
      },
      serverInfo: {
        name: 'mindmeld-server',
        version: '0.1.0',
        description: 'MindMeld mind mapping server with MCP support'
      }
    });
    
    res.json(response);
  });

  // List Available Resources
  router.post('/resources/list', (req, res) => {
    try {
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
        // Dynamic map resources will be handled in the read endpoint
      ];

      const response = createMcpResponse(req.body.id, { resources });
      res.json(response);
    } catch (error) {
      logger.error('MCP resources/list error:', error);
      const response = createMcpResponse(req.body.id, null, 
        createMcpError(-32603, 'Internal error', error.message));
      res.json(response);
    }
  });

  // Read Specific Resource
  router.post('/resources/read', (req, res) => {
    try {
      const { uri } = req.body.params;
      
      if (uri === 'mindmeld://health') {
        const content = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          transport: 'http-mcp',
          features: {
            maps: true,
            mcp: true,
            auth: false // Will be true when OAuth is implemented
          }
        };

        const response = createMcpResponse(req.body.id, {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        });
        res.json(response);
        return;
      }

      if (uri === 'mindmeld://maps') {
        // Use the API service (will respect auth when implemented)
        const maps = mapsService.list({ 
          limit: 50, 
          offset: 0,
          // userContext: req.userContext (future auth)
        });
        
        const response = createMcpResponse(req.body.id, {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              maps,
              total: maps.length,
              message: 'All mind maps accessible to the user'
            }, null, 2)
          }]
        });
        res.json(response);
        return;
      }

      // Individual map resource: mindmeld://maps/{id}
      if (uri.startsWith('mindmeld://maps/')) {
        const mapId = uri.replace('mindmeld://maps/', '');
        
        try {
          // Use API service (respects permissions, validation, etc.)
          const map = mapsService.get(mapId, {
            // userContext: req.userContext (future auth)
          });
          
          const response = createMcpResponse(req.body.id, {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(map, null, 2)
            }]
          });
          res.json(response);
          return;
        } catch (serviceError) {
          if (serviceError.name === 'NotFoundError') {
            const response = createMcpResponse(req.body.id, null,
              createMcpError(-32602, 'Resource not found', `Map ${mapId} not found or not accessible`));
            res.json(response);
            return;
          }
          // TODO: Handle auth errors (401/403) when auth is implemented
          throw serviceError;
        }
      }

      // Unknown resource
      const response = createMcpResponse(req.body.id, null,
        createMcpError(-32602, 'Invalid params', `Unknown resource URI: ${uri}`));
      res.json(response);

    } catch (error) {
      logger.error('MCP resources/read error:', error);
      const response = createMcpResponse(req.body.id, null,
        createMcpError(-32603, 'Internal error', error.message));
      res.json(response);
    }
  });

  // List Available Tools
  router.post('/tools/list', (req, res) => {
    try {
      const tools = [
        {
          name: 'maps.list',
          description: 'List all mind maps accessible to the user with pagination',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of maps to return (1-100, default: 50)',
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
                description: 'Initial map data structure (nodes and connections)'
              }
            },
            required: ['name', 'data']
          }
        },
        {
          name: 'maps.update',
          description: 'Update an existing map with optimistic concurrency control',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                description: 'UUID of the map to update'
              },
              data: {
                type: 'object',
                description: 'Updated map data structure'
              },
              version: {
                type: 'number',
                minimum: 1,
                description: 'Current version for optimistic concurrency control'
              }
            },
            required: ['id', 'data', 'version']
          }
        },
        {
          name: 'maps.delete',
          description: 'Delete a mind map',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
                description: 'UUID of the map to delete'
              }
            },
            required: ['id']
          }
        }
      ];

      const response = createMcpResponse(req.body.id, { tools });
      res.json(response);
    } catch (error) {
      logger.error('MCP tools/list error:', error);
      const response = createMcpResponse(req.body.id, null,
        createMcpError(-32603, 'Internal error', error.message));
      res.json(response);
    }
  });

  // Call Tool
  router.post('/tools/call', (req, res) => {
    try {
      const { name, arguments: args = {} } = req.body.params;
      
      logger.info(`MCP tool called: ${name}`, { args, user: req.userContext?.userId });

      switch (name) {
        case 'maps.list': {
          const limit = Math.min(Math.max(args.limit || 50, 1), 100);
          const offset = Math.max(args.offset || 0, 0);
          
          // Use API service - will respect user permissions when auth is added
          const maps = mapsService.list({ 
            limit, 
            offset,
            // userContext: req.userContext (future auth)
          });
          
          const result = {
            maps,
            total: maps.length,
            limit,
            offset,
            hasMore: maps.length === limit // Simple pagination hint
          };

          const response = createMcpResponse(req.body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          });
          res.json(response);
          break;
        }

        case 'maps.get': {
          if (!args.id) {
            const response = createMcpResponse(req.body.id, null,
              createMcpError(-32602, 'Invalid params', 'Map ID is required'));
            res.json(response);
            return;
          }

          try {
            // Use API service - handles permissions, validation, etc.
            const map = mapsService.get(args.id, {
              // userContext: req.userContext (future auth)
            });
            
            const response = createMcpResponse(req.body.id, {
              content: [{
                type: 'text',
                text: JSON.stringify(map, null, 2)
              }]
            });
            res.json(response);
          } catch (serviceError) {
            if (serviceError.name === 'NotFoundError') {
              const response = createMcpResponse(req.body.id, null,
                createMcpError(-32602, 'Map not found', `Map ${args.id} not found or not accessible`));
              res.json(response);
              return;
            }
            throw serviceError;
          }
          break;
        }

        case 'maps.create': {
          if (!args.name || !args.data) {
            const response = createMcpResponse(req.body.id, null,
              createMcpError(-32602, 'Invalid params', 'Name and data are required'));
            res.json(response);
            return;
          }

          // Use API service - handles validation, user assignment, etc.
          const newMap = mapsService.create({
            name: args.name,
            data: args.data,
            // userContext: req.userContext (future auth)
          });

          const response = createMcpResponse(req.body.id, {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                map: newMap,
                message: `Created map "${newMap.name}" with ID ${newMap.id}`
              }, null, 2)
            }]
          });
          res.json(response);
          break;
        }

        case 'maps.update': {
          if (!args.id || !args.data || typeof args.version !== 'number') {
            const response = createMcpResponse(req.body.id, null,
              createMcpError(-32602, 'Invalid params', 'ID, data, and version are required'));
            res.json(response);
            return;
          }

          try {
            // Use API service - handles permissions, optimistic concurrency, etc.
            const updatedMap = mapsService.update(args.id, {
              data: args.data,
              version: args.version,
              // userContext: req.userContext (future auth)
            });

            const response = createMcpResponse(req.body.id, {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  map: updatedMap,
                  message: `Updated map "${updatedMap.name}" to version ${updatedMap.version}`
                }, null, 2)
              }]
            });
            res.json(response);
          } catch (serviceError) {
            if (serviceError.name === 'NotFoundError') {
              const response = createMcpResponse(req.body.id, null,
                createMcpError(-32602, 'Map not found', `Map ${args.id} not found or not accessible`));
              res.json(response);
              return;
            }
            if (serviceError.name === 'ConflictError') {
              const response = createMcpResponse(req.body.id, null,
                createMcpError(-32602, 'Version conflict', 'Map has been modified by another client'));
              res.json(response);
              return;
            }
            throw serviceError;
          }
          break;
        }

        case 'maps.delete': {
          if (!args.id) {
            const response = createMcpResponse(req.body.id, null,
              createMcpError(-32602, 'Invalid params', 'Map ID is required'));
            res.json(response);
            return;
          }

          try {
            // Use API service - handles permissions, cascade deletes, etc.
            mapsService.delete(args.id, {
              // userContext: req.userContext (future auth)
            });

            const response = createMcpResponse(req.body.id, {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Deleted map ${args.id}`
                }, null, 2)
              }]
            });
            res.json(response);
          } catch (serviceError) {
            if (serviceError.name === 'NotFoundError') {
              const response = createMcpResponse(req.body.id, null,
                createMcpError(-32602, 'Map not found', `Map ${args.id} not found or not accessible`));
              res.json(response);
              return;
            }
            throw serviceError;
          }
          break;
        }

        default: {
          const response = createMcpResponse(req.body.id, null,
            createMcpError(-32601, 'Method not found', `Unknown tool: ${name}`));
          res.json(response);
          break;
        }
      }
    } catch (error) {
      logger.error('MCP tools/call error:', error);
      const response = createMcpResponse(req.body.id, null,
        createMcpError(-32603, 'Internal error', error.message));
      res.json(response);
    }
  });

  // Health check specific to MCP endpoints
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'mindmeld-mcp-endpoints',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      capabilities: ['resources', 'tools'],
      auth: {
        enabled: false, // Will be true when OAuth is implemented
        methods: [] // Will include ['oauth', 'jwt'] when implemented
      }
    });
  });

  return router;
}

module.exports = { createMcpRoutes };
