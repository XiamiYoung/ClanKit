<template>
  <div class="tca-root" ref="rootEl">

    <!-- Header -->
    <div class="tca-header">
      <div class="tca-nav">
        <button class="tca-nav-btn" @click="navigate(-1)">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="tca-today-btn" @click="goToday">{{ t('tasks.calendar.today') }}</button>
        <button class="tca-nav-btn" @click="navigate(1)">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <h2 class="tca-period-label">{{ periodLabel }}</h2>
      </div>
      <div class="tca-view-tabs">
        <button
          v-for="v in VIEWS"
          :key="v"
          :class="['tca-view-btn', viewMode === v && 'tca-view-btn--active']"
          @click="viewMode = v"
        >{{ v }}</button>
      </div>
    </div>

    <!-- ── Month view ──────────────────────────────────────────────────────── -->
    <template v-if="viewMode === 'Month'">
      <div class="tca-weekday-row">
        <div v-for="d in DAY_ABBR" :key="d" class="tca-weekday-label">{{ d }}</div>
      </div>
      <div class="tca-month-grid">
        <div
          v-for="cell in monthCells"
          :key="cell.key"
          :class="['tca-month-cell', cell.isToday && 'tca-month-cell--today', cell.isOtherMonth && 'tca-month-cell--other']"
          @click="onDayRightClick(cell.date)"
        >
          <div class="tca-cell-daynum">{{ cell.dayNum }}</div>
          <div class="tca-cell-events">
            <div
              v-for="ev in cell.events.slice(0, 3)"
              :key="ev.id"
              :class="['tca-event-pill', `tca-event--${ev.statusClass}`]"
              :style="ev.planColor ? { background: ev.planColor + '22', color: ev.planColor, borderLeft: `3px solid ${ev.planColor}` } : {}"
              @mouseenter="showTooltip($event, ev)"
              @mouseleave="hideTooltip"
              @click.stop="openDetail($event, ev)"
              @contextmenu.prevent.stop="onEventContextMenu($event, ev)"
            >
              <span class="tca-event-icon">{{ ev.planIcon }}</span>
              <span class="tca-event-name">{{ ev.planName }}</span>
              <span class="tca-event-time">{{ ev.timeLabel }}</span>
            </div>
            <div v-if="cell.events.length > 3" class="tca-more-label" @click.stop="openMoreModal(cell)">+{{ cell.events.length - 3 }} more</div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Week view ──────────────────────────────────────────────────────── -->
    <template v-if="viewMode === 'Week'">
      <div class="tca-time-grid">
        <!-- header row -->
        <div class="tca-tg-corner"></div>
        <div
          v-for="day in weekDays"
          :key="day.key"
          :class="['tca-tg-col-header', day.isToday && 'tca-tg-col-header--today']"
        >
          <span class="tca-tg-col-dayname">{{ day.dayName }}</span>
          <span :class="['tca-tg-col-daynum', day.isToday && 'tca-tg-col-daynum--today']">{{ day.dayNum }}</span>
        </div>

        <!-- body: 24 hour rows -->
        <template v-for="h in 24" :key="h">
          <div class="tca-tg-time-label">{{ formatHour(h - 1) }}</div>
          <div
            v-for="day in weekDays"
            :key="day.key + h"
            :class="['tca-tg-slot', day.isToday && 'tca-tg-slot--today', isCurrentHour(day.date, h - 1) && 'tca-tg-slot--current']"
            @click="onSlotRightClick(day.date, h - 1)"
          >
            <div
              v-for="ev in (day.eventsByHour[h - 1] || [])"
              :key="ev.id"
              :class="['tca-tg-event', `tca-event--${ev.statusClass}`]"
              :style="ev.planColor ? { background: ev.planColor + '22', color: ev.planColor } : {}"
              @mouseenter="showTooltip($event, ev)"
              @mouseleave="hideTooltip"
              @click.stop="openDetail($event, ev)"
              @contextmenu.prevent.stop="onEventContextMenu($event, ev)"
            >{{ ev.planIcon }} {{ ev.planName }}</div>
          </div>
        </template>
      </div>
    </template>

    <!-- ── Day view ───────────────────────────────────────────────────────── -->
    <template v-if="viewMode === 'Day'">
      <div class="tca-time-grid tca-time-grid--day">
        <!-- header -->
        <div class="tca-tg-corner"></div>
        <div :class="['tca-tg-col-header', isToday(currentDate) && 'tca-tg-col-header--today']">
          <span class="tca-tg-col-dayname">{{ currentDate.toLocaleDateString(undefined, { weekday: 'long' }) }}</span>
          <span :class="['tca-tg-col-daynum', isToday(currentDate) && 'tca-tg-col-daynum--today']">{{ currentDate.getDate() }}</span>
        </div>

        <!-- 24 hour rows -->
        <template v-for="h in 24" :key="h">
          <div class="tca-tg-time-label">{{ formatHour(h - 1) }}</div>
          <div :class="['tca-tg-slot', isCurrentHour(currentDate, h - 1) && 'tca-tg-slot--current']" @click="onSlotRightClick(currentDate, h - 1)">
            <div
              v-for="ev in (dayEventsByHour[h - 1] || [])"
              :key="ev.id"
              :class="['tca-tg-event', `tca-event--${ev.statusClass}`]"
              :style="ev.planColor ? { background: ev.planColor + '22', color: ev.planColor } : {}"
              @mouseenter="showTooltip($event, ev)"
              @mouseleave="hideTooltip"
              @click.stop="openDetail($event, ev)"
              @contextmenu.prevent.stop="onEventContextMenu($event, ev)"
            >{{ ev.planIcon }} {{ ev.planName }}</div>
          </div>
        </template>
      </div>
    </template>

    <!-- Context menu -->
    <Teleport v-if="contextMenu.visible" to="body">
      <div
        class="tca-ctx-menu"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
        @mousedown.stop
      >
        <button class="tca-ctx-item" @click="viewFromContext">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          View
        </button>
        <button v-if="!contextMenu.event?.isPast" class="tca-ctx-item tca-ctx-item--danger" @click="deleteFromContext">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          Delete Plan
        </button>
      </div>
    </Teleport>

    <!-- Day events modal -->
    <Teleport v-if="moreModal.visible" to="body">
      <div class="tca-more-backdrop">
        <div class="tca-more-modal">
          <div class="tca-more-header">
            <div class="tca-more-header-left">
              <div class="tca-more-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <div class="tca-more-title">{{ moreModal.dateLabel }}</div>
                <div class="tca-more-subtitle">{{ moreModal.events.length }} event{{ moreModal.events.length === 1 ? '' : 's' }}</div>
              </div>
            </div>
            <button class="tca-more-close" @click="moreModal.visible = false">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="tca-more-table-wrap">
            <table class="tca-more-table">
              <thead>
                <tr>
                  <th class="tca-mth tca-mth--plan">Plan</th>
                  <th class="tca-mth tca-mth--time">Time</th>
                  <th class="tca-mth tca-mth--trigger">Trigger</th>
                  <th class="tca-mth tca-mth--dur">Duration</th>
                  <th class="tca-mth tca-mth--status">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="ev in moreModal.events"
                  :key="ev.id"
                  class="tca-mtr tca-mtr--clickable"
                  @click="() => openHistory(ev)"
                >
                  <td class="tca-mtd">
                    <div class="tca-more-plan-cell">
                      <span class="tca-more-plan-icon">{{ ev.planIcon }}</span>
                      <span class="tca-more-plan-name">{{ ev.planName }}</span>
                    </div>
                  </td>
                  <td class="tca-mtd tca-mtd--mono">{{ ev.timeLabel }}</td>
                  <td class="tca-mtd">
                    <span :class="['tca-more-trigger', ev.triggeredBy === 'manual' ? 'tca-more-trigger--manual' : 'tca-more-trigger--schedule']">
                      {{ ev.triggeredBy === 'manual' ? t('tasks.manual') : t('tasks.scheduled') }}
                    </span>
                  </td>
                  <td class="tca-mtd tca-mtd--mono">{{ ev.runDuration || '—' }}</td>
                  <td class="tca-mtd">
                    <span :class="['tca-more-status', `tca-more-status--${ev.statusClass}`]">
                      <svg v-if="ev.statusClass==='completed'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else-if="ev.statusClass==='error'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      <svg v-else-if="ev.statusClass==='running'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>
                      <svg v-else-if="ev.statusClass==='planned'" style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <svg v-else style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      {{ STATUS_LABEL[ev.statusClass] }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Hover Tooltip -->
    <Teleport v-if="tooltip.visible && tooltip.event" to="body">
      <div
        class="tca-tooltip"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
        @mouseenter="keepTooltip"
        @mouseleave="hideTooltip"
      >
        <div class="tca-tt-plan-row">
          <span class="tca-tt-plan">{{ tooltip.event.planName }}</span>
          <span v-if="tooltip.event.triggeredBy === 'manual'" class="tca-tt-trigger">{{ t('tasks.manual') }}</span>
        </div>
        <div class="tca-tt-time">{{ tooltip.event.dateLabel }}</div>
        <div class="tca-tt-divider"></div>
        <!-- Completed -->
        <template v-if="tooltip.event.statusClass === 'completed'">
          <div class="tca-tt-status tca-tt-status--completed">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {{ t('tasks.status.completed') }}
          </div>
          <div v-if="tooltip.event.runDuration" class="tca-tt-meta">{{ tooltip.event.runDuration }}</div>
        </template>
        <!-- Failed -->
        <template v-else-if="tooltip.event.statusClass === 'error'">
          <div class="tca-tt-status tca-tt-status--error">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {{ t('tasks.status.error') }}
          </div>
          <div v-if="tooltip.event.runDuration" class="tca-tt-meta">{{ tooltip.event.runDuration }}</div>
          <div v-if="tooltip.event.runError" class="tca-tt-error">{{ tooltip.event.runError }}</div>
        </template>
        <!-- Running -->
        <template v-else-if="tooltip.event.statusClass === 'running'">
          <div class="tca-tt-status tca-tt-status--running">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Running
          </div>
        </template>
        <!-- Planned (future + enabled) -->
        <template v-else-if="tooltip.event.statusClass === 'planned'">
          <div class="tca-tt-status tca-tt-status--planned">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Planned
          </div>
        </template>
        <!-- Not executed (past, no run) -->
        <template v-else-if="tooltip.event.isPast">
          <div class="tca-tt-status tca-tt-status--not-executed">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Not executed
          </div>
          <div v-if="!tooltip.event.schedEnabled" class="tca-tt-meta">Schedule was disabled</div>
        </template>
        <!-- Future + disabled -->
        <template v-else>
          <div class="tca-tt-status tca-tt-status--not-executed">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Not scheduled
          </div>
          <div class="tca-tt-meta">Schedule is disabled</div>
        </template>
        <div v-if="tooltip.event.scheduleExpr" class="tca-tt-cron">{{ tooltip.event.scheduleExpr }}</div>
      </div>
    </Teleport>


  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  plans: { type: Array, default: () => [] },
  runs:  { type: Array, default: () => [] },   // run index summaries
  planColors: { type: Object, default: () => ({}) }, // planId → color hex
})
const emit = defineEmits(['select-plan', 'new-plan', 'open-history', 'open-plan', 'delete-plan'])

