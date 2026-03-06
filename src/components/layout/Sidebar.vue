<template>
  <nav
    class="flex flex-col shrink-0"
    :style="{ width: isCollapsed ? '4rem' : '12.5rem', minWidth: isCollapsed ? '4rem' : '12.5rem', background: '#FFFFFF', height: '100%', overflow: 'hidden', position: 'relative', zIndex: 10, borderRight: '1px solid #E5E5EA', transition: 'width 0.2s ease, min-width 0.2s ease' }"
    aria-label="Main navigation"
  >
    <!-- Logo / Header -->
    <div :style="{ padding: isCollapsed ? '1.25rem 0' : '1.25rem 1.25rem', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }">
      <img
        src="/icon.png"
        alt="ClankAI"
        :class="isCollapsed ? 'w-8 h-8 rounded-lg' : 'w-11 h-11 rounded-xl'"
        style="object-fit:contain;flex-shrink:0;"
      />
      <span v-show="!isCollapsed" style="font-family:'Inter','Figtree',system-ui,sans-serif; font-size:1.5rem; font-weight:800; color:#1A1A1A; letter-spacing:-0.03em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-left:0.75rem;">
        ClankAI
      </span>
    </div>

    <!-- Voice call indicator -->
    <div v-if="voiceStore.isCallActive" class="sidebar-call-indicator" @click="goToCall" :title="isCollapsed ? 'On a call — click to return' : ''">
      <div class="sidebar-call-dot"></div>
      <span v-show="!isCollapsed" class="sidebar-call-text">On a call</span>
      <span v-show="!isCollapsed" class="sidebar-call-name">{{ voiceStore.activePersonaName }}</span>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-3 flex flex-col overflow-y-auto" style="scrollbar-width:thin;gap:0.125rem;">

      <!-- ── AI Agent ── -->
      <div class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header">
          <span class="nav-section-label" v-show="!isCollapsed">AI Agent</span>
          <button @click="toggleCollapse" class="nav-collapse-btn" :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
        </div>
        <NavItem to="/chats"     :icon="IconChats"     label="Chats"       :isCollapsed="isCollapsed" />
        <NavItem to="/tools"     :icon="IconTools"     label="Tools"       :isCollapsed="isCollapsed" />
        <NavItem to="/skills"    :icon="IconSkills"    label="Skills"      :isCollapsed="isCollapsed" />
        <NavItem to="/mcp"       :icon="IconMcp"       label="MCP Servers" :isCollapsed="isCollapsed" />
        <NavItem to="/knowledge" :icon="IconKnowledge" label="Knowledge"   :isCollapsed="isCollapsed" />
        <NavItem to="/personas"  :icon="IconPersonas"  label="Personas"    :isCollapsed="isCollapsed" />
      </div>

      <!-- ── Workspace ── -->
      <div class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header" v-show="!isCollapsed">
          <span class="nav-section-label">Workspace</span>
        </div>
        <NavItem to="/news"  :icon="IconNews"  label="News"      :isCollapsed="isCollapsed" />
        <NavItem to="/notes" :icon="IconNotes" label="Documents" :isCollapsed="isCollapsed" />
      </div>

      <!-- ── System ── -->
      <div class="nav-section" :class="{ collapsed: isCollapsed }">
        <div class="nav-section-header" v-show="!isCollapsed">
          <span class="nav-section-label">System</span>
        </div>
        <NavItem to="/config" :icon="IconConfig" label="Configuration" :isCollapsed="isCollapsed" />
      </div>

    </div>

    <!-- ── Nav tooltip ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="navTooltipVisible" class="nav-tooltip-fixed" :style="navTooltipStyle">
        {{ navTooltipText }}
      </div>
    </Teleport>

    <!-- ── Cost Overview (bottom of sidebar) ──────────────────────────── -->
    <CostOverview :isCollapsed="isCollapsed" />
  </nav>
</template>

<script setup>
import { defineComponent, h, ref, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useVoiceStore } from '../../stores/voice'
import CostOverview from './CostOverview.vue'

const route = useRoute()
const router = useRouter()
const voiceStore = useVoiceStore()

// ── Nav tooltip (position:fixed so it escapes overflow:hidden ancestors) ─────
const navTooltipVisible = ref(false)
const navTooltipText    = ref('')
const navTooltipStyle   = ref({})

function showNavTooltip(label, event) {
  const r = event.currentTarget.getBoundingClientRect()
  navTooltipText.value  = label
  navTooltipStyle.value = {
    top:       (r.top + r.height / 2) + 'px',
    left:      (r.right + 8) + 'px',
    transform: 'translateY(-50%)',
  }
  navTooltipVisible.value = true
}
function hideNavTooltip() {
  navTooltipVisible.value = false
}


