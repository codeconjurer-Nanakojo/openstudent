import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables')
  throw new Error('Supabase configuration incomplete. Check environment variables.')
}

console.log('🔗 Initializing Supabase client...')
console.log('📍 Supabase URL:', supabaseUrl)

const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log('✅ Supabase client initialized successfully')

// Rate limiting protection
const signUpAttempts = new Map();
const SIGNUP_COOLDOWN_MS = 60000; // 60 seconds cooldown

/**
 * Check if a user is attempting to sign up too frequently
 * @param {string} email - Email address to check
 * @returns {boolean} - True if user should wait, false otherwise
 */
const isRateLimited = (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const lastAttempt = signUpAttempts.get(normalizedEmail);

  if (lastAttempt) {
    const timeSinceLastAttempt = Date.now() - lastAttempt;
    if (timeSinceLastAttempt < SIGNUP_COOLDOWN_MS) {
      console.log(`⏰ Rate limited: ${normalizedEmail} tried too soon`);
      return true;
    }
  }

  // Update the last attempt time
  signUpAttempts.set(normalizedEmail, Date.now());
  return false;
};

/**
 * Sanitize error messages to prevent exposure of sensitive information
 * @param {Error|string} error - The error to sanitize
 * @returns {string} - Safe error message
 */
const sanitizeError = (error) => {
  const errorMessage = error?.message || error?.toString() || 'An unexpected error occurred'

  // Common error mappings for user-friendly messages
  const errorMappings = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Please check your email and confirm your account',
    'User already registered': 'An account with this email already exists',
    'Password should be at least 6 characters': 'Password must be at least 6 characters long',
    'Unable to validate email address': 'Please enter a valid email address',
    'signup_disabled': 'Account registration is currently disabled',
    'For security purposes, you can only request this after': 'You\'re trying too quickly. Please wait a few seconds before retrying.',
    'new row violates row-level security policy': 'Registration failed due to security policy. Please contact support.'
  }

  // Check for rate limiting errors
  if (errorMessage.includes('For security purposes, you can only request this after')) {
    return errorMappings['For security purposes, you can only request this after'];
  }

  // Check for RLS policy violations
  if (errorMessage.includes('new row violates row-level security policy')) {
    return errorMappings['new row violates row-level security policy'];
  }

  // Return mapped error or generic message
  return errorMappings[errorMessage] || 'Something went wrong. Please try again.'
}

/**
 * Get the current authenticated user
 * @returns {Promise<{success: boolean, user?: object, message: string}>}
 */
export const getCurrentUser = async () => {
  console.log('👤 Getting current user...')

  try {
    const { data: { user }, error } = await supabase.auth.getUser()

    console.log('📊 Current user response:', {
      user: user ? { id: user.id, email: user.email } : null,
      error: error?.message
    })

    if (error) {
      console.log('❌ Failed to get current user:', error.message)
      return { success: false, message: 'Failed to get user information' }
    }

    if (!user) {
      console.log('❌ No authenticated user found')
      return { success: false, message: 'No authenticated user' }
    }

    console.log('✅ Current user retrieved successfully')
    return {
      success: true,
      user: user,
      message: 'User retrieved successfully'
    }
  } catch (error) {
    console.error('💥 Unexpected error getting current user:', error)
    return { success: false, message: 'An unexpected error occurred' }
  }
}

/**
 * Get the current user's profile
 * @returns {Promise<{success: boolean, profile?: object, message: string}>}
 */
export const getProfile = async () => {
  console.log('👤 Fetching user profile...')

  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.log('❌ Session error:', sessionError.message)
      return { success: false, message: 'Failed to get session. Please try again.' }
    }

    if (!session) {
      console.log('❌ No active session')
      return { success: false, message: 'No active session. Please log in again.' }
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, full_name, role, university_id, program_id, profile_picture, created_at')
      .eq('id', session.user.id)
      .single()

    console.log('📊 Profile fetch response:', {
      profile: profile ? {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        university_id: profile.university_id,
        program_id: profile.program_id,
        profile_picture: profile.profile_picture
      } : null,
      error: profileError?.message
    })

    if (profileError) {
      console.log('❌ Profile fetch failed:', profileError.message)
      return { success: false, message: 'Failed to fetch profile. Please try again.' }
    }

    if (!profile) {
      console.log('❌ No profile found for user')
      return { success: false, message: 'User profile not found. Please contact support.' }
    }

    console.log('✅ Profile loaded successfully')
    return {
      success: true,
      profile: profile,
      message: 'Profile loaded successfully'
    }
  } catch (error) {
    console.error('💥 Unexpected profile fetch error:', error)
    return { success: false, message: 'An unexpected error occurred' }
  }
}

