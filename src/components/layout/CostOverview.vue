<template>
  <div class="cost-footer" :class="{ 'cost-footer-collapsed': isCollapsed }">

    <!-- Ambient cost readout — passive metric, click opens breakdown -->
    <button
      class="cost-readout"
      :class="{ 'cost-readout-collapsed': isCollapsed }"
      @click="open"
      @mouseenter="showReadoutTooltip($event)"
      @mouseleave="hideTooltip()"
    >
      <!-- $ icon -->
      <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      <template v-if="!isCollapsed">
        <span class="cost-readout-value">{{ data ? fmtCost(total.USD) : '—' }}</span>
        <span class="cost-readout-cur">USD</span>
        <svg class="cost-readout-arrow" style="width:11px;height:11px;margin-left:auto;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
        </svg>
      </template>
    </button>

    <Teleport to="body">
      <div v-if="tooltipVisible" class="cost-nav-tooltip" :style="tooltipStyle">{{ tooltipText }}</div>
    </Teleport>

    <Teleport to="body">
      <div v-if="isOpen" class="cost-modal-backdrop">
        <div class="cost-modal">
          <div class="cost-modal-header">
            <div style="display:flex;align-items:center;gap:0.625rem;">
              <div class="cost-modal-icon">
                <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <span class="cost-modal-title">Cost Overview</span>
              <span class="cost-modal-subtitle">All-time, all chats</span>
            </div>
            <button @click="close" class="cost-modal-close">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div v-if="isLoading" class="cost-modal-loading">
            <svg class="cost-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
            </svg>
            <span>Loading usage data…</span>
          </div>

          <div v-else class="cost-modal-body">
            <div v-if="!providers.length" style="text-align:center;padding:2rem;color:#6B7280;font-size:var(--fs-body);">
              No usage data yet. Send some messages first.
            </div>
            <template v-else>
              <div v-for="prov in providers" :key="prov.label" class="cost-provider-card">
                <div class="cost-provider-header">
                  <span class="cost-provider-name">
                    {{ prov.label }}<template v-if="prov.whisperCalls"> — {{ prov.whisperCalls }} rounds · {{ prov.whisperSecs.toFixed(1) }}s</template>
                  </span>
                </div>
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
                <div class="cost-provider-currency">
                  <span>{{ fmtCost(prov.costs.USD) }} <span class="cost-cur-label">USD</span></span>
                </div>
              </div>

              <div class="cost-total-row">
                <span class="cost-total-label">TOTAL</span>
                <div class="cost-currency-row">
                  <span>{{ fmtCost(total.USD) }} <span class="cost-cur-label">USD</span></span>
                  <span class="cost-sep">/</span>
                  <span>{{ fmtCost(total.CNY, 'CNY') }} <span class="cost-cur-label">CNY</span></span>
                  <span class="cost-sep">/</span>
                  <span>{{ fmtCost(total.SGD, 'SGD') }} <span class="cost-cur-label">SGD</span></span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useConfigStore } from '../../stores/config'
import { useAgentsStore } from '../../stores/agents'
import { resolveModelPrice, convertCurrencies, formatCost } from '../../utils/pricing.js'

const props = defineProps({
  isCollapsed: { type: Boolean, default: false },
})

const configStore = useConfigStore()
const agentsStore = useAgentsStore()

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltipVisible = ref(false)
const tooltipText    = ref('')
const tooltipStyle   = ref({})

function _showTip(text, event) {
  const r = event.currentTarget.getBoundingClientRect()
  tooltipText.value  = text
  tooltipStyle.value = {
    top:       (r.top + r.height / 2) + 'px',
    left:      (r.right + 8) + 'px',
    transform: 'translateY(-50%)',
  }
  tooltipVisible.value = true
}
function showReadoutTooltip(event) {
  // Collapsed: show the number in the tooltip; expanded: show action hint
  const label = props.isCollapsed
    ? (data.value ? `${fmtCost(total.value.USD)} USD` : 'Cost Overview')
    : 'See cost breakdown'
  _showTip(label, event)
}
function hideTooltip() { tooltipVisible.value = false }

// ── Modal state ────────────────────────────────────────────────────────────────
const isOpen    = ref(false)
const isLoading = ref(false)
const data      = ref(null)

function open()  { isOpen.value = true  }
function close() { isOpen.value = false }

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

const USAGE_KEYS = ['inputTokens','outputTokens','cacheCreationTokens','cacheReadTokens','voiceInputTokens','voiceOutputTokens','whisperCalls','whisperSecs','ttsChars']

