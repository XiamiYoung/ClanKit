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
        <!-- Cost Overview button -->
        <button
          @click="showCostOverview = true"
          class="cost-overview-btn"
          :class="{ collapsed: isCollapsed }"
          @mouseenter="isCollapsed ? showNavTooltip('Cost Overview', $event) : undefined"
          @mouseleave="isCollapsed ? hideNavTooltip() : undefined"
        >
          <svg style="width:18px;height:18px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <span v-show="!isCollapsed" class="cost-overview-label">Cost Overview</span>
        </button>
      </div>

    </div>

    <!-- ── Nav tooltip ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="navTooltipVisible" class="nav-tooltip-fixed" :style="navTooltipStyle">
        {{ navTooltipText }}
      </div>
    </Teleport>

    <!-- ── Cost Overview Modal ─────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showCostOverview" class="cost-modal-backdrop" @click.self.stop>
        <div class="cost-modal" @click.stop>
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
              <div v-for="prov in overviewProviders" :key="prov.label" class="cost-provider-card">
                <!-- Provider header -->
                <div class="cost-provider-header">
                  <span class="cost-provider-name">
                    {{ prov.label }}<template v-if="prov.whisperCalls"> — {{ prov.whisperCalls }} rounds · {{ prov.whisperSecs.toFixed(1) }}s</template>
                  </span>
                </div>
                <!-- Per-model rows -->
                <div v-for="m in prov.models" :key="m.modelId" class="cost-model-row">
                  <div class="cost-model-top">
                    <span class="cost-model-id">{{ MODEL_DISPLAY_NAMES[m.modelId] || m.modelId }}</span>
                    <span class="cost-model-usd">{{ fmtCost(m.usd) }}</span>
                  </div>
                  <div class="cost-model-detail">
                    <template v-if="m.usage.whisperSecs">
                      <span>{{ m.usage.whisperSecs.toFixed(1) }}s × {{ fmtCost(m.whisperPerSec) }}</span>
                    </template>
                    <template v-else-if="m.usage.ttsChars">
                      <span>{{ fmtTokens(m.usage.ttsChars) }} chars × {{ fmtCost(m.ttsPerChar) }}</span>
                    </template>
                    <template v-else>
                      <span v-if="m.usage.inputTokens">In {{ fmtTokens(m.usage.inputTokens) }}<template v-if="m.inputPricePerToken"> × {{ fmtCost(m.inputPricePerToken) }} = {{ fmtCost(m.usage.inputTokens * m.inputPricePerToken) }}</template></span>
                      <span v-if="m.usage.outputTokens">Out {{ fmtTokens(m.usage.outputTokens) }}<template v-if="m.outputPricePerToken"> × {{ fmtCost(m.outputPricePerToken) }} = {{ fmtCost(m.usage.outputTokens * m.outputPricePerToken) }}</template></span>
                      <span v-if="m.usage.voiceInputTokens">In(v) {{ fmtTokens(m.usage.voiceInputTokens) }}<template v-if="m.inputPricePerToken"> × {{ fmtCost(m.inputPricePerToken) }} = {{ fmtCost(m.usage.voiceInputTokens * m.inputPricePerToken) }}</template></span>
                      <span v-if="m.usage.voiceOutputTokens">Out(v) {{ fmtTokens(m.usage.voiceOutputTokens) }}<template v-if="m.outputPricePerToken"> × {{ fmtCost(m.outputPricePerToken) }} = {{ fmtCost(m.usage.voiceOutputTokens * m.outputPricePerToken) }}</template></span>
                      <span v-if="m.usage.cacheCreationTokens">Cache write {{ fmtTokens(m.usage.cacheCreationTokens) }}</span>
                      <span v-if="m.usage.cacheReadTokens">Cache read {{ fmtTokens(m.usage.cacheReadTokens) }}</span>
                    </template>
                  </div>
                </div>
                <!-- Provider total currency row -->
                <div class="cost-provider-currency">
                  <span>{{ fmtCost(prov.costs.USD) }} <span class="cost-cur-label">USD</span></span>
                </div>
              </div>

              <div class="cost-total-row">
                <span class="cost-total-label">TOTAL</span>
                <div class="cost-currency-row">
                  <span>{{ fmtCost(overviewTotal.USD) }} <span class="cost-cur-label">USD</span></span>
                  <span class="cost-sep">/</span>
                  <span>{{ fmtCost(overviewTotal.CNY, 'CNY') }} <span class="cost-cur-label">CNY</span></span>
                  <span class="cost-sep">/</span>
                  <span>{{ fmtCost(overviewTotal.SGD, 'SGD') }} <span class="cost-cur-label">SGD</span></span>
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
import { usePersonasStore } from '../../stores/personas'
import { resolveModelPrice, calcCostUSD, convertCurrencies, formatCost } from '../../utils/pricing.js'

