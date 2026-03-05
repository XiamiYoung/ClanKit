<template>
  <nav
    class="flex flex-col shrink-0"
    :style="{ width: isCollapsed ? '4rem' : '12.5rem', minWidth: isCollapsed ? '4rem' : '12.5rem', background: '#FFFFFF', height: '100%', overflow: 'hidden', position: 'relative', zIndex: 10, borderRight: '1px solid #E5E5EA', transition: 'width 0.2s ease, min-width 0.2s ease' }"
    aria-label="Main navigation"
  >
    <!-- Logo / Header -->
    <div :style="{ padding: isCollapsed ? '1rem 0' : '1rem 1.25rem', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }">
      <img
        src="/icon.png"
        alt="SparkAI"
        :class="isCollapsed ? 'w-7 h-7 rounded-md' : 'w-9 h-9 rounded-xl'"
        style="object-fit:contain;flex-shrink:0;"
      />
      <span v-show="!isCollapsed" style="font-family:'Inter','Figtree',system-ui,sans-serif; font-size:var(--fs-subtitle); font-weight:700; color:#1A1A1A; letter-spacing:-0.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-left:0.625rem;">
        SparkAI
      </span>
    </div>

    <!-- Voice call indicator -->
    <div v-if="voiceStore.isCallActive" class="sidebar-call-indicator" @click="goToCall" :title="isCollapsed ? 'On a call — click to return' : ''">
      <div class="sidebar-call-dot"></div>
      <span v-show="!isCollapsed" class="sidebar-call-text">On a call</span>
      <span v-show="!isCollapsed" class="sidebar-call-name">{{ voiceStore.activePersonaName }}</span>
    </div>

    <!-- Navigation -->
    <div class="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto" style="scrollbar-width:thin;">
      <div style="display:flex;align-items:center;justify-content:space-between;min-height:1.5rem;">
        <p class="nav-section-label" v-show="!isCollapsed" style="margin:0;">AI Agent</p>
        <button @click="toggleCollapse" class="nav-collapse-btn" :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" style="flex-shrink:0;">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
      </div>
      <NavItem to="/chats"    :icon="IconChats"    label="Chats"    :isCollapsed="isCollapsed" />
      <NavItem to="/tools"    :icon="IconTools"    label="Tools"    :isCollapsed="isCollapsed" />
      <NavItem to="/skills"   :icon="IconSkills"   label="Skills"   :isCollapsed="isCollapsed" />
      <NavItem to="/mcp"      :icon="IconMcp"      label="MCP Servers" :isCollapsed="isCollapsed" />
      <NavItem to="/knowledge" :icon="IconKnowledge" label="Knowledge" :isCollapsed="isCollapsed" />
      <NavItem to="/personas" :icon="IconPersonas" label="Personas" :isCollapsed="isCollapsed" />
      <p class="nav-section-label" v-show="!isCollapsed" style="margin-top:0.75rem;">Workspace</p>
      <NavItem to="/news"     :icon="IconNews"     label="News"     :isCollapsed="isCollapsed" />
      <NavItem to="/notes"     :icon="IconNotes"     label="Documents"  :isCollapsed="isCollapsed" />

      <p class="nav-section-label" v-show="!isCollapsed" style="margin-top:0.75rem;">System</p>
      <NavItem to="/config" :icon="IconConfig" label="Configuration" :isCollapsed="isCollapsed" />

      <!-- Cost Overview button -->
      <button
        @click="showCostOverview = true"
        class="cost-overview-btn"
        :class="{ collapsed: isCollapsed }"
        :title="isCollapsed ? 'Cost Overview' : ''"
      >
        <svg style="width:18px;height:18px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
        <span v-show="!isCollapsed" class="cost-overview-label">Cost Overview</span>
      </button>

    </div>

    <!-- ── Cost Overview Modal ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showCostOverview" class="cost-modal-backdrop" @click.self="showCostOverview = false">
        <div class="cost-modal">
          <div class="cost-modal-header">
            <div style="display:flex;align-items:center;gap:0.625rem;">
              <div class="cost-modal-icon">
                <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <span class="cost-modal-title">Cost Overview</span>
              <span class="cost-modal-subtitle">All-time, all chats</span>
            </div>
            <button @click="showCostOverview = false" class="cost-modal-close">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div v-if="isLoadingOverview" class="cost-modal-loading">
            <svg class="cost-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span>Loading usage data…</span>
          </div>

          <div v-else class="cost-modal-body">
            <div v-if="!overviewProviders.length" style="text-align:center;padding:2rem;color:#6B7280;font-size:var(--fs-body);">
              No usage data yet. Send some messages first.
            </div>
            <template v-else>
              <div v-for="prov in overviewProviders" :key="prov.name" class="cost-provider-card">
                <div class="cost-provider-header">
                  <span class="cost-provider-name">{{ prov.label }}</span>
                  <span class="cost-provider-total">{{ fmtCost(prov.costs.USD, 'USD') }}</span>
                </div>
                <div class="cost-provider-detail">
                  <span>Input: {{ (prov.usage.inputTokens || 0).toLocaleString() }} tok</span>
                  <span>Output: {{ (prov.usage.outputTokens || 0).toLocaleString() }} tok</span>
                  <span v-if="prov.usage.cacheReadTokens">Cache hits: {{ (prov.usage.cacheReadTokens || 0).toLocaleString() }}</span>
                  <span v-if="prov.usage.whisperCalls">Whisper: {{ prov.usage.whisperCalls }} calls</span>
                </div>
                <div class="cost-currency-row">
                  <span>{{ fmtCost(prov.costs.USD, 'USD') }}</span>
                  <span style="color:#4B5563;">/</span>
                  <span>{{ fmtCost(prov.costs.CNY, 'CNY') }}</span>
                  <span style="color:#4B5563;">/</span>
                  <span>{{ fmtCost(prov.costs.SGD, 'SGD') }}</span>
                </div>
              </div>

              <div class="cost-total-row">
                <span class="cost-total-label">TOTAL</span>
                <div class="cost-currency-row" style="font-weight:700;">
                  <span>{{ fmtCost(overviewTotal.USD, 'USD') }}</span>
                  <span style="color:#4B5563;">/</span>
                  <span>{{ fmtCost(overviewTotal.CNY, 'CNY') }}</span>
                  <span style="color:#4B5563;">/</span>
                  <span>{{ fmtCost(overviewTotal.SGD, 'SGD') }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </nav>
</template>

<script setup>
import { defineComponent, h, ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useVoiceStore } from '../../stores/voice'
import { useConfigStore } from '../../stores/config'
import { resolveModelPrice, calcCostUSD, convertCurrencies, formatCost } from '../../utils/pricing.js'

const route = useRoute()
const router = useRouter()
const voiceStore = useVoiceStore()
const configStore = useConfigStore()

// ── Cost Overview ────────────────────────────────────────────────────────────
const showCostOverview  = ref(false)
const isLoadingOverview = ref(false)
const overviewData      = ref(null)

// Alias to avoid name collision with any local variable
const fmtCost = formatCost

const PROVIDER_LABELS = {
  anthropic:  'Anthropic',
  openrouter: 'OpenRouter',
  openai:     'OpenAI',
  deepseek:   'DeepSeek',
  voice:      'Voice (Whisper/TTS)',
}

watch(showCostOverview, async (open) => {
  if (!open) return
  isLoadingOverview.value = true
  overviewData.value = null
  try {
    const index = await window.electronAPI.getChatIndex()
    const provMap = {}

    for (const meta of (index || [])) {
      const chat = await window.electronAPI.getChat(meta.id)
      if (!chat?.usage) continue
      const u        = chat.usage
      const provider = chat.provider || 'anthropic'
      const model    = chat.model    || ''

      if (!provMap[provider]) {
        provMap[provider] = {
          label: PROVIDER_LABELS[provider] || provider,
          usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, voiceInputTokens: 0, voiceOutputTokens: 0, whisperCalls: 0, whisperSecs: 0 },
          modelsUsed: new Set(),
        }
      }
      const p = provMap[provider]
      for (const key of Object.keys(p.usage)) {
        p.usage[key] = (p.usage[key] || 0) + (u[key] || 0)
      }
      if (model) p.modelsUsed.add(model)
    }

    const pricing = configStore.config.pricing
    const rates   = pricing?.currencyRates || { USD: 1, CNY: 7.28, SGD: 1.35 }

    const providers = Object.entries(provMap).map(([, p]) => {
      let totalUSD = 0
      const prices = [...p.modelsUsed].map(m => resolveModelPrice(m, pricing)).filter(Boolean)
      if (prices.length > 0) {
        const avgPrice = {
          input:      prices.reduce((s, x) => s + (x.input || 0), 0)      / prices.length,
          output:     prices.reduce((s, x) => s + (x.output || 0), 0)     / prices.length,
          cacheWrite: prices.reduce((s, x) => s + (x.cacheWrite || 0), 0) / prices.length,
          cacheRead:  prices.reduce((s, x) => s + (x.cacheRead || 0), 0)  / prices.length,
          perSec:     prices.reduce((s, x) => s + (x.perSec || 0), 0)     / prices.length,
        }
        totalUSD = calcCostUSD(p.usage, avgPrice)
      }
      return { name: p.label, label: p.label, usage: p.usage, costs: convertCurrencies(totalUSD, rates) }
    })

    const totalUSD = providers.reduce((s, p) => s + p.costs.USD, 0)
    overviewData.value = { providers, total: convertCurrencies(totalUSD, rates) }
  } catch (err) {
    console.error('Cost overview error', err)
    overviewData.value = { providers: [], total: { USD: 0, CNY: 0, SGD: 0 } }
  } finally {
    isLoadingOverview.value = false
  }
})

