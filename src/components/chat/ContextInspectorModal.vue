<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background:rgba(0,0,0,0.3);"
  >
    <div
      class="relative flex flex-col rounded-2xl overflow-hidden"
      style="background:#FFFFFF; border:1px solid #E5E5EA; border-radius:16px; width:80vw; max-height:85vh; box-shadow:0 8px 32px rgba(0,0,0,0.12);"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-3 shrink-0" style="border-bottom:1px solid #E5E5EA;">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="font-semibold" style="font-family:'Inter',sans-serif; color:#1A1A1A; font-size:var(--fs-subtitle);">{{ t('chats.contextInspector') }}</span>
          <span
            v-if="activeChatModel"
            class="px-1.5 py-0.5 rounded-full"
            style="background:#F5F5F5; color:#6B7280; font-size:var(--fs-small);"
          >{{ activeChatModel }}</span>
        </div>
        <button
          @click="$emit('close')"
          class="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
          style="color:#9CA3AF;"
          @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
          @mouseleave="e => e.currentTarget.style.background=''"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <!-- Metrics section (expanded by default) -->
        <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.metrics = !inspectorSections.metrics"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.metrics') }}</span>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.metrics ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.metrics" class="px-4 py-3" style="border-top:1px solid #E5E5EA;">
            <table style="width:100%; font-size:var(--fs-body); color:#1A1A1A;">
              <tbody>
                <tr style="border-bottom:1px solid #F5F5F5;">
                  <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.inputTokens') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ contextMetrics.inputTokens?.toLocaleString() ?? '0' }}</td>
                </tr>
                <tr style="border-bottom:1px solid #F5F5F5;">
                  <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.maxTokens') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (contextMetrics.maxTokens ?? 0).toLocaleString() }}</td>
                </tr>
                <tr style="border-bottom:1px solid #F5F5F5;">
                  <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.context') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ Math.round(contextMetrics.percentage) }}%</td>
                </tr>
                <tr :style="(contextMetrics.voiceInputTokens || contextMetrics.voiceOutputTokens) ? 'border-bottom:1px solid #F5F5F5;' : ''">
                  <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.compactions') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ contextMetrics.compactionCount ?? 0 }}</td>
                </tr>
                <template v-if="contextMetrics.voiceInputTokens || contextMetrics.voiceOutputTokens">
                  <tr style="border-bottom:1px solid #F5F5F5;">
                    <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.voiceIn') }}</td>
                    <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (contextMetrics.voiceInputTokens ?? 0).toLocaleString() }} {{ t('chats.tok') }}</td>
                  </tr>
                  <tr :style="(contextMetrics.whisperCalls) ? 'border-bottom:1px solid #F5F5F5;' : ''">
                    <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.voiceOut') }}</td>
                    <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (contextMetrics.voiceOutputTokens ?? 0).toLocaleString() }} {{ t('chats.tok') }}</td>
                  </tr>
                </template>
                <tr v-if="contextMetrics.whisperCalls">
                  <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">{{ t('chats.whisperStt') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ contextMetrics.whisperCalls }} {{ t('chats.rounds') }}, {{ (contextMetrics.whisperSecs ?? 0).toFixed(1) }}{{ t('chats.audioUnit') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- System Prompt section -->
        <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.system = !inspectorSections.system"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.systemPrompt') }}</span>
              <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                {{ contextSnapshot ? (contextSnapshot.systemPrompt?.length ?? 0).toLocaleString() + ' ' + t('chats.chars') : t('chats.notYetLoaded') }}
              </span>
            </div>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.system ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.system" class="px-4 py-3" style="border-top:1px solid #E5E5EA;">
            <pre v-if="contextSnapshot?.systemPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:300px; overflow-y:auto;">{{ contextSnapshot.systemPrompt }}</pre>
            <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">{{ t('chats.availableAfterFirstMessage') }}</p>
          </div>
        </div>

        <!-- Agents section — uses store data before first message, snapshot prompts after -->
        <div v-if="inspectorAgents" style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.agents = !inspectorSections.agents"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.agents') }}</span>
              <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                {{ (inspectorAgents.systemAgentPrompt || inspectorAgents.systemAgentName ? 1 : 0) + (inspectorAgents.userAgentPrompt || inspectorAgents.userAgentName ? 1 : 0) }} {{ t('chats.active') }}
              </span>
            </div>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.agents ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.agents" style="border-top:1px solid #E5E5EA;">
            <!-- System agent -->
            <div
              v-if="inspectorAgents.systemAgentPrompt || inspectorAgents.systemAgentName"
              class="px-4 py-3"
              :style="(inspectorAgents.userAgentPrompt || inspectorAgents.userAgentName) ? 'border-bottom:1px solid #F5F5F5;' : ''"
            >
              <div class="flex items-center gap-2 mb-1.5">
                <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:rgba(0,122,255,0.1); color:#0056CC;">{{ t('chats.systemAgent') }}</span>
                <span v-if="inspectorAgents.systemAgentName" style="color:#6B7280; font-size:var(--fs-small);">{{ inspectorAgents.systemAgentName }}</span>
              </div>
              <pre v-if="inspectorAgents.systemAgentPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:200px; overflow-y:auto;">{{ inspectorAgents.systemAgentPrompt }}</pre>
              <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">{{ t('chats.promptAvailableAfterFirstMessage') }}</p>
            </div>
            <!-- User agent -->
            <div v-if="inspectorAgents.userAgentPrompt || inspectorAgents.userAgentName" class="px-4 py-3">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:#D1FAE5; color:#065F46;">{{ t('chats.userAgent') }}</span>
                <span v-if="inspectorAgents.userAgentName" style="color:#6B7280; font-size:var(--fs-small);">{{ inspectorAgents.userAgentName }}</span>
              </div>
              <pre v-if="inspectorAgents.userAgentPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:200px; overflow-y:auto;">{{ inspectorAgents.userAgentPrompt }}</pre>
              <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">{{ t('chats.promptAvailableAfterFirstMessage') }}</p>
            </div>
          </div>
        </div>

        <!-- Messages section -->
        <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.messages = !inspectorSections.messages"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.messages') }}</span>
              <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                {{ contextSnapshot?.messages?.length ?? 0 }}
              </span>
            </div>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.messages ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.messages" style="border-top:1px solid #E5E5EA; max-height:400px; overflow-y:auto;">
            <template v-if="contextSnapshot?.messages?.length">
              <div
                v-for="(msg, idx) in contextSnapshot.messages"
                :key="idx"
                class="px-4 py-2.5"
                :style="idx < contextSnapshot.messages.length - 1 ? 'border-bottom:1px solid #F5F5F5;' : ''"
              >
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="px-1.5 py-0.5 rounded text-xs font-medium"
                    :style="msg.role === 'user'
                      ? 'background:rgba(0,122,255,0.1); color:#0056CC;'
                      : 'background:#D1FAE5; color:#065F46;'"
                  >{{ msg.role }}</span>
                  <span style="color:#9CA3AF; font-size:var(--fs-small);">{{ msg.contentLength?.toLocaleString() }} {{ t('chats.chars') }}</span>
                </div>
                <div
                  class="text-xs cursor-pointer"
                  style="font-family:'JetBrains Mono',monospace; color:#6B7280;"
                  @click="expandedMessages[idx] = !expandedMessages[idx]"
                >
                  <pre v-if="expandedMessages[idx]" class="whitespace-pre-wrap leading-relaxed overflow-x-auto" style="max-height:300px; overflow-y:auto;">{{ msg.fullContent }}</pre>
                  <span v-else>{{ msg.contentPreview }}<span v-if="msg.contentLength > 200" style="color:#007AFF;"> ... ({{ t('chats.clickToExpand') }})</span></span>
                </div>
              </div>
            </template>
            <div v-else class="px-4 py-3" style="color:#9CA3AF; font-size:var(--fs-body);">{{ contextSnapshot ? t('chats.noMessages') : t('chats.availableAfterFirstMessage') }}</div>
          </div>
        </div>

        <!-- Tools section -->
        <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.tools = !inspectorSections.tools"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.tools') }}</span>
              <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                {{ contextSnapshot?.tools?.length ?? 0 }}
              </span>
            </div>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.tools ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.tools" style="border-top:1px solid #E5E5EA; max-height:300px; overflow-y:auto;">
            <template v-if="contextSnapshot?.tools?.length">
              <div
                v-for="(tool, idx) in contextSnapshot.tools"
                :key="idx"
                class="px-4 py-2"
                :style="idx < contextSnapshot.tools.length - 1 ? 'border-bottom:1px solid #F5F5F5;' : ''"
              >
                <span class="font-medium text-xs" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A;">{{ tool.name }}</span>
                <p v-if="tool.description" class="mt-0.5 text-xs" style="color:#9CA3AF;">{{ tool.description.slice(0, 150) }}{{ tool.description.length > 150 ? '...' : '' }}</p>
              </div>
            </template>
            <div v-else class="px-4 py-3" style="color:#9CA3AF; font-size:var(--fs-body);">{{ contextSnapshot ? t('chats.noTools') : t('chats.availableAfterFirstMessage') }}</div>
          </div>
        </div>

        <!-- Debug Log section -->
        <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
          <button
            @click="inspectorSections.debugLog = !inspectorSections.debugLog"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
            style="background:#F2F2F7;"
            @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
            @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
          >
            <div class="flex items-center gap-2">
              <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">{{ t('chats.debugLog') }}</span>
              <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                {{ debugLogs.length }} {{ t('chats.entries') }}
              </span>
            </div>
            <svg class="w-4 h-4 transition-transform" :style="inspectorSections.debugLog ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div v-if="inspectorSections.debugLog" style="border-top:1px solid #E5E5EA;">
            <!-- Info bar -->
            <div class="px-4 py-2 flex items-center gap-3 flex-wrap" style="background:#F2F2F7; border-bottom:1px solid #F5F5F5;">
              <span style="font-size:var(--fs-small); color:#9CA3AF;">
                {{ t('chats.electron') }}: <span :style="hasElectron ? 'color:#007AFF; font-weight:600;' : 'color:#dc2626; font-weight:600;'">{{ hasElectron ? t('chats.yes') : t('chats.no') }}</span>
              </span>
              <span style="font-size:var(--fs-small); color:#9CA3AF;">
                {{ t('chats.modelLabel') }} <span style="color:#1A1A1A; font-weight:600;">{{ debugModelId }}</span>
              </span>
            </div>
            <!-- Log entries (last 100) -->
            <div ref="debugLogEl" style="max-height:300px; overflow-y:auto; background:#1A1A1A; font-family:'JetBrains Mono',monospace;">
              <div class="px-3 py-2 space-y-0.5">
                <div v-if="debugLogs.length === 0" style="color:#6B7280; font-size:var(--fs-secondary);">{{ t('chats.noEventsYet') }}</div>
                <div
                  v-for="(entry, i) in debugLogs.slice(-100)"
                  :key="i"
                  style="font-size:var(--fs-secondary);"
                  :style="entry.level === 'error' ? 'color:#f87171;' : entry.level === 'warn' ? 'color:#fbbf24;' : entry.level === 'success' ? 'color:#86efac;' : entry.level === 'chunk' ? 'color:#93c5fd;' : 'color:#E5E5EA;'"
                >
                  <span style="color:#6B7280; margin-right:6px; font-size:var(--fs-caption);">{{ entry.time }}</span>{{ entry.msg }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useChatsStore }  from '../../stores/chats'