const route = useRoute()
const router = useRouter()
const voiceStore = useVoiceStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()

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

// ── Cost Overview ────────────────────────────────────────────────────────────
const showCostOverview  = ref(false)
const isLoadingOverview = ref(false)
const overviewData      = ref(null)

// Alias to avoid name collision with any local variable
const fmtCost = formatCost

function fmtTokens(n) {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + 'k'
  return String(n)
}

const MODEL_DISPLAY_NAMES = {
  'whisper-1': 'STT (Speech To Text)',
  'tts-1':     'TTS (Text To Speech)',
  'tts-1-hd':  'TTS HD (Text To Speech)',
  'tts-llm':   'TTS Voice LLM',
}

const PROVIDER_LABELS = {
  anthropic:  'Anthropic',
  openrouter: 'OpenRouter',
  openai:     'OpenAI',
  deepseek:   'DeepSeek',
  voice:      'Voice (Whisper)',
}

watch(showCostOverview, async (open) => {
  if (!open) return
  isLoadingOverview.value = true
  overviewData.value = null
  try {
    const index = await window.electronAPI.getChatIndex()
    const provMap = {}
    const USAGE_KEYS = ['inputTokens','outputTokens','cacheCreationTokens','cacheReadTokens','voiceInputTokens','voiceOutputTokens','whisperCalls','whisperSecs','ttsChars']

    for (const meta of (index || [])) {
      const chat = await window.electronAPI.getChat(meta.id)
      if (!chat?.usage) continue
      const u        = chat.usage
      // Skip chats with no actual token usage (empty object or all-zero fields)
      if (!USAGE_KEYS.some(k => (u[k] || 0) > 0)) continue
      const provider = chat.provider || 'anthropic'
      // Resolve model: chat.model (set by accumulateUsage) → persona modelId → skip
      const personaId = (chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds[0] : null)
        || chat.systemPersonaId
      const personaModel = personaId ? personasStore.getPersonaById(personaId)?.modelId : null
      const model = chat.model || personaModel
      // Always route STT (Whisper) into the standalone Voice bucket
      if ((u.whisperSecs || 0) + (u.whisperCalls || 0) > 0) {
        const vProv = 'voice', vModel = 'whisper-1'
        if (!provMap[vProv]) provMap[vProv] = { label: PROVIDER_LABELS[vProv] || 'Voice (Whisper)', models: {} }
        const vp = provMap[vProv]
        if (!vp.models[vModel]) vp.models[vModel] = { usage: Object.fromEntries(USAGE_KEYS.map(k => [k, 0])) }
        vp.models[vModel].usage.whisperCalls += (u.whisperCalls || 0)
        vp.models[vModel].usage.whisperSecs  += (u.whisperSecs  || 0)
      }
      // Route TTS chars to Voice bucket (priced per char via tts-1/tts-1-hd)
      if ((u.ttsChars || 0) > 0) {
        const vProv = 'voice'
        if (!provMap[vProv]) provMap[vProv] = { label: PROVIDER_LABELS[vProv] || 'Voice (Whisper)', models: {} }
        const ttsModel = 'tts-1'
        const vp = provMap[vProv]
        if (!vp.models[ttsModel]) vp.models[ttsModel] = { usage: Object.fromEntries(USAGE_KEYS.map(k => [k, 0])) }
        vp.models[ttsModel].usage.ttsChars += (u.ttsChars || 0)
      }

      // Route voice LLM tokens to Voice bucket, tagged with base model for pricing
      if (model && (u.voiceInputTokens || 0) + (u.voiceOutputTokens || 0) > 0) {
        const vProv = 'voice'
        if (!provMap[vProv]) provMap[vProv] = { label: PROVIDER_LABELS[vProv] || 'Voice (Whisper)', models: {} }
        const vp = provMap[vProv]
        if (!vp.models['tts-llm']) vp.models['tts-llm'] = { usage: Object.fromEntries(USAGE_KEYS.map(k => [k, 0])), baseModel: model }
        vp.models['tts-llm'].usage.voiceInputTokens  += (u.voiceInputTokens  || 0)
        vp.models['tts-llm'].usage.voiceOutputTokens += (u.voiceOutputTokens || 0)
      }

      if (!model) continue

      if (!provMap[provider]) provMap[provider] = { label: PROVIDER_LABELS[provider] || provider, models: {} }
      const p = provMap[provider]
      if (!p.models[model]) p.models[model] = { usage: Object.fromEntries(USAGE_KEYS.map(k => [k, 0])) }
      // Accumulate LLM keys only — whisper, voice tokens and ttsChars go to Voice bucket
      const VOICE_ONLY = new Set(['whisperCalls','whisperSecs','voiceInputTokens','voiceOutputTokens','ttsChars'])
      for (const key of USAGE_KEYS) {
        if (!VOICE_ONLY.has(key)) p.models[model].usage[key] += (u[key] || 0)
      }
    }

    const pricing      = configStore.config.pricing
    const rates        = pricing?.currencyRates || { USD: 1, CNY: 7.28, SGD: 1.35 }
    const whisperPrice = resolveModelPrice('whisper-1', pricing)
    const M            = 1_000_000

    const providers = Object.entries(provMap).map(([, p]) => {
      let provUSD = 0
      const models = Object.entries(p.models).map(([modelId, m]) => {
        const price = resolveModelPrice(m.baseModel || modelId, pricing)
        let llmUsd = 0
        if (price) {
          llmUsd += ((m.usage.inputTokens         || 0) / M) * (price.input      || 0)
          llmUsd += ((m.usage.outputTokens        || 0) / M) * (price.output     || 0)
          llmUsd += ((m.usage.voiceInputTokens    || 0) / M) * (price.input      || 0)
          llmUsd += ((m.usage.voiceOutputTokens   || 0) / M) * (price.output     || 0)
          llmUsd += ((m.usage.cacheCreationTokens || 0) / M) * (price.cacheWrite || 0)
          llmUsd += ((m.usage.cacheReadTokens     || 0) / M) * (price.cacheRead  || 0)
        }
        const whisperPerSec = whisperPrice?.perSec || 0.0001
        const whisperUsd    = (m.usage.whisperSecs || 0) * whisperPerSec
        const ttsPrice      = resolveModelPrice('tts-1', pricing)
        const ttsPerChar    = ttsPrice?.perChar || 0.000015
        const ttsUsd        = (m.usage.ttsChars || 0) * ttsPerChar
        const usd = llmUsd + whisperUsd + ttsUsd
        provUSD += usd
        const inputPricePerToken  = price ? (price.input  || 0) / M : 0
        const outputPricePerToken = price ? (price.output || 0) / M : 0
        return { modelId, usage: m.usage, usd, llmUsd, whisperUsd, ttsUsd, whisperPerSec, ttsPerChar, inputPricePerToken, outputPricePerToken, costs: convertCurrencies(usd, rates) }
      }).sort((a, b) => b.usd - a.usd)
      const whisperCalls = models.reduce((s, m) => s + (m.usage.whisperCalls || 0), 0)
      const whisperSecs  = models.reduce((s, m) => s + (m.usage.whisperSecs  || 0), 0)
      return { label: p.label, models, costs: convertCurrencies(provUSD, rates), whisperCalls, whisperSecs }
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
  width: 52rem; max-width: 94vw; max-height: 88vh;
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
.cost-provider-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; }
.cost-provider-name  { font-size:var(--fs-secondary); font-weight:700; color:#FFFFFF; }
.cost-provider-total { font-size:var(--fs-secondary); font-weight:700; color:#34D399; font-family:'JetBrains Mono',monospace; }

/* Per-model rows */
.cost-model-row {
  background:#0A0A0A; border:1px solid #1A1A1A; border-radius:0.5rem;
  padding:0.5rem 0.625rem; margin-bottom:0.375rem;
}
.cost-model-row:last-of-type { margin-bottom:0.5rem; }
.cost-model-top {
  display:flex; justify-content:space-between; align-items:baseline;
  margin-bottom:0.25rem;
}
.cost-model-id  { font-family:'JetBrains Mono',monospace; font-size:var(--fs-caption); color:#D1D5DB; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%; }
.cost-model-usd { font-family:'JetBrains Mono',monospace; font-size:var(--fs-caption); font-weight:700; color:#34D399; white-space:nowrap; }
.cost-model-calls  { font-size:var(--fs-small); color:#9CA3AF; margin-bottom:0.25rem; }
.cost-model-detail { display:flex; gap:0.625rem 1rem; flex-wrap:wrap; font-size:var(--fs-small); color:#6B7280; align-items:center; }
.cost-model-multicur { font-family:'JetBrains Mono',monospace; color:#6B7280; white-space:nowrap; }

/* Provider-level currency footer */
.cost-provider-currency {
  display:flex; gap:0.375rem; align-items:center; flex-wrap:wrap; justify-content:flex-end;
  font-size:var(--fs-caption); font-family:'JetBrains Mono',monospace; color:#34D399;
  padding-top:0.5rem; border-top:1px solid #1F1F1F; margin-top:0.125rem;
}
.cost-cur-label { font-size:0.85em; }
.cost-sep { color:#4B5563; }

.cost-currency-row { display:flex; gap:0.5rem; align-items:center; font-size:var(--fs-caption); color:#34D399; font-family:'JetBrains Mono',monospace; }
.cost-total-row {
  display:flex; justify-content:space-between; align-items:center;
  padding:0.75rem 1rem; background:#1A1A1A; border-radius:0.75rem;
  border:1px solid #2A2A2A;
}
.cost-total-label { font-size:var(--fs-secondary); font-weight:700; color:#FFFFFF; letter-spacing:0.06em; }
</style>
