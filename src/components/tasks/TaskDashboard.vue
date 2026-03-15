<template>
  <div class="tdb-root">

    <!-- Stats cards -->
    <div class="tdb-stats">
      <div class="tdb-stat-card">
        <div class="tdb-stat-icon tdb-stat-icon--total">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </div>
        <div class="tdb-stat-body">
          <div class="tdb-stat-value">{{ totalRuns }}</div>
          <div class="tdb-stat-label">Total Runs</div>
        </div>
      </div>
      <div class="tdb-stat-card">
        <div class="tdb-stat-icon tdb-stat-icon--scheduled">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="tdb-stat-body">
          <div class="tdb-stat-value">{{ scheduledCount }}</div>
          <div class="tdb-stat-label">Scheduled Ahead</div>
        </div>
      </div>
      <div class="tdb-stat-card">
        <div class="tdb-stat-icon tdb-stat-icon--success">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="tdb-stat-body">
          <div class="tdb-stat-value">{{ successRate }}%</div>
          <div class="tdb-stat-label">Success Rate</div>
        </div>
      </div>
      <div class="tdb-stat-card">
        <div class="tdb-stat-icon tdb-stat-icon--dur">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div class="tdb-stat-body">
          <div class="tdb-stat-value">{{ avgDuration }}</div>
          <div class="tdb-stat-label">Avg Duration</div>
        </div>
      </div>
      <div class="tdb-stat-card">
        <div class="tdb-stat-icon tdb-stat-icon--top">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="tdb-stat-body">
          <div class="tdb-stat-value tdb-stat-value--sm">{{ mostActivePlan || '—' }}</div>
          <div class="tdb-stat-label">Most Active Plan</div>
        </div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="tdb-charts">
      <!-- Donut chart -->
      <div class="tdb-chart-card tdb-chart-card--donut">
        <div class="tdb-chart-title">Status Distribution</div>
        <div class="tdb-donut-wrap">
          <svg class="tdb-donut-svg" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#1E1E1E" stroke-width="18"/>
            <template v-for="seg in donutSegments" :key="seg.status">
              <circle
                cx="60" cy="60" r="46"
                fill="none"
                :stroke="seg.color"
                stroke-width="18"
                stroke-linecap="butt"
                :stroke-dasharray="`${seg.dash} ${seg.gap}`"
                :stroke-dashoffset="seg.offset"
                style="transform:rotate(-90deg);transform-origin:60px 60px"
              />
            </template>
            <text x="60" y="57" text-anchor="middle" fill="#FFFFFF" font-size="18" font-weight="700" font-family="Inter,sans-serif">{{ totalRuns }}</text>
            <text x="60" y="71" text-anchor="middle" fill="#6B7280" font-size="8" font-family="Inter,sans-serif">total runs</text>
          </svg>
          <div class="tdb-donut-legend">
            <div v-for="seg in donutSegments" :key="seg.status" class="tdb-legend-item">
              <span class="tdb-legend-dot" :style="{ background: seg.color }"></span>
              <span class="tdb-legend-label">{{ seg.label }}</span>
              <span class="tdb-legend-count">{{ seg.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bar chart -->
      <div class="tdb-chart-card tdb-chart-card--bar">
        <div class="tdb-chart-title">Runs — Last 14 Days</div>
        <div class="tdb-bar-area">
          <div v-if="barDays.every(d => d.total === 0)" class="tdb-bar-empty">No runs in the last 14 days</div>
          <template v-else>
            <div class="tdb-bar-cols">
              <div v-for="day in barDays" :key="day.date" class="tdb-bar-col">
                <div class="tdb-bar-stack" :title="`${day.label}: ${day.completed} ok, ${day.failed} fail, ${day.skipped} skip`">
                  <div
                    v-if="day.failed"
                    class="tdb-bar-seg tdb-bar-seg--failed"
                    :style="{ flex: day.failed }"
                  ></div>
                  <div
                    v-if="day.skipped"
                    class="tdb-bar-seg tdb-bar-seg--skipped"
                    :style="{ flex: day.skipped }"
                  ></div>
                  <div
                    v-if="day.completed"
                    class="tdb-bar-seg tdb-bar-seg--completed"
                    :style="{ flex: day.completed }"
                  ></div>
                  <div v-if="day.total === 0" class="tdb-bar-empty-col"></div>
                </div>
                <div class="tdb-bar-label">{{ day.label }}</div>
              </div>
            </div>
            <div class="tdb-bar-legend">
              <span class="tdb-bar-legend-item"><span class="tdb-legend-dot" style="background:#10B981"></span>Success</span>
              <span class="tdb-bar-legend-item"><span class="tdb-legend-dot" style="background:#EF4444"></span>Failed</span>
              <span class="tdb-bar-legend-item"><span class="tdb-legend-dot" style="background:#6B7280"></span>Skipped</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Executions table -->
    <div class="tdb-table-card">
      <div class="tdb-table-scroll">
      <div class="tdb-table-header">
        <div class="tdb-table-title">All Executions</div>
        <div class="tdb-table-controls">
          <div class="tdb-search-wrap">
            <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="tdb-search-input" v-model="searchQuery" placeholder="Search plans…" @input="page = 1" />
            <button v-if="searchQuery" class="tdb-search-clear" @click="searchQuery = ''; page = 1">
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="tdb-table-filters">
            <button
              v-for="f in STATUS_FILTERS"
              :key="f.value"
              :class="['tdb-filter-btn', statusFilter === f.value && 'tdb-filter-btn--active']"
              @click="statusFilter = f.value; page = 1"
            >{{ f.label }}</button>
          </div>
        </div>
      </div>

      <div v-if="filteredRuns.length === 0" class="tdb-table-empty">No executions found</div>
      <template v-else>
        <div class="tdb-table-wrap">
          <table class="tdb-table">
            <thead>
              <tr>
                <th class="tdb-th tdb-th--category">Category</th>
                <th class="tdb-th tdb-th--plan">Plan</th>
                <th class="tdb-th tdb-th--trigger">Trigger</th>
                <th class="tdb-th tdb-th--started">Started</th>
                <th class="tdb-th tdb-th--dur">Duration</th>
                <th class="tdb-th tdb-th--steps">{{ t('tasks.step.steps') }}</th>
                <th class="tdb-th tdb-th--status">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in pageRuns"
                :key="row.id"
                class="tdb-row"
                @click="openDetail(row)"
              >
                <td class="tdb-td">
                  <div v-if="row.planCategoryEmoji || row.planCategoryName" class="tdb-cat-cell">
                    <span class="tdb-cat-emoji">{{ row.planCategoryEmoji }}</span>
                    <span class="tdb-cat-name">{{ row.planCategoryName }}</span>
                  </div>
                  <div v-else class="tdb-cat-cell">
                    <span class="tdb-cat-name">Uncategorized</span>
                  </div>
                </td>
                <td class="tdb-td">
                  <div class="tdb-plan-cell">
                    <span class="tdb-plan-icon" :style="{ background: row.planColor }">{{ row.planIcon }}</span>
                    <span class="tdb-plan-name">{{ row.planName }}</span>
                  </div>
                </td>
                <td class="tdb-td">
                  <span :class="['tdb-trigger-badge', `tdb-trigger--${row.triggeredBy}`]">{{ row.triggeredBy === 'schedule' ? t('tasks.scheduled') : t('tasks.manual') }}</span>
                </td>
                <td class="tdb-td tdb-td--mono">{{ fmtDateTime(row.startedAt) }}</td>
                <td class="tdb-td tdb-td--mono">{{ row.duration || '—' }}</td>
                <td class="tdb-td tdb-td--center">{{ row.stepCount ?? '—' }}</td>
                <td class="tdb-td">
                  <span :class="['tdb-status-pill', `tdb-status--${row.status}`]">
                    <svg v-if="row.status==='completed'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else-if="row.status==='error'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <svg v-else-if="row.status==='running'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>
                    <svg v-else style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    {{ STATUS_LABEL[row.status] || row.status }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="tdb-pagination">
          <button class="tdb-page-btn" :disabled="page === 1" @click="page--">
            <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="tdb-page-info">{{ page }} / {{ totalPages }}</span>
          <button class="tdb-page-btn" :disabled="page === totalPages" @click="page++">
            <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </template>
      </div><!-- /tdb-table-scroll -->
    </div>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  runs:     { type: Array, default: () => [] },
  plans:    { type: Array, default: () => [] },
  planColors: { type: Object, default: () => ({}) },
  planCategories: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-run'])

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_FILTERS = computed(() => [
  { value: 'all',       label: t('common.all') },
  { value: 'completed', label: t('tasks.status.completed') },
  { value: 'error',     label: t('tasks.status.error') },
  { value: 'skipped',   label: t('tasks.dashboard.skipped') },
  { value: 'running',   label: t('tasks.status.running') },
])

const STATUS_LABEL = computed(() => ({
  completed: t('tasks.status.completed'),
  error:     t('tasks.status.error'),
  skipped:   t('tasks.dashboard.skipped'),
  running:   t('tasks.status.running'),
}))

const STATUS_COLORS = {
  completed: '#10B981',
  error:     '#EF4444',
  skipped:   '#6B7280',
  running:   '#F59E0B',
}

const PAGE_SIZE = 20

// ── State ─────────────────────────────────────────────────────────────────────

const statusFilter = ref('all')
const searchQuery  = ref('')
const page         = ref(1)

// ── Plan lookup helpers ────────────────────────────────────────────────────────

function planById(id) {
  return props.plans.find(p => p.id === id) || null
}

const planCatMap = computed(() => Object.fromEntries(props.planCategories.map(c => [c.id, c])))

// ── Stats ─────────────────────────────────────────────────────────────────────

const totalRuns = computed(() => props.runs.length)

const successRate = computed(() => {
  const completed = props.runs.filter(r => r.status === 'completed').length
  if (totalRuns.value === 0) return 0
  return Math.round((completed / totalRuns.value) * 100)
})

const avgDuration = computed(() => {
  const durations = props.runs
    .filter(r => r.startedAt && r.completedAt)
    .map(r => new Date(r.completedAt) - new Date(r.startedAt))
    .filter(d => d > 0)
  if (durations.length === 0) return '—'
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length
  return fmtMs(avg)
})

const mostActivePlan = computed(() => {
  if (props.runs.length === 0) return null
  const counts = {}
  for (const r of props.runs) {
    counts[r.planId] = (counts[r.planId] || 0) + 1
  }
  const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
  if (!topId) return null
  const plan = planById(topId)
  const name = plan?.name || topId
  return name.length > 18 ? name.slice(0, 18) + '…' : name
})

// ── Scheduled ahead count ─────────────────────────────────────────────────────
// Cron: count as 1 (recurring). Once: count only if the runAt is in the future.

const scheduledCount = computed(() => {
  const now = new Date()
  let total = 0
  for (const plan of props.plans) {
    const s = plan.schedule
    if (!s || !s.enabled || s.type === 'manual') continue
    if (s.type === 'cron' && s.cron) {
      total += 1 // recurring counts as one planned slot
    } else if (s.type === 'once' && s.runAt) {
      if (new Date(s.runAt) > now) total += 1
    }
  }
  return total
})

// ── Donut chart ───────────────────────────────────────────────────────────────

const CIRCUMFERENCE = Math.round(2 * Math.PI * 46) // ~289

const donutSegments = computed(() => {
  if (totalRuns.value === 0) {
    return [{ status: 'empty', label: 'No runs', color: '#2A2A2A', count: 0, dash: CIRCUMFERENCE, gap: 0, offset: 0 }]
  }

  const order = ['completed', 'error', 'skipped', 'running']
  const counts = {}
  for (const r of props.runs) counts[r.status] = (counts[r.status] || 0) + 1

  const segs = []
  let offset = 0
  for (const st of order) {
    const count = counts[st] || 0
    if (count === 0) continue
    const dash = Math.round((count / totalRuns.value) * CIRCUMFERENCE)
    const gap  = CIRCUMFERENCE - dash
    segs.push({
      status: st,
      label:  STATUS_LABEL[st] || st,
      color:  STATUS_COLORS[st] || '#9CA3AF',
      count,
      dash,
      gap,
      offset: -offset,
    })
    offset += dash
  }
  return segs
})

// ── Bar chart (last 14 days) ───────────────────────────────────────────────────

const barDays = computed(() => {
  const days = []
  const now = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const label = i === 0 ? 'Today' : `${d.getMonth()+1}/${d.getDate()}`
    days.push({ date: key, label, completed: 0, failed: 0, skipped: 0, total: 0 })
  }

  for (const r of props.runs) {
    if (!r.startedAt) continue
    const d = new Date(r.startedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const entry = days.find(x => x.date === key)
    if (!entry) continue
    if (r.status === 'completed') entry.completed++
    else if (r.status === 'error') entry.failed++
    else if (r.status === 'skipped') entry.skipped++
    entry.total++
  }
  return days
})

// ── Table rows ────────────────────────────────────────────────────────────────

const allRows = computed(() => {
  return [...props.runs]
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
    .map(r => {
      const plan = planById(r.planId)
      const category = plan?.categoryId ? planCatMap.value[plan.categoryId] : null
      return {
        id:                  r.id,
        planId:              r.planId,
        planName:            plan?.name || r.planId || '—',
        planIcon:            plan?.icon || '📋',
        planColor:           props.planColors[r.planId] || '#6B7280',
        planCategoryEmoji:   category?.emoji || null,
        planCategoryName:    category?.name || null,
        triggeredBy:         r.triggeredBy || 'manual',
        startedAt:           r.startedAt,
        status:              r.status,
        duration:            fmtMs(r.startedAt && r.completedAt ? new Date(r.completedAt) - new Date(r.startedAt) : null),
        stepCount:           r.stepCount ?? null,
      }
    })
})

const filteredRuns = computed(() => {
  let rows = statusFilter.value === 'all' ? allRows.value : allRows.value.filter(r => r.status === statusFilter.value)
  const q = searchQuery.value.trim().toLowerCase()
  if (q) rows = rows.filter(r => r.planName?.toLowerCase().includes(q))
  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRuns.value.length / PAGE_SIZE)))

const pageRuns = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredRuns.value.slice(start, start + PAGE_SIZE)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms || ms <= 0) return null
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem ? `${m}m ${rem}s` : `${m}m`
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const mo  = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h   = String(d.getHours()).padStart(2, '0')
  const mi  = String(d.getMinutes()).padStart(2, '0')
  const s   = String(d.getSeconds()).padStart(2, '0')
  return `${mo}/${day} ${h}:${mi}:${s}`
}