import { useConfigStore }  from '../../stores/config'
import { useAgentsStore }  from '../../stores/agents'
import { useI18n }         from '../../i18n/useI18n'
import { resolveModelPrice, convertCurrencies } from '../../utils/pricing.js'

const props = defineProps({
  visible:        Boolean,
  chatId:         String,
  contextMetrics: Object,   // activeContextMetrics from parent
  debugLogs:      { type: Array, default: () => [] },
})

const emit = defineEmits(['close'])

const chatsStore  = useChatsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const { t }       = useI18n()

// ── Internal state ──────────────────────────────────────────────────────────

const inspectorUsage    = ref(null)
const contextSnapshot   = ref(null)
const expandedMessages  = reactive({})
const inspectorSections = reactive({
  metrics: true, system: false, agents: false,
  messages: false, tools: false, debugLog: false, cost: true,
})
const debugLogEl = ref(null)

const hasElectron = !!(typeof window !== 'undefined' && window.electronAPI)

const debugModelId = computed(() => {
  const a = configStore.config.anthropic || {}
  return a.utilityModel || a.sonnetModel || '(unset)'
})

// ── Computeds ───────────────────────────────────────────────────────────────

const activeChatUsage = computed(() => {
  const chat = chatsStore.activeChat
  const base = inspectorUsage.value || chat?.usage || null
  const m = chat?.contextMetrics
  if (!m) return base
  const liveWhisper = (m.whisperCalls || 0) + (m.whisperSecs || 0)
  const liveVoice   = (m.voiceInputTokens || 0) + (m.voiceOutputTokens || 0)
  if (!liveWhisper && !liveVoice) return base
  return {
    ...(base || {}),
    whisperCalls:      Math.max(base?.whisperCalls      || 0, m.whisperCalls      || 0),
    whisperSecs:       Math.max(base?.whisperSecs       || 0, m.whisperSecs       || 0),
    voiceInputTokens:  Math.max(base?.voiceInputTokens  || 0, m.voiceInputTokens  || 0),
    voiceOutputTokens: Math.max(base?.voiceOutputTokens || 0, m.voiceOutputTokens || 0),
  }
})

