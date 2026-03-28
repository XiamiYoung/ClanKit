<template>
  <div class="session-view">
    <!-- Header -->
    <div class="session-header">
      <button class="session-back-btn" @click="goBack">
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div class="session-header-info">
        <h1 class="session-title">{{ topic?.title || t('plaza.discussion') }}</h1>
        <span v-if="session" class="session-status-badge" :class="'status-' + session.status">{{ session.status }}</span>
      </div>
      <div class="session-header-actions">
        <!-- Start button: shown when not running and not concluded -->
        <AppButton
          v-if="session && !autoRunning && session.status !== 'concluded'"
          size="compact"
          @click="startAutoRun"
          :disabled="isRunning"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Start
        </AppButton>
        <!-- Stop button: shown while auto-running -->
        <AppButton
          v-if="autoRunning"
          size="compact"
          variant="danger"
          @click="stopAutoRun"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          Stop
        </AppButton>
      </div>
    </div>

    <!-- Main layout: 60/40 split -->
    <div class="session-layout">
      <!-- Left column: game + messages + toolbar -->
      <div class="session-left">
        <!-- Game canvas -->
        <PlazaGameCanvas
          v-if="session"
          ref="canvasRef"
          :agentIds="session.agentIds"
          :agentNames="agentNameMap"
          :agentAvatars="agentAvatarMap"
          :backgroundKey="bgKey"
        />

        <!-- Message feed -->
        <div class="session-messages" ref="messagesRef">
          <div v-if="!session" class="session-loading">Loading session...</div>
          <div v-else-if="session.messages.length === 0 && !isRunning" class="session-no-msgs">
            Click "Start" to begin the discussion.
          </div>
          <div
            v-for="msg in session?.messages || []"
            :key="msg.id"
            class="session-msg"
          >
            <img v-if="agentAvatarMap[msg.agentId]" :src="agentAvatarMap[msg.agentId]" alt="" class="msg-avatar-img" />
            <div v-else class="msg-avatar" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #374151 100%)' }">
              {{ (msg.agentName || '?')[0].toUpperCase() }}
            </div>
            <div class="msg-body">
              <div class="msg-meta">
                <span class="msg-name">{{ msg.agentName }}</span>
                <span class="msg-round">Round {{ msg.round + 1 }}</span>
              </div>
              <p class="msg-text">{{ msg.content }}</p>
            </div>
          </div>
          <!-- Streaming placeholder -->
          <div v-if="streamingText" class="session-msg streaming-msg">
            <img v-if="streamingAgentId && agentAvatarMap[streamingAgentId]" :src="agentAvatarMap[streamingAgentId]" alt="" class="msg-avatar-img streaming-avatar" />
            <div v-else class="msg-avatar" :style="{ background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)' }">
              {{ (streamingAgentName || '?')[0].toUpperCase() }}
            </div>
            <div class="msg-body">
              <div class="msg-meta">
                <span class="msg-name">{{ streamingAgentName }}</span>
                <span class="msg-round streaming-indicator">Speaking...</span>
              </div>
              <p class="msg-text">{{ streamingText }}</p>
            </div>
          </div>
        </div>

        <!-- Conclusion -->
        <div v-if="session?.conclusion" class="session-conclusion">
          <div class="conclusion-header">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            <span>Conclusion</span>
          </div>
          <p class="conclusion-text">{{ session.conclusion }}</p>
        </div>

        <!-- Bottom toolbar -->
        <div v-if="session" class="session-toolbar">
          <span class="toolbar-rounds">
            Round {{ session.currentRound }} / {{ session.maxRounds }}
          </span>
          <span v-if="memoryStatus" class="toolbar-memory-status">{{ memoryStatus }}</span>
        </div>
      </div>

      <!-- Right column: memory panel -->
      <div class="session-right">
        <MemoryPanel
          :agentIds="session?.agentIds || []"
          :agentNames="agentNameMap"
          :memories="session?.agentMemories || {}"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePlazaStore } from '../stores/plaza'