const VIEWS = computed(() => [t('tasks.calendar.month'), t('tasks.calendar.week'), t('tasks.calendar.day')])
const DAY_ABBR = computed(() => [t('tasks.calendar.sunday'), t('tasks.calendar.monday'), t('tasks.calendar.tuesday'), t('tasks.calendar.wednesday'), t('tasks.calendar.thursday'), t('tasks.calendar.friday'), t('tasks.calendar.saturday')])

const STATUS_LABEL = computed(() => ({
  completed:    t('tasks.status.completed'),
  error:       t('tasks.status.error'),
  running:     t('tasks.status.running'),
  planned:     t('tasks.status.planned'),
  'not-executed': t('tasks.status.notExecuted'),
  disabled:    t('tasks.status.disabled'),
}))

const viewMode    = ref('Month')
const currentDate = ref(today())
const rootEl      = ref(null)

const tooltip     = ref({ visible: false, event: null, x: 0, y: 0 })
const moreModal   = ref({ visible: false, dateLabel: '', events: [] })
const contextMenu = ref({ visible: false, x: 0, y: 0, planId: null, planName: '', event: null })
let _hideTimer = null

// ── Date helpers ──────────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function isToday(d) {
  const t = today()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isCurrentHour(date, h) {
  const now = new Date()
  return isToday(date) && now.getHours() === h
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfWeek(d) {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

function formatHour(h) {
  if (h === 0)  return '12am'
  if (h < 12)  return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function formatTime(d) {
  const h = d.getHours()
  const m = d.getMinutes()
  const label = `${formatHour(h)}${m ? `:${String(m).padStart(2, '0')}` : ''}`
  return label
}

function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return null
  const ms = new Date(endIso) - new Date(startIso)
  if (ms < 0) return null
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── Navigation ────────────────────────────────────────────────────────────────

function navigate(delta) {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'Month') d.setMonth(d.getMonth() + delta)
  else if (viewMode.value === 'Week') d.setDate(d.getDate() + delta * 7)
  else d.setDate(d.getDate() + delta)
  currentDate.value = d
}

function goToday() {
  currentDate.value = today()
}

const periodLabel = computed(() => {
  const d = currentDate.value
  if (viewMode.value === 'Month') {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (viewMode.value === 'Week') {
    const ws = startOfWeek(d)
    const we = addDays(ws, 6)
    const sameMonth = ws.getMonth() === we.getMonth()
    if (sameMonth) return `${ws.toLocaleDateString(undefined, { month: 'long' })} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
    return `${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
})

// ── Cron field matcher ────────────────────────────────────────────────────────

function matchField(field, value) {
  if (field === '*') return true
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/')
      const step = parseInt(stepStr)
      if (rangeStr === '*') { if (value % step === 0) return true; continue }
      if (rangeStr.includes('-')) {
        const [lo, hi] = rangeStr.split('-').map(Number)
        if (value >= lo && value <= hi && (value - lo) % step === 0) return true
        continue
      }
    }
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number)
      if (value >= lo && value <= hi) return true
      continue
    }
    if (parseInt(part) === value) return true
  }
  return false
}

function cronOccurrences(cronExpr, rangeStart, rangeEnd) {
  try {
    const parts = cronExpr.trim().split(/\s+/)
    if (parts.length < 5) return []
    const [minF, hourF, domF, monthF, dowF] = parts
    const results = []
    const day = new Date(rangeStart)
    day.setHours(0, 0, 0, 0)

    while (day <= rangeEnd) {
      if (matchField(monthF, day.getMonth() + 1) &&
          matchField(domF,   day.getDate()) &&
          matchField(dowF,   day.getDay())) {
        for (let h = 0; h < 24; h++) {
          if (!matchField(hourF, h)) continue
          for (let m = 0; m < 60; m++) {
            if (!matchField(minF, m)) continue
            const dt = new Date(day)
            dt.setHours(h, m, 0, 0)
            if (dt >= rangeStart && dt <= rangeEnd) results.push(dt)
          }
        }
      }
      day.setDate(day.getDate() + 1)
    }
    return results
  } catch { return [] }
}

// ── View range ────────────────────────────────────────────────────────────────

const viewRange = computed(() => {
  const d = currentDate.value
  if (viewMode.value === 'Month') {
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 41)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  if (viewMode.value === 'Week') {
    const start = startOfWeek(d)
    const end = addDays(start, 7)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }
  // Day
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(d)
  end.setHours(23, 59, 59, 999)
  return { start, end }
})

// ── Event generation ──────────────────────────────────────────────────────────

function findScheduledRun(planId, eventDate) {
  // Match only scheduler-triggered runs within ±30 min of the scheduled time
  const WINDOW = 30 * 60 * 1000
  let best = null
  let bestDiff = Infinity
  for (const run of props.runs) {
    if (run.planId !== planId) continue
    if (run.triggeredBy !== 'schedule') continue   // ignore manual runs
    const diff = Math.abs(new Date(run.startedAt) - eventDate)
    if (diff < WINDOW && diff < bestDiff) { best = run; bestDiff = diff }
  }
  return best
}

function statusClass(status) {
  if (status === 'completed') return 'completed'
  if (status === 'error')     return 'error'
  if (status === 'running')   return 'running'
  if (status === 'skipped')   return 'not-executed'
  return 'not-executed'
}

const allEvents = computed(() => {
  const { start, end } = viewRange.value
  const now = new Date()
  const events = []
  const consumedRunIds = new Set()

  // 1. Scheduled occurrence events (planned + past matched runs)
  for (const plan of props.plans) {
    const sched = plan.schedule
    if (!sched || sched.type === 'manual') continue

    let dates = []
    if (sched.type === 'once' && sched.runAt) {
      const d = new Date(sched.runAt)
      if (d >= start && d <= end) dates = [d]
    } else if (sched.type === 'cron' && sched.cron) {
      dates = cronOccurrences(sched.cron, start, end)
    }

    for (const date of dates) {
      const isPast = date < now
      const run = (isPast && sched.enabled) ? findScheduledRun(plan.id, date) : null
      if (run) consumedRunIds.add(run.id)
      const sc = run            ? statusClass(run.status)
               : isPast         ? 'not-executed'
               : sched.enabled  ? 'planned'
               : 'disabled'

      events.push({
        id:           `${plan.id}-${date.getTime()}`,
        planId:       plan.id,
        planName:     plan.name,
        planIcon:     plan.icon || '📋',
        planColor:    props.planColors[plan.id] || null,
        date,
        isPast,
        schedEnabled: !!sched.enabled,
        timeLabel:    formatTime(date),
        dateLabel:    date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        scheduleExpr: sched.type === 'cron' ? sched.cron : null,
        statusClass:  sc,
        runStatus:    run?.status || null,
        runDuration:  run ? formatDuration(run.startedAt, run.completedAt) : null,
        runError:     run?.error || null,
        triggeredBy:  'schedule',
        runId:        run?.id || null,
      })
    }
  }

  // 2. Actual run events — all runs in the view range not already shown via a scheduled slot
  for (const run of props.runs) {
    if (consumedRunIds.has(run.id)) continue
    if (!run.startedAt) continue
    const runDate = new Date(run.startedAt)
    if (runDate < start || runDate > end) continue

    const plan = props.plans.find(p => p.id === run.planId)
    events.push({
      id:           `run-${run.id}`,
      planId:       run.planId,
      planName:     plan?.name || run.planName || run.planId || '—',
      planIcon:     plan?.icon || '📋',
      planColor:    props.planColors[run.planId] || null,
      date:         runDate,
      isPast:       true,
      schedEnabled: true,
      timeLabel:    formatTime(runDate),
      dateLabel:    runDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      scheduleExpr: null,
      statusClass:  statusClass(run.status),
      runStatus:    run.status,
      runDuration:  formatDuration(run.startedAt, run.completedAt),
      runError:     run.error || null,
      triggeredBy:  run.triggeredBy || 'manual',
      runId:        run.id,
    })
  }

  events.sort((a, b) => a.date - b.date)
  return events
})

// ── Month cells ───────────────────────────────────────────────────────────────

const monthCells = computed(() => {
  const { start } = viewRange.value
  const cells = []
  const monthOf = currentDate.value.getMonth()

  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i)
    const dayEvents = allEvents.value.filter(ev => isSameDay(ev.date, d))
    cells.push({
      key:          d.toISOString(),
      date:         d,
      dayNum:       d.getDate(),
      isToday:      isToday(d),
      isOtherMonth: d.getMonth() !== monthOf,
      events:       dayEvents,
    })
  }
  return cells
})

