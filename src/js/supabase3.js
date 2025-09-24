// src/js/supabase3.js - Advanced integrations (MEGA, QA utilities)
// Uses authenticated context via supabase.js when needed

import { supabase } from './supabase.js'
import { badgesConfig as defaultBadgesConfig, getTimeWindowStart } from './config.js'

const MEGA_UPLOAD_ENDPOINT = '/api/mega/upload'

/**
 * Validate a MEGA link
 * @param {string} link
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateMegaLink(link) {
  if (!link || typeof link !== 'string') return { valid: false, message: 'Link is required' }
  const trimmed = link.trim()
  // Accept typical MEGA share URL patterns
  const pattern = /^(https?:\/\/)?(mega\.nz\/(file|folder)\/[A-Za-z0-9_-]{6,})(#|!)[A-Za-z0-9_-]{6,}/i
  return pattern.test(trimmed)
    ? { valid: true }
    : { valid: false, message: 'Enter a valid MEGA share link' }
}

/**
 * Upload a file to MEGA via backend function
 * Requires Supabase JWT to be sent to backend for auth/rls
 * @param {File} file
 * @param {(percent:number)=>void} onProgress - optional progress callback 0..100
 * @returns {Promise<{success:boolean, link?:string, message?:string}>}
 */
export async function uploadToMega(file, onProgress) {
  try {
    if (!file) return { success: false, message: 'No file selected' }

    const token = localStorage.getItem('sb-access-token')
    const form = new FormData()
    form.append('file', file)

    const xhr = new XMLHttpRequest()
    const promise = new Promise((resolve) => {
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          onProgress(percent)
        }
      }
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try {
            if (xhr.status >= 200 && xhr.status < 300) {
              const json = JSON.parse(xhr.responseText || '{}')
              if (json.success && json.link) {
                resolve({ success: true, link: json.link })
              } else {
                resolve({ success: false, message: json.message || 'Upload failed' })
              }
            } else {
              resolve({ success: false, message: `Server error ${xhr.status}` })
            }
          } catch (err) {
            resolve({ success: false, message: 'Invalid server response' })
          }
        }
      }
      xhr.open('POST', MEGA_UPLOAD_ENDPOINT, true)
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(form)
    })

    return await promise
  } catch (error) {
    console.error('uploadToMega error:', error)
    return { success: false, message: 'Unexpected error during MEGA upload' }
  }
}

/**
 * QA utilities: fetch documents by source type (github/mega/other)
 * @param {'github'|'mega'|'other'} source
 * @param {object} options
 */
