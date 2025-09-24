/**
 * DataProvider Factory
 *
 * Factory for creating appropriate DataProvider instances based on configuration,
 * environment, and feature flags. Provides seamless switching between offline-first
 * LocalJSONProvider and collaborative YjsProvider.
 *
 * Features:
 * - Environment detection (browser vs server-side)
 * - Feature flag integration
 * - Provider switching for migration scenarios
 * - Fallback handling when providers fail
 * - Configuration validation
 *
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 * @see MS-63: Client YjsProvider + y-indexeddb; converters; performance guards
 */

const LocalJSONProvider = require('./LocalJSONProvider');
// const YjsProvider = require('./YjsProvider'); // Will be implemented in MS-63

/**
 * Provider types
 */
const PROVIDER_TYPES = {
  LOCAL: 'local',
  YJS: 'yjs',
  AUTO: 'auto'
};

/**
 * Environment detection utilities
 */
class EnvironmentDetector {
  static isBrowser() {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      typeof document !== 'undefined'
    );
  }

  static isServerSide() {
    return typeof window === 'undefined' || typeof document === 'undefined';
  }

  static hasWebSocketSupport() {
    return this.isBrowser() && typeof WebSocket !== 'undefined';
  }

  static hasLocalStorageSupport() {
    if (!this.isBrowser()) {
      return false;
    }

    try {
      const testKey = 'mindmeld_test';
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * DataProvider Factory
 */
class DataProviderFactory {
  constructor(config = {}) {
    this.config = {
      defaultProvider: config.defaultProvider || PROVIDER_TYPES.AUTO,
      featureFlags: config.featureFlags || {},
      websocketUrl: config.websocketUrl || 'ws://localhost:3001',
      localStoragePrefix: config.localStoragePrefix || 'mindmeld_',
      fallbackProvider: config.fallbackProvider || PROVIDER_TYPES.LOCAL,
      enableHydrationSuppression: config.enableHydrationSuppression !== false,
      ...config
    };

    // Cache providers to avoid recreating them
    this.providerCache = new Map();
    this.currentProvider = null;
    this.currentProviderType = null;
  }

  /**
   * Create a DataProvider instance based on configuration and environment
   *
   * @param {Object} options - Override options
   * @returns {DataProviderInterface} Provider instance
   */
  async createProvider(options = {}) {
    const providerType = this.determineProviderType(options);

    // Return cached provider if available and no forced recreation
    if (!options.forceNew && this.providerCache.has(providerType)) {
      const cachedProvider = this.providerCache.get(providerType);
      this.currentProvider = cachedProvider;
      this.currentProviderType = providerType;
      return cachedProvider;
    }

    try {
      const provider = await this.instantiateProvider(providerType, options);

      // Cache the provider
      this.providerCache.set(providerType, provider);
      this.currentProvider = provider;
      this.currentProviderType = providerType;

      return provider;
    } catch (error) {
      console.warn(
        `DataProviderFactory: Failed to create ${providerType} provider:`,
        error
      );

      // Try fallback provider if primary fails
      if (providerType !== this.config.fallbackProvider) {
        console.log(
          `DataProviderFactory: Falling back to ${this.config.fallbackProvider} provider`
        );
        return this.createProvider({
          ...options,
          type: this.config.fallbackProvider,
          forceNew: true
        });
      }

      throw new Error(`Failed to create DataProvider: ${error.message}`);
    }
  }

  /**
   * Get the current active provider
   */
  getCurrentProvider() {
    return this.currentProvider;
  }

  /**
   * Get the current provider type
   */
  getCurrentProviderType() {
    return this.currentProviderType;
  }

  /**
   * Switch to a different provider type
   *
   * @param {string} newType - New provider type
   * @param {Object} options - Switch options
   * @returns {DataProviderInterface} New provider instance
   */
  async switchProvider(newType, options = {}) {
    console.log(
      `DataProviderFactory: Switching from ${this.currentProviderType} to ${newType}`
    );

    // Pause autosave on current provider if switching during runtime
    if (this.currentProvider && options.pauseAutosave !== false) {
      try {
        this.currentProvider.pauseAutosave();
      } catch (error) {
        console.warn(
          'DataProviderFactory: Could not pause autosave on current provider:',
          error
        );
      }
    }

    const newProvider = await this.createProvider({
      ...options,
      type: newType,
      forceNew: true
    });

    // Resume autosave on new provider if requested
    if (options.resumeAutosave !== false) {
      try {
        newProvider.resumeAutosave();
      } catch (error) {
        console.warn(
          'DataProviderFactory: Could not resume autosave on new provider:',
          error
        );
      }
    }

    return newProvider;
  }

  /**
   * Determine which provider type to use
   *
   * @param {Object} options - Options that might override default behavior
   * @returns {string} Provider type
   */
  determineProviderType(options = {}) {
    // Explicit type override
    if (options.type && Object.values(PROVIDER_TYPES).includes(options.type)) {
      return options.type;
    }

    // Use configured default if not AUTO
    if (this.config.defaultProvider !== PROVIDER_TYPES.AUTO) {
      return this.config.defaultProvider;
    }

    // AUTO mode - determine based on environment and feature flags

    // Server-side rendering - always use local or suppress hydration
    if (EnvironmentDetector.isServerSide()) {
      if (this.config.enableHydrationSuppression) {
        return null; // Suppress provider creation on server-side
      }
      return PROVIDER_TYPES.LOCAL;
    }

    // Browser environment - check feature flags and capabilities
    if (EnvironmentDetector.isBrowser()) {
      // Check feature flags
      if (
        this.config.featureFlags.enableCollaboration &&
        this.config.featureFlags.enableYjsProvider
      ) {
        // YJS provider requires WebSocket support
        if (EnvironmentDetector.hasWebSocketSupport()) {
          return PROVIDER_TYPES.YJS;
        }
      }

      // Fall back to local provider if localStorage is available
      if (EnvironmentDetector.hasLocalStorageSupport()) {
        return PROVIDER_TYPES.LOCAL;
      }
    }

    // Default fallback
    return this.config.fallbackProvider;
  }

  /**
   * Instantiate a specific provider type
   *
   * @param {string} type - Provider type
   * @param {Object} options - Configuration options
   * @returns {DataProviderInterface} Provider instance
   */
  async instantiateProvider(type, options = {}) {
    switch (type) {
      case PROVIDER_TYPES.LOCAL:
        return this.createLocalProvider(options);

      case PROVIDER_TYPES.YJS:
        return this.createYjsProvider(options);

      case null:
        // Hydration suppression - return null for server-side
        return null;

      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Create LocalJSONProvider instance
   *
   * @param {Object} options - Configuration options
   * @returns {LocalJSONProvider} Local provider instance
   */
  createLocalProvider(options = {}) {
    if (!EnvironmentDetector.hasLocalStorageSupport()) {
      throw new Error('LocalJSONProvider requires localStorage support');
    }

    const providerOptions = {
      storagePrefix: this.config.localStoragePrefix + 'map_',
      metaPrefix: this.config.localStoragePrefix + 'meta_',
      maxMaps: options.maxMaps || 100,
      storageQuotaWarning: options.storageQuotaWarning || 5 * 1024 * 1024,
      ...options
    };

    return new LocalJSONProvider(providerOptions);
  }

  /**
   * Create YjsProvider instance (placeholder for MS-63)
   *
   * @param {Object} options - Configuration options
   * @returns {YjsProvider} YJS provider instance
   */
  createYjsProvider(_options = {}) {
    // TODO: Implement in MS-63
    throw new Error('YjsProvider not yet implemented - see MS-63');

    /*
    if (!EnvironmentDetector.hasWebSocketSupport()) {
      throw new Error('YjsProvider requires WebSocket support');
    }
    
    const _providerOptions = {
      websocketUrl: this.config.websocketUrl,
      ...options
    };
    
    return new YjsProvider(providerOptions);
    */
  }

  /**
   * Check if a provider type is available in current environment
   *
   * @param {string} type - Provider type to check
   * @returns {boolean} True if provider is available
   */
  isProviderAvailable(type) {
    switch (type) {
      case PROVIDER_TYPES.LOCAL:
        return EnvironmentDetector.hasLocalStorageSupport();

      case PROVIDER_TYPES.YJS:
        return (
          EnvironmentDetector.hasWebSocketSupport() &&
          this.config.featureFlags.enableYjsProvider !== false
        );

      default:
        return false;
    }
  }

  /**
   * Get environment information for debugging
   */
  getEnvironmentInfo() {
    return {
      isBrowser: EnvironmentDetector.isBrowser(),
      isServerSide: EnvironmentDetector.isServerSide(),
      hasWebSocketSupport: EnvironmentDetector.hasWebSocketSupport(),
      hasLocalStorageSupport: EnvironmentDetector.hasLocalStorageSupport(),
      availableProviders: Object.values(PROVIDER_TYPES).filter(
        type => type !== PROVIDER_TYPES.AUTO && this.isProviderAvailable(type)
      ),
      recommendedProvider: this.determineProviderType(),
      currentProvider: this.currentProviderType,
      featureFlags: this.config.featureFlags
    };
  }

  /**
   * Clean up cached providers
   */
  cleanup() {
    this.providerCache.clear();
    this.currentProvider = null;
    this.currentProviderType = null;
  }
}

// Export factory class and constants
module.exports = {
  DataProviderFactory,
  PROVIDER_TYPES,
  EnvironmentDetector
};