// ── Week days ─────────────────────────────────────────────────────────────────

const weekDays = computed(() => {
  const ws = startOfWeek(currentDate.value)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i)
    const dayEvts = allEvents.value.filter(ev => isSameDay(ev.date, d))
    const byHour = {}
    for (const ev of dayEvts) {
      const h = ev.date.getHours()
      if (!byHour[h]) byHour[h] = []
      byHour[h].push(ev)
    }
    return {
      key:         d.toISOString(),
      date:        d,
      dayName:     d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNum:      d.getDate(),
      isToday:     isToday(d),
      eventsByHour: byHour,
    }
  })
})

// ── Day events ────────────────────────────────────────────────────────────────

const dayEventsByHour = computed(() => {
  const byHour = {}
  for (const ev of allEvents.value) {
    if (isSameDay(ev.date, currentDate.value)) {
      const h = ev.date.getHours()
      if (!byHour[h]) byHour[h] = []
      byHour[h].push(ev)
    }
  }
  return byHour
})

// ── Tooltip (hover) ───────────────────────────────────────────────────────────

function showTooltip(e, ev) {
  clearTimeout(_hideTimer)
  const rect = e.target.getBoundingClientRect()
  tooltip.value = {
    visible: true,
    event:   ev,
    x:       Math.min(rect.right + 8, window.innerWidth - 240),
    y:       Math.max(rect.top - 8, 8),
  }
}