// ── Data loading ─────────────────────────────────────────────────────────────
// fresh=true: triggered by modal open — clears old data and shows spinner
// fresh=false: silent background load on mount for the ambient readout chip
async function loadUsageData(fresh = true) {
  if (!fresh && data.value) return   // already have data, chip is already showing a number
  if (fresh) { isLoading.value = true; data.value = null }
  try {
    const index  = await window.electronAPI.getChatIndex()
    const provMap = {}

    for (const meta of (index || [])) {
      const chat = await window.electronAPI.getChat(meta.id)
      if (!chat?.usage) continue
      const u = chat.usage
      if (!USAGE_KEYS.some(k => (u[k] || 0) > 0)) continue
      const provider   = chat.provider || 'anthropic'
      const personaId  = (chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds[0] : null) || chat.systemPersonaId
      const personaModel = personaId ? agentsStore.getAgentById(personaId)?.modelId : null
      const model      = chat.model || personaModel

      if ((u.whisperSecs || 0) + (u.whisperCalls || 0) > 0) {
        const vp = _ensureProv(provMap, 'voice')
        _ensureModel(vp, 'whisper-1').usage.whisperCalls += (u.whisperCalls || 0)
        _ensureModel(vp, 'whisper-1').usage.whisperSecs  += (u.whisperSecs  || 0)
      }
      if ((u.ttsChars || 0) > 0) {
        _ensureModel(_ensureProv(provMap, 'voice'), 'tts-1').usage.ttsChars += (u.ttsChars || 0)
      }
      if (model && (u.voiceInputTokens || 0) + (u.voiceOutputTokens || 0) > 0) {
        const vm = _ensureModel(_ensureProv(provMap, 'voice'), 'tts-llm')
        vm.baseModel = model
        vm.usage.voiceInputTokens  += (u.voiceInputTokens  || 0)
        vm.usage.voiceOutputTokens += (u.voiceOutputTokens || 0)
      }
      if (!model) continue

      const VOICE_ONLY = new Set(['whisperCalls','whisperSecs','voiceInputTokens','voiceOutputTokens','ttsChars'])
      const pm = _ensureModel(_ensureProv(provMap, provider, PROVIDER_LABELS[provider] || provider), model)
      for (const key of USAGE_KEYS) {
        if (!VOICE_ONLY.has(key)) pm.usage[key] += (u[key] || 0)
      }
    }

    const pricing      = configStore.config.pricing
    const rates        = pricing?.currencyRates || { USD: 1, CNY: 7.28, SGD: 1.35 }
    const whisperPrice = resolveModelPrice('whisper-1', pricing)
    const M            = 1_000_000

    const resolvedProviders = Object.entries(provMap).map(([, p]) => {
      let provUSD = 0
      const models = Object.entries(p.models).map(([modelId, m]) => {
        const price         = resolveModelPrice(m.baseModel || modelId, pricing)
        const whisperPerSec = whisperPrice?.perSec || 0.0001
        const ttsPrice      = resolveModelPrice('tts-1', pricing)
        const ttsPerChar    = ttsPrice?.perChar || 0.000015
        let usd = 0
        if (price) {
          usd += ((m.usage.inputTokens         || 0) / M) * (price.input      || 0)
          usd += ((m.usage.outputTokens        || 0) / M) * (price.output     || 0)
          usd += ((m.usage.voiceInputTokens    || 0) / M) * (price.input      || 0)
          usd += ((m.usage.voiceOutputTokens   || 0) / M) * (price.output     || 0)
          usd += ((m.usage.cacheCreationTokens || 0) / M) * (price.cacheWrite || 0)
          usd += ((m.usage.cacheReadTokens     || 0) / M) * (price.cacheRead  || 0)
        }
        usd += (m.usage.whisperSecs || 0) * whisperPerSec
        usd += (m.usage.ttsChars   || 0) * ttsPerChar
        provUSD += usd
        return {
          modelId, usage: m.usage, usd, whisperPerSec, ttsPerChar,
          inputPricePerToken:  price ? (price.input  || 0) / M : 0,
          outputPricePerToken: price ? (price.output || 0) / M : 0,
          costs: convertCurrencies(usd, rates),
        }
      }).sort((a, b) => b.usd - a.usd)
      const whisperCalls = models.reduce((s, m) => s + (m.usage.whisperCalls || 0), 0)
      const whisperSecs  = models.reduce((s, m) => s + (m.usage.whisperSecs  || 0), 0)
      return { label: p.label, models, costs: convertCurrencies(provUSD, rates), whisperCalls, whisperSecs }
    })

    const utilityUsage = await window.electronAPI.getUtilityUsage?.()
    if (utilityUsage && (utilityUsage.inputTokens || 0) + (utilityUsage.outputTokens || 0) > 0) {
      const uModel    = utilityUsage.model
      const uPrice    = resolveModelPrice(uModel, pricing)
      const utilUsd   = uPrice ? (((utilityUsage.inputTokens  || 0) / M) * (uPrice.input  || 0) + ((utilityUsage.outputTokens || 0) / M) * (uPrice.output || 0)) : 0
      resolvedProviders.push({
        label: `Utility (${PROVIDER_LABELS[utilityUsage.provider] || utilityUsage.provider || 'Unknown'})`,
        models: [{
          modelId: uModel,
          usage: { inputTokens: utilityUsage.inputTokens || 0, outputTokens: utilityUsage.outputTokens || 0 },
          usd: utilUsd, whisperPerSec: 0, ttsPerChar: 0,
          inputPricePerToken:  uPrice ? (uPrice.input  || 0) / M : 0,
          outputPricePerToken: uPrice ? (uPrice.output || 0) / M : 0,
          costs: convertCurrencies(utilUsd, rates),
        }],
        costs: convertCurrencies(utilUsd, rates),
        whisperCalls: 0, whisperSecs: 0,
      })
    }

    const totalUSD = resolvedProviders.reduce((s, p) => s + p.costs.USD, 0)
    data.value = { providers: resolvedProviders, total: convertCurrencies(totalUSD, rates) }
  } catch (err) {
    console.error('Cost overview error', err)
    data.value = { providers: [], total: { USD: 0, CNY: 0, SGD: 0 } }
  } finally {
    isLoading.value = false
  }
}