/**
 * Update the current user's profile
 * @param {object} updates - Object with profile fields to update
 * @returns {Promise<{success: boolean, profile?: object, message: string}>}
 */
export const updateProfile = async (updates) => {
  console.log('💾 Updating user profile...')
  console.log('📝 Update data:', updates)

  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.log('❌ Session error:', sessionError.message)
      return { success: false, message: 'Failed to get session. Please try again.' }
    }

    if (!session) {
      console.log('❌ No active session')
      return { success: false, message: 'No active session. Please log in again.' }
    }

    // Update user profile
    const { data: profile, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', session.user.id)
      .select()

    console.log('📊 Profile update response:', {
      profile: profile ? profile[0] : null,
      error: updateError?.message
    })

    if (updateError) {
      console.log('❌ Profile update failed:', updateError.message)
      return { success: false, message: sanitizeError(updateError) }
    }

    if (!profile || profile.length === 0) {
      console.log('❌ No profile found after update')
      return { success: false, message: 'Profile update failed. Please try again.' }
    }

    console.log('✅ Profile updated successfully')
    return {
      success: true,
      profile: profile[0],
      message: 'Profile updated successfully'
    }

  } catch (error) {
    console.error('💥 Unexpected profile update error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Check if a user's profile is complete
 * @param {object} profile - The user's profile object
 * @returns {boolean} - True if profile is complete, false otherwise
 */
export const checkProfileCompletion = (profile) => {
  console.log('🔍 Checking profile completion...')

  const isComplete = profile &&
                    profile.full_name &&
                    profile.university_id &&
                    profile.program_id;

  console.log(`📊 Profile completion: ${isComplete ? 'Complete' : 'Incomplete'}`)
  return isComplete;
}

/**
 * Sign in with OAuth provider
 * @param {string} provider - The OAuth provider (e.g., 'google', 'github')
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const signInWithOAuth = async (provider) => {
  console.log(`🔗 Starting ${provider} OAuth login...`)

  try {
    const redirectUrl = `${window.location.origin}/auth/callback`;
    console.log('🔄 Redirect URL:', redirectUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: redirectUrl
      }
    })

    console.log('📊 OAuth response:', {
      url: data?.url ? 'Generated' : 'None',
      error: error?.message
    })

    if (error) {
      console.log(`❌ ${provider} OAuth failed:`, error.message)
      return { success: false, message: sanitizeError(error) }
    }

    console.log(`🚀 Redirecting to ${provider} OAuth...`)
    return {
      success: true,
      message: 'Redirecting to authentication provider'
    }

  } catch (error) {
    console.error(`💥 ${provider} OAuth error:`, error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const signOut = async () => {
  console.log('🚪 Starting sign out process...')

  try {
    const { error } = await supabase.auth.signOut()

    console.log('📊 Sign out response:', { error: error?.message })

    if (error) {
      console.log('❌ Sign out failed:', error.message)
      return { success: false, message: sanitizeError(error) }
    }

    console.log('✅ Sign out successful')
    return { success: true, message: 'Signed out successfully' }

  } catch (error) {
    console.error('💥 Sign out error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Register a new user with email and password
 * @param {string} fullName - User's full name
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const register = async (fullName, email, password) => {
  console.log('🚀 Starting user registration process...')
  console.log('📝 Registration data:', { fullName, email, password: '***hidden***' })

  try {
    // Input validation
    if (!fullName?.trim() || !email?.trim() || !password?.trim()) {
      console.log('❌ Registration failed: Missing required fields')
      return { success: false, message: 'All fields are required' }
    }

    if (password.length < 6) {
      console.log('❌ Registration failed: Password too short')
      return { success: false, message: 'Password must be at least 6 characters long' }
    }

    // Rate limiting check
    if (isRateLimited(email)) {
      console.log('❌ Registration failed: Rate limited')
      return { success: false, message: 'You\'re trying too quickly. Please wait a minute before trying again.' }
    }

    // Step 1: Create auth user
    console.log('👤 Creating auth user with Supabase...')
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: {
          full_name: fullName.trim()
        }
      }
    })

    console.log('📊 Auth signup response:', {
      user: authData?.user?.id,
      session: !!authData?.session,
      error: authError?.message
    })

    if (authError) {
      console.log('❌ Auth signup failed:', authError.message)
      return { success: false, message: sanitizeError(authError) }
    }

    if (!authData?.user) {
      console.log('❌ No user data returned from signup')
      return { success: false, message: 'Registration failed. Please try again.' }
    }

    // Step 2: Insert user profile into users table
    console.log('💾 Inserting user profile into users table...')
    const profileData = {
      id: authData.user.id,
      email: email.trim(),
      full_name: fullName.trim(),
      role: 'contributor',
      created_at: new Date().toISOString()
    }

    console.log('📋 Profile data:', profileData)

    const { data: profileInsert, error: profileError } = await supabase
      .from('users')
      .insert([profileData])

    console.log('📊 Profile insert response:', {
      data: profileInsert,
      error: profileError?.message
    })

    if (profileError) {
      console.log('❌ Profile creation failed:', profileError.message)

      // Check for RLS policy violation
      if (profileError.message.includes('row-level security policy')) {
        console.log('🔒 RLS policy violation detected')
        console.log('⚠️ Orphaned auth user would need cleanup (not performed in frontend)')

        return {
          success: false,
          message: sanitizeError(profileError)
        }
      }

      // Log warning about orphaned auth user (no cleanup in frontend)
      console.log('⚠️ Orphaned auth user would need cleanup (not performed in frontend)')

      return {
        success: false,
        message: 'Registration failed. Please try again.'
      }
    }

    console.log('✅ User registration completed successfully')
    console.log('📧 User should check email for confirmation link')

    return {
      success: true,
      message: 'Registration successful! Please check your email to confirm your account.'
    }

  } catch (error) {
    console.error('💥 Unexpected registration error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

/**
 * Login user with email and password
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, profile?: object, message: string}>}
 */
export const login = async (email, password) => {
  console.log('🔐 Starting user login process...')
  console.log('📝 Login attempt for email:', email)

  try {
    // Input validation
    if (!email?.trim() || !password?.trim()) {
      console.log('❌ Login failed: Missing credentials')
      return { success: false, message: 'Email and password are required' }
    }

    // Step 1: Authenticate with Supabase
    console.log('🔑 Authenticating with Supabase...')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password
    })

    console.log('📊 Auth signin response:', {
      user: authData?.user?.id,
      session: !!authData?.session,
      error: authError?.message
    })

    if (authError) {
      console.log('❌ Authentication failed:', authError.message)
      return { success: false, message: sanitizeError(authError) }
    }

    if (!authData?.user || !authData?.session) {
      console.log('❌ No user/session data returned from signin')
      return { success: false, message: 'Login failed. Please try again.' }
    }

    // Step 2: Fetch user profile from users table
    console.log('👤 Fetching user profile...')
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, full_name, role, university_id, program_id, profile_picture, created_at')
      .eq('id', authData.user.id)
      .single()

    console.log('📊 Profile fetch response:', {
      profile: profile ? {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        role: profile.role,
        university_id: profile.university_id,
        program_id: profile.program_id,
        profile_picture: profile.profile_picture
      } : null,
      error: profileError?.message
    })

    if (profileError) {
      console.log('❌ Profile fetch failed:', profileError.message)
      return { success: false, message: 'Login failed. Please try again.' }
    }

    if (!profile) {
      console.log('❌ No profile found for user')
      return { success: false, message: 'User profile not found. Please contact support.' }
    }

    console.log('✅ Login successful')
    console.log('👤 User role:', profile.role)

    return {
      success: true,
      profile: profile,
      message: 'Login successful!'
    }

  } catch (error) {
    console.error('💥 Unexpected login error:', error)
    return { success: false, message: sanitizeError(error) }
  }
}

// Export the Supabase client for advanced usage
export { supabase }

console.log('📦 Supabase module loaded successfully')