import { useAgentsStore } from '../stores/agents'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'
import PlazaGameCanvas from '../components/plaza/PlazaGameCanvas.vue'
import MemoryPanel from '../components/plaza/MemoryPanel.vue'
import { pickBackground } from '../components/plaza/game/DiscussionScene.js'
import { getAvatarDataUri } from '../components/agents/agentAvatars'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const plazaStore = usePlazaStore()
const agentsStore = useAgentsStore()

const session = ref(null)
const topic = ref(null)
const isRunning = ref(false)
const autoRunning = ref(false)
const streamingText = ref('')
const streamingAgentId = ref('')
const streamingAgentName = ref('')
const memoryStatus = ref('')
const canvasRef = ref(null)
const messagesRef = ref(null)
let unsubChunk = null
let stopRequested = false

const bgKey = computed(() => session.value ? pickBackground(session.value.id) : 'library')

const agentNameMap = computed(() => {
  const map = {}
  for (const id of (session.value?.agentIds || [])) {
    const agent = (agentsStore.agents || []).find(a => a.id === id)
    map[id] = agent?.name || 'Agent'
  }
  return map
})

const agentAvatarMap = computed(() => {
  const map = {}
  for (const id of (session.value?.agentIds || [])) {
    const agent = (agentsStore.agents || []).find(a => a.id === id)
    if (agent?.avatar) {
      const uri = getAvatarDataUri(agent.avatar)
      if (uri) map[id] = uri
    }
  }
  return map
})

onMounted(async () => {
  await agentsStore.loadAgents()
  await plazaStore.loadTopics()

  const sessionId = route.params.sessionId
  session.value = await window.electronAPI.plaza.getSessionById(sessionId)
  if (session.value) {
    topic.value = plazaStore.topics.find(t => t.id === session.value.topicId) || null
  }

  unsubChunk = window.electronAPI.plaza.onChunk(handleChunk)
})

onBeforeUnmount(() => {
  stopRequested = true
  if (unsubChunk) unsubChunk()
})

function handleChunk({ sessionId, agentId, agentName, chunk }) {
  if (session.value?.id !== sessionId) return
  if (chunk.type === 'text' && chunk.text) {
    streamingText.value += chunk.text
    streamingAgentId.value = agentId
    streamingAgentName.value = agentName || agentNameMap.value[agentId] || 'Agent'

    if (streamingText.value.length === chunk.text.length) {
      canvasRef.value?.triggerSpeak(agentId, chunk.text)
    }

    nextTick(() => {
      if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      }
    })
  }
}

// Run a single round and return the updated session
async function runOneRound() {
  if (!session.value) return false
  isRunning.value = true
  streamingText.value = ''
  streamingAgentId.value = ''
  streamingAgentName.value = ''

  try {
    const res = await plazaStore.runRound(session.value.topicId, session.value.id)
    if (res.success && res.session) {
      session.value = res.session
      const lastMsg = res.session.messages[res.session.messages.length - 1]
      if (lastMsg) {
        canvasRef.value?.triggerSpeak(lastMsg.agentId, lastMsg.content.slice(0, 80))
      }
      if (topic.value) {
        await plazaStore.saveTopic({
          ...topic.value,
          lastSessionId: session.value.id,
          lastSessionStatus: session.value.status,
        })
      }
      return true
    }
    return false
  } finally {
    isRunning.value = false
    streamingText.value = ''
    streamingAgentId.value = ''
    streamingAgentName.value = ''
    nextTick(() => {
      if (messagesRef.value) {
        messagesRef.value.scrollTop = messagesRef.value.scrollHeight
      }
    })
  }
}

// Auto-run all rounds sequentially
async function startAutoRun() {
  if (autoRunning.value || !session.value) return
  autoRunning.value = true
  stopRequested = false

  while (!stopRequested && session.value && session.value.status !== 'concluded' && session.value.status !== 'deadlocked') {
    const ok = await runOneRound()
    if (!ok || stopRequested) break
    // Small pause between rounds so the UI breathes
    await new Promise(r => setTimeout(r, 800))
  }

  autoRunning.value = false

  // Auto-extract memories and commit to soul when done
  if (session.value && session.value.messages.length > 0) {
    await autoExtractAndCommit()
  }
}

function stopAutoRun() {
  stopRequested = true
}

function goBack() {
  stopRequested = true
  router.push('/plaza')
}