// Resolved model for the active chat: agent modelId -> chat.model -> contextSnapshot
const activeChatModel = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return ''
  const agentId = (chat.groupAgentIds?.length > 0 ? chat.groupAgentIds[0] : null)
    || chat.systemAgentId
  const agent = agentId ? agentsStore.getAgentById(agentId) : null
  return agent?.modelId || chat.model || contextSnapshot.value?.model || ''
})

// Agent info for the inspector — prefers snapshot data (has prompts), falls back to store (has names)
const inspectorAgents = computed(() => {
  if (contextSnapshot.value?.agents?.systemAgentPrompt || contextSnapshot.value?.agents?.userAgentPrompt) {
    return contextSnapshot.value.agents
  }
  const chat = chatsStore.activeChat
  if (!chat) return null
  const sysId = (chat.groupAgentIds?.length > 0 ? chat.groupAgentIds[0] : null) || chat.systemAgentId
  const sysAgent = sysId ? agentsStore.getAgentById(sysId) : agentsStore.defaultSystemAgent
  const usrId = chat.userAgentId
  const usrAgent = usrId ? agentsStore.getAgentById(usrId) : agentsStore.defaultUserAgent
  if (!sysAgent && !usrAgent) return null
  return {
    systemAgentName: sysAgent?.name || null,
    systemAgentPrompt: null,
    userAgentName: usrAgent?.name || null,
    userAgentPrompt: null,
  }
})

