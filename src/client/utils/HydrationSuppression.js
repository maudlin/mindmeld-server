/**
 * Hydration Suppression Utilities
 * 
 * Provides mechanisms to prevent server-side rendering of client-only features,
 * particularly DataProvider instances that require browser APIs (localStorage, WebSocket).
 * Ensures clean separation between server/client data flows.
 * 
 * Features:
 * - Server-side detection
 * - Component-level hydration suppression
 * - Safe client-side initialization
 * - Development mode warnings
 * 
 * @see MS-62: Client boundary + LocalJSONProvider; hydration suppression; autosave pause/resume
 */

/**
 * Environment detection (similar to DataProviderFactory but focused on hydration)
 */
class HydrationChecker {
  /**
   * Check if we're running on server-side
   */
  static isServerSide() {
    return (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof navigator === 'undefined'
    );
  }
  
  /**
   * Check if we're in a hydration phase
   */
  static isHydrating() {
    if (this.isServerSide()) {
      return false;
    }
    
    // Check for hydration indicators
    return (
      typeof window !== 'undefined' &&
      window.document &&
      !window.document.documentElement.hasAttribute('data-hydrated')
    );
  }
  
  /**
   * Mark that hydration is complete
   */
  static markHydrationComplete() {
    if (!this.isServerSide()) {
      window.document.documentElement.setAttribute('data-hydrated', 'true');
    }
  }
  
  /**
   * Check if browser APIs are available
   */
  static hasBrowserAPIs() {
    return (
      !this.isServerSide() &&
      typeof window.localStorage !== 'undefined' &&
      typeof window.sessionStorage !== 'undefined'
    );
  }
}

/**
 * Hydration suppression decorator/wrapper
 */
class HydrationSuppressor {
  constructor(options = {}) {
    this.options = {
      suppressOnServer: options.suppressOnServer !== false,
      suppressDuringHydration: options.suppressDuringHydration !== false,
      fallbackValue: options.fallbackValue || null,
      enableLogging: options.enableLogging !== false,
      ...options
    };
  }
  
  /**
   * Suppress execution if conditions are met
   * 
   * @param {Function} fn - Function to potentially suppress
   * @param {*} fallback - Fallback value if suppressed
   * @returns {*} Function result or fallback
   */
  suppress(fn, fallback = this.options.fallbackValue) {
    // Server-side suppression
    if (this.options.suppressOnServer && HydrationChecker.isServerSide()) {
      this.log('Suppressing execution on server-side');
      return fallback;
    }
    
    // Hydration phase suppression
    if (this.options.suppressDuringHydration && HydrationChecker.isHydrating()) {
      this.log('Suppressing execution during hydration');
      return fallback;
    }
    
    // Browser API availability check
    if (!HydrationChecker.hasBrowserAPIs()) {
      this.log('Suppressing execution - browser APIs not available');
      return fallback;
    }
    
    // Safe to execute
    try {
      return fn();
    } catch (error) {
      this.log('Function execution failed:', error);
      return fallback;
    }
  }
  
  /**
   * Async version of suppress
   */
  async suppressAsync(fn, fallback = this.options.fallbackValue) {
    // Server-side suppression
    if (this.options.suppressOnServer && HydrationChecker.isServerSide()) {
      this.log('Suppressing async execution on server-side');
      return Promise.resolve(fallback);
    }
    
    // Hydration phase suppression
    if (this.options.suppressDuringHydration && HydrationChecker.isHydrating()) {
      this.log('Suppressing async execution during hydration');
      return Promise.resolve(fallback);
    }
    
    // Browser API availability check
    if (!HydrationChecker.hasBrowserAPIs()) {
      this.log('Suppressing async execution - browser APIs not available');
      return Promise.resolve(fallback);
    }
    
    // Safe to execute
    try {
      return await fn();
    } catch (error) {
      this.log('Async function execution failed:', error);
      return fallback;
    }
  }
  
  /**
   * Create a component wrapper that handles hydration
   */
  wrapComponent(Component, LoadingComponent = null) {
    const suppressor = this;
    
    return function HydratedComponent(props) {
      // Server-side: return loading/placeholder component
      if (suppressor.options.suppressOnServer && HydrationChecker.isServerSide()) {
        return LoadingComponent ? LoadingComponent(props) : null;
      }
      
      // Client-side during hydration: return loading component
      if (suppressor.options.suppressDuringHydration && HydrationChecker.isHydrating()) {
        return LoadingComponent ? LoadingComponent(props) : null;
      }
      
      // Safe to render the actual component
      return Component(props);
    };
  }
  
  /**
   * Wait for client-side hydration to complete
   */
  async waitForHydration() {
    if (HydrationChecker.isServerSide()) {
      return; // No-op on server
    }
    
    return new Promise((resolve) => {
      if (!HydrationChecker.isHydrating()) {
        resolve();
        return;
      }
      
      // Poll for hydration completion
      const checkHydration = () => {
        if (!HydrationChecker.isHydrating()) {
          resolve();
        } else {
          setTimeout(checkHydration, 50);
        }
      };
      
      checkHydration();
    });
  }
  
  /**
   * Safe initialization wrapper for DataProvider
   */
  async initializeDataProvider(factory, options = {}) {
    return this.suppressAsync(async () => {
      // Wait for hydration to complete
      await this.waitForHydration();
      
      // Mark hydration as complete
      HydrationChecker.markHydrationComplete();
      
      // Create the provider
      return await factory.createProvider(options);
    });
  }
  
  /**
   * Log messages if logging is enabled
   */
  log(...args) {
    if (this.options.enableLogging) {
      console.log('[HydrationSuppressor]', ...args);
    }
  }
}

/**
 * Utility functions for common hydration patterns
 */
const HydrationUtils = {
  /**
   * Safe localStorage access
   */
  safeLocalStorage: {
    getItem(key) {
      const suppressor = new HydrationSuppressor();
      return suppressor.suppress(() => {
        return window.localStorage.getItem(key);
      });
    },
    
    setItem(key, value) {
      const suppressor = new HydrationSuppressor();
      return suppressor.suppress(() => {
        window.localStorage.setItem(key, value);
        return true;
      }, false);
    },
    
    removeItem(key) {
      const suppressor = new HydrationSuppressor();
      return suppressor.suppress(() => {
        window.localStorage.removeItem(key);
        return true;
      }, false);
    }
  },
  
  /**
   * Create a hydration-safe hook (for use with React or similar frameworks)
   */
  createHydrationSafeHook(factory) {
    return function useHydrationSafeProvider(options = {}) {
      const [provider, setProvider] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      
      React.useEffect(() => {
        const suppressor = new HydrationSuppressor();
        
        suppressor.initializeDataProvider(factory, options)
          .then(setProvider)
          .catch(setError)
          .finally(() => setLoading(false));
      }, []);
      
      return { provider, error, loading };
    };
  },
  
  /**
   * Check if it's safe to use client-side features
   */
  isClientSafe() {
    return !HydrationChecker.isServerSide() && HydrationChecker.hasBrowserAPIs();
  },
  
  /**
   * Defer execution until client-side is ready
   */
  defer(fn) {
    if (HydrationChecker.isServerSide()) {
      return;
    }
    
    if (typeof window.requestIdleCallback !== 'undefined') {
      window.requestIdleCallback(fn);
    } else {
      setTimeout(fn, 0);
    }
  }
};

module.exports = {
  HydrationChecker,
  HydrationSuppressor,
  HydrationUtils
};