// Extract memories then commit all to soul automatically, and generate conclusion
async function autoExtractAndCommit() {
  if (!session.value || !topic.value) return
  const agents = session.value.agentIds.map(id => {
    const a = (agentsStore.agents || []).find(x => x.id === id)
    return a ? { id: a.id, name: a.name } : { id, name: 'Agent' }
  })

  // Generate conclusion
  memoryStatus.value = 'Generating conclusion...'
  try {
    const conclusionRes = await plazaStore.generateConclusion(session.value, topic.value.title, agents)
    if (conclusionRes.success && conclusionRes.conclusion) {
      session.value.conclusion = conclusionRes.conclusion
      await plazaStore.saveSession(session.value)
    }
  } catch {}

  // Extract memories
  memoryStatus.value = 'Extracting memories...'
  try {
    const res = await plazaStore.extractMemories(session.value, agents)
    if (res.success && res.memories) {
      session.value.agentMemories = res.memories
      await plazaStore.saveSession(session.value)

      // Auto-commit all memories to soul files
      memoryStatus.value = 'Writing to soul files...'
      const agentTypes = {}
      for (const id of session.value.agentIds) {
        const a = (agentsStore.agents || []).find(x => x.id === id)
        agentTypes[id] = a?.type || 'system'
      }
      const memoriesWithContent = {}
      for (const [id, mems] of Object.entries(res.memories)) {
        if (mems && mems.length > 0) memoriesWithContent[id] = mems
      }
      if (Object.keys(memoriesWithContent).length > 0) {
        await plazaStore.commitMemories({
          topicTitle: topic.value.title,
          agentMemories: memoriesWithContent,
          agentTypes,
        })
      }
      memoryStatus.value = 'Memories saved to soul files'
      setTimeout(() => { memoryStatus.value = '' }, 4000)
    } else {
      memoryStatus.value = ''
    }
  } catch {
    memoryStatus.value = ''
  }
}

</script>

<style scoped>
.session-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-main);
}
.session-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 2rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
}
.session-back-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-weight: 600;
  font-size: var(--fs-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.session-back-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.session-header-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}
.session-title {
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-status-badge {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.status-setup { background: rgba(99,102,241,0.12); color: #6366F1; }
.status-running { background: rgba(245,158,11,0.12); color: #D97706; }
.status-paused { background: rgba(99,102,241,0.12); color: #6366F1; }
.status-concluded { background: rgba(16,185,129,0.12); color: #059669; }
.status-deadlocked { background: rgba(107,114,128,0.12); color: #4B5563; }
.session-header-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
.session-layout {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem 2rem 1.5rem;
  overflow: hidden;
}
.session-left {
  flex: 6;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}
.session-right {
  flex: 4;
  min-width: 0;
  overflow-y: auto;
}
.session-messages {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  
  padding-right: 0.25rem;
}
.session-loading, .session-no-msgs {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem 0;
  font-size: var(--fs-secondary);
}
.session-msg {
  display: flex;
  gap: 0.625rem;
  animation: msgIn 200ms ease-out;
}
@keyframes msgIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.msg-avatar-img {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.msg-avatar-img.streaming-avatar {
  border: 2px solid #F59E0B;
}
.msg-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-size: var(--fs-caption);
  font-weight: 700;
  flex-shrink: 0;
}
.msg-body {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.625rem 0.875rem;
}
.msg-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}
.msg-name {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.msg-round {
  font-size: var(--fs-small);
  color: var(--text-muted);
}
.msg-text {
  font-size: var(--fs-body);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.streaming-msg .msg-body {
  border-color: #F59E0B;
}
.streaming-indicator {
  color: #F59E0B;
  font-weight: 600;
}
.session-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.625rem 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.toolbar-rounds {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
}
.toolbar-memory-status {
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #10B981;
  animation: memFade 300ms ease-out;
}
.session-conclusion {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  flex-shrink: 0;
}
.conclusion-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: rgba(255,255,255,0.6);
  font-size: var(--fs-caption);
  font-weight: 600;
  margin-bottom: 0.375rem;
}
.conclusion-text {
  font-size: var(--fs-secondary);
  color: #FFFFFF;
  margin: 0;
  line-height: 1.6;
  white-space: pre-wrap;
}
@keyframes memFade {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
