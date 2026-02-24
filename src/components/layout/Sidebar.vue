<template>
  <nav
    class="flex flex-col shrink-0"
    style="width: 260px; min-width: 260px; background: #FFFFFF; height: 100%; overflow: hidden; position: relative; z-index: 10; border-right: 1px solid #E5E5EA;"
    aria-label="Main navigation"
  >
    <!-- Logo / Header -->
    <div class="px-5 py-5" style="border-bottom: 1px solid #F0F0F0;">
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style="background: #1A1A1A;"
        >
          <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <span style="font-family:'Inter','Figtree',system-ui,sans-serif; font-size:var(--fs-subtitle); font-weight:700; color:#1A1A1A; letter-spacing:-0.02em;">
          SparkAI
        </span>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto" style="scrollbar-width:thin;">
      <p class="nav-section-label">AI Agent</p>
      <NavItem to="/chats"    :icon="IconChats"    label="Chats"    />
      <NavItem to="/skills"   :icon="IconSkills"   label="Skills"   />
      <NavItem to="/mcp"      :icon="IconMcp"      label="MCP Servers" />
      <NavItem to="/tools"    :icon="IconTools"    label="Tools" />
      <NavItem to="/personas" :icon="IconPersonas" label="Personas" />

      <p class="nav-section-label" style="margin-top:12px;">Workspace</p>
      <NavItem to="/notes"     :icon="IconNotes"     label="Notes" />

      <p class="nav-section-label" style="margin-top:12px;">System</p>
      <NavItem to="/config" :icon="IconConfig" label="Configuration" />
    </div>

    <!-- Footer -->
    <div class="px-3 py-3" style="border-top: 1px solid #F0F0F0;">
      <div
        class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors duration-150"
        style="color: #6B7280;"
        @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
        @mouseleave="e => e.currentTarget.style.background='transparent'"
      >
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-semibold"
          style="background: #1A1A1A;"
        >S</div>
        <div class="flex-1 min-w-0">
          <p style="font-size:var(--fs-secondary);font-weight:600;color:#1A1A1A;font-family:'Inter',sans-serif;">SparkAI</p>
          <p style="font-size:var(--fs-caption);color:#9CA3AF;font-family:'Inter',sans-serif;">AI Desktop</p>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { defineComponent, h } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

// ── SVG Icon Components ──────────────────────────────────────────────────────
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
  props: { to: String, label: String, icon: Object },
  setup(props) {
    return () => {
      const isActive = route.path === props.to || route.path.startsWith(props.to + '/')
      return h(RouterLink, {
        to: props.to,
        class: [
          'nav-item',
          isActive ? 'nav-item-active' : 'nav-item-inactive'
        ],
        'aria-current': isActive ? 'page' : undefined,
      }, () => [
        h(props.icon, { style: 'width:18px;height:18px;flex-shrink:0;' }),
        h('span', { style: 'font-size:var(--fs-secondary);font-weight:500;' }, props.label)
      ])
    }
  }
})
</script>

<style scoped>
.nav-section-label {
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  padding: 10px 12px 4px;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 1px;
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
  background: #F5F5F5;
  color: #1A1A1A;
}

@media (prefers-reduced-motion: reduce) {
  .nav-item {
    transition: none;
  }
}
</style>