const activeChatCost = computed(() => {
  const usage = activeChatUsage.value
  const chat  = chatsStore.activeChat
  if (!usage || !chat) return null
  const hasActivity = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.whisperCalls || 0) > 0
  if (!hasActivity) return null
  const modelId = activeChatModel.value
  const price   = resolveModelPrice(modelId, configStore.config.pricing)
  const M = 1_000_000
  const inputUsd      = price ? (((usage.inputTokens  || 0) + (usage.voiceInputTokens  || 0)) / M) * (price.input      || 0) : 0
  const outputUsd     = price ? (((usage.outputTokens || 0) + (usage.voiceOutputTokens || 0)) / M) * (price.output     || 0) : 0
  const cacheWriteUsd = price ? ((usage.cacheCreationTokens || 0) / M) * (price.cacheWrite || 0) : 0
  const cacheReadUsd  = price ? ((usage.cacheReadTokens     || 0) / M) * (price.cacheRead  || 0) : 0
  const llmUsd = inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd
  const whisperPrice = resolveModelPrice('whisper-1', configStore.config.pricing)
  const whisperUsd   = ((usage.whisperSecs || 0)) * (whisperPrice?.perSec || 0.0001)
  const usd = llmUsd + whisperUsd
  const all = convertCurrencies(usd, configStore.config.pricing?.currencyRates)
  return { usd, all, modelId, hasPricing: !!price, llmUsd, whisperUsd, inputUsd, outputUsd, cacheWriteUsd, cacheReadUsd }
})

// ── Data fetch ──────────────────────────────────────────────────────────────

async function refreshContextSnapshot() {
  const cid = props.chatId
  if (!cid || !window.electronAPI?.getContextSnapshot) return
  try {
    const snap = await window.electronAPI.getContextSnapshot(cid)
    if (snap) contextSnapshot.value = snap
  } catch {}
}

async function fetchOnOpen() {
  Object.keys(expandedMessages).forEach(k => delete expandedMessages[k])
  const [, freshChat] = await Promise.all([
    refreshContextSnapshot(),
    window.electronAPI.getChat(props.chatId),
  ])
  if (freshChat?.usage) inspectorUsage.value = freshChat.usage
}

// ── Debug log auto-scroll ───────────────────────────────────────────────────

function scrollDebugToBottom() {
  nextTick(() => {
    if (debugLogEl.value) debugLogEl.value.scrollTop = debugLogEl.value.scrollHeight
  })
}

watch(() => props.debugLogs, () => { if (inspectorSections.debugLog) scrollDebugToBottom() }, { deep: true })
watch(() => inspectorSections.debugLog, (open) => { if (open) scrollDebugToBottom() })

// ── Lifecycle watchers ──────────────────────────────────────────────────────

// When modal opens: fetch snapshot + usage; auto-scroll debug log if open
watch(() => props.visible, (open) => {
  if (open) {
    fetchOnOpen()
    if (inspectorSections.debugLog) scrollDebugToBottom()
  } else {
    inspectorUsage.value = null
  }
})

// Refresh inspector snapshot when context metrics update during an open inspector
watch(() => props.contextMetrics?.inputTokens, () => {
  if (props.visible) refreshContextSnapshot()
})
</script>