function keepTooltip() {
  clearTimeout(_hideTimer)
}

function hideTooltip() {
  _hideTimer = setTimeout(() => { tooltip.value.visible = false }, 120)
}

// ── Right-click → new plan with prefilled date ────────────────────────────────

function onDayRightClick(date) {
  emit('new-plan', { date: date.toISOString(), hour: null })
}

function onSlotRightClick(date, hour) {
  emit('new-plan', { date: date.toISOString(), hour })
}

// ── Click dispatch ────────────────────────────────────────────────────────────
// Past events with a run → open execution history
// Future/unexecuted events → open plan detail

function _dispatchEvent(ev) {
  if (ev.runId) {
    emit('open-history', { planId: ev.planId, runId: ev.runId })
  } else {
    emit('open-plan', { planId: ev.planId })
  }
}

function openDetail(e, ev) {
  e.stopPropagation()
  clearTimeout(_hideTimer)
  tooltip.value.visible = false
  _dispatchEvent(ev)
}

function openHistory(ev) {
  moreModal.value.visible = false
  _dispatchEvent(ev)
}

function openMoreModal(cell) {
  moreModal.value = {
    visible:   true,
    dateLabel: cell.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    events:    cell.events,
  }
}

function onEventContextMenu(e, ev) {
  contextMenu.value = {
    visible:  true,
    x:        Math.min(e.clientX, window.innerWidth - 160),
    y:        Math.min(e.clientY, window.innerHeight - 80),
    planId:   ev.planId,
    planName: ev.planName,
    event:    ev,
  }
}

