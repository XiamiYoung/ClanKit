<template>
  <div class="mbc-root">

    <!-- ── Voice call panel ───────────────────────────── -->
    <template v-if="voiceStore.isCallActive">
      <div class="mbc-call-panel">
        <div class="mbc-call-icon" :class="'mbc-call-icon--' + voiceStore.status">
          <svg viewBox="0 0 24 24" fill="none" style="width:10px;height:10px;">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="mbc-call-name">{{ voiceStore.activeAgentName || 'Call' }}</span>
        <span class="mbc-call-status">
          {{ voiceStore.status === 'speaking' ? 'speaking' : voiceStore.status === 'processing' ? 'thinking' : 'listening' }}
        </span>
        <button class="mbc-call-end" @click.stop="endCall" title="End call">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:9px;height:9px;">
            <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.47 11.47 0 0 0 3.58.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.47 11.47 0 0 0 .57 3.58 1 1 0 0 1-.25 1.02z"/>
          </svg>
        </button>
      </div>
      <div class="mbc-sep" />
    </template>

    <!-- ── Chat section ───────────────────────────────── -->
    <div class="mbc-section mbc-section--clickable" ref="chatSectionRef" @mouseenter="showChatKit" @mouseleave="hideChatKit" @click.stop="onChatSectionClick">
      <svg v-if="ongoingCount > 0" class="mbc-spin mbc-spin--chat" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgba(96,165,250,0.2)" stroke-width="2.5"/>
        <path d="M12 3a9 9 0 0 1 9 9" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <svg v-else class="mbc-icon-sm" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgba(96,165,250,0.18)" stroke-width="2"/>
        <path d="M8 12l3 3 5-5" stroke="#60A5FA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="mbc-count mbc-count--chat">{{ ongoingCount }}</span>
      <span v-if="activeChatNameShort" class="mbc-name" :title="activeChatNameNeedsTooltip ? activeChatName : undefined">
        {{ activeChatNameShort }}
      </span>
    </div>

    <div class="mbc-sep" />

    <!-- ── Plan section ───────────────────────────────── -->
    <div class="mbc-section mbc-section--clickable" ref="planSectionRef" @mouseenter="showPlanKit" @mouseleave="hidePlanKit" @click.stop="onPlanSectionClick">
      <svg v-if="planActivity?.status === 'running'" class="mbc-spin mbc-spin--plan" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgba(251,191,36,0.2)" stroke-width="2.5"/>
        <path d="M12 3a9 9 0 0 1 9 9" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <svg v-else-if="planActivity?.status === 'error'" class="mbc-icon-sm" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgba(239,68,68,0.25)" stroke-width="2"/>
        <line x1="9" y1="9" x2="15" y2="15" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
        <line x1="15" y1="9" x2="9" y2="15" stroke="#EF4444" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <svg v-else class="mbc-icon-sm" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="rgba(251,191,36,0.18)" stroke-width="2"/>
        <path d="M8 12l3 3 5-5" :stroke="planActivity ? '#FBBF24' : 'rgba(255,255,255,0.15)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="mbc-count mbc-count--plan">
        {{ planActivity ? `${planActivity.doneCount}/${planActivity.stepCount}` : '—' }}
      </span>
      <span v-if="planNameShort" class="mbc-name">{{ planNameShort }}</span>
    </div>

    <div class="mbc-sep" />

    <!-- ── Ticker ─────────────────────────────────────── -->
    <div v-if="!showCompose" class="mbc-ticker-wrap">
      <template v-if="tickerText">
        <span class="mbc-ticker-dot" :style="tickerDotStyle" />
        <div class="mbc-ticker-clip">
          <div
            class="mbc-ticker-track"
            :class="tickerStatus === 'running' ? 'mbc-ticker-loop' : 'mbc-ticker-once'"
            :key="tickerKey"
          >
            <span class="mbc-ticker-text">{{ tickerText }}</span>
          </div>
        </div>
      </template>
      <span v-else class="mbc-ticker-idle">No recent activity</span>
    </div>

    <!-- ── Compose ────────────────────────────────────── -->
    <div v-if="showCompose" class="mbc-compose-wrap" @mousedown.stop>
      <input
        ref="composeInputRef"
        v-model="composeText"
        class="mbc-compose-input"
        placeholder="Send a message…"
        @keydown.enter.exact.prevent="submitCompose"
        @keydown.escape="closeCompose"
      />
      <button class="mbc-compose-send" :disabled="!composeText.trim()" @click.stop="submitCompose" title="Send (Enter)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>

    <div class="mbc-sep" />

    <!-- ── Compose toggle ─────────────────────────────── -->
    <button class="mbc-compose-btn" :class="{ active: showCompose }" @click.stop="toggleCompose" title="Quick message">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>

    <!-- ── Toolkits (teleported, escape overflow:hidden) ── -->
    <Teleport to="body">
      <!-- Chat toolkit -->
      <div
        v-if="chatKitVisible && !isMinibarMode"
        class="mbc-toolkit"
        :style="{ top: chatKitPos.top + 'px', left: chatKitPos.left + 'px' }"
        @mouseenter="() => clearTimeout(chatKitHideTimer)"
        @mouseleave="hideChatKit"
      >
        <div class="mbc-kit-header">
          <span class="mbc-kit-dot mbc-kit-dot--chat" />
          Active Chats
        </div>
        <div class="mbc-kit-divider" />
        <template v-if="runningChats.length">
          <div v-for="chat in runningChats" :key="chat.id" class="mbc-kit-row">
            <svg v-if="chat.isRunning" class="mbc-kit-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="rgba(96,165,250,0.2)" stroke-width="2.5"/>
              <path d="M12 3a9 9 0 0 1 9 9" stroke="#60A5FA" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
            <span v-else class="mbc-kit-status-dot" style="background:#34D399;" />
            <span class="mbc-kit-row-name">{{ chat.title }}</span>
            <span class="mbc-kit-badge" :class="chat.isRunning ? 'mbc-badge--running' : 'mbc-badge--idle'">
              {{ chat.isRunning ? 'running' : 'idle' }}
            </span>
          </div>
        </template>
        <div v-else class="mbc-kit-empty">No active chats</div>
      </div>

      <!-- Plan toolkit -->
      <div
        v-if="planKitVisible && !isMinibarMode"
        class="mbc-toolkit"
        :style="{ top: planKitPos.top + 'px', left: planKitPos.left + 'px' }"
        @mouseenter="() => clearTimeout(planKitHideTimer)"
        @mouseleave="hidePlanKit"
      >
        <div class="mbc-kit-header">
          <span class="mbc-kit-dot mbc-kit-dot--plan" />
          Task Engine
        </div>
        <div class="mbc-kit-divider" />
        <template v-if="planActivity">
          <div class="mbc-kit-plan-row">
            <span class="mbc-kit-plan-name">{{ planActivity.planName }}</span>
            <span class="mbc-kit-plan-badge" :class="`mbc-plan-badge--${planActivity.status}`">
              {{ planActivity.status === 'running' ? 'running' : planActivity.status === 'done' ? 'done' : 'error' }}
            </span>
          </div>
          <div class="mbc-kit-progress-row">
            <div class="mbc-kit-progress-bar">
              <div
                class="mbc-kit-progress-fill"
                :class="planActivity.status === 'error' ? 'mbc-fill--error' : planActivity.status === 'done' ? 'mbc-fill--done' : 'mbc-fill--running'"
                :style="{ width: planActivity.stepCount > 0 ? (planActivity.doneCount / planActivity.stepCount * 100) + '%' : '0%' }"
              />
            </div>
            <span class="mbc-kit-progress-label">{{ planActivity.doneCount }}/{{ planActivity.stepCount }}</span>
          </div>
          <template v-if="planActivity.status !== 'running'">
            <div class="mbc-kit-divider" />
            <div v-if="planActivity.summary" class="mbc-kit-summary">{{ planActivity.summary }}</div>
            <div v-else class="mbc-kit-empty" style="font-style:italic;">Summarizing…</div>
          </template>
        </template>
        <div v-else class="mbc-kit-empty">No recent plan activity</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, watchEffect, nextTick, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChatsStore } from '../../stores/chats'
