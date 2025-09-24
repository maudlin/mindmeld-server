/**
 * Event-Driven Architecture - Central Event Bus
 * Enables loose coupling between components
 */

const EventEmitter = require('events');
const Logger = require('./logger');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.on('error', (error) => {
      Logger.error('EventBus error:', error);
    });
  }

  /**
   * Emit an event following "noun.verb" naming convention
   * @param {string} eventName - Event name in format "noun.verb"
   * @param {object} data - Event data
   */
  emit(eventName, data = {}) {
    Logger.debug(`Event emitted: ${eventName}`, data);
    super.emit(eventName, data);
  }

  /**
   * Subscribe to an event with error handling
   * @param {string} eventName - Event name to listen for
   * @param {function} handler - Event handler function
   */
  subscribe(eventName, handler) {
    const wrappedHandler = (data) => {
      try {
        handler(data);
      } catch (error) {
        Logger.error(`Error in event handler for ${eventName}:`, error);
        this.emit('error', error);
      }
    };

    this.on(eventName, wrappedHandler);
    Logger.debug(`Subscribed to event: ${eventName}`);
  }
}

// Export singleton instance
const eventBus = new EventBus();
module.exports = eventBus;
