/**
 * State Management Service
 * Business logic layer for mind map state operations
 */

const Logger = require('../utils/logger');
const eventBus = require('../utils/event-bus');

class StateService {
  constructor(storage) {
    this.storage = storage;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Log state operations for monitoring
    eventBus.subscribe('state.saved', (data) => {
      Logger.info('State operation completed', data.stats);
    });

    eventBus.subscribe('state.error', (data) => {
      Logger.error(`State ${data.operation} failed:`, data.error);
    });
  }

  /**
   * Get current state, returns empty state if none exists
   * @returns {Promise<object>} Current state or empty default
   */
  async getCurrentState() {
    try {
      const state = await this.storage.readState();
      return state || this.storage.getEmptyState();
    } catch (error) {
      Logger.error('Error getting current state:', error);
      // Return empty state as fallback
      return this.storage.getEmptyState();
    }
  }

  /**
   * Save state with validation
   * @param {object} state - State to save
   * @returns {Promise<object>} Save result
   */
  async saveState(state) {
    // Validate state structure
    const validationResult = this.validateState(state);
    if (!validationResult.valid) {
      const error = new Error(
        `Invalid state: ${validationResult.errors.join(', ')}`,
      );
      eventBus.emit('state.error', {
        operation: 'save',
        error: error.message,
        validation: validationResult.errors,
      });
      throw error;
    }

    // Emit validation success
    eventBus.emit('state.validated', {
      notesCount: state.notes?.length || 0,
      connectionsCount: state.connections?.length || 0,
    });

    return await this.storage.writeState(state);
  }

  /**
   * Validate state structure and content
   * @param {object} state - State to validate
   * @returns {object} Validation result
   */
  validateState(state) {
    const errors = [];

    // Check basic structure
    if (!state || typeof state !== 'object') {
      errors.push('State must be an object');
      return { valid: false, errors };
    }

    // Check required fields
    if (!Array.isArray(state.notes)) {
      errors.push('State must have notes array');
    }

    if (!Array.isArray(state.connections)) {
      errors.push('State must have connections array');
    }

    if (typeof state.zoomLevel !== 'number') {
      errors.push('State must have numeric zoomLevel');
    }

    // Validate notes structure
    if (state.notes) {
      state.notes.forEach((note, index) => {
        if (!note.id) {
          errors.push(`Note at index ${index} missing id`);
        }
        if (typeof note.content !== 'string') {
          errors.push(`Note at index ${index} must have string content`);
        }
      });
    }

    // Validate connections structure
    if (state.connections) {
      state.connections.forEach((connection, index) => {
        if (!connection.from || !connection.to) {
          errors.push(`Connection at index ${index} missing from/to`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get state statistics
   * @returns {Promise<object>} State statistics
   */
  async getStateStats() {
    try {
      const state = await this.getCurrentState();
      return {
        notesCount: state.notes?.length || 0,
        connectionsCount: state.connections?.length || 0,
        zoomLevel: state.zoomLevel || 5,
        isEmpty: !state.notes?.length && !state.connections?.length,
      };
    } catch (error) {
      Logger.error('Error getting state stats:', error);
      return { error: 'Failed to get stats' };
    }
  }
}

module.exports = StateService;