export async function getDocumentsBySource(source, options = {}) {
  let searchExpr
  if (source === 'github') searchExpr = 'https://github.com'
  else if (source === 'mega') searchExpr = 'mega.nz'

  const { page = 1, pageSize = 20 } = options
  const offset = (page - 1) * pageSize

  try {
    let query = supabase
      .from('projects')
      .select('id, title, file_url, created_at, status', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (source === 'other') {
      query = query.not('file_url', 'ilike', `%github.com%`).not('file_url', 'ilike', `%mega.nz%`)
    } else if (searchExpr) {
      query = query.ilike('file_url', `%${searchExpr}%`)
    }

    const { data, error } = await query
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

console.log('📦 supabase3 (MEGA, QA utilities) loaded')

// =========================
// Analytics Helpers
// =========================

/**
 * Increment views counter for a document (projects.views)
 * @param {string} docId
 */
export async function incrementDocumentViews(docId) {
  try {
    if (!docId) return { success: false, message: 'Document ID required' }
    // Prefer RPC for safe increment under RLS
    const rpc = await supabase.rpc('increment_project_views', { doc_id: docId })
    if (!rpc.error) return { success: true, message: 'Views incremented' }

    // Fallback: naive increment (requires permissive policy)
    const { data: row, error: readError } = await supabase
      .from('projects')
      .select('id, views')
      .eq('id', docId)
      .single()
    if (readError || !row) return { success: false, message: readError?.message || 'Document not found' }
    const current = typeof row.views === 'number' ? row.views : 0
    const { error: writeError } = await supabase
      .from('projects')
      .update({ views: current + 1 })
      .eq('id', docId)
    if (writeError) return { success: false, message: writeError.message }
    return { success: true, message: 'Views incremented (fallback)' }
  } catch (e) {
    return { success: false, message: 'Unexpected error incrementing views' }
  }
}

/**
 * Get contributor analytics
 * @param {string} userId
 */
export async function getContributorAnalytics(userId, windowKey = 'all') {
  try {
    if (!userId) return { data: null, error: new Error('User ID required') }
    const start = getTimeWindowStart(windowKey)
    let query = supabase
      .from('projects')
      .select('id, tags, course_id, views, created_at, status, download_count')
      .eq('contributor_id', userId)
    if (start) query = query.gte('created_at', start.toISOString())
    const { data: docs, error } = await query
    if (error) return { data: null, error }

    const total = docs?.length || 0
    const byType = {}
    const byCourse = {}
    let views = 0
    let downloads = 0
    const uploadsOverTime = {}
    for (const d of docs || []) {
      views += d.views || 0
      downloads += d.download_count || 0
      const types = Array.isArray(d.tags) ? d.tags.filter(t => typeof t === 'string') : []
      const matched = types.find(t => ['lecture-notes','past-questions','assignment','project','tutorial','reference','other'].includes(t))
      const key = matched || 'unknown'
      byType[key] = (byType[key] || 0) + 1
      if (d.course_id) byCourse[d.course_id] = (byCourse[d.course_id] || 0) + 1
      const day = (d.created_at || '').slice(0, 10)
      if (day) uploadsOverTime[day] = (uploadsOverTime[day] || 0) + 1
    }

    return { data: { totalUploads: total, totalViews: views, totalDownloads: downloads, byType, byCourse, uploadsOverTime }, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

/**
 * Get admin analytics snapshot
 */
export async function getAdminAnalytics() {
  try {
    const [usersRes, docsRes] = await Promise.all([
      supabase.from('users').select('id, active, role'),
      supabase.from('projects').select('id, status, contributor_id, course_id, tags, created_at, views')
    ])
    if (usersRes.error) return { data: null, error: usersRes.error }
    if (docsRes.error) return { data: null, error: docsRes.error }

    const users = usersRes.data || []
    const docs = docsRes.data || []

    const totalUsers = users.length
    const activeUsers = users.filter(u => u.active === true).length
    const suspendedUsers = users.filter(u => u.active === false).length

    const totalDocs = docs.length
    const statusCounts = { approved: 0, pending: 0, rejected: 0 }
    const uploadsOverTime = {}
    const byType = {}
    const byCourse = {}
    const byContributor = {}
    for (const d of docs) {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1
      const day = (d.created_at || '').slice(0, 10)
      if (day) uploadsOverTime[day] = (uploadsOverTime[day] || 0) + 1
      const types = Array.isArray(d.tags) ? d.tags.filter(t => typeof t === 'string') : []
      const matched = types.find(t => ['lecture-notes','past-questions','assignment','project','tutorial','reference','other'].includes(t))
      const key = matched || 'unknown'
      byType[key] = (byType[key] || 0) + 1
      if (d.course_id) byCourse[d.course_id] = (byCourse[d.course_id] || 0) + 1
      if (d.contributor_id) byContributor[d.contributor_id] = (byContributor[d.contributor_id] || 0) + 1
    }

    // Top lists
    const topContributors = Object.entries(byContributor).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count])=>({ id, count }))
    const popularCourses = Object.entries(byCourse).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,count])=>({ id, count }))

    return {
      data: {
        users: { totalUsers, activeUsers, suspendedUsers },
        documents: { totalDocs, statusCounts, byType, byCourse, uploadsOverTime, topContributors, popularCourses }
      },
      error: null
    }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Admin: Users management
// =========================

export async function getAllUsers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, role, active, onboarding_complete, program_id, university_id')
      .order('created_at', { ascending: false })
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Projects listings (admin/contributor)
// =========================

export async function getAllProjects(filters = {}, options = {}) {
  try {
    const { page = 1, pageSize = 20, orderBy = 'created_at', orderDir = 'desc' } = options
    const offset = (page - 1) * pageSize
    let query = supabase
      .from('projects')
      .select('id, title, contributor_id, status, views, license, created_at, course_id')
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + pageSize - 1)
    if (filters.status) query = query.eq('status', filters.status)
    if (filters.contributor_id) query = query.eq('contributor_id', filters.contributor_id)
    if (filters.course_id) query = query.eq('course_id', filters.course_id)
    if (filters.university_id) {
      // Resolve user IDs by university first (avoids count+join limitations)
      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('id')
        .eq('university_id', filters.university_id)
      if (!uErr && users && users.length > 0) {
        const ids = users.map(u => u.id)
        query = query.in('contributor_id', ids)
      } else {
        // No matching users: short-circuit
        return { data: [], error: null }
      }
    }
    const { data, error } = await query
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getContributorProjects(userId, options = {}) {
  return getAllProjects({ contributor_id: userId }, options)
}

export function getContributorBadges(analytics, config = defaultBadgesConfig) {
  const badges = []
  if (!analytics) return badges
  if ((analytics.totalUploads || 0) >= (config.topUploads || 10)) badges.push('Top Contributor')
  const distinctCourses = Object.keys(analytics.byCourse || {})
  if (distinctCourses.length >= (config.diverseCourses || 3)) badges.push('Diverse Contributor')
  if ((analytics.totalViews || 0) >= (config.popularViews || 500)) badges.push('Popular Contributor')
  return badges
}

// =========================
// Moderation history helpers (admin)
// Table expected: moderation_logs(project_id uuid, actor_id uuid, action text, reason text, created_at timestamptz)
// RLS: only admins can insert/select
// =========================

export async function logModerationAction(projectId, action, reason = null) {
  try {
    if (!projectId || !action) return { success: false, message: 'projectId and action required' }
    const { error } = await supabase
      .from('moderation_logs')
      .insert([{ project_id: projectId, action, reason }])
    if (error) return { success: false, message: error.message }
    return { success: true, message: 'Logged' }
  } catch (err) {
    return { success: false, message: err.message || 'Unexpected error' }
  }
}

export async function getModerationHistory(projectId, limit = 20) {
  try {
    if (!projectId) return { data: null, error: new Error('projectId required') }
    const { data, error } = await supabase
      .from('moderation_logs')
      .select('project_id, action, reason, created_at, actor_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Utility: lookup user by email to filter projects by contributor
export async function getUserByEmail(email) {
  try {
    if (!email) return { data: null, error: new Error('email required') }
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .ilike('email', email)
      .limit(1)
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Aggregated analytics helpers (admin)
// =========================

export async function getProjectStatusCounts(windowKey = 'all') {
  try {
    const start = getTimeWindowStart(windowKey)
    let query = supabase.from('projects').select('status, created_at')
    if (start) query = query.gte('created_at', start.toISOString())
    const { data, error } = await query
    if (error) return { data: null, error }
    const counts = { approved: 0, pending: 0, rejected: 0 }
    for (const r of data || []) counts[r.status] = (counts[r.status] || 0) + 1
    return { data: counts, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getUploadsPerProgram(windowKey = 'all') {
  try {
    const start = getTimeWindowStart(windowKey)
    let query = supabase
      .from('projects')
      .select('course_id, created_at, courses!inner(program_id)')
    if (start) query = query.gte('created_at', start.toISOString())
    const { data, error } = await query
    if (error) return { data: null, error }
    const perProgram = {}
    for (const r of data || []) {
      const pid = r.courses?.program_id
      if (pid) perProgram[pid] = (perProgram[pid] || 0) + 1
    }
    return { data: perProgram, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Aggregated analytics helpers (contributor)
// =========================

export async function getContributorUploadsByCourse(userId, windowKey = 'all') {
  try {
    if (!userId) return { data: null, error: new Error('User ID required') }
    const start = getTimeWindowStart(windowKey)
    let query = supabase
      .from('projects')
      .select('course_id, created_at')
      .eq('contributor_id', userId)
    if (start) query = query.gte('created_at', start.toISOString())
    const { data, error } = await query
    if (error) return { data: null, error }
    const byCourse = {}
    for (const r of data || []) {
      if (r.course_id) byCourse[r.course_id] = (byCourse[r.course_id] || 0) + 1
    }
    return { data: byCourse, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getCourseNames(courseIds = []) {
  try {
    if (!Array.isArray(courseIds) || courseIds.length === 0) return { data: {}, error: null }
    const { data, error } = await supabase
      .from('courses')
      .select('id, code, name')
      .in('id', courseIds)
    if (error) return { data: null, error }
    const map = {}
    for (const c of data || []) map[c.id] = c.code ? `${c.code}` : c.name
    return { data: map, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Fetch all courses minimal for filters (admin)
export async function getAllCoursesMinimal(limit = 1000) {
  try {
    const { data, error } = await supabase
      .from('courses')
      .select('id, code, name')
      .order('code', { ascending: true })
      .limit(limit)
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Admin: Projects count with filters (for pagination)
// =========================

export async function countProjects(filters = {}) {
  try {
    let query = supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })

    if (filters.status) query = query.eq('status', filters.status)
    if (filters.contributor_id) query = query.eq('contributor_id', filters.contributor_id)
    if (filters.course_id) query = query.eq('course_id', filters.course_id)
    if (filters.university_id) {
      const { data: users, error: uErr } = await supabase
        .from('users')
        .select('id')
        .eq('university_id', filters.university_id)
      if (uErr) return { data: null, error: uErr }
      const ids = (users || []).map(u => u.id)
      if (ids.length === 0) return { data: 0, error: null }
      query = query.in('contributor_id', ids)
    }

    const { count, error } = await query
    if (error) return { data: null, error }
    return { data: count || 0, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// Contributor insights: most viewed/downloaded and progression
export function getContributorProgression(analytics, config = defaultBadgesConfig) {
  const remainingUploads = Math.max(0, (config.topUploads || 10) - (analytics.totalUploads || 0))
  const remainingViews = Math.max(0, (config.popularViews || 500) - (analytics.totalViews || 0))
  const distinctCourses = Object.keys(analytics.byCourse || {}).length
  const remainingDiversity = Math.max(0, (config.diverseCourses || 3) - distinctCourses)
  return { remainingUploads, remainingViews, remainingDiversity }
}

export function computeMostViewedAndDownloaded(projects = []) {
  let mostViewed = null
  let mostDownloaded = null
  for (const p of projects) {
    if (!mostViewed || (p.views || 0) > (mostViewed.views || 0)) mostViewed = p
    if (!mostDownloaded || (p.download_count || 0) > (mostDownloaded.download_count || 0)) mostDownloaded = p
  }
  return { mostViewed, mostDownloaded }
}

// =========================
// Public: Community stats for landing page
// =========================

export async function getCommunityStats() {
  try {
    const [pRes, uRes, uniRes] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('universities').select('id', { count: 'exact', head: true }).eq('is_active', true)
    ])
    if (pRes.error) return { data: null, error: pRes.error }
    if (uRes.error) return { data: null, error: uRes.error }
    if (uniRes.error) return { data: null, error: uniRes.error }
    return {
      data: {
        totalProjects: pRes.count || 0,
        totalContributors: uRes.count || 0,
        totalUniversities: uniRes.count || 0
      },
      error: null
    }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Leaderboards
// =========================

export async function getTopContributors(limit = 10, windowKey = '7d') {
  try {
    const start = getTimeWindowStart(windowKey)
    const end = new Date()
    // Prefer SQL RPC
    const rpc = await supabase.rpc('get_top_contributors', {
      p_limit: limit,
      p_start: start ? start.toISOString() : null,
      p_end: end.toISOString()
    })
    if (!rpc.error && Array.isArray(rpc.data)) {
      const mapped = rpc.data.map(r => ({ id: r.user_id, uploads: r.uploads, views: r.views, downloads: r.downloads }))
      return { data: mapped, error: null }
    }

    // Fallback to client-side aggregation
    let query = supabase
      .from('projects')
      .select('contributor_id, views, download_count, created_at')
    if (start) query = query.gte('created_at', start.toISOString())
    const { data, error } = await query
    if (error) return { data: null, error }
    const byUser = {}
    for (const r of data || []) {
      const u = r.contributor_id
      if (!u) continue
      if (!byUser[u]) byUser[u] = { uploads: 0, views: 0, downloads: 0 }
      byUser[u].uploads += 1
      byUser[u].views += r.views || 0
      byUser[u].downloads += r.download_count || 0
    }
    const ranked = Object.entries(byUser).map(([id, v]) => ({ id, ...v }))
      .sort((a,b)=> b.uploads - a.uploads || b.views - a.views || b.downloads - a.downloads)
      .slice(0, limit)
    return { data: ranked, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function getTopProjects(limit = 10, windowKey = '7d') {
  try {
    const start = getTimeWindowStart(windowKey)
    const end = new Date()
    // Prefer SQL RPC
    const rpc = await supabase.rpc('get_top_projects', {
      p_limit: limit,
      p_start: start ? start.toISOString() : null,
      p_end: end.toISOString()
    })
    if (!rpc.error && Array.isArray(rpc.data)) {
      const mapped = rpc.data.map(r => ({ id: r.project_id, title: r.title, views: r.views, download_count: r.downloads, created_at: r.created_at }))
      return { data: mapped, error: null }
    }

    // Fallback
    let query = supabase
      .from('projects')
      .select('id, title, views, download_count, created_at')
    if (start) query = query.gte('created_at', start.toISOString())
    const { data, error } = await query
    if (error) return { data: null, error }
    const ranked = (data||[]).sort((a,b)=> (b.views||0) - (a.views||0) || (b.download_count||0) - (a.download_count||0)).slice(0, limit)
    return { data: ranked, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

// =========================
// Trend helpers via RPC
// =========================
export async function getMetricTrend(metric = 'uploads', windowKey = '7d') {
  try {
    const start = getTimeWindowStart(windowKey)
    const end = new Date()
    const { data, error } = await supabase.rpc('get_metric_trend', {
      p_metric: metric,
      p_start: start ? start.toISOString() : null,
      p_end: end.toISOString()
    })
    if (error) return { data: null, error }
    const row = Array.isArray(data) && data.length ? data[0] : null
    if (!row) return { data: { current_value: 0, previous_value: 0, pct_change: null }, error: null }
    return { data: row, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function updateUserRole(userId, role) {
  try {
    if (!userId || !role) return { data: null, error: new Error('User ID and role required') }
    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', userId)
      .select('id, role')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

export async function updateUserActive(userId, active) {
  try {
    if (!userId || active === undefined) return { data: null, error: new Error('User ID and active required') }
    const { data, error } = await supabase
      .from('users')
      .update({ active })
      .eq('id', userId)
      .select('id, active')
      .single()
    if (error) return { data: null, error }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: err }
  }
}

