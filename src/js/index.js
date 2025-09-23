import { supabase } from '/src/js/supabase.js'
import { getProfile } from '/src/js/supabase.js'
import { getCommunityStats } from '/src/js/supabase3.js'

const ctaAuth = document.getElementById('cta-auth')
const ctaDashboard = document.getElementById('cta-dashboard')
const ctaContribute = document.getElementById('cta-contribute')
const navDashboard = document.getElementById('nav-dashboard')
const navContribute = document.getElementById('nav-contribute')
const statProjects = document.getElementById('stat-projects')
const statContributors = document.getElementById('stat-contributors')
const statUniversities = document.getElementById('stat-universities')

async function setupAuthAwareUI() {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Fetch role to decide dashboard route
      const prof = await getProfile()
      const role = prof?.profile?.role
      const dashboardHref = role === 'admin' ? '/admin.html' : '/profile.html'
      if (ctaDashboard) { ctaDashboard.href = dashboardHref; ctaDashboard.style.display = 'inline-block' }
      if (navDashboard) navDashboard.href = dashboardHref
      if (ctaAuth) ctaAuth.style.display = 'none'
      if (navContribute) navContribute.href = '/upload.html'
      if (ctaContribute) ctaContribute.href = '/upload.html'
    } else {
      // Not logged in: redirect contribute to login
      if (ctaDashboard) ctaDashboard.style.display = 'none'
      const toLogin = (e) => { e.preventDefault(); window.location.href = '/login.html' }
      if (navContribute) navContribute.addEventListener('click', toLogin)
      if (ctaContribute) ctaContribute.addEventListener('click', toLogin)
    }
  } catch (_) { /* noop */ }
}

async function loadCommunityStats() {
  const res = await getCommunityStats()
  if (!res.error && res.data) {
    if (statProjects) statProjects.textContent = String(res.data.totalProjects)
    if (statContributors) statContributors.textContent = String(res.data.totalContributors)
    if (statUniversities) statUniversities.textContent = String(res.data.totalUniversities)
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await setupAuthAwareUI()
  await loadCommunityStats()
})


