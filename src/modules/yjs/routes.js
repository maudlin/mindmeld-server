const WebSocket = require('ws');
const YjsService = require('./service');

/**
 * Yjs WebSocket Routes
 * Handles WebSocket upgrades for the /yjs/:mapId endpoint
 */
class YjsRoutes {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.yjsService = new YjsService({
      logger: this.logger,
      dbFile: options.dbFile
    });

    // WebSocket server instance
    this.wss = null;
  }

  /**
   * Create and configure WebSocket server
   */
  createWebSocketServer(httpServer) {
    // Create WebSocket server that doesn't listen on its own port
    this.wss = new WebSocket.Server({
      noServer: true,
      perMessageDeflate: true,
      maxPayload: 1024 * 1024 // 1MB max message size
    });

    // Handle WebSocket upgrade requests
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);

      // Only handle /yjs/* paths
      if (url.pathname.startsWith('/yjs/')) {
        this.wss.handleUpgrade(request, socket, head, ws => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        // Let other handlers deal with non-Yjs WebSocket requests
        socket.destroy();
      }
    });

    // Handle WebSocket connections
    this.wss.on('connection', async (ws, request) => {
      try {
        await this.yjsService.handleWebSocketConnection(ws, request);
      } catch (error) {
        this.logger.error('Failed to handle WebSocket connection', {
          url: request.url,
          error: error.message
        });
        ws.close(1011, 'Server error');
      }
    });

    // Handle WebSocket server errors
    this.wss.on('error', error => {
      this.logger.error('WebSocket server error', {
        error: error.message,
        stack: error.stack
      });
    });

    this.logger.info('Yjs WebSocket server configured');

    return this.wss;
  }

  /**
   * Get statistics about connected clients
   */
  getStats() {
    if (!this.wss) {
      return {
        connected: 0,
        documents: 0
      };
    }

    return {
      connected: this.wss.clients.size,
      documents: this.yjsService.docs.size,
      connections: Array.from(this.yjsService.connections.entries()).map(
        ([mapId, connections]) => ({
          mapId,
          clients: connections.size,
          stats: this.yjsService.getDocumentStats(mapId)
        })
      )
    };
  }

  /**
   * Close all WebSocket connections and clean up
   */
  close() {
    if (this.yjsService) {
      this.yjsService.close();
    }

    if (this.wss) {
      this.wss.close(error => {
        if (error) {
          this.logger.error('Error closing WebSocket server', {
            error: error.message
          });
        } else {
          this.logger.info('Yjs WebSocket server closed');
        }
      });
    }
  }
}

/**
 * Factory function to create and configure Yjs routes
 */
function createYjsRoutes(httpServer, options = {}) {
  const yjsRoutes = new YjsRoutes(options);
  yjsRoutes.createWebSocketServer(httpServer);
  return yjsRoutes;
}

module.exports = {
  YjsRoutes,
  createYjsRoutes
};
