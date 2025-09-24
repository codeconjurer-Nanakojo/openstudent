// charts.js - lightweight Chart.js loader and shared configs

export async function loadChartJs() {
  if (window.Chart) return window.Chart
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return window.Chart
}

export const chartColors = {
  primary: '#2563eb',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  gray: '#94a3b8'
}

export const defaultOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, position: 'bottom' } },
  scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 6 } }, y: { beginAtZero: true } }
}

export function renderPie(ctx, labels, data, colors = []) {
  const Chart = window.Chart
  if (!Chart) return null
  return new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: colors.length ? colors : [chartColors.primary, chartColors.success, chartColors.warning, chartColors.error, chartColors.gray] }] },
    options: defaultOptions
  })
}

export function renderBar(ctx, labels, data, label = 'Count') {
  const Chart = window.Chart
  if (!Chart) return null
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: chartColors.primary }] },
    options: defaultOptions
  })
}

export function renderLine(ctx, labels, data, label = 'Views') {
  const Chart = window.Chart
  if (!Chart) return null
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: chartColors.primary, backgroundColor: 'rgba(37,99,235,0.2)', fill: true, tension: 0.3 }] },
    options: defaultOptions
  })
}

console.log('📊 charts module ready')

// ==============================
// Trend indicator helpers
// ==============================
export function formatTrend(pctChange) {
  if (pctChange === null || pctChange === undefined || isNaN(pctChange)) {
    return { text: '—', icon: '', color: chartColors.gray, direction: 'flat' }
  }
  const pct = Number(pctChange)
  const up = pct > 0
  const down = pct < 0
  const icon = up ? '↑' : (down ? '↓' : '→')
  const color = up ? chartColors.success : (down ? chartColors.error : chartColors.gray)
  const text = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`
  const direction = up ? 'up' : (down ? 'down' : 'flat')
  return { text, icon, color, direction }
}

export function renderTrendBadge(containerEl, pctChange) {
  if (!containerEl) return
  const t = formatTrend(pctChange)
  containerEl.innerHTML = `<span class="badge" style="background:${t.color}22; color:${t.color}; border:1px solid ${t.color}55;">${t.icon} ${t.text}</span>`
}

