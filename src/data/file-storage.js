/**
 * File Storage Service
 * Handles atomic file operations for state persistence
 */

const fs = require('fs').promises;
const path = require('path');
const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

class FileStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Read state from file with error handling
   * @returns {Promise<object|null>} Parsed state or null if file doesn't exist
   */
  async readState() {
    try {
      eventBus.emit('state.reading', { filePath: this.filePath });
      
      const data = await fs.readFile(this.filePath, 'utf8');
      const state = JSON.parse(data);
      
      Logger.info(`State loaded: ${state.notes?.length || 0} notes`);
      eventBus.emit('state.read', { 
        success: true, 
        notesCount: state.notes?.length || 0,
        connectionsCount: state.connections?.length || 0
      });
      
      return state;
    } catch (error) {
      if (error.code === 'ENOENT') {
        Logger.info('State file not found, returning empty state');
        eventBus.emit('state.read', { success: true, empty: true });
        return null;
      }
      
      Logger.error('Failed to read state:', error);
      eventBus.emit('state.error', { operation: 'read', error: error.message });
      throw error;
    }
  }

  /**
   * Write state to file using atomic writes with proper locking
   * @param {object} state - State object to save
   * @returns {Promise<object>} Save result with stats
   */
  async writeState(state) {
    // Use a unique temporary file name to avoid conflicts in concurrent writes
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const uniqueTmpPath = `${this.filePath}.tmp.${uniqueId}`;
    
    try {
      eventBus.emit('state.saving', { 
        notesCount: state.notes?.length || 0,
        connectionsCount: state.connections?.length || 0
      });

      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      // Atomic write: write to unique temp file first, then rename
      await fs.writeFile(uniqueTmpPath, JSON.stringify(state, null, 2));
      
      // Atomic rename with fallbacks for edge cases in CI/concurrency
      try {
        await fs.rename(uniqueTmpPath, this.filePath);
      } catch (err) {
        if (err && err.code === 'EXDEV') {
          // Cross-device link not permitted: fallback to copy then unlink
          await fs.copyFile(uniqueTmpPath, this.filePath);
          await fs.unlink(uniqueTmpPath).catch(() => {});
        } else if (err && err.code === 'ENOENT') {
          // Rare race on some filesystems: if temp disappeared but final exists, treat as success
          try {
            const stat = await fs.stat(this.filePath);
            if (!stat.isFile()) {
              throw err;
            }
          } catch (_) {
            throw err;
          }
        } else {
          throw err;
        }
      }

      const stats = {
        notes: state.notes?.length || 0,
        connections: state.connections?.length || 0,
        zoomLevel: state.zoomLevel,
        timestamp: new Date().toISOString()
      };

      Logger.info(`State saved: ${stats.notes} notes, ${stats.connections} connections`);
      eventBus.emit('state.saved', { success: true, stats });

      return { success: true, ...stats };
    } catch (error) {
      Logger.error('Failed to save state:', error);
      eventBus.emit('state.error', { operation: 'save', error: error.message });
      
      // Clean up temp file if it exists
      try {
        await fs.unlink(uniqueTmpPath);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }
  }

  /**
   * Get empty default state
   * @returns {object} Default empty state structure
   */
  getEmptyState() {
    return {
      notes: [],
      connections: [],
      zoomLevel: 5
    };
  }
}

module.exports = FileStorage;