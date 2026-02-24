<template>
  <nav
    class="flex flex-col shrink-0"
    style="width: 270px; min-width: 270px; background: #0F172A; height: 100%; overflow: hidden; position: relative; z-index: 10; transition: min-width 200ms ease, width 200ms ease;"
    aria-label="Main navigation"
  >
    <!-- Logo / Header -->
    <div class="px-6 py-5" style="border-bottom: 1px solid rgba(255,255,255,0.08);">
      <div class="flex items-center gap-2.5">
        <div
          class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style="background: #3B82F6;"
        >
          <svg style="width:20px;height:20px;color:#fff;" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        </div>
        <span style="font-family:'Figtree',system-ui,sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#fff; letter-spacing:-0.01em;">
          SparkAI
        </span>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-4 flex flex-col gap-0">
      <p class="nav-section-label">AI Agent</p>
      <NavItem to="/chats"    :icon="IconChats"    label="Chats"    />
      <NavItem to="/skills"   :icon="IconSkills"   label="Skills"   />
      <NavItem to="/mcp"      :icon="IconMcp"      label="MCP Servers" />
      <NavItem to="/tools"    :icon="IconTools"    label="Tools" />
      <NavItem to="/personas" :icon="IconPersonas" label="Personas" />

      <p class="nav-section-label">Workspace</p>
      <NavItem to="/notes"     :icon="IconNotes"     label="Notes" />

      <p class="nav-section-label" style="margin-top:16px;">System</p>
      <NavItem to="/config" :icon="IconConfig" label="Configuration" />
    </div>

    <!-- Footer -->
    <div class="px-3 py-4" style="border-top: 1px solid rgba(255,255,255,0.08);">
      <div
        class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors duration-150"
        style="color: rgba(255,255,255,0.6);"
        @mouseenter="e => e.currentTarget.style.background='rgba(255,255,255,0.06)'"
        @mouseleave="e => e.currentTarget.style.background='transparent'"
      >
        <div
          class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-sm font-semibold"
          style="background: #3B82F6;"
        >M</div>
        <div class="flex-1 min-w-0">
          <p style="font-size:var(--fs-body);font-weight:500;color:#fff;font-family:'Noto Sans',sans-serif;">SparkAI</p>
          <p style="font-size:var(--fs-secondary);color:rgba(255,255,255,0.45);font-family:'Noto Sans',sans-serif;">AI Desktop</p>
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
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ])
})

const IconPersonas = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
    h('circle', { cx: '12', cy: '7', r: '4' })
  ])
})

const IconSkills = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ])
})

const IconMcp = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83' }),
    h('circle', { cx: '12', cy: '12', r: '3' })
  ])
})

const IconNotes = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' }),
    h('path', { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' })
  ])
})

const IconTools = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' })
  ])
})

const IconConfig = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14' }),
    h('path', { d: 'M12 2v2M12 20v2M2 12h2M20 12h2' })
  ])
})

// ── NavItem Component ────────────────────────────────────────────────────────
const NavItem = defineComponent({
  props: { to: String, label: String, icon: Object },
  setup(props) {
    return () => {
      const isActive = route.path === props.to || route.path.startsWith(props.to + '/')
      const baseStyle = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;cursor:pointer;transition:all 0.15s;margin-bottom:2px;text-decoration:none;font-family:Noto Sans,sans-serif;'
      const activeStyle = 'background:#3B82F6;color:#fff;'
      const inactiveStyle = 'color:rgba(255,255,255,0.6);'
      return h(RouterLink, {
        to: props.to,
        style: baseStyle + (isActive ? activeStyle : inactiveStyle),
        'aria-current': isActive ? 'page' : undefined,
        onMouseenter: isActive ? undefined : (e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.color = '#fff'
        },
        onMouseleave: isActive ? undefined : (e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
        },
      }, () => [
        h(props.icon, { style: 'width:20px;height:20px;flex-shrink:0;' }),
        h('span', { style: 'font-size:var(--fs-subtitle);font-weight:500;' }, props.label)
      ])
    }
  }
})
</script>

<style scoped>
.nav-section-label {
  font-size: var(--fs-secondary);
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.35);
  padding: 6px 12px 4px;
  font-family: 'Noto Sans', sans-serif;
}
</style>
