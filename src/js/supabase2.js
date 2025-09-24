// src/js/supabase2.js - Phase 2 Database Layer for OpenStudent
// Handles courses and projects (documents) interactions only
// Uses pre-configured client from supabase.js to inherit auth session for RLS

import { supabase } from './supabase.js'

/**
 * @typedef {Object} Course
 * @property {string} id - UUID
 * @property {string} name - Course name
 * @property {string} code - Course code
 * @property {string} description - Course description
 * @property {string} program_id - Program UUID
 * @property {number} level - Course level (100, 200, etc.)
 * @property {number} semester - Semester (1 or 2)
 * @property {number} credits - Number of credits
 * @property {boolean} is_active - Whether course is active
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 */

/**
 * @typedef {Object} Document
 * @property {string} id - UUID
 * @property {string} title - Project/document title
 * @property {string} description - Project description
 * @property {string} abstract - Project abstract
 * @property {string} file_url - MEGA URL or file path
 * @property {number} file_size - File size in bytes
 * @property {string} image_url - ImageKit URL for preview
 * @property {string} course_id - Course UUID
 * @property {string} contributor_id - User UUID
 * @property {string} team_id - Team UUID (optional)
 * @property {string} status - pending/under_review/approved/rejected
 * @property {string[]} tags - Array of tags
 * @property {number} price - Price per download
 * @property {number} download_count - Total downloads
 * @property {number} average_rating - Average rating
 * @property {number} review_count - Number of reviews
 * @property {boolean} is_featured - Featured status
 * @property {boolean} is_public - Public visibility
 * @property {string} published_at - ISO timestamp
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 */

/**
 * @typedef {Object} DocumentFilters
 * @property {string} program_id - Filter by program
 * @property {string} course_id - Filter by course
 * @property {string} user_id - Filter by contributor
 * @property {string} status - Filter by status
 * @property {boolean} is_public - Filter by public visibility
 * @property {string} search - Search in title/description/abstract
 */

/**
 * @typedef {Object} QueryOptions
 * @property {number} page - Page number (1-based)
 * @property {number} pageSize - Results per page
 * @property {string} orderBy - Column to order by
 * @property {'asc'|'desc'} orderDir - Order direction
 */

// =====================================
// COURSES FUNCTIONS
// =====================================

/**
 * Fetch courses for a program
 * @example getCourses('uuid-123')
 * @param {string} programId - Program UUID (required)
 * @param {Object} options - Pagination options
 * @param {number} options.limit - Max results (default: 100)
 * @param {number} options.offset - Results to skip (default: 0)
 * @returns {Promise<{data: Course[]|null, error: Error|null}>}
 */