function viewFromContext() {
  const { event } = contextMenu.value
  contextMenu.value.visible = false
  _dispatchEvent(event)
}

function deleteFromContext() {
  const { planId, planName } = contextMenu.value
  contextMenu.value.visible = false
  emit('delete-plan', { planId, planName })
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (moreModal.value.visible) moreModal.value.visible = false
    if (contextMenu.value.visible) contextMenu.value.visible = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('mousedown', closeContextMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousedown', closeContextMenu)
})
</script>

<style scoped>
.tca-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

/* Header */
.tca-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 1rem;
}
.tca-nav { display: flex; align-items: center; gap: 0.375rem; }
.tca-nav-btn {
  width: 1.875rem;
  height: 1.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tca-nav-btn:hover { background: var(--text-primary); color: #FFF; border-color: var(--text-primary); }
.tca-today-btn {
  padding: 0.3125rem 0.75rem;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tca-today-btn:hover { background: var(--text-primary); color: #FFF; border-color: var(--text-primary); }
.tca-period-label {
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0 0.5rem;
  letter-spacing: -0.01em;
}
.tca-view-tabs { display: flex; gap: 0.25rem; }
.tca-view-btn {
  padding: 0.3125rem 0.875rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tca-view-btn:hover { color: var(--text-primary); border-color: var(--text-primary); }
.tca-view-btn--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFF;
}

/* ── Month view ──────────────────────────────────────────────────────────── */
.tca-weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}
.tca-weekday-label {
  padding: 0.375rem 0.5rem;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tca-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  flex: 1;
  overflow: hidden;
}

.tca-month-cell {
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  padding: 0.375rem 0.5rem;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: var(--bg-card);
  transition: background 0.1s ease;
}
.tca-month-cell:hover { background: var(--bg-hover); }
.tca-month-cell--other { background: var(--bg-main); }
.tca-month-cell--today { background: rgba(0, 122, 255, 0.04); }
.tca-month-cell:nth-child(7n) { border-right: none; }

.tca-cell-daynum {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: var(--text-secondary);
  line-height: 1;
  margin-top: 0.375rem;
  margin-left: 0.375rem;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}
.tca-month-cell--today .tca-cell-daynum {
  color: #FFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.tca-month-cell--other .tca-cell-daynum { color: var(--text-muted); opacity: 0.5; }

.tca-cell-events { display: flex; flex-direction: column; gap: 0.1875rem; overflow: hidden; }

.tca-event-pill {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 0.1s ease;
}
.tca-event-pill:hover { opacity: 0.85; }

.tca-event-dot {
  width: 0.4375rem;
  height: 0.4375rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.tca-event-icon { flex-shrink: 0; font-size: 0.75em; }
.tca-event-name { flex: 1; overflow: hidden; text-overflow: ellipsis; }
.tca-event-time { flex-shrink: 0; opacity: 0.7; font-weight: 400; }

.tca-more-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: var(--text-muted);
  padding: 0 0.375rem;
}

/* Event color variants */
.tca-event--disabled {
  background: rgba(55, 65, 81, 0.1);
  color: #374151;
  opacity: 0.5;
}
.tca-event--disabled .tca-event-dot { background: #374151; }

.tca-event--planned {
  background: rgba(96, 165, 250, 0.1);
  color: #3B82F6;
}
.tca-event--planned .tca-event-dot { background: #60A5FA; }

.tca-event--completed {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}
.tca-event--completed .tca-event-dot { background: #10B981; }

.tca-event--error {
  background: rgba(239, 68, 68, 0.1);
  color: #DC2626;
}
.tca-event--error .tca-event-dot { background: #EF4444; }

.tca-event--running {
  background: rgba(245, 158, 11, 0.1);
  color: #D97706;
}
.tca-event--running .tca-event-dot { background: #F59E0B; }

.tca-event--not-executed {
  background: rgba(156, 163, 175, 0.10);
  color: var(--text-muted);
  opacity: 0.65;
}
.tca-event--not-executed .tca-event-dot { background: #9CA3AF; }

/* ── Time grid (Week + Day) ──────────────────────────────────────────────── */
.tca-time-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 3.5rem repeat(7, 1fr);
  grid-template-rows: 2.5rem repeat(24, 3rem);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.tca-time-grid--day {
  grid-template-columns: 3.5rem 1fr;
}

.tca-tg-corner {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border-light);
}

.tca-tg-col-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  padding: 0.375rem;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border-light);
}
.tca-tg-col-header--today {
  background: rgba(0, 122, 255, 0.04);
}

.tca-tg-col-dayname {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tca-tg-col-daynum {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-secondary);
  line-height: 1;
}
.tca-tg-col-daynum--today {
  color: #FFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.tca-tg-time-label {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 0.25rem 0.5rem 0 0;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: var(--text-muted);
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}

.tca-tg-slot {
  padding: 0.125rem 0.25rem;
  border-right: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  transition: background 0.1s ease;
}
.tca-tg-slot:hover { background: var(--bg-hover); }
.tca-tg-slot--today { background: rgba(0, 122, 255, 0.02); }
.tca-tg-slot--current { background: rgba(0, 122, 255, 0.06) !important; }

.tca-tg-event {
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: opacity 0.1s ease;
}
.tca-tg-event:hover { opacity: 0.8; }
</style>

<style>
/* ── Context menu ────────────────────────────────────────────────────────────── */
.tca-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.25rem;
  min-width: 9rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2);
  animation: tcaCtxIn 0.1s ease-out;
}
@keyframes tcaCtxIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.tca-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #E5E7EB;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
  text-align: left;
}
.tca-ctx-item:hover { background: rgba(255,255,255,0.08); color: #FFFFFF; }
.tca-ctx-item--danger { color: #F87171; }
.tca-ctx-item--danger:hover { background: rgba(239,68,68,0.15); color: #FCA5A5; }

/* ── Day events modal ────────────────────────────────────────────────────────── */
.tca-more-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tca-more-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 52rem;
  max-width: calc(100vw - 2rem);
  height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: tcaMoreIn 0.2s ease-out;
}

@keyframes tcaMoreIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.tca-more-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}

.tca-more-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tca-more-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  flex-shrink: 0;
}

.tca-more-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #FFFFFF;
}

.tca-more-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.4);
  margin-top: 0.125rem;
}

.tca-more-close {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.375rem;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s ease;
}
.tca-more-close:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

.tca-more-table-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
  scrollbar-gutter: stable;
}