// Open modal → fresh load (shows spinner, clears stale data)
watch(isOpen, (v) => { if (v) loadUsageData(true) })

// Mount → silent background load so the ambient chip shows a number immediately
onMounted(() => { loadUsageData(false) })

function _ensureProv(map, key, label) {
  if (!map[key]) map[key] = { label: label || PROVIDER_LABELS[key] || key, models: {} }
  return map[key]
}
function _ensureModel(prov, modelId) {
  if (!prov.models[modelId]) prov.models[modelId] = { usage: Object.fromEntries(USAGE_KEYS.map(k => [k, 0])) }
  return prov.models[modelId]
}

const providers = computed(() => data.value?.providers || [])
const total     = computed(() => data.value?.total     || { USD: 0, CNY: 0, SGD: 0 })
</script>

<style scoped>
.cost-footer {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid #F0F0F0;
}
.cost-footer-collapsed {
  padding: 0.5rem 0.5rem;
}

/* Ambient cost readout chip */
.cost-readout {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}
/* Collapsed: icon only, centered */
.cost-readout-collapsed {
  justify-content: center;
  padding: 0.5rem;
  width: 2.5rem;
}
.cost-readout:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #1A1A1A;
}
.cost-readout:hover .cost-readout-arrow {
  opacity: 1;
}

.cost-readout-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #1A1A1A;
}
.cost-readout-cur {
  font-size: var(--fs-small);
  color: #9CA3AF;
  letter-spacing: 0.04em;
}
.cost-readout-arrow {
  opacity: 0;
  transition: opacity 0.15s ease;
  color: #6B7280;
}
</style>

<style>
/* Tooltip — unscoped, fixed position */
.cost-nav-tooltip {
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

/* Modal — unscoped, teleported to body */
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
.cost-modal-title   { font-family:'Inter',sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#FFFFFF; }
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
.cost-spinner { width:1.25rem; height:1.25rem; animation: costSpin 0.8s linear infinite; }
@keyframes costSpin { to { transform: rotate(360deg); } }
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
.cost-model-row {
  background:#0A0A0A; border:1px solid #1A1A1A; border-radius:0.5rem;
  padding:0.5rem 0.625rem; margin-bottom:0.375rem;
}
.cost-model-row:last-of-type { margin-bottom:0.5rem; }
.cost-model-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.25rem; }
.cost-model-id  { font-family:'JetBrains Mono',monospace; font-size:var(--fs-caption); color:#D1D5DB; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:70%; }
.cost-model-usd { font-family:'JetBrains Mono',monospace; font-size:var(--fs-caption); font-weight:700; color:#34D399; white-space:nowrap; }
.cost-model-detail { display:flex; gap:0.625rem 1rem; flex-wrap:wrap; font-size:var(--fs-small); color:#6B7280; align-items:center; }
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
