import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client securely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables')
  throw new Error('Supabase configuration incomplete. Check environment variables.')
}

console.log('🔗 Initializing Supabase client...')
const supabase = createClient(supabaseUrl, supabaseAnonKey)
console.log('✅ Supabase client initialized successfully')

// Rate limiting for sign-ups
const signUpAttempts = new Map()
const SIGNUP_COOLDOWN_MS = 60000 // 60 seconds

/**
 * Check if email is rate limited for sign-up attempts
 */
const isRateLimited = (email) => {
  const normalizedEmail = email.trim().toLowerCase()
  const lastAttempt = signUpAttempts.get(normalizedEmail)

  if (lastAttempt && (Date.now() - lastAttempt) < SIGNUP_COOLDOWN_MS) {
    return true
  }

  signUpAttempts.set(normalizedEmail, Date.now())
  return false
}

/**
 * Sanitize error messages for user-friendly display
 */
const sanitizeError = (error) => {
  const errorMessage = error?.message || error?.toString() || 'An unexpected error occurred'

  const errorMappings = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please check your email and confirm your account',
    'User already registered': 'An account with this email already exists',
    'Password should be at least 6 characters': 'Password must be at least 6 characters long',
    'Unable to validate email address': 'Please enter a valid email address',
    'signup_disabled': 'Account registration is currently disabled',
    'For security purposes, you can only request this after': 'You are trying too quickly. Please wait before retrying.',
    'new row violates row-level security policy': 'Registration failed due to security policy. Please contact support.'
  }

  // Handle specific error patterns
  if (errorMessage.includes('For security purposes')) {
    return errorMappings['For security purposes, you can only request this after']
  }
  if (errorMessage.includes('row-level security policy')) {
    return errorMappings['new row violates row-level security policy']
  }

  return errorMappings[errorMessage] || 'Something went wrong. Please try again.'
}

/**
 * Get authenticated session helper
 */
const getAuthenticatedSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error) {
      console.log('❌ Session error:', error.message)
      return { session: null, user: null }
    }

    return { session, user: session?.user || null }
  } catch (error) {
    console.error('💥 Session check error:', error)
    return { session: null, user: null }
  }
}

// ==================== AUTHENTICATION FUNCTIONS ====================

/**
 * Sign up a new user with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {object} metadata - Additional user metadata (e.g., { full_name })
 * @returns {Promise<{success: boolean, user?: object, message: string}>}
 */