.tca-more-table {
  width: 100%;
  border-collapse: collapse;
}

.tca-mth {
  padding: 0.5rem 0.875rem;
  text-align: left;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: rgba(255,255,255,0.3);
  background: #0A0A0A;
  border-bottom: 1px solid #1E1E1E;
  white-space: nowrap;
  position: sticky;
  top: 0;
}
.tca-mth--plan    { min-width: 10rem; }
.tca-mth--time    { width: 5rem; }
.tca-mth--trigger { width: 6.5rem; }
.tca-mth--dur     { width: 5rem; }
.tca-mth--status  { width: 7rem; }

.tca-mtr { transition: background 0.1s ease; }
.tca-mtr--clickable { cursor: pointer; }
.tca-mtr--clickable:hover { background: rgba(255,255,255,0.05); }
.tca-mtr:not(:last-child) .tca-mtd { border-bottom: 1px solid #161616; }

.tca-mtd {
  padding: 0.625rem 0.875rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: rgba(255,255,255,0.75);
  vertical-align: middle;
}
.tca-mtd--mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.35);
}

.tca-more-plan-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tca-more-plan-icon { font-size: 0.9rem; flex-shrink: 0; }
.tca-more-plan-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11rem;
  color: #FFFFFF;
}

.tca-more-trigger {
  display: inline-flex;
  padding: 0.125rem 0.4375rem;
  border-radius: 9999px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
}
.tca-more-trigger--manual   { background: rgba(156,163,175,0.12); color: rgba(255,255,255,0.4); }
.tca-more-trigger--schedule { background: rgba(59,130,246,0.12);  color: #60A5FA; }

.tca-more-status {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
}
.tca-more-status--completed    { background: rgba(16,185,129,0.15);  color: #34D399; }
.tca-more-status--error        { background: rgba(239,68,68,0.15);   color: #F87171; }
.tca-more-status--running      { background: rgba(245,158,11,0.15);  color: #FCD34D; }
.tca-more-status--planned      { background: rgba(96,165,250,0.15);  color: #93C5FD; }
.tca-more-status--not-executed { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.4); }
.tca-more-status--disabled     { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }

/* Tooltip — unscoped (teleported to body) */
.tca-tooltip {
  position: fixed;
  z-index: 9999;
  min-width: 13rem;
  max-width: 18rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  padding: 0.75rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  pointer-events: none;
  animation: tcaTtIn 0.12s ease-out;
}
@keyframes tcaTtIn {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.tca-tt-plan-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.tca-tt-plan {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.tca-tt-trigger {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.125rem 0.4375rem;
  border-radius: 9999px;
  background: rgba(156,163,175,0.15);
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}
.tca-tt-time {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.45);
}
.tca-tt-divider {
  height: 1px;
  background: #1E1E1E;
  margin: 0.25rem 0;
}
.tca-tt-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  align-self: flex-start;
}
.tca-tt-status--completed    { background: rgba(16,185,129,0.15);  color: #34D399; }
.tca-tt-status--error        { background: rgba(239,68,68,0.15);   color: #F87171; }
.tca-tt-status--running      { background: rgba(245,158,11,0.15);  color: #FCD34D; }
.tca-tt-status--planned      { background: rgba(96,165,250,0.15);  color: #93C5FD; }
.tca-tt-status--not-executed { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.45); }
.tca-tt-meta {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.4);
}
.tca-tt-meta--upcoming { color: #60A5FA; }
.tca-tt-error {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(239,68,68,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tca-tt-cron {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.25);
  margin-top: 0.125rem;
}

</style>