const isCollapsed = ref(false)
const userOverride = ref(null) // null = auto mode, true/false = user locked

function applyAutoCollapse() {
  if (userOverride.value !== null) return
  isCollapsed.value = window.innerWidth < 1920
}

function onResize() {
  if (userOverride.value === null) {
    isCollapsed.value = window.innerWidth < 1920
  }
}

onMounted(() => {
  applyAutoCollapse()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})

function goToCall() {
  voiceStore.setPip(false)
  router.push('/chats')
}
function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
  userOverride.value = isCollapsed.value
}

// ── SVG Icon Components ──────────────────────────────────────────────────────
const IconNews = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2' }),
    h('line', { x1: '10', y1: '6', x2: '18', y2: '6' }),
    h('line', { x1: '10', y1: '10', x2: '18', y2: '10' }),
    h('line', { x1: '10', y1: '14', x2: '14', y2: '14' })
  ])
})

const IconChats = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ])
})

const IconPersonas = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
    h('circle', { cx: '12', cy: '7', r: '4' })
  ])
})

const IconSkills = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ])
})

const IconKnowledge = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }),
    h('path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' })
  ])
})

const IconMcp = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' }),
    h('circle', { cx: '12', cy: '12', r: '3' })
  ])
})

const IconNotes = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
    h('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' })
  ])
})

const IconTools = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' })
  ])
})

const IconConfig = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
  ])
})

// ── NavItem Component ────────────────────────────────────────────────────────
const NavItem = defineComponent({
  props: { to: String, label: String, icon: Object, isCollapsed: { type: Boolean, default: false } },
  setup(props) {
    return () => {
      const isActive = route.path === props.to || route.path.startsWith(props.to + '/')
      const children = [
        h(props.icon, { style: 'width:18px;height:18px;flex-shrink:0;' })
      ]
      if (!props.isCollapsed) {
        children.push(h('span', { style: 'font-size:var(--fs-secondary);font-weight:500;' }, props.label))
      }
      return h(RouterLink, {
        to: props.to,
        class: [
          'nav-item',
          isActive ? 'nav-item-active' : 'nav-item-inactive'
        ],
        style: props.isCollapsed ? 'justify-content:center;' : '',
        onMouseenter: props.isCollapsed ? (e) => showNavTooltip(props.label, e) : undefined,
        onMouseleave: props.isCollapsed ? () => hideNavTooltip() : undefined,
        'aria-current': isActive ? 'page' : undefined,
      }, () => children)
    }
  }
})
</script>

<style scoped>
.nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}

/* Spacing between sections when expanded — no divider */
.nav-section + .nav-section {
  margin-top: 0.375rem;
}

/* Divider between sections when collapsed */
.nav-section.collapsed + .nav-section.collapsed {
  margin-top: 0.375rem;
  padding-top: 0.375rem;
  border-top: 1px solid #F0F0F0;
}

.nav-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
  padding: 0 0.25rem;
}

.nav-section-label {
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  padding: 0.5rem 0.5rem 0.25rem;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5625rem 0.75rem;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 0.0625rem;
  text-decoration: none;
  font-family: 'Inter', sans-serif;
}

.nav-item-active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

.nav-item-inactive {
  color: #6B7280;
}

.nav-item-inactive:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}

.nav-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: background 0.15s, color 0.15s;
}
.nav-collapse-btn:hover {
  background: #F5F5F5;
  color: #1A1A1A;
}

/* ── Voice call indicator ─────────────────────────────────────────────── */
.sidebar-call-indicator {
  display: flex; align-items: center; gap: 0.5rem;
  margin: 0.5rem 0.75rem 0; padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.625rem; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: all 0.15s ease;
  animation: sidebarCallPulse 2s ease-in-out infinite;
}
.sidebar-call-indicator:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.sidebar-call-dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%;
  background: #10B981; flex-shrink: 0;
  box-shadow: 0 0 6px rgba(16,185,129,0.5);
  animation: dotPulse 1.5s ease-in-out infinite;
}
.sidebar-call-text {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 600; color: #FFFFFF; white-space: nowrap;
}
.sidebar-call-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.6); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
@keyframes dotPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
@keyframes sidebarCallPulse {
  0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  50% { box-shadow: 0 2px 12px rgba(16,185,129,0.15), 0 2px 8px rgba(0,0,0,0.12); }
}

@media (prefers-reduced-motion: reduce) {
  .nav-item {
    transition: none;
  }
  .sidebar-call-indicator, .sidebar-call-dot { animation: none; }
}

</style>

<style>
/* Nav tooltip — fixed position, escapes all overflow:hidden ancestors */
.nav-tooltip-fixed {
  position: fixed;
  z-index: 99999;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  padding: 0.3125rem 0.625rem;
  border-radius: 0.375rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  pointer-events: none;
}

</style>
