/**
 * OpenStudent - Supabase Client & Authentication
 * Vite-optimized production client with secure environment variables
 * Location: src/js/supabase.js
 * Version: 2.0.0
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Configuration Management for Vite Environment
 */
class Config {
  constructor() {
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    this.supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    this.isDevelopment = import.meta.env.DEV;
    this.isProduction = import.meta.env.PROD;

    this.validateConfig();
  }

  validateConfig() {
    if (!this.supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL is required in environment variables');
    }

    if (!this.supabaseAnonKey) {
      throw new Error('VITE_SUPABASE_ANON_KEY is required in environment variables');
    }

    // Validate URL format
    if (!this.isValidUrl(this.supabaseUrl)) {
      throw new Error('VITE_SUPABASE_URL must be a valid URL');
    }

    // Security check - ensure we're not accidentally exposing service role key
    if (this.supabaseAnonKey.includes('service_role')) {
      throw new Error('Service role key detected in client! Use anon key only.');
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  getClientConfig() {
    return {
      url: this.supabaseUrl,
      key: this.supabaseAnonKey,
      options: {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          // Enhanced security for production
          storage: this.isProduction ?
            window?.localStorage :
            window?.sessionStorage || window?.localStorage
        },
        global: {
          headers: {
            'X-Client-Info': 'openstudent-web@2.0.0'
          }
        }
      }
    };
  }
}

/**
 * Enhanced Logger with Vite-specific optimizations
 */
class Logger {
  constructor(config) {
    this.isDev = config.isDevelopment;
    this.logLevel = import.meta.env.VITE_LOG_LEVEL || (this.isDev ? 'debug' : 'error');
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  log(level, message, data = null) {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const logData = { timestamp, level, message, data };

    const consoleMethod = level === 'error' ? 'error' :
                         level === 'warn' ? 'warn' : 'log';

    console[consoleMethod](`[OpenStudent:${level.toUpperCase()}]`, message, data);

    // In production, send errors to monitoring service
    if (!this.isDev && level === 'error') {
      this.sendToMonitoring(logData);
    }
  }

  debug(message, data) { this.log('debug', message, data); }
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }

  sendToMonitoring(logData) {
    // Integration point for error monitoring (Sentry, LogRocket, etc.)
    if (typeof window !== 'undefined') {
      try {
        const errors = JSON.parse(localStorage.getItem('openstudent_errors') || '[]');
        errors.push(logData);
        localStorage.setItem('openstudent_errors', JSON.stringify(errors.slice(-50)));
      } catch (e) {
        console.error('Failed to store error log', e);
      }
    }
  }
}

/**
 * Enhanced Cache Manager with memory optimization
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes default TTL
    this.maxSize = 100; // Maximum cache entries
    this.hitCount = 0;
    this.missCount = 0;

    // Cleanup timer to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  set(key, value, customTtl = null) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const ttl = customTtl || this.ttl;
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry, lastAccessed: Date.now() });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.missCount++;
      return null;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    item.lastAccessed = Date.now();
    this.hitCount++;
    return item.value;
  }

  invalidate(pattern) {
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  clear() {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0,
      hitCount: this.hitCount,
      missCount: this.missCount
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.clear();
  }
}

/**
 * Main OpenStudent Client Class - Vite Optimized
 */
class OpenStudentClient {
  constructor() {
    this.config = new Config();
    this.logger = new Logger(this.config);
    this.cache = new CacheManager();

    const clientConfig = this.config.getClientConfig();
    this.supabase = createClient(
      clientConfig.url,
      clientConfig.key,
      clientConfig.options
    );

    this.currentUser = null;
    this.currentProfile = null;
    this.isInitialized = false;
    this.eventListeners = new Set();

    // Setup auth state listener
    this.setupAuthListener();

    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.cleanup());
    }
  }

  /**
   * Initialize the client and check existing session
   */
  async init() {
    if (this.isInitialized) return this.getSessionInfo();

    try {
      const session = await this.checkSession();
      this.isInitialized = true;
      this.logger.info('OpenStudent client initialized', {
        hasSession: !!session.user,
        environment: this.config.isDevelopment ? 'development' : 'production'
      });
      return session;
    } catch (error) {
      this.logger.error('Client initialization failed', error);
      throw error;
    }
  }

  /**
   * Setup authentication state change listener with cleanup
   */
  setupAuthListener() {
    const { data: { subscription } } = this.supabase.auth.onAuthStateChange(
      async (event, session) => {
        this.logger.debug('Auth state changed', { event, hasSession: !!session });

        if (event === 'SIGNED_OUT' || !session) {
          this.currentUser = null;
          this.currentProfile = null;
          this.cache.clear();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          this.currentUser = session.user;
          await this.loadUserProfile();
        }

        // Dispatch custom event for UI updates
        this.dispatchAuthEvent(event, session);
      }
    );

    // Store subscription for cleanup
    this.authSubscription = subscription;
  }

  /**
   * Dispatch authentication events
   */
  dispatchAuthEvent(event, session) {
    if (typeof window !== 'undefined') {
      const customEvent = new CustomEvent('openstudent:auth-change', {
        detail: { event, session, profile: this.currentProfile }
      });
      window.dispatchEvent(customEvent);
    }
  }

  /**
   * Enhanced login with comprehensive error handling
   */
  async login(email, password, options = {}) {
    const { maxRetries = 3 } = options;

    try {
      // Input validation
      this.validateLoginInput(email, password);
      const normalizedEmail = email.trim().toLowerCase();

      // Attempt login with retry logic
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data, error } = await this.supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
            options: { shouldCreateUser: false }
          });

          if (error) throw error;

          this.currentUser = data.user;
          await this.loadUserProfile();

          this.logger.info('Login successful', {
            userId: data.user.id,
            email: normalizedEmail,
            role: this.currentProfile?.role
          });

          return {
            success: true,
            user: data.user,
            profile: this.currentProfile,
            session: data.session
          };

        } catch (error) {
          lastError = error;
          if (attempt < maxRetries && this.isRetryableError(error)) {
            this.logger.warn(`Login attempt ${attempt} failed, retrying...`, error.message);
            await this.delay(1000 * attempt);
          } else {
            break;
          }
        }
      }

      throw lastError;

    } catch (error) {
      this.logger.error('Login failed', { email, error: error.message });
      return {
        success: false,
        error: this.getUserFriendlyError(error.message),
        code: error.code || 'LOGIN_FAILED'
      };
    }
  }

  /**
   * User registration with profile creation
   */
  async register(email, password, userData = {}) {
    try {
      this.validateRegistrationInput(email, password, userData);

      const { data, error } = await this.supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: userData.fullName || userData.full_name || '',
            university_id: userData.universityId || userData.university_id || null,
            program_id: userData.programId || userData.program_id || null
          }
        }
      });

      if (error) throw error;

      // Create user profile if signup successful
      if (data.user && !error) {
        const profileData = {
          id: data.user.id,
          email: data.user.email,
          full_name: userData.fullName || userData.full_name || '',
          role: 'contributor',
          university_id: userData.universityId || userData.university_id || null,
          program_id: userData.programId || userData.program_id || null,
          points: 0,
          total_earnings: 0.00,
          verified: false,
          is_active: true,
          created_at: new Date().toISOString()
        };

        const profileResult = await this.insert('users', profileData);
        if (!profileResult.success) {
          this.logger.error('Profile creation failed', profileResult.error);
          return {
            success: false,
            error: 'Account created but profile setup failed. Please contact support.'
          };
        }
      }

      this.logger.info('Registration successful', {
        userId: data.user?.id,
        needsConfirmation: !data.session
      });

      return {
        success: true,
        user: data.user,
        needsConfirmation: !data.session
      };

    } catch (error) {
      this.logger.error('Registration failed', { email, error: error.message });
      return {
        success: false,
        error: this.getUserFriendlyError(error.message),
        code: error.code || 'REGISTRATION_FAILED'
      };
    }
  }

  /**
   * Enhanced logout with complete cleanup
   */
  async logout() {
    try {
      const { error } = await this.supabase.auth.signOut();

      if (error) throw error;

      // Clear all client state
      this.currentUser = null;
      this.currentProfile = null;
      this.cache.clear();

      // Clear sensitive data from storage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('openstudent_temp_data');
      }

      this.logger.info('Logout successful');
      return { success: true };

    } catch (error) {
      this.logger.error('Logout failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load user profile with enhanced caching
   */
  async loadUserProfile() {
    if (!this.currentUser) return null;

    const cacheKey = `profile:${this.currentUser.id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.currentProfile = cached;
      return cached;
    }

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select(`
          id, email, role, university_id, program_id, full_name, bio,
          avatar_url, points, total_earnings, verified, is_active,
          created_at, last_login,
          universities(id, name, code),
          programs(id, name, code)
        `)
        .eq('id', this.currentUser.id)
        .single();

      if (error) throw error;

      // Update last login timestamp
      await this.supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', this.currentUser.id);

      this.currentProfile = data;
      this.cache.set(cacheKey, data, 10 * 60 * 1000); // Cache for 10 minutes

      return data;

    } catch (error) {
      this.logger.error('Failed to load user profile', error);
      return null;
    }
  }

  /**
   * Check current session
   */
  async checkSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();

      if (error) throw error;

      if (!session) {
        return { success: true, user: null, profile: null };
      }

      this.currentUser = session.user;

      if (!this.currentProfile) {
        await this.loadUserProfile();
      }

      return {
        success: true,
        user: session.user,
        profile: this.currentProfile,
        session
      };

    } catch (error) {
      this.logger.error('Session check failed', error);
      return { success: false, error: error.message, user: null };
    }
  }

  /**
   * Enhanced query method with advanced filtering
   */
  async query(table, options = {}) {
    const {
      select = '*',
      filters = {},
      orderBy = null,
      limit = null,
      offset = null,
      cache = true,
      cacheTtl = null
    } = options;

    const cacheKey = cache ? `query:${table}:${JSON.stringify(options)}` : null;

    if (cache && cacheKey) {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      let query = this.supabase.from(table).select(select);

      // Apply filters with advanced operators
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value.op) {
            query = query[value.op](key, value.value);
          } else {
            query = query.eq(key, value);
          }
        }
      });

      // Apply ordering
      if (orderBy) {
        if (Array.isArray(orderBy)) {
          orderBy.forEach(order => {
            query = query.order(order.column, { ascending: order.ascending ?? true });
          });
        } else {
          query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
        }
      }

      // Apply pagination
      if (limit) query = query.limit(limit);
      if (offset) query = query.range(offset, offset + (limit || 50) - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const result = { success: true, data, count };

      if (cache && cacheKey) {
        this.cache.set(cacheKey, result, cacheTtl);
      }

      return result;

    } catch (error) {
      this.logger.error(`Query failed for table ${table}`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Enhanced insert method
   */
  async insert(table, data, options = {}) {
    try {
      const { returning = true, upsert = false } = options;

      let query = this.supabase.from(table);

      if (upsert) {
        query = query.upsert(data);
      } else {
        query = query.insert(data);
      }

      if (returning) {
        query = query.select();
      }

      const { data: result, error } = await query;

      if (error) throw error;

      // Invalidate relevant cache entries
      this.cache.invalidate(table);

      this.logger.debug(`Insert successful in ${table}`, {
        recordCount: Array.isArray(data) ? data.length : 1
      });

      return { success: true, data: result };

    } catch (error) {
      this.logger.error(`Insert failed in ${table}`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Enhanced update method
   */
  async update(table, updates, filters, options = {}) {
    try {
      const { returning = true } = options;

      let query = this.supabase.from(table).update(updates);

      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      if (returning) {
        query = query.select();
      }

      const { data, error } = await query;

      if (error) throw error;

      // Invalidate relevant cache entries
      this.cache.invalidate(table);

      return { success: true, data };

    } catch (error) {
      this.logger.error(`Update failed in ${table}`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Delete method
   */
  async delete(table, filters) {
    try {
      let query = this.supabase.from(table).delete();

      Object.entries(filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });

      const { data, error } = await query;

      if (error) throw error;

      // Invalidate relevant cache entries
      this.cache.invalidate(table);

      return { success: true, data };

    } catch (error) {
      this.logger.error(`Delete failed in ${table}`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Role and permission methods
   */
  hasRole(role) {
    return this.currentProfile?.role === role;
  }

  isAdmin() {
    return this.hasRole('admin');
  }

  isContributor() {
    return this.hasRole('contributor');
  }

  canModerate() {
    return this.isAdmin() || this.hasRole('reviewer');
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getCurrentProfile() {
    return this.currentProfile;
  }

  getSessionInfo() {
    return {
      user: this.currentUser,
      profile: this.currentProfile,
      isAuthenticated: !!this.currentUser
    };
  }

  /**
   * Event listener management
   */
  onAuthStateChange(callback) {
    const listener = (event) => {
      callback(event.detail.event, event.detail.session, event.detail.profile);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('openstudent:auth-change', listener);
      this.eventListeners.add({ type: 'openstudent:auth-change', listener });
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openstudent:auth-change', listener);
        this.eventListeners.delete({ type: 'openstudent:auth-change', listener });
      }
    };
  }

  /**
   * Input validation methods
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  validateLoginInput(email, password) {
    if (!email || typeof email !== 'string') {
      throw new Error('Valid email address is required');
    }
    if (!this.validateEmail(email)) {
      throw new Error('Please enter a valid email address');
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
  }

  validateRegistrationInput(email, password, userData) {
    this.validateLoginInput(email, password);

    // Enhanced password validation for registration
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!userData.fullName || !userData.full_name) {
      throw new Error('Full name is required');
    }
  }

  /**
   * Error handling utilities
   */
  isRetryableError(error) {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'];
    return (
      retryableCodes.some(code => error.message?.includes(code)) ||
      error.status >= 500 ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT'
    );
  }

  getUserFriendlyError(message) {
    const errorMap = {
      'Invalid login credentials': 'Invalid email or password. Please try again.',
      'Email not confirmed': 'Please check your email and click the confirmation link.',
      'Too many requests': 'Too many attempts. Please wait a few minutes and try again.',
      'Network request failed': 'Connection error. Please check your internet connection.',
      'User already registered': 'An account with this email already exists.',
      'Password should be at least 6 characters': 'Password must be at least 6 characters long.',
      'Signup is not allowed for this instance': 'Registration is currently disabled. Please contact support.',
      'Invalid email': 'Please enter a valid email address.'
    };

    return errorMap[message] || 'An unexpected error occurred. Please try again.';
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for monitoring
   */
  async healthCheck() {
    try {
      const start = Date.now();
      const { data, error } = await this.supabase.from('users').select('count').limit(1);
      const responseTime = Date.now() - start;

      return {
        status: error ? 'unhealthy' : 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
        cacheStats: this.cache.getStats(),
        error: error?.message
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Cleanup method
   */
  cleanup() {
    this.cache.destroy();

    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }

    // Clean up event listeners
    if (typeof window !== 'undefined') {
      this.eventListeners.forEach(({ type, listener }) => {
        window.removeEventListener(type, listener);
      });
    }
    this.eventListeners.clear();

    this.logger.info('OpenStudent client cleaned up');
  }
}

// Initialize singleton instance
const openStudentClient = new OpenStudentClient();

// Auto-initialize when DOM is ready or immediately if already loaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => openStudentClient.init());
  } else {
    openStudentClient.init();
  }
} else {
  // For server-side or non-DOM environments
  openStudentClient.init();
}

// ES Module exports
export default openStudentClient;

export const {
  login,
  register,
  logout,
  checkSession,
  query,
  insert,
  update,
  delete: deleteRecord,
  isAdmin,
  isContributor,
  canModerate,
  getCurrentUser,
  getCurrentProfile,
  onAuthStateChange
} = {
  login: (...args) => openStudentClient.login(...args),
  register: (...args) => openStudentClient.register(...args),
  logout: () => openStudentClient.logout(),
  checkSession: () => openStudentClient.checkSession(),
  query: (...args) => openStudentClient.query(...args),
  insert: (...args) => openStudentClient.insert(...args),
  update: (...args) => openStudentClient.update(...args),
  delete: (...args) => openStudentClient.delete(...args),
  isAdmin: () => openStudentClient.isAdmin(),
  isContributor: () => openStudentClient.isContributor(),
  canModerate: () => openStudentClient.canModerate(),
  getCurrentUser: () => openStudentClient.getCurrentUser(),
  getCurrentProfile: () => openStudentClient.getCurrentProfile(),
  onAuthStateChange: (callback) => openStudentClient.onAuthStateChange(callback)
};

// Legacy global access for backwards compatibility (if needed)
if (typeof window !== 'undefined') {
  window.OpenStudent = openStudentClient;
  window.supabaseClient = openStudentClient.supabase;

  // Legacy auth object
  window.OpenStudentAuth = {
    login: (...args) => openStudentClient.login(...args),
    register: (...args) => openStudentClient.register(...args),
    logout: () => openStudentClient.logout(),
    checkSession: () => openStudentClient.checkSession(),
    query: (...args) => openStudentClient.query(...args),
    insert: (...args) => openStudentClient.insert(...args),
    update: (...args) => openStudentClient.update(...args),
    isAdmin: () => openStudentClient.isAdmin(),
    isContributor: () => openStudentClient.isContributor(),
    canModerate: () => openStudentClient.canModerate(),
    getCurrentUser: () => openStudentClient.getCurrentUser(),
    getCurrentProfile: () => openStudentClient.getCurrentProfile()
  };

  // Development helpers
  if (import.meta.env.DEV) {
    window.OpenStudentDebug = {
      client: openStudentClient,
      clearCache: () => openStudentClient.cache.clear(),
      getCache: () => openStudentClient.cache,
      getCacheStats: () => openStudentClient.cache.getStats(),
      healthCheck: () => openStudentClient.healthCheck(),
      getLogs: () => {
        try {
          return JSON.parse(localStorage.getItem('openstudent_errors') || '[]');
        } catch {
          return [];
        }
      },
      config: openStudentClient.config
    };
  }
}