import { useAgentsStore } from '../../stores/agents'
import { useVoiceStore } from '../../stores/voice'
import { useTasksStore } from '../../stores/tasks'
import { useFocusModeStore } from '../../stores/focusMode'

const router = useRouter()
const chatsStore = useChatsStore()
const agentsStore = useAgentsStore()
const voiceStore = useVoiceStore()
const tasksStore = useTasksStore()
const focusModeStore = useFocusModeStore()
const isMinibarMode = computed(() => focusModeStore.isMinibarMode)

if (!agentsStore.agents.length) agentsStore.loadAgents()

// ── Chat section ──────────────────────────────────────────────────────────
const ongoingCount = ref(0)
const lastActiveTickerChatId = ref(null)

watchEffect(() => {
  let running = 0
  for (const c of chatsStore.chats) { if (c.isRunning) running++ }
  ongoingCount.value = running
})

const activeChatName = computed(() => {
  const id = lastActiveTickerChatId.value || chatsStore.activeChatId
  if (!id) return null
  return chatsStore.chats.find(c => c.id === id)?.title || null
})
const activeChatNameShort = computed(() => {
  const name = activeChatName.value
  if (!name) return null
  return name.length > 9 ? name.slice(0, 9) + '…' : name
})
const activeChatNameNeedsTooltip = computed(() => (activeChatName.value?.length ?? 0) > 9)

