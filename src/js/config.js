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

// Single source of truth for time windows
export const timeWindows = {
  '7d': { label: 'Last 7 days', days: 7 },
  '30d': { label: 'Last 30 days', days: 30 },
  '90d': { label: 'Last 90 days', days: 90 }
}

// Helper to compute the start date for a given window key
export function getTimeWindowStart(windowKey) {
  if (!windowKey) return null
  const conf = timeWindows[windowKey]
  if (!conf) return null
  const d = new Date()
  d.setDate(d.getDate() - (conf.days || 0))
  return d
}

console.log('⚙️ config loaded')

// Academic semester ranges (Ghanaian calendar)
// First Semester: Aug 1 – Dec 31 (current year)
// Second Semester: Jan 1 – May 31 (current year)
export function getSemesterRange(date = new Date()) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1 // 1..12
  if (month >= 8 && month <= 12) {
    return {
      label: `First Semester ${year}/${year + 1}`,
      start: new Date(year, 7, 1), // Aug 1
      end: new Date(year, 11, 31)  // Dec 31
    }
  } else {
    return {
      label: `Second Semester ${year}`,
      start: new Date(year, 0, 1), // Jan 1
      end: new Date(year, 4, 31)   // May 31
    }
  }
}
