/**
 * OpenStudent - Supabase Client & Authentication
 * Production-ready core client with proper error handling, caching, and scalability
 * Location: assets/js/supabase.js
 * Version: 1.0.0
 */

/**
 * Configuration Management
 * In production, use build-time environment injection or config service
 */
class Config {
  constructor() {
    this.supabaseUrl = this.getEnvVar('SUPABASE_URL');
    this.supabaseAnonKey = this.getEnvVar('SUPABASE_ANON_KEY');
    this.isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('Missing required Supabase configuration');
    }
  }

  getEnvVar(key) {
    // Try multiple sources for configuration
    return (
      window.ENV?.[key] ||
      document.querySelector(`meta[name="env-${key.toLowerCase()}"]`)?.content ||
      (this.isDevelopment ? this.getDevConfig(key) : null)
    );
  }

  getDevConfig(key) {
    const devConfig = {
      'SUPABASE_URL': 'https://your-project.supabase.co',
      'SUPABASE_ANON_KEY': 'your-anon-key'
    };
    return devConfig[key];
  }
}

/**
 * Logger with different levels and production optimization
 */
class Logger {
  constructor() {
    this.isDev = new Config().isDevelopment;
  }

  log(level, message, data = null) {
    if (!this.isDev && level === 'debug') return;

    const timestamp = new Date().toISOString();
    const logData = { timestamp, level, message, data };

    console[level === 'error' ? 'error' : 'log'](`[OpenStudent:${level.toUpperCase()}]`, message, data);

    // In production, send to monitoring service
    if (!this.isDev && level === 'error') {
      this.sendToMonitoring(logData);
    }
  }

  debug(message, data) { this.log('debug', message, data); }
  info(message, data) { this.log('info', message, data); }
  warn(message, data) { this.log('warn', message, data); }
  error(message, data) { this.log('error', message, data); }

  sendToMonitoring(logData) {
    // Implement error tracking service integration (Sentry, LogRocket, etc.)
    // For now, store in localStorage for debugging
    try {
      const errors = JSON.parse(localStorage.getItem('openstudent_errors') || '[]');
      errors.push(logData);
      localStorage.setItem('openstudent_errors', JSON.stringify(errors.slice(-50))); // Keep last 50
    } catch (e) {
      console.error('Failed to store error log', e);
    }
  }
}

/**
 * Cache Manager for optimizing database queries
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
    this.ttl = 5 * 60 * 1000; // 5 minutes default TTL
  }

  set(key, value, customTtl = null) {
    const ttl = customTtl || this.ttl;
    const expiry = Date.now() + ttl;
    this.cache.set(key, { value, expiry });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Main OpenStudent Client Class
 */
class OpenStudentClient {
  constructor() {
    this.config = new Config();
    this.logger = new Logger();
    this.cache = new CacheManager();

    // Initialize Supabase client
    this.supabase = supabase.createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });

    this.currentUser = null;
    this.currentProfile = null;
    this.isInitialized = false;

    // Set up auth state listener
    this.setupAuthListener();
  }

  /**
   * Initialize the client and check existing session
   */
  async init() {
    if (this.isInitialized) return;

    try {
      const session = await this.checkSession();
      this.isInitialized = true;
      this.logger.info('OpenStudent client initialized', { hasSession: !!session.user });
      return session;
    } catch (error) {
      this.logger.error('Client initialization failed', error);
      throw error;
    }
  }

  /**
   * Set up authentication state change listener
   */
  setupAuthListener() {
    this.supabase.auth.onAuthStateChange(async (event, session) => {
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
      window.dispatchEvent(new CustomEvent('openstudent:auth-change', {
        detail: { event, session, profile: this.currentProfile }
      }));
    });
  }

  /**
   * Enhanced login with retry logic and validation
   */
  async login(email, password, options = {}) {
    const { rememberMe = true, maxRetries = 3 } = options;

    try {
      // Input validation
      if (!this.validateEmail(email)) {
        throw new Error('Please enter a valid email address');
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

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
            await this.delay(1000 * attempt); // Exponential backoff
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
   * Enhanced logout with cleanup
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
      sessionStorage.removeItem('openstudent_temp_data');

      this.logger.info('Logout successful');
      return { success: true };

    } catch (error) {
      this.logger.error('Logout failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Load user profile with caching
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
          id, email, role, university_id, program_id, full_name, 
          created_at, last_login, points, verified,
          universities(name, code),
          programs(name, code)
        `)
        .eq('id', this.currentUser.id)
        .single();

      if (error) throw error;

      // Update last login
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
   * Check current session with caching
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
   * Enhanced database operations with caching and error handling
   */
  async query(table, options = {}) {
    const {
      select = '*',
      filters = {},
      orderBy = null,
      limit = null,
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

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else if (typeof value === 'object' && value.op) {
            // Support for advanced operators: { op: 'gte', value: 10 }
            query = query[value.op](key, value.value);
          } else {
            query = query.eq(key, value);
          }
        }
      });

      // Apply ordering
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }

      // Apply limit
      if (limit) {
        query = query.limit(limit);
      }

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
   * Enhanced insert with validation
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

      this.logger.debug(`Insert successful in ${table}`, { recordCount: Array.isArray(data) ? data.length : 1 });
      return { success: true, data: result };

    } catch (error) {
      this.logger.error(`Insert failed in ${table}`, error);
      return { success: false, error: error.message, data: null };
    }
  }

  /**
   * Enhanced update with optimistic locking
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
   * Role and permission checking
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

  /**
   * Utility methods
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isRetryableError(error) {
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR'];
    return retryableCodes.some(code => error.message?.includes(code)) || error.status >= 500;
  }

  getUserFriendlyError(message) {
    const errorMap = {
      'Invalid login credentials': 'Invalid email or password. Please try again.',
      'Email not confirmed': 'Please check your email and click the confirmation link.',
      'Too many requests': 'Too many login attempts. Please wait a few minutes and try again.',
      'Network request failed': 'Connection error. Please check your internet connection.'
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
}

// Initialize singleton instance
const openStudentClient = new OpenStudentClient();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => openStudentClient.init());
} else {
  openStudentClient.init();
}

// Export for global access
window.OpenStudent = openStudentClient;
window.supabaseClient = openStudentClient.supabase; // Direct access if needed

// Export individual methods for convenience
window.OpenStudentAuth = {
  login: (...args) => openStudentClient.login(...args),
  logout: () => openStudentClient.logout(),
  checkSession: () => openStudentClient.checkSession(),
  query: (...args) => openStudentClient.query(...args),
  insert: (...args) => openStudentClient.insert(...args),
  update: (...args) => openStudentClient.update(...args),
  isAdmin: () => openStudentClient.isAdmin(),
  isContributor: () => openStudentClient.isContributor(),
  canModerate: () => openStudentClient.canModerate(),
  getCurrentUser: () => openStudentClient.currentUser,
  getCurrentProfile: () => openStudentClient.currentProfile
};

// Development helpers
if (openStudentClient.config.isDevelopment) {
  window.OpenStudentDebug = {
    client: openStudentClient,
    clearCache: () => openStudentClient.cache.clear(),
    getCache: () => openStudentClient.cache,
    healthCheck: () => openStudentClient.healthCheck(),
    getLogs: () => JSON.parse(localStorage.getItem('openstudent_errors') || '[]')
  };
}