const runningChats = computed(() =>
  chatsStore.chats
    .filter(c => c.isRunning || c.id === chatsStore.activeChatId)
    .slice(0, 6)
    .map(c => ({ id: c.id, title: c.title || 'Untitled', isRunning: !!c.isRunning }))
)

// ── Plan section ──────────────────────────────────────────────────────────
const planActivity = computed(() => tasksStore.planActivity)

const planNameShort = computed(() => {
  const name = planActivity.value?.planName
  if (!name) return null
  return name.length > 9 ? name.slice(0, 9) + '…' : name
})

// ── Ticker (source-aware: chat=blue, plan=amber) ──────────────────────────
const tickerText = ref('')
const tickerKey = ref(0)
const tickerStatus = ref('idle')  // 'idle' | 'running' | 'done' | 'error'
const tickerSource = ref('chat')  // 'chat' | 'plan'

const tickerDotStyle = computed(() => {
  if (tickerStatus.value === 'error')  return { background: '#EF4444' }
  if (tickerStatus.value === 'done')   return tickerSource.value === 'plan'
    ? { background: '#FBBF24' }
    : { background: '#34D399' }
  return tickerSource.value === 'plan'
    ? { background: '#FBBF24', animation: 'mbc-dot-pulse 1.2s ease-in-out infinite' }
    : { background: '#60A5FA', animation: 'mbc-dot-pulse 1.2s ease-in-out infinite' }
})

function _lastMsgText(msgs, role) {
  if (!msgs?.length) return null
  for (let j = msgs.length - 1; j >= 0; j--) {
    const m = msgs[j]
    const text = typeof m.content === 'string' ? m.content
      : (Array.isArray(m.content) ? m.content.find(b => b.type === 'text')?.text : null)
    if (m.role === role && text?.trim()) return text.replace(/\n+/g, ' ').trim().slice(0, 220)
  }
  return null
}

let _prevRunning = new Map()
watch(
  () => chatsStore.chats.map(c => ({ id: c.id, running: c.isRunning })),
  async (cur) => {
    for (const { id, running } of cur) {
      const wasRunning = _prevRunning.get(id) ?? false
      if (!wasRunning && running) {
        const chat = chatsStore.chats.find(c => c.id === id)
        if (!chat) continue
        tickerSource.value = 'chat'
        tickerStatus.value = 'running'
        if (chat.messages === null) await chatsStore.ensureMessages(chat.id)
        tickerText.value = _lastMsgText(chat.messages, 'user') ?? chat.title ?? 'Working…'
        tickerKey.value++
        lastActiveTickerChatId.value = chat.id
      } else if (wasRunning && !running) {
        const chat = chatsStore.chats.find(c => c.id === id)
        if (!chat) continue
        tickerSource.value = 'chat'
        tickerStatus.value = 'done'
        tickerText.value = _lastMsgText(chat.messages, 'assistant') ?? (chat.title ? `"${chat.title}" completed` : 'Task completed')
        tickerKey.value++
        lastActiveTickerChatId.value = chat.id
      }
    }
    _prevRunning = new Map(cur.map(c => [c.id, !!c.running]))
  }
)

