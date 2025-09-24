// Global config for thresholds, leaderboards, chart colors/options

export const badgesConfig = {
  topUploads: 10,
  diverseCourses: 3,
  popularViews: 500
}

export const leaderboardConfig = {
  topContributorsLimit: 10,
  mostViewedProjectsLimit: 10
}

export const chartConfig = {
  colors: {
    primary: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    gray: '#94a3b8'
  }
}

export const timeWindows = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  'semester': { label: 'Last 120 days', days: 120 }
}

export function getTimeWindowStart(windowKey = 'all') {
  if (!windowKey || windowKey === 'all') return null
  const conf = timeWindows[windowKey]
  if (!conf) return null
  const d = new Date()
  d.setDate(d.getDate() - (conf.days || 0))
  return d
}

console.log('⚙️ config loaded')

// Standardized time windows for analytics and filtering
export const timeWindows = {
  all: 'all',
  '7d': 7,
  '30d': 30,
  semester: 'semester'
}

export function getTimeWindowStart(windowKey) {
  if (!windowKey || windowKey === 'all') return null
  if (windowKey === 'semester') {
    const now = new Date()
    const month = now.getMonth() // 0-11
    const startMonth = month < 6 ? 0 : 6 // Jan or Jul
    return new Date(now.getFullYear(), startMonth, 1)
  }
  const days = typeof timeWindows[windowKey] === 'number' ? timeWindows[windowKey] : null
  if (!days) return null
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

