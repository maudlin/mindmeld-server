/**
 * State Service Unit Tests
 * Tests business logic and validation
 */

const StateService = require('../../src/services/state-service');
const eventBus = require('../../src/utils/event-bus');

// Mock storage
class MockStorage {
  constructor() {
    this.data = null;
    this.shouldThrow = false;
  }

  async readState() {
    if (this.shouldThrow) {
      throw new Error('Storage error');
    }
    return this.data;
  }

  async writeState(state) {
    if (this.shouldThrow) {
      throw new Error('Storage error');
    }
    this.data = state;
    return {
      success: true,
      notes: state.notes?.length || 0,
      connections: state.connections?.length || 0,
      zoomLevel: state.zoomLevel,
      timestamp: new Date().toISOString()
    };
  }

  getEmptyState() {
    return {
      notes: [],
      connections: [],
      zoomLevel: 5
    };
  }
}

describe('StateService', () => {
  let stateService;
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
    stateService = new StateService(mockStorage);

    // Clear event listeners
    eventBus.removeAllListeners();
  });

  describe('getCurrentState', () => {
    it('should return stored state when available', async () => {
      const testState = {
        notes: [{ id: '1', content: 'Test' }],
        connections: [],
        zoomLevel: 3
      };

      mockStorage.data = testState;

      const result = await stateService.getCurrentState();
      expect(result).toEqual(testState);
    });

    it('should return empty state when no data exists', async () => {
      const result = await stateService.getCurrentState();
      expect(result).toEqual({
        notes: [],
        connections: [],
        zoomLevel: 5
      });
    });

    it('should return empty state on storage error', async () => {
      mockStorage.shouldThrow = true;

      const result = await stateService.getCurrentState();
      expect(result).toEqual({
        notes: [],
        connections: [],
        zoomLevel: 5
      });
    });
  });

  describe('saveState', () => {
    it('should save valid state', async () => {
      const validState = {
        notes: [{ id: '1', content: 'Test Note' }],
        connections: [{ from: '1', to: '2' }],
        zoomLevel: 4
      };

      const result = await stateService.saveState(validState);

      expect(result.success).toBe(true);
      expect(result.notes).toBe(1);
      expect(result.connections).toBe(1);
      expect(result.zoomLevel).toBe(4);
      expect(mockStorage.data).toEqual(validState);
    });

    it('should reject state with missing notes array', async () => {
      const invalidState = {
        connections: [],
        zoomLevel: 5
      };

      await expect(stateService.saveState(invalidState)).rejects.toThrow(
        'Invalid state: State must have notes array'
      );
    });

    it('should reject state with missing connections array', async () => {
      const invalidState = {
        notes: [],
        zoomLevel: 5
      };

      await expect(stateService.saveState(invalidState)).rejects.toThrow(
        'Invalid state: State must have connections array'
      );
    });

    it('should reject state with invalid zoomLevel', async () => {
      const invalidState = {
        notes: [],
        connections: [],
        zoomLevel: 'invalid'
      };

      await expect(stateService.saveState(invalidState)).rejects.toThrow(
        'Invalid state: State must have numeric zoomLevel'
      );
    });

    it('should reject non-object state', async () => {
      await expect(stateService.saveState('invalid')).rejects.toThrow(
        'Invalid state: State must be an object'
      );
    });

    it('should reject null state', async () => {
      await expect(stateService.saveState(null)).rejects.toThrow(
        'Invalid state: State must be an object'
      );
    });
  });

  describe('validateState', () => {
    it('should validate correct state', () => {
      const validState = {
        notes: [
          { id: '1', content: 'Note 1' },
          { id: '2', content: 'Note 2' }
        ],
        connections: [{ from: '1', to: '2' }],
        zoomLevel: 5
      };

      const result = stateService.validateState(validState);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect notes without id', () => {
      const invalidState = {
        notes: [{ content: 'Note without id' }],
        connections: [],
        zoomLevel: 5
      };

      const result = stateService.validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Note at index 0 missing id');
    });

    it('should detect notes without content', () => {
      const invalidState = {
        notes: [{ id: '1' }],
        connections: [],
        zoomLevel: 5
      };

      const result = stateService.validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Note at index 0 must have string content'
      );
    });

    it('should detect connections without from/to', () => {
      const invalidState = {
        notes: [],
        connections: [
          { from: '1' }, // missing to
          { to: '2' } // missing from
        ],
        zoomLevel: 5
      };

      const result = stateService.validateState(invalidState);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Connection at index 0 missing from/to');
      expect(result.errors).toContain('Connection at index 1 missing from/to');
    });
  });

  describe('getStateStats', () => {
    it('should return stats for existing state', async () => {
      const testState = {
        notes: [
          { id: '1', content: 'Note 1' },
          { id: '2', content: 'Note 2' }
        ],
        connections: [{ from: '1', to: '2' }],
        zoomLevel: 7
      };

      mockStorage.data = testState;

      const stats = await stateService.getStateStats();
      expect(stats).toEqual({
        notesCount: 2,
        connectionsCount: 1,
        zoomLevel: 7,
        isEmpty: false
      });
    });

    it('should return empty stats for no data', async () => {
      const stats = await stateService.getStateStats();
      expect(stats).toEqual({
        notesCount: 0,
        connectionsCount: 0,
        zoomLevel: 5,
        isEmpty: true
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockStorage.shouldThrow = true;

      const stats = await stateService.getStateStats();
      // Service should gracefully fallback to empty state stats
      expect(stats).toEqual({
        notesCount: 0,
        connectionsCount: 0,
        zoomLevel: 5,
        isEmpty: true
      });
    });
  });
});