watch(planActivity, (pa, prevPa) => {
  if (!pa) return
  if (pa.status === 'running' && prevPa?.status !== 'running') {
    tickerSource.value = 'plan'; tickerStatus.value = 'running'
    tickerText.value = `Running: ${pa.planName}`; tickerKey.value++
  } else if (pa.status === 'running' && pa.currentTaskName !== prevPa?.currentTaskName && pa.currentTaskName) {
    tickerSource.value = 'plan'; tickerStatus.value = 'running'
    tickerText.value = `${pa.planName} › ${pa.currentTaskName}`; tickerKey.value++
  } else if (pa.status !== 'running' && prevPa?.status === 'running') {
    tickerSource.value = 'plan'
    tickerStatus.value = pa.status === 'done' ? 'done' : 'error'
    tickerText.value = pa.summary || `${pa.planName} — ${pa.status === 'done' ? 'completed' : 'failed'}`
    tickerKey.value++
  }
}, { deep: true })

watch(() => planActivity.value?.summary, (summary) => {
  if (!summary || tickerSource.value !== 'plan') return
  if (planActivity.value?.status !== 'running') { tickerText.value = summary; tickerKey.value++ }
})

// ── Compose ────────────────────────────────────────────────────────────────
const showCompose = ref(false)
const composeText = ref('')
const composeInputRef = ref(null)

function toggleCompose() {
  showCompose.value = !showCompose.value
  if (showCompose.value) nextTick(() => composeInputRef.value?.focus())
  else composeText.value = ''
}
function closeCompose() { showCompose.value = false; composeText.value = '' }

async function resolveTargetChatId() {
  if (lastActiveTickerChatId.value) {
    const found = chatsStore.chats.find(c => c.id === lastActiveTickerChatId.value)
    if (found) return found.id
  }
  if (chatsStore.activeChatId) return chatsStore.activeChatId
  const first = chatsStore.chats[0]
  if (first) return first.id
  const defaultAgentId = agentsStore.defaultSystemAgent?.id ?? null
  const newChat = await chatsStore.createChat('New Chat', defaultAgentId ? [defaultAgentId] : null, null)
  return newChat.id
}

async function submitCompose() {
  const text = composeText.value.trim()
  if (!text) return
  const chatId = await resolveTargetChatId()
  composeText.value = ''
  showCompose.value = false
  chatsStore.triggerMinibarSend(text, chatId)
}

// ── Voice call ─────────────────────────────────────────────────────────────
function endCall() {
  if (window.electronAPI?.voice?.stop) window.electronAPI.voice.stop()
  voiceStore.endCall()
}

// ── Section click navigation ───────────────────────────────────────────────

function _exitMinibarIfActive() {
  if (focusModeStore.isMinibarMode) {
    focusModeStore.exitMinibar()
    window.electronAPI?.window?.setMinibar({ enable: false })
  }
}

function onChatSectionClick() {
  _exitMinibarIfActive()
  const chatId = lastActiveTickerChatId.value || chatsStore.activeChatId
  if (chatId) chatsStore.activeChatId = chatId
  router.push('/chats')
}

function onPlanSectionClick() {
  const planId = tasksStore.activeRun?.planId || tasksStore.planActivity?.planId
  if (planId) tasksStore.requestOpenPlan(planId)
  _exitMinibarIfActive()
  router.push('/tasks')
}

// ── Hover toolkits ─────────────────────────────────────────────────────────
const chatSectionRef = ref(null)
const planSectionRef = ref(null)
const chatKitVisible = ref(false)
const planKitVisible = ref(false)
const chatKitPos = ref({ top: 0, left: 0 })
const planKitPos = ref({ top: 0, left: 0 })
let chatKitHideTimer = null
let planKitHideTimer = null