function openDetail(row) {
  const plan = planById(row.planId)
  if (plan) emit('open-run', { plan, runId: row.id })
}
</script>

<style scoped>
.tdb-root {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
  overflow: hidden;
}

/* ── Stats ───────────────────────────────────────────────────────────────────── */

.tdb-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
  flex-shrink: 0;
}

.tdb-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.tdb-stat-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #FFFFFF;
}
.tdb-stat-icon--total     { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.tdb-stat-icon--scheduled { background: linear-gradient(135deg, #312E81, #6366F1); }
.tdb-stat-icon--success   { background: linear-gradient(135deg, #065F46, #10B981); }
.tdb-stat-icon--dur       { background: linear-gradient(135deg, #1E3A5F, #3B82F6); }
.tdb-stat-icon--top       { background: linear-gradient(135deg, #78350F, #F59E0B); }

.tdb-stat-body {
  min-width: 0;
}
.tdb-stat-value {
  font-size: var(--fs-section);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.02em;
}
.tdb-stat-value--sm {
  font-size: var(--fs-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tdb-stat-label {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin-top: 0.125rem;
}

/* ── Charts ──────────────────────────────────────────────────────────────────── */

.tdb-charts {
  display: grid;
  grid-template-columns: 22rem 1fr;
  gap: 1rem;
  flex-shrink: 0;
}

.tdb-chart-card {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: var(--radius-lg);
  padding: 1.25rem 1.5rem;
}

.tdb-chart-title {
  font-size: var(--fs-caption);
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 1rem;
}

/* Donut */
.tdb-donut-wrap {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.tdb-donut-svg {
  width: 7.5rem;
  height: 7.5rem;
  flex-shrink: 0;
}

.tdb-donut-legend {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tdb-legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--fs-caption);
  color: rgba(255,255,255,0.65);
}

.tdb-legend-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.tdb-legend-label { flex: 1; }
.tdb-legend-count {
  font-weight: 700;
  color: rgba(255,255,255,0.9);
  min-width: 1.5rem;
  text-align: right;
}

/* Bar chart */
.tdb-bar-area {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tdb-bar-empty {
  font-size: var(--fs-caption);
  color: rgba(255,255,255,0.3);
  text-align: center;
  padding: 2rem 0;
}

.tdb-bar-cols {
  display: flex;
  align-items: flex-end;
  gap: 0.3125rem;
  height: 6rem;
}

.tdb-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3125rem;
  height: 100%;
}

.tdb-bar-stack {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 3px;
  overflow: hidden;
  min-height: 2px;
}

.tdb-bar-seg {
  width: 100%;
  min-height: 2px;
}
.tdb-bar-seg--completed { background: #10B981; }
.tdb-bar-seg--failed    { background: #EF4444; }
.tdb-bar-seg--skipped   { background: #4B5563; }
.tdb-bar-empty-col      { flex: 1; background: #1E1E1E; border-radius: 3px; }

.tdb-bar-label {
  font-size: 0.5rem;
  color: rgba(255,255,255,0.3);
  white-space: nowrap;
  flex-shrink: 0;
}

.tdb-bar-legend {
  display: flex;
  gap: 1rem;
}

.tdb-bar-legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.45);
}

/* ── Table ───────────────────────────────────────────────────────────────────── */

.tdb-table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tdb-table-scroll {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
  margin-right: 0.375rem;
}

.tdb-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border-light);
}

.tdb-table-title {
  font-size: var(--fs-body);
  font-weight: 700;
  color: var(--text-primary);
}

.tdb-table-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.tdb-search-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-muted);
}
.tdb-search-input {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-small);
  color: var(--text-primary);
  outline: none;
  width: 10rem;
}
.tdb-search-input::placeholder { color: var(--text-muted); }
.tdb-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-muted);
  line-height: 1;
}
.tdb-search-clear:hover { color: var(--text-primary); }
.tdb-table-filters {
  display: flex;
  gap: 0.375rem;
}

.tdb-filter-btn {
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: transparent;
  font-size: var(--fs-small);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
.tdb-filter-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.tdb-filter-btn--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
}

.tdb-table-empty {
  padding: 2.5rem;
  text-align: center;
  font-size: var(--fs-secondary);
  color: var(--text-muted);
}

.tdb-table-wrap {
  overflow-x: auto;
}

.tdb-table {
  width: 100%;
  border-collapse: collapse;
}

.tdb-th {
  padding: 0.625rem 1rem;
  text-align: left;
  font-size: var(--fs-small);
  font-weight: 600;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
  background: #FAFAFA;
}
.tdb-th--category { width: 10rem; }
.tdb-th--plan    { min-width: 12rem; }
.tdb-th--trigger { width: 7rem; }
.tdb-th--started { width: 9rem; }
.tdb-th--dur     { width: 6rem; }
.tdb-th--steps   { width: 5rem; text-align: center; }
.tdb-th--status  { width: 8rem; }

.tdb-row {
  cursor: pointer;
  transition: background 0.1s ease;
}
.tdb-row:hover { background: var(--bg-hover); }
.tdb-row:not(:last-child) .tdb-td { border-bottom: 1px solid var(--border-light); }

.tdb-td {
  padding: 0.75rem 1rem;
  font-size: var(--fs-secondary);
  color: var(--text-primary);
  vertical-align: middle;
}
.tdb-td--mono   { font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small); color: var(--text-secondary); }
.tdb-td--center { text-align: center; }

.tdb-cat-cell {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.tdb-cat-emoji {
  font-size: var(--fs-body);
  flex-shrink: 0;
}

.tdb-cat-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tdb-plan-cell {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.tdb-plan-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  flex-shrink: 0;
  opacity: 0.85;
}

.tdb-plan-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 14rem;
}

.tdb-trigger-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  font-size: var(--fs-small);
  font-weight: 600;
}
.tdb-trigger--schedule {
  background: rgba(59,130,246,0.12);
  color: #60A5FA;
}
.tdb-trigger--manual {
  background: rgba(156,163,175,0.12);
  color: #9CA3AF;
}

.tdb-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.1875rem 0.625rem;
  border-radius: var(--radius-full);
  font-size: var(--fs-small);
  font-weight: 700;
}
.tdb-status--completed { background: rgba(16,185,129,0.12);  color: #10B981; }
.tdb-status--error     { background: rgba(239,68,68,0.12);   color: #EF4444; }
.tdb-status--skipped   { background: rgba(107,114,128,0.12); color: #9CA3AF; }
.tdb-status--running   { background: rgba(245,158,11,0.12);  color: #F59E0B; }

/* ── Pagination ──────────────────────────────────────────────────────────────── */

.tdb-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.75rem;
  border-top: 1px solid var(--border-light);
}

.tdb-page-btn {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}
.tdb-page-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.tdb-page-btn:disabled { opacity: 0.4; cursor: default; }

.tdb-page-info {
  font-size: var(--fs-small);
  color: var(--text-secondary);
  min-width: 4rem;
  text-align: center;
}
</style>