export const signUpWithEmail = async (email, password, metadata = {}) => {
  console.log('🚀 signUpWithEmail: Starting registration...')

  try {
    // Input validation
    if (!email?.trim() || !password?.trim()) {
      return { success: false, message: 'Email and password are required' }
    }

    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long' }
    }

    // Rate limiting check
    if (isRateLimited(email)) {
      return { success: false, message: 'You are trying too quickly. Please wait a minute before trying again.' }
    }

    // Step 1: Create auth user
    console.log('👤 signUpWithEmail: Creating auth user...')
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: metadata
      }
    })

    if (authError) {
      console.log('❌ signUpWithEmail: Auth signup failed:', authError.message)
      return { success: false, message: sanitizeError(authError) }
    }

    if (!authData?.user) {
      console.log('❌ signUpWithEmail: No user data returned')
      return { success: false, message: 'Registration failed. Please try again.' }
    }

    // Step 2: Insert user profile into users table
    console.log('💾 signUpWithEmail: Creating user profile...')
    const profileData = {
      id: authData.user.id,
      email: email.trim(),
      full_name: metadata.full_name || '',
      role: 'contributor',
      created_at: new Date().toISOString()
    }

    const { error: profileError } = await supabase
      .from('users')
      .insert([profileData])

    if (profileError) {
      console.log('❌ signUpWithEmail: Profile creation failed:', profileError.message)
      return { success: false, message: sanitizeError(profileError) }
    }

    console.log('✅ signUpWithEmail: Registration completed successfully')
    return {
      success: true,
      user: authData.user,
      message: 'Registration successful! Please check your email to confirm your account.'
    }

  } catch (error) {
    console.error('💥 signUpWithEmail: Unexpected error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Sign in a user with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, user?: object, profile?: object, message: string}>}
 */
export const signInWithEmail = async (email, password) => {
  console.log('🔐 signInWithEmail: Starting login...')

  try {
    // Input validation
    if (!email?.trim() || !password?.trim()) {
      return { success: false, message: 'Email and password are required' }
    }

    // Step 1: Authenticate with Supabase
    console.log('🔑 signInWithEmail: Authenticating...')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    })

    if (authError) {
      console.log('❌ signInWithEmail: Authentication failed:', authError.message)
      return { success: false, message: sanitizeError(authError) }
    }

    if (!authData?.user || !authData?.session) {
      console.log('❌ signInWithEmail: No user/session data returned')
      return { success: false, message: 'Login failed. Please try again.' }
    }

    // Step 2: Fetch user profile
    const profileResult = await getProfile()
    if (!profileResult.success) {
      console.log('❌ signInWithEmail: Failed to fetch profile after login')
      return { success: false, message: 'Login failed. Please try again.' }
    }

    console.log('✅ signInWithEmail: Login successful')
    return {
      success: true,
      user: authData.user,
      profile: profileResult.profile,
      message: 'Login successful!'
    }

  } catch (error) {
    console.error('💥 signInWithEmail: Unexpected error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Sign in with OAuth provider
 * @param {string} provider - OAuth provider ('google', 'github', etc.)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const signInWithOAuth = async (provider) => {
  console.log(`🔗 signInWithOAuth: Starting ${provider} OAuth...`)

  try {
    const redirectUrl = `${window.location.origin}/auth/callback`
    console.log('📍 signInWithOAuth: Redirect URL:', redirectUrl)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: redirectUrl
      }
    })

    if (error) {
      console.log(`❌ signInWithOAuth: ${provider} OAuth failed:`, error.message)
      return { success: false, message: sanitizeError(error) }
    }

    console.log(`✅ signInWithOAuth: ${provider} OAuth initiated`)
    return {
      success: true,
      message: `Redirecting to ${provider} authentication...`
    }

  } catch (error) {
    console.error(`💥 signInWithOAuth: ${provider} OAuth error:`, error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const signOut = async () => {
  console.log('🚪 signOut: Starting logout...')

  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.log('❌ signOut: Logout failed:', error.message)
      return { success: false, message: sanitizeError(error) }
    }

    console.log('✅ signOut: Logout successful')
    return { success: true, message: 'Signed out successfully' }

  } catch (error) {
    console.error('💥 signOut: Unexpected error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Get the currently authenticated user
 * @returns {Promise<{success: boolean, user?: object, message: string}>}
 */
export const getCurrentUser = async () => {
  console.log('👤 getCurrentUser: Fetching current user...')

  try {
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      console.log('❌ getCurrentUser: Failed to get user:', error.message)
      return { success: false, message: 'Failed to get user information' }
    }

    if (!user) {
      console.log('❌ getCurrentUser: No authenticated user found')
      return { success: false, message: 'No authenticated user' }
    }

    console.log('✅ getCurrentUser: User retrieved successfully')
    return {
      success: true,
      user: user,
      message: 'User retrieved successfully'
    }
  } catch (error) {
    console.error('💥 getCurrentUser: Unexpected error:', error)
    return { success: false, message: 'An unexpected error occurred' }
  }
}

// ==================== PROFILE FUNCTIONS ====================

/**
 * Get the logged-in user's profile from the users table
 * @returns {Promise<{success: boolean, profile?: object, message: string}>}
 */
export const getProfile = async () => {
  console.log('👤 getProfile: Fetching user profile...')

  try {
    const { session } = await getAuthenticatedSession()

    if (!session) {
      return { success: false, message: 'No active session. Please log in again.' }
    }

    const { data: profile, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, university_id, program_id, avatar_url, created_at, updated_at')
      .eq('id', session.user.id)
      .single()

    if (error) {
      console.log('❌ getProfile: Profile fetch failed:', error.message)
      return { success: false, message: 'Failed to fetch profile. Please try again.' }
    }

    if (!profile) {
      console.log('❌ getProfile: No profile found')
      return { success: false, message: 'Profile not found. Please contact support.' }
    }

    console.log('✅ getProfile: Profile fetched successfully')
    return {
      success: true,
      profile: profile,
      message: 'Profile loaded successfully'
    }
  } catch (error) {
    console.error('💥 getProfile: Unexpected error:', error)
    return { success: false, message: 'An unexpected error occurred' }
  }
}

/**
 * Update the user's profile in the users table
 * @param {object} updates - Object containing fields to update
 * @returns {Promise<{success: boolean, profile?: object, message: string}>}
 */
export const updateProfile = async (updates) => {
  console.log('📝 updateProfile: Updating profile...')
  console.log('📊 updateProfile: Updates:', updates)

  try {
    const { session } = await getAuthenticatedSession()

    if (!session) {
      return { success: false, message: 'No active session. Please log in again.' }
    }

    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data: profile, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', session.user.id)
      .select('id, email, full_name, role, university_id, program_id, avatar_url, created_at, updated_at')
      .single()

    if (error) {
      console.log('❌ updateProfile: Update failed:', error.message)
      return { success: false, message: sanitizeError(error) }
    }

    console.log('✅ updateProfile: Profile updated successfully')
    return {
      success: true,
      profile: profile,
      message: 'Profile updated successfully'
    }

  } catch (error) {
    console.error('💥 updateProfile: Unexpected error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Check if required profile fields are completed
 * @param {object} profile - User profile object (optional, will fetch if not provided)
 * @returns {Promise<boolean>} - True if profile is complete
 */
export const checkProfileCompletion = async (profile = null) => {
  console.log('🔍 checkProfileCompletion: Checking profile completion...')

  try {
    // Fetch profile if not provided
    if (!profile) {
      const profileResult = await getProfile()
      if (!profileResult.success) {
        console.log('❌ checkProfileCompletion: Failed to fetch profile')
        return false
      }
      profile = profileResult.profile
    }

    const requiredFields = ['full_name', 'university_id', 'program_id']
    const isComplete = requiredFields.every(field => profile?.[field])

    console.log(`📊 checkProfileCompletion: Profile ${isComplete ? 'complete' : 'incomplete'}`)
    return isComplete

  } catch (error) {
    console.error('💥 checkProfileCompletion: Unexpected error:', error)
    return false
  }
}

/**
 * Get avatar URL with fallback to UI Avatars service
 * @param {object} profile - User profile object
 * @returns {string} - Avatar URL (profile picture or generated fallback)
 */
export const getAvatarUrl = (profile) => {
  if (profile?.avatar_url) {
    console.log('🖼️ getAvatarUrl: Using profile avatar')
    return profile.avatar_url
  }

  // Fallback: UI Avatars service with platform colors
  const name = encodeURIComponent(profile?.full_name || 'User')
  const fallbackUrl = `https://ui-avatars.com/api/?name=${name}&background=2563eb&color=fff&size=128&bold=true`

  console.log('🎭 getAvatarUrl: Using fallback avatar for:', profile?.full_name || 'User')
  return fallbackUrl
}

// ==================== DROPDOWN DATA FUNCTIONS ====================

/**
 * Get universities list for dropdowns
 * @returns {Promise<Array>} - List of active universities
 */
export const getUniversities = async () => {
  console.log('🎓 getUniversities: Fetching universities...')

  try {
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, short_name')
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.log('❌ getUniversities: Fetch failed:', error.message)
      return []
    }

    console.log('✅ getUniversities: Fetched successfully:', data?.length || 0, 'universities')
    return data || []

  } catch (error) {
    console.error('💥 getUniversities: Unexpected error:', error)
    return []
  }
}

/**
 * Get programs list for dropdowns
 * @returns {Promise<Array>} - List of programs
 */
export const getPrograms = async () => {
  console.log('📚 getPrograms: Fetching programs...')

  try {
    const { data, error } = await supabase
      .from('programs')
      .select('id, name')
      .order('name')

    if (error) {
      console.log('❌ getPrograms: Fetch failed:', error.message)
      return []
    }

    console.log('✅ getPrograms: Fetched successfully:', data?.length || 0, 'programs')
    return data || []

  } catch (error) {
    console.error('💥 getPrograms: Unexpected error:', error)
    return []
  }
}

// ==================== LEGACY COMPATIBILITY FUNCTIONS ====================

/**
 * Legacy register function for backward compatibility
 */
export const register = (fullName, email, password) =>
  signUpWithEmail(email, password, { full_name: fullName })

/**
 * Legacy login function for backward compatibility
 */
export const login = signInWithEmail

/**
 * Legacy OAuth functions for backward compatibility
 */
export const loginWithGoogle = () => signInWithOAuth('google')
export const loginWithGitHub = () => signInWithOAuth('github')

/**
 * Legacy logout function for backward compatibility
 */
export const logout = signOut

/**
 * Legacy session check function for backward compatibility
 */
export const checkSession = async () => {
  const { session } = await getAuthenticatedSession()
  return { success: !!session, session, message: session ? 'Session found' : 'No active session' }
}

// Export the Supabase client for advanced usage
export { supabase }

console.log('📦 Supabase module loaded successfully')