function showChatKit() {
  clearTimeout(chatKitHideTimer)
  const rect = chatSectionRef.value?.getBoundingClientRect()
  if (!rect) return
  chatKitPos.value = { top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left + rect.width / 2 - 130, window.innerWidth - 276)) }
  chatKitVisible.value = true
}
function hideChatKit() { chatKitHideTimer = setTimeout(() => { chatKitVisible.value = false }, 150) }

function showPlanKit() {
  clearTimeout(planKitHideTimer)
  const rect = planSectionRef.value?.getBoundingClientRect()
  if (!rect) return
  planKitPos.value = { top: rect.bottom + 8, left: Math.max(8, Math.min(rect.left + rect.width / 2 - 130, window.innerWidth - 276)) }
  planKitVisible.value = true
}
function hidePlanKit() { planKitHideTimer = setTimeout(() => { planKitVisible.value = false }, 150) }

onUnmounted(() => {
  clearTimeout(chatKitHideTimer)
  clearTimeout(planKitHideTimer)
})
</script>

<style scoped>
/* Root fills the parent flex container */
.mbc-root {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 100%;
}

.mbc-sep {
  width: 1px;
  height: 1.125rem;
  background: rgba(255,255,255,0.1);
  margin: 0 0.4375rem;
  flex-shrink: 0;
}

/* ── Sections ─────────────────────────────────────────────────────────────── */
.mbc-section {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  padding: 0.1875rem 0.3125rem;
  border-radius: 0.3125rem;
  cursor: default;
  transition: background 0.15s ease;
}
.mbc-section:hover { background: rgba(255,255,255,0.07); }
.mbc-section--clickable { cursor: pointer; }

.mbc-spin {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
  animation: mbc-spin 0.85s linear infinite;
}
@keyframes mbc-spin { to { transform: rotate(360deg); } }

.mbc-icon-sm {
  width: 0.875rem;
  height: 0.875rem;
  flex-shrink: 0;
}

.mbc-count {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  min-width: 0.75rem;
  text-align: center;
}
.mbc-count--chat { color: rgba(96,165,250,0.9); }
.mbc-count--plan { color: rgba(251,191,36,0.9); }