const overviewProviders = computed(() => overviewData.value?.providers || [])
const overviewTotal     = computed(() => overviewData.value?.total     || { USD: 0, CNY: 0, SGD: 0 })

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
        'aria-current': isActive ? 'page' : undefined,
      }, () => children)
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
  padding: 0.625rem 0.75rem 0.25rem;
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
  background: #F5F5F5;
  color: #1A1A1A;
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

.cost-overview-btn {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: none;
  border: none;
  cursor: pointer;
  width: 100%;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  transition: all 0.15s ease;
  margin-top: 0.25rem;
  text-align: left;
}
.cost-overview-btn:hover { background: #F5F5F5; color: #1A1A1A; }
.cost-overview-btn.collapsed { justify-content: center; padding: 0.5rem; }
.cost-overview-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>

<style>
/* Cost Overview modal — unscoped (teleported to body) */
.cost-modal-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
}
.cost-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 32rem; max-width: 90vw; max-height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: costModalIn 0.15s ease-out;
}
@keyframes costModalIn {
  from { opacity: 0; transform: scale(0.96) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
.cost-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1rem 0.75rem;
  border-bottom: 1px solid #1F1F1F;
}
.cost-modal-icon {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center;
  color: #FFFFFF; flex-shrink: 0;
}
.cost-modal-title   { font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); font-weight:700; color:#FFFFFF; }
.cost-modal-subtitle{ font-size:var(--fs-caption); color:#6B7280; margin-left:0.25rem; }
.cost-modal-close {
  width:2rem; height:2rem; border-radius:0.5rem; background:none; border:none;
  cursor:pointer; display:flex; align-items:center; justify-content:center; color:#6B7280;
  transition: background 0.15s;
}
.cost-modal-close:hover { background:#1A1A1A; color:#FFFFFF; }
.cost-modal-loading {
  display:flex; align-items:center; justify-content:center; gap:0.75rem;
  padding:3rem; color:#6B7280; font-size:var(--fs-body);
}
.cost-spinner { width:1.25rem; height:1.25rem; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cost-modal-body {
  flex:1; overflow-y:auto; padding:1rem;
  display:flex; flex-direction:column; gap:0.75rem;
  scrollbar-width:thin;
}
.cost-modal-body::-webkit-scrollbar { width: 6px; }
.cost-modal-body::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
.cost-provider-card {
  background:#141414; border:1px solid #1F1F1F; border-radius:0.75rem; padding:0.75rem 1rem;
}
.cost-provider-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.375rem; }
.cost-provider-name  { font-size:var(--fs-secondary); font-weight:600; color:#FFFFFF; }
.cost-provider-total { font-size:var(--fs-secondary); font-weight:700; color:#34D399; font-family:'JetBrains Mono',monospace; }
.cost-provider-detail{ display:flex; gap:1rem; flex-wrap:wrap; font-size:var(--fs-caption); color:#6B7280; margin-bottom:0.375rem; }
.cost-currency-row   { display:flex; gap:0.5rem; align-items:center; font-size:var(--fs-caption); color:#9CA3AF; font-family:'JetBrains Mono',monospace; }
.cost-total-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:0.75rem 1rem; background:#1A1A1A; border-radius:0.75rem;
  border:1px solid #2A2A2A;
}
.cost-total-label { font-size:var(--fs-secondary); font-weight:700; color:#FFFFFF; letter-spacing:0.06em; }
</style>