export async function getCourses(programId, { limit = 100, offset = 0 } = {}) {
  try {
    if (!programId) {
      return { data: null, error: new Error('Program ID is required') }
    }

    const { data, error } = await supabase
      .from('courses')
      .select('id, code, name, description, program_id, level, semester, credits, is_active, created_at')
      .eq('program_id', programId)
      .eq('is_active', true)
      .order('code', { ascending: true })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.warn('Error fetching courses:', error.message)
      return { data: null, error }
    }

    return { data: data || [], error: null }
  } catch (err) {
    console.warn('Unexpected error in getCourses:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Insert a new course (admin only via RLS)
 * @example insertCourse({ name: 'Math 101', code: 'MATH101', program_id: 'uuid', level: 100, semester: 1 })
 * @param {Object} courseData - Course data
 * @param {string} courseData.name - Course name (required)
 * @param {string} courseData.code - Course code (required)
 * @param {string} courseData.description - Course description
 * @param {string} courseData.program_id - Program UUID (required)
 * @param {number} courseData.level - Course level (required)
 * @param {number} courseData.semester - Semester (required)
 * @param {number} courseData.credits - Number of credits
 * @param {boolean} courseData.is_active - Active status
 * @returns {Promise<{data: Course|null, error: Error|null}>}
 */
export async function insertCourse(courseData) {
  try {
    const requiredFields = ['name', 'code', 'program_id', 'level', 'semester']
    const missingFields = requiredFields.filter(field => !courseData[field])

    if (missingFields.length > 0) {
      return {
        data: null,
        error: new Error(`Missing required fields: ${missingFields.join(', ')}`)
      }
    }

    const { data, error } = await supabase
      .from('courses')
      .insert([{
        name: courseData.name,
        code: courseData.code,
        description: courseData.description || null,
        program_id: courseData.program_id,
        level: courseData.level,
        semester: courseData.semester,
        credits: courseData.credits || null,
        is_active: courseData.is_active !== undefined ? courseData.is_active : true
      }])
      .select('id, code, name, description, program_id, level, semester, credits, is_active, created_at')
      .single()

    if (error) {
      console.warn('Error inserting course:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err) {
    console.warn('Unexpected error in insertCourse:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Update a course (admin only via RLS)
 * @param {string} courseId
 * @param {Object} updates - Any of: code, name, description, level, semester, credits, is_active
 */
export async function updateCourse(courseId, updates) {
  try {
    if (!courseId || !updates) return { data: null, error: new Error('courseId and updates required') }
    const { data, error } = await supabase
      .from('courses')
      .update({
        code: updates.code,
        name: updates.name,
        description: updates.description,
        level: updates.level,
        semester: updates.semester,
        credits: updates.credits,
        is_active: updates.is_active
      })
      .eq('id', courseId)
      .select('id, code, name, level, semester, is_active')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Delete a course (admin only via RLS)
 */
export async function deleteCourse(courseId) {
  try {
    if (!courseId) return { data: null, error: new Error('courseId required') }
    const { data, error } = await supabase
      .from('courses')
      .delete()
      .eq('id', courseId)
      .select('id')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =====================================
// PROGRAMS FUNCTIONS (admin)
// =====================================

export async function listPrograms() {
  try {
    const { data, error } = await supabase
      .from('programs')
      .select('id, name')
      .order('name', { ascending: true })
    if (error) return { data: null, error }
    return { data: data || [], error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function createProgram(name) {
  try {
    if (!name) return { data: null, error: new Error('Program name required') }
    const { data, error } = await supabase
      .from('programs')
      .insert([{ name }])
      .select('id, name')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function updateProgram(programId, name) {
  try {
    if (!programId || !name) return { data: null, error: new Error('programId and name required') }
    const { data, error } = await supabase
      .from('programs')
      .update({ name })
      .eq('id', programId)
      .select('id, name')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function deleteProgram(programId) {
  try {
    if (!programId) return { data: null, error: new Error('programId required') }
    const { data, error } = await supabase
      .from('programs')
      .delete()
      .eq('id', programId)
      .select('id')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =====================================
// DOCUMENTS (PROJECTS) FUNCTIONS
// =====================================

/**
 * Fetch documents with filters and options
 * @example getDocuments({ course_id: 'uuid' }, { page: 1, pageSize: 20 })
 * @param {DocumentFilters} filters - Filter criteria
 * @param {QueryOptions} options - Query options
 * @returns {Promise<{data: Document[]|null, error: Error|null}>}
 */
export async function getDocuments(filters = {}, options = {}) {
  try {
    const { page = 1, pageSize = 20, orderBy = 'created_at', orderDir = 'desc' } = options
    const offset = (page - 1) * pageSize

    let query = supabase
      .from('projects')
      .select(`
        id,
        title,
        description,
        abstract,
        file_url,
        file_size,
        image_url,
        views,
        license,
        course_id,
        contributor_id,
        status,
        tags,
        price,
        download_count,
        average_rating,
        review_count,
        is_featured,
        is_public,
        published_at,
        created_at
      `)

    // Apply filters dynamically
    if (filters.course_id) {
      query = query.eq('course_id', filters.course_id)
    }

    if (filters.user_id) {
      query = query.eq('contributor_id', filters.user_id)
    }

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.is_public !== undefined) {
      query = query.eq('is_public', filters.is_public)
    }

    // Program filter requires join
    if (filters.program_id) {
      query = query
        .select(`
          id,
          title,
          description,
          abstract,
          file_url,
          file_size,
          image_url,
          views,
          license,
          course_id,
          contributor_id,
          status,
          tags,
          price,
          download_count,
          average_rating,
          review_count,
          is_featured,
          is_public,
          published_at,
          created_at,
          courses!inner(program_id)
        `)
        .eq('courses.program_id', filters.program_id)
    }

    // Search filter
    if (filters.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.trim()}%`
      query = query.or(`title.ilike.${searchTerm},description.ilike.${searchTerm},abstract.ilike.${searchTerm}`)
    }

    // Ordering and pagination
    query = query
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + pageSize - 1)

    const { data, error } = await query

    if (error) {
      console.warn('Error fetching documents:', error.message)
      return { data: null, error }
    }

    return { data: data || [], error: null }
  } catch (err) {
    console.warn('Unexpected error in getDocuments:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Fetch documents after a cursor for pagination
 * @example getDocumentsAfter('2023-12-01T00:00:00Z', 'uuid-123', 20)
 * @param {string} cursorCreatedAt - ISO timestamp cursor
 * @param {string} cursorId - UUID cursor for tie-breaking
 * @param {number} limit - Max results (default: 20)
 * @returns {Promise<{data: Document[]|null, error: Error|null}>}
 */
export async function getDocumentsAfter(cursorCreatedAt, cursorId, limit = 20) {
  try {
    if (!cursorCreatedAt || !cursorId) {
      return { data: null, error: new Error('Both cursorCreatedAt and cursorId are required') }
    }

    const { data, error } = await supabase
      .from('projects')
      .select(`
        id,
        title,
        description,
        file_url,
        course_id,
        contributor_id,
        status,
        is_public,
        created_at
      `)
      .or(`created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`)
      .eq('status', 'approved')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('Error fetching documents after cursor:', error.message)
      return { data: null, error }
    }

    return { data: data || [], error: null }
  } catch (err) {
    console.warn('Unexpected error in getDocumentsAfter:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Insert a new document/project
 * @example insertDocument({ title: 'My Project', description: 'Great project', file_url: 'mega://...', course_id: 'uuid', contributor_id: 'uuid' })
 * @param {Object} docData - Document data
 * @param {string} docData.title - Document title (required)
 * @param {string} docData.description - Document description (required)
 * @param {string} docData.abstract - Document abstract
 * @param {string} docData.file_url - File URL from MEGA/ImageKit (required)
 * @param {number} docData.file_size - File size in bytes
 * @param {string} docData.image_url - Preview image URL from ImageKit
 * @param {string} docData.course_id - Course UUID (required)
 * @param {string} docData.contributor_id - User UUID (required)
 * @param {string} docData.team_id - Team UUID
 * @param {string[]} docData.tags - Array of tags
 * @param {number} docData.price - Price per download
 * @param {boolean} docData.is_public - Public visibility
 * @returns {Promise<{data: Document|null, error: Error|null}>}
 */
export async function insertDocument(docData) {
  try {
    const requiredFields = ['title', 'description', 'file_url', 'course_id', 'contributor_id']
    const missingFields = requiredFields.filter(field => !docData[field])

    if (missingFields.length > 0) {
      return {
        data: null,
        error: new Error(`Missing required fields: ${missingFields.join(', ')}`)
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        title: docData.title,
        description: docData.description,
        abstract: docData.abstract || null,
        file_url: docData.file_url,
        file_size: docData.file_size || null,
        image_url: docData.image_url || null,
        license: docData.license || null,
        course_id: docData.course_id,
        contributor_id: docData.contributor_id,
        team_id: docData.team_id || null,
        tags: docData.tags || [],
        price: docData.price || 0,
        is_public: docData.is_public !== undefined ? docData.is_public : true,
        status: 'pending' // Always starts as pending
      }])
      .select(`
        id,
        title,
        description,
        abstract,
        file_url,
        file_size,
        image_url,
        views,
        license,
        course_id,
        contributor_id,
        team_id,
        status,
        tags,
        price,
        is_public,
        created_at
      `)
      .single()

    if (error) {
      console.warn('Error inserting document:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err) {
    console.warn('Unexpected error in insertDocument:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Update a document's status (admin/moderator only via RLS)
 * @param {string} docId - Document UUID
 * @param {string} status - New status ('approved' | 'rejected' | 'pending')
 * @returns {Promise<{data: {id: string, status: string}|null, error: Error|null}>}
 */
export async function updateDocumentStatus(docId, status) {
  try {
    if (!docId || !status) {
      return { data: null, error: new Error('Document ID and status are required') }
    }

    const { data, error } = await supabase
      .from('projects')
      .update({ status })
      .eq('id', docId)
      .select('id, status')
      .single()

    if (error) {
      console.warn('Error updating document status:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err) {
    console.warn('Unexpected error in updateDocumentStatus:', err.message)
    return { data: null, error: err }
  }
}

/**
 * Delete a document (owner/admin only via RLS)
 * @example deleteDocument('uuid-123')
 * @param {string} docId - Document UUID (required)
 * @returns {Promise<{data: {id: string}|null, error: Error|null}>}
 */
export async function deleteDocument(docId) {
  try {
    if (!docId) {
      return { data: null, error: new Error('Document ID is required') }
    }

    const { data, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', docId)
      .select('id')
      .single()

    if (error) {
      console.warn('Error deleting document:', error.message)
      return { data: null, error }
    }

    return { data, error: null }
  } catch (err) {
    console.warn('Unexpected error in deleteDocument:', err.message)
    return { data: null, error: err }
  }
}

// =====================================
// UTILITY FUNCTIONS
// =====================================

/**
 * Count documents matching filters
 * @example countDocuments({ status: 'approved' })
 * @param {DocumentFilters} filters - Same filters as getDocuments
 * @returns {Promise<{data: number|null, error: Error|null}>}
 */
export async function countDocuments(filters = {}) {
  try {
    let query = supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })

    // Apply same filters as getDocuments
    if (filters.course_id) {
      query = query.eq('course_id', filters.course_id)
    }

    if (filters.user_id) {
      query = query.eq('contributor_id', filters.user_id)
    }

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.is_public !== undefined) {
      query = query.eq('is_public', filters.is_public)
    }

    if (filters.program_id) {
      // For program filter, we need a different approach since head: true doesn't work well with joins
      const { data: courseIds, error: courseError } = await supabase
        .from('courses')
        .select('id')
        .eq('program_id', filters.program_id)

      if (courseError) {
        console.warn('Error fetching courses for count:', courseError.message)
        return { data: null, error: courseError }
      }

      const courseIdArray = courseIds?.map(c => c.id) || []
      if (courseIdArray.length === 0) {
        return { data: 0, error: null }
      }

      query = query.in('course_id', courseIdArray)
    }

    if (filters.search && filters.search.trim()) {
      const searchTerm = `%${filters.search.trim()}%`
      query = query.or(`title.ilike.${searchTerm},description.ilike.${searchTerm},abstract.ilike.${searchTerm}`)
    }

    const { count, error } = await query

    if (error) {
      console.warn('Error counting documents:', error.message)
      return { data: null, error }
    }

    return { data: count || 0, error: null }
  } catch (err) {
    console.warn('Unexpected error in countDocuments:', err.message)
    return { data: null, error: err }
  }
}

// =====================================
// SIGNED URL FUNCTIONS
// =====================================

/**
 * Generate signed URL for Supabase Storage
 * Note: Since schema shows MEGA URLs for projects, this may not be used.
 * For ImageKit URLs (public) or MEGA links, return the original URL.
 * @example getSignedUrl('documents', 'user123/project.pdf', 3600)
 * @param {string} bucket - Storage bucket name
 * @param {string} path - File path in bucket
 * @param {number} expiresIn - Expiration in seconds (default: 60)
 * @returns {Promise<{data: string|null, error: Error|null}>}
 */
export async function getSignedUrl(bucket, path, expiresIn = 60) {
  try {
    if (!bucket || !path) {
      return { data: null, error: new Error('Bucket and path are required') }
    }

    // Since the schema shows MEGA URLs and ImageKit URLs,
    // Supabase Storage may not be used for project files.
    // This is a placeholder implementation.
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)

    if (error) {
      console.warn('Error generating signed URL:', error.message)
      return { data: null, error }
    }

    return { data: data?.signedUrl || null, error: null }
  } catch (err) {
    console.warn('Unexpected error in getSignedUrl:', err.message)
    // Return no-op for non-Supabase storage architecture
    return { data: null, error: null }
  }
}

// =====================================
// UNIVERSITIES CRUD (Admin Catalog)
// =====================================

/**
 * List universities
 */
export async function listUniversities() {
  try {
    const { data, error } = await supabase
      .from('universities')
      .select('id, name, short_name, is_active, created_at')
      .order('name')
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Insert university
 */
export async function insertUniversity({ name, short_name, is_active = true }) {
  try {
    if (!name) return { data: null, error: new Error('Name required') }
    const { data, error } = await supabase
      .from('universities')
      .insert([{ name, short_name: short_name || null, is_active }])
      .select('id, name, short_name, is_active')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Update university
 */
export async function updateUniversity(id, updates) {
  try {
    if (!id) return { data: null, error: new Error('ID required') }
    const { data, error } = await supabase
      .from('universities')
      .update(updates)
      .eq('id', id)
      .select('id, name, short_name, is_active')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Delete university
 */
export async function deleteUniversity(id) {
  try {
    if (!id) return { data: null, error: new Error('ID required') }
    const { data, error } = await supabase
      .from('universities')
      .delete()
      .eq('id', id)
      .select('id')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}