.mbc-name {
  font-size: 0.625rem;
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* ── Voice call panel ─────────────────────────────────────────────────────── */
.mbc-call-panel {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.3125rem 0.125rem 0.25rem;
  border-radius: 9999px;
  background: rgba(52,211,153,0.12);
  border: 1px solid rgba(52,211,153,0.25);
  flex-shrink: 0;
}
.mbc-call-icon { display:flex; align-items:center; justify-content:center; color:#34D399; flex-shrink:0; }
.mbc-call-icon--speaking  { color:#60A5FA; animation:mbc-call-pulse 0.8s ease-in-out infinite; }
.mbc-call-icon--processing{ color:#FBBF24; animation:mbc-call-pulse 1s ease-in-out infinite; }
.mbc-call-icon--listening { color:#34D399; animation:mbc-call-pulse 1.4s ease-in-out infinite; }
.mbc-call-icon--idle      { color:rgba(255,255,255,0.4); }
@keyframes mbc-call-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

.mbc-call-name {
  font-family:'Inter',sans-serif; font-size:0.625rem; font-weight:600;
  color:#FFFFFF; white-space:nowrap; max-width:4rem; overflow:hidden; text-overflow:ellipsis;
}
.mbc-call-status {
  font-family:'Inter',sans-serif; font-size:0.5625rem; font-weight:500;
  color:rgba(255,255,255,0.45); white-space:nowrap;
}
.mbc-call-end {
  display:flex; align-items:center; justify-content:center;
  width:1rem; height:1rem; border:none; border-radius:50%;
  background:rgba(255,59,48,0.2); color:#FF6B6B; cursor:pointer; flex-shrink:0;
  transition:background 0.15s ease,color 0.15s ease;
}
.mbc-call-end:hover { background:rgba(255,59,48,0.45); color:#FFFFFF; }

/* ── Ticker ───────────────────────────────────────────────────────────────── */
.mbc-ticker-wrap {
  flex: 1; min-width: 0; height: 100%;
  display: flex; align-items: center; gap: 0.25rem;
}
.mbc-ticker-dot {
  width: 0.3125rem; height: 0.3125rem; border-radius: 50%; flex-shrink: 0;
  transition: background 0.3s ease;
}
@keyframes mbc-dot-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

.mbc-ticker-clip { flex:1; min-width:0; overflow:hidden; height:100%; display:flex; align-items:center; }
.mbc-ticker-track { padding-left:100%; white-space:nowrap; will-change:transform; flex-shrink:0; }
.mbc-ticker-loop { animation: mbc-ticker 16s linear infinite; }
.mbc-ticker-once { animation: mbc-ticker 20s linear 1 forwards; }
@keyframes mbc-ticker { from{transform:translateX(0)} to{transform:translateX(-100%)} }

.mbc-ticker-text {
  font-size:0.6875rem; color:rgba(255,255,255,0.6); font-weight:400;
  white-space:nowrap; font-family:'Inter',sans-serif;
}
.mbc-ticker-idle {
  font-size:0.6875rem; color:rgba(255,255,255,0.2); font-style:italic;
  font-family:'Inter',sans-serif; white-space:nowrap;
}

/* ── Compose ──────────────────────────────────────────────────────────────── */
.mbc-compose-wrap { flex:1; min-width:0; display:flex; align-items:center; gap:0.3125rem; }
.mbc-compose-input {
  flex:1; min-width:0; height:1.375rem;
  background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);
  border-radius:0.3125rem; padding:0 0.4375rem;
  color:#FFFFFF; font-size:0.6875rem; font-family:'Inter',sans-serif;
  outline:none; transition:border-color 0.15s ease,background 0.15s ease;
}
.mbc-compose-input::placeholder { color:rgba(255,255,255,0.3); }
.mbc-compose-input:focus { border-color:rgba(255,255,255,0.3); background:rgba(255,255,255,0.12); }

.mbc-compose-send {
  display:flex; align-items:center; justify-content:center;
  width:1.375rem; height:1.375rem; border:none; border-radius:0.3125rem;
  background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.7);
  cursor:pointer; flex-shrink:0; transition:background 0.15s ease,color 0.15s ease;
}
.mbc-compose-send:hover:not(:disabled) { background:rgba(255,255,255,0.2); color:#FFFFFF; }
.mbc-compose-send:disabled { opacity:0.35; cursor:default; }

.mbc-compose-btn {
  display:flex; align-items:center; justify-content:center;
  width:1.375rem; height:1.375rem; border:none;
  background:transparent; color:rgba(255,255,255,0.35);
  cursor:pointer; border-radius:0.3125rem; flex-shrink:0;
  transition:background 0.15s ease,color 0.15s ease;
}
.mbc-compose-btn:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
.mbc-compose-btn.active { color:#60A5FA; background:rgba(96,165,250,0.12); }
</style>

<!-- Unscoped: toolkit styles apply to teleported elements -->
<style>
.mbc-toolkit {
  position: fixed;
  z-index: 9999;
  min-width: 15rem;
  max-width: 20rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.75rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.2);
  padding: 0.625rem;
  pointer-events: auto;
  animation: mbc-kit-enter 0.15s ease-out;
}
@keyframes mbc-kit-enter {
  from { opacity:0; transform:translateY(-4px) scale(0.97); }
  to   { opacity:1; transform:translateY(0) scale(1); }
}

.mbc-kit-header {
  display:flex; align-items:center; gap:0.375rem;
  font-family:'Inter',sans-serif; font-size:0.6875rem; font-weight:700;
  color:rgba(255,255,255,0.9); letter-spacing:0.04em; text-transform:uppercase;
  padding:0 0.125rem 0.25rem;
}
.mbc-kit-dot { width:0.4375rem; height:0.4375rem; border-radius:50%; flex-shrink:0; }
.mbc-kit-dot--chat { background:#60A5FA; }
.mbc-kit-dot--plan { background:#FBBF24; }

.mbc-kit-divider { height:1px; background:#2A2A2A; margin:0.3125rem 0; }

.mbc-kit-row {
  display:flex; align-items:center; gap:0.375rem;
  padding:0.3125rem 0.25rem; border-radius:0.375rem;
}
.mbc-kit-row:hover { background:rgba(255,255,255,0.04); }

.mbc-kit-spin {
  width:0.8125rem; height:0.8125rem; flex-shrink:0;
  animation:mbc-kit-spin 0.85s linear infinite;
}
@keyframes mbc-kit-spin { to{transform:rotate(360deg)} }

.mbc-kit-status-dot { width:0.4375rem; height:0.4375rem; border-radius:50%; flex-shrink:0; margin:0 0.1875rem; }

.mbc-kit-row-name {
  flex:1; font-family:'Inter',sans-serif; font-size:0.75rem; font-weight:500;
  color:rgba(255,255,255,0.75); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.mbc-kit-badge {
  font-family:'Inter',sans-serif; font-size:0.5625rem; font-weight:600;
  padding:0.0625rem 0.3125rem; border-radius:9999px; white-space:nowrap;
  flex-shrink:0; text-transform:uppercase; letter-spacing:0.04em;
}
.mbc-badge--running { background:rgba(96,165,250,0.15); color:#60A5FA; }
.mbc-badge--idle    { background:rgba(52,211,153,0.12); color:#34D399; }

.mbc-kit-empty {
  font-family:'Inter',sans-serif; font-size:0.6875rem;
  color:rgba(255,255,255,0.2); padding:0.3125rem 0.25rem; text-align:center;
}

/* Plan toolkit */
.mbc-kit-plan-row { display:flex; align-items:center; gap:0.5rem; padding:0.25rem 0.125rem; }
.mbc-kit-plan-name {
  flex:1; font-family:'Inter',sans-serif; font-size:0.75rem; font-weight:600;
  color:rgba(255,255,255,0.85); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.mbc-kit-plan-badge {
  font-family:'Inter',sans-serif; font-size:0.5625rem; font-weight:700;
  padding:0.0625rem 0.3125rem; border-radius:9999px; white-space:nowrap;
  flex-shrink:0; text-transform:uppercase; letter-spacing:0.04em;
}
.mbc-plan-badge--running { background:rgba(251,191,36,0.15); color:#FBBF24; }
.mbc-plan-badge--done    { background:rgba(52,211,153,0.12); color:#34D399; }
.mbc-plan-badge--error   { background:rgba(239,68,68,0.12);  color:#EF4444; }

.mbc-kit-progress-row { display:flex; align-items:center; gap:0.5rem; padding:0.1875rem 0.125rem; }
.mbc-kit-progress-bar { flex:1; height:0.25rem; background:rgba(255,255,255,0.08); border-radius:9999px; overflow:hidden; }
.mbc-kit-progress-fill { height:100%; border-radius:9999px; transition:width 0.4s ease; }
.mbc-fill--running { background:#FBBF24; }
.mbc-fill--done    { background:#34D399; }
.mbc-fill--error   { background:#EF4444; }

.mbc-kit-progress-label {
  font-family:'JetBrains Mono',monospace; font-size:0.625rem;
  color:rgba(255,255,255,0.4); white-space:nowrap; flex-shrink:0;
}

.mbc-kit-current { display:flex; align-items:center; gap:0.3125rem; padding:0.1875rem 0.125rem; }
.mbc-kit-current-label { font-family:'Inter',sans-serif; font-size:0.625rem; font-weight:500; color:rgba(255,255,255,0.3); white-space:nowrap; flex-shrink:0; }
.mbc-kit-current-name { font-family:'Inter',sans-serif; font-size:0.6875rem; font-weight:500; color:#FBBF24; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }

.mbc-kit-summary {
  font-family:'Inter',sans-serif; font-size:0.6875rem; color:rgba(255,255,255,0.55);
  line-height:1.5; padding:0.3125rem 0.125rem;
}
</style>
