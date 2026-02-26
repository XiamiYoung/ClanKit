<template>
  <div class="grid-panel">
    <!-- ── Header bar ── -->
    <div class="gp-header">
      <!-- Row 1: Title + actions -->
      <div class="gp-header-row">
        <div class="gp-title-area" @click="$emit('select', chatId)">
          <svg class="gp-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="gp-title">{{ chat?.title || 'Chat' }}</span>
        </div>
        <div class="gp-header-actions">
          <span v-if="isRunning" class="gp-running-badge">
            <span class="gp-running-dot"></span>
            Running
          </span>
          <!-- Maximize -->
          <button class="gp-action-btn" @click.stop="$emit('maximize')" title="Maximize — open in single view">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>
          <!-- Swap -->
          <div class="gp-swap-wrap" ref="swapWrapEl">
            <button class="gp-action-btn" :class="{ active: showSwapMenu }" @click.stop="showSwapMenu = !showSwapMenu" title="Switch to another chat">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </button>
            <div v-if="showSwapMenu" class="gp-swap-dropdown" @click.stop>
              <div class="gp-swap-header">Switch chat</div>
              <input v-model="swapSearch" type="text" placeholder="Search chats..." class="gp-swap-search" ref="swapSearchEl" />
              <div class="gp-swap-list">
                <button v-for="c in swapCandidates" :key="c.id" class="gp-swap-item" @click="doSwap(c.id)">
                  <span class="gp-swap-item-title">{{ c.title || 'Untitled' }}</span>
                  <span class="gp-swap-item-meta">{{ c.messages?.length ?? '?' }} msgs</span>
                </button>
                <div v-if="swapCandidates.length === 0" class="gp-swap-empty">No other chats</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Row 2: Personas + model -->
      <div class="gp-meta-row">
        <div class="gp-persona-chip" :title="userPersonaName">
          <div class="gp-persona-avatar user">
            <img v-if="userAvatarUri" :src="userAvatarUri" alt="" class="gp-persona-avatar-img" />
            <svg v-else style="width:10px;height:10px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <span class="gp-persona-name">{{ userPersonaName }}</span>
        </div>
        <svg class="gp-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        <div class="gp-persona-chip system" :title="systemPersonaName">
          <div class="gp-sys-avatar-stack">
            <div v-for="(pid, idx) in systemPersonaIds.slice(0, 3)" :key="pid" class="gp-persona-avatar system" :style="{ zIndex: systemPersonaIds.length - idx, marginLeft: idx > 0 ? '-4px' : '0' }">
              <img v-if="getPersonaAvatar(pid)" :src="getPersonaAvatar(pid)" alt="" class="gp-persona-avatar-img" />
              <span v-else class="gp-persona-initial">{{ getPersonaInitial(pid) }}</span>
            </div>
            <div v-if="systemPersonaIds.length > 3" class="gp-persona-avatar system gp-persona-overflow" :style="{ marginLeft: '-4px', zIndex: 0 }">
              <span class="gp-persona-initial">+{{ systemPersonaIds.length - 3 }}</span>
            </div>
          </div>
          <span class="gp-persona-name">{{ systemPersonaName }}</span>
        </div>
        <div class="flex-1"></div>
        <span class="gp-model-badge" :title="modelLabel">{{ modelLabelShort }}</span>
      </div>
    </div>

    <!-- ── Messages (same layout as single view) ── -->
    <div ref="messagesEl" class="gp-messages" @scroll="onScroll">
      <div v-if="chat?.messages === null" class="gp-placeholder">
        <div class="gp-spinner"></div>
        <span style="font-size:var(--fs-small); color:#9CA3AF;">Loading</span>
      </div>
      <div v-else-if="!chat?.messages?.length" class="gp-placeholder">
        <div class="gp-empty-icon">
          <svg style="width:28px;height:28px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <span style="font-size:var(--fs-secondary); color:#9CA3AF;">Start a conversation</span>
      </div>
      <template v-else>
        <div
          v-for="msg in chat.messages"
          :key="msg.id"
          :class="['flex gap-2.5 animate-fade-in', msg.role === 'user' ? 'justify-end' : 'justify-start']"
        >
          <!-- Assistant avatar -->
          <div v-if="msg.role === 'assistant'" class="gp-msg-avatar-col">
            <div class="gp-msg-avatar-wrap">
              <img v-if="getSystemAvatar(msg)" :src="getSystemAvatar(msg)" alt="" class="gp-msg-avatar-img" />
              <div v-else class="gp-msg-avatar-fallback system">
                <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0"/>
                </svg>
              </div>
            </div>
            <span class="gp-msg-name">{{ getMsgAssistantName(msg) }}</span>
          </div>

          <!-- Bubble -->
          <div :class="['relative group/bubble', msg.role === 'assistant' ? 'min-w-[40%] max-w-[80%]' : 'max-w-[75%]']">
            <!-- Hover actions -->
            <div v-if="!msg.streaming" class="absolute -top-2 right-1 z-10 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all duration-150">
              <button v-if="msg.content" @click="copyMessage(msg)" class="gp-msg-action" :title="copiedId === msg.id ? 'Copied!' : 'Copy'">
                <svg v-if="copiedId === msg.id" class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
            </div>
            <div :class="['gp-msg-bubble', msg.role === 'user' ? 'gp-msg-bubble-user' : 'gp-msg-bubble-assistant']">
              <div v-if="msg.streaming && (!msg.content && (!msg.segments || msg.segments.length === 0))" class="gp-thinking">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </div>
              <div :class="msg.role === 'user' ? 'user-content' : 'prose-sparkai'">
                <MessageRenderer :message="msg" />
              </div>
            </div>
            <div class="gp-msg-timestamp" :style="msg.role === 'user' ? 'text-align:right;' : 'text-align:left;'">
              {{ formatTime(msg.timestamp) }}
            </div>
          </div>

          <!-- User avatar -->
          <div v-if="msg.role === 'user'" class="gp-msg-avatar-col">
            <div class="gp-msg-avatar-wrap">
              <img v-if="userAvatarUri" :src="userAvatarUri" alt="" class="gp-msg-avatar-img" />
              <div v-else class="gp-msg-avatar-fallback user">
                <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
            </div>
            <span class="gp-msg-name">{{ userPersonaName }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- ── Input area (same structure as single view) ── -->
    <div class="gp-input-area">
      <div class="gp-input-box" :class="{ focused: inputFocused }">
        <textarea
          ref="inputEl"
          v-model="inputText"
          @keydown="onKeydown"
          @focus="inputFocused = true"
          @blur="inputFocused = false"
          placeholder="Type your message here..."
          rows="2"
          class="gp-textarea"
        />
        <!-- Stop -->
        <button v-if="isRunning" @click.stop="stopChat" class="gp-btn stop" aria-label="Stop" title="Stop agent">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        </button>
        <!-- Send -->
        <button
          @click.stop="sendMessage"
          :disabled="!inputText.trim()"
          class="gp-btn send"
          :class="{ active: inputText.trim() }"
          aria-label="Send"
          :title="isRunning ? 'Queue message' : 'Send message'"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { usePersonasStore } from '../../stores/personas'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import { useToolsStore } from '../../stores/tools'
import { useKnowledgeStore } from '../../stores/knowledge'
import { getAvatarDataUri } from '../personas/personaAvatars'
import { v4 as uuidv4 } from 'uuid'
import MessageRenderer from './MessageRenderer.vue'

const props = defineProps({
  chatId: { type: String, required: true },
  gridChatIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['select', 'swap-chat', 'maximize'])

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const skillsStore = useSkillsStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const knowledgeStore = useKnowledgeStore()

const inputText = ref('')
const inputEl = ref(null)
const inputFocused = ref(false)
const messagesEl = ref(null)
const userScrolled = ref(false)
let programmaticScrollCount = 0

// Swap menu state
const showSwapMenu = ref(false)
const swapSearch = ref('')
const swapWrapEl = ref(null)
const swapSearchEl = ref(null)

// Copy state
const copiedId = ref(null)

const chat = computed(() => chatsStore.chats.find(c => c.id === props.chatId) || null)
const isRunning = computed(() => chat.value?.isRunning ?? false)

// ── Persona helpers ──
function getAvatarUri(persona) {
  if (!persona?.avatar) return null
  return getAvatarDataUri(persona.avatar)
}
function getPersonaAvatar(pid) {
  return getAvatarUri(personasStore.getPersonaById(pid))
}
function getPersonaInitial(pid) {
  return (personasStore.getPersonaById(pid)?.name || '?').charAt(0)
}
function getSystemAvatar(msg) {
  const pid = msg.personaId || chat.value?.systemPersonaId
  const persona = pid ? personasStore.getPersonaById(pid) : personasStore.defaultSystemPersona
  return getAvatarUri(persona)
}
function getMsgAssistantName(msg) {
  const pid = msg.personaId || systemPersonaIds.value[0]
  const persona = pid ? personasStore.getPersonaById(pid) : null
  return persona?.name || msg.personaName || 'Assistant'
}

const userPersona = computed(() => {
  const id = chat.value?.userPersonaId
  return id ? personasStore.getPersonaById(id) : personasStore.defaultUserPersona
})
const userPersonaName = computed(() => userPersona.value?.name || 'User')
const userAvatarUri = computed(() => getAvatarUri(userPersona.value))
const systemPersonaIds = computed(() => {
  const c = chat.value
  if (!c) return []
  if (c.groupPersonaIds?.length) return c.groupPersonaIds
  const id = c.systemPersonaId || personasStore.defaultSystemPersona?.id
  return id ? [id] : []
})
const systemPersonaName = computed(() => {
  const ids = systemPersonaIds.value
  if (ids.length === 0) return 'Assistant'
  if (ids.length === 1) return personasStore.getPersonaById(ids[0])?.name || 'Assistant'
  return `${ids.length} personas`
})

// ── Model label ──
const modelLabel = computed(() => {
  const c = chat.value; if (!c) return ''
  return `${c.provider || 'anthropic'} / ${c.model || configStore.config.activeModel || ''}`
})
const modelLabelShort = computed(() => {
  const c = chat.value; if (!c) return ''
  const provider = c.provider || 'anthropic'
  const model = c.model || configStore.config.activeModel || ''
  const short = model.length > 16 ? model.slice(0, 14) + '…' : model
  return `${provider}/${short}`
})

// ── Time formatter ──
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

// ── Copy ──
async function copyMessage(msg) {
  try {
    let text = msg.content || ''
    if (msg.segments?.length) text = msg.segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n').trim()
    await navigator.clipboard.writeText(text)
    copiedId.value = msg.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch (e) { console.error('Copy failed', e) }
}

// ── Swap ──
const swapCandidates = computed(() => {
  const q = swapSearch.value.toLowerCase()
  return chatsStore.chats
    .filter(c => !props.gridChatIds.includes(c.id))
    .filter(c => !q || (c.title || '').toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 20)
})
function doSwap(newId) { emit('swap-chat', props.chatId, newId); showSwapMenu.value = false; swapSearch.value = '' }
function onDocClick(e) {
  if (showSwapMenu.value && swapWrapEl.value && !swapWrapEl.value.contains(e.target)) { showSwapMenu.value = false; swapSearch.value = '' }
}
watch(showSwapMenu, v => { if (v) nextTick(() => swapSearchEl.value?.focus()) })

// ── Lifecycle ──
onMounted(async () => {
  await chatsStore.ensureMessages(props.chatId)
  scrollToBottom(true)
  document.addEventListener('click', onDocClick)
})
onUnmounted(() => { document.removeEventListener('click', onDocClick) })

// ── Scroll ──
watch(() => chat.value?.messages?.length, () => { scrollToBottom() }, { flush: 'post' })
watch(() => { const msgs = chat.value?.messages; if (!msgs?.length) return 0; return msgs[msgs.length-1]?.content?.length ?? 0 }, () => { scrollToBottom() }, { flush: 'post' })

function scrollToBottom(force = false) {
  if (!force && userScrolled.value) return
  programmaticScrollCount++
  nextTick(() => { nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    requestAnimationFrame(() => { programmaticScrollCount = Math.max(0, programmaticScrollCount - 1) })
  }) })
}
function onScroll() {
  if (programmaticScrollCount > 0) return
  const el = messagesEl.value; if (!el) return
  userScrolled.value = (el.scrollHeight - el.scrollTop - el.clientHeight) > 60
}

function onKeydown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

// ── Send ──
async function sendMessage() {
  const text = inputText.value.trim(); if (!text || !props.chatId) return
  const chatId = props.chatId
  const targetChat = chatsStore.chats.find(c => c.id === chatId); if (!targetChat) return
  if (targetChat.isRunning) return
  if (!window.electronAPI?.runAgent) {
    await chatsStore.addMessage(chatId, { role: 'user', content: text })
    await chatsStore.addMessage(chatId, { role: 'assistant', content: 'Agent loop is not available in browser mode.' })
    return
  }
  inputText.value = ''; inputFocused.value = false; userScrolled.value = false
  await chatsStore.addMessage(chatId, { role: 'user', content: text })
  if (targetChat.messages) for (const m of targetChat.messages) if (m.streaming) m.streaming = false
  const streamingMsgId = uuidv4()
  await chatsStore.addMessage(chatId, { id: streamingMsgId, role: 'assistant', content: '', streaming: true, streamingStartedAt: Date.now(), segments: [] })
  scrollToBottom(true); targetChat.isRunning = true
  const apiMessages = targetChat.messages.filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content)).map(m => ({ role: m.role, content: m.content }))
  const cfg = { ...configStore.config }
  const chatProvider = targetChat.provider || 'anthropic'
  if (chatProvider === 'openrouter') { cfg.apiKey = cfg.openrouterApiKey; cfg.baseURL = cfg.openrouterBaseURL }
  else if (chatProvider === 'openai') { cfg.openaiApiKey = cfg.openaiApiKey || ''; cfg.openaiBaseURL = cfg.openaiBaseURL || 'https://mlaas.virtuosgames.com'; cfg._resolvedProvider = 'openai'; cfg.defaultProvider = 'openai' }
  if (targetChat.model) cfg.customModel = targetChat.model
  const sysPersona = targetChat.systemPersonaId ? personasStore.getPersonaById(targetChat.systemPersonaId) : personasStore.defaultSystemPersona
  const usrPersona = targetChat.userPersonaId ? personasStore.getPersonaById(targetChat.userPersonaId) : personasStore.defaultUserPersona
  const personaPrompts = {}
  if (sysPersona?.prompt) personaPrompts.systemPersonaPrompt = sysPersona.prompt
  if (usrPersona?.prompt) personaPrompts.userPersonaPrompt = usrPersona.prompt
  personaPrompts.systemPersonaId = sysPersona?.id || '__default_system__'
  personaPrompts.userPersonaId = usrPersona?.id || '__default_user__'
  const singleCfg = { ...cfg }
  const personaProvider = sysPersona?.providerId || chatProvider
  if (personaProvider === 'openrouter') { singleCfg.apiKey = cfg.openrouterApiKey; singleCfg.baseURL = cfg.openrouterBaseURL }
  else if (personaProvider === 'openai') { singleCfg.openaiApiKey = cfg.openaiApiKey || ''; singleCfg.openaiBaseURL = cfg.openaiBaseURL || 'https://mlaas.virtuosgames.com'; singleCfg._resolvedProvider = 'openai'; singleCfg.defaultProvider = 'openai' }
  const personaModel = sysPersona?.modelId || targetChat.model || null
  if (personaModel) singleCfg.customModel = personaModel
  try {
    const res = await window.electronAPI.runAgent({
      chatId, messages: JSON.parse(JSON.stringify(apiMessages)), config: JSON.parse(JSON.stringify(singleCfg)),
      enabledAgents: [], enabledSkills: JSON.parse(JSON.stringify(skillsStore.allSkillObjects)), personaPrompts,
      mcpServers: mcpStore.servers.map(s => JSON.parse(JSON.stringify(s))),
      httpTools: toolsStore.tools.map(t => JSON.parse(JSON.stringify(t))),
      knowledgeConfig: { ragEnabled: knowledgeStore.ragEnabled, pineconeApiKey: knowledgeStore.pineconeApiKey, pineconeIndexName: knowledgeStore.pineconeIndexName, embeddingProvider: knowledgeStore.embeddingProvider, embeddingModel: knowledgeStore.embeddingModel, indexConfigs: JSON.parse(JSON.stringify(knowledgeStore.indexConfigs)) },
    })
    if (targetChat.messages) {
      const msg = targetChat.messages.find(m => m.id === streamingMsgId)
      if (msg) {
        if (res.success) { if (!msg.content && res.result) { msg.segments = [{ type: 'text', content: res.result }]; msg.content = res.result } }
        else { msg.segments = [{ type: 'text', content: `Error: ${res.error}` }]; msg.content = `Error: ${res.error}` }
        msg.streaming = false; if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
      }
    }
    await chatsStore.persist?.()
  } catch (err) {
    const tc = chatsStore.chats.find(c => c.id === chatId)
    if (tc?.messages) { const msg = tc.messages.find(m => m.id === streamingMsgId); if (msg) { msg.content = `Error: ${err.message}`; msg.streaming = false; if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt } }
  } finally {
    const finChat = chatsStore.chats.find(c => c.id === chatId)
    if (finChat) { finChat.isRunning = false; finChat.isThinking = false }
    if (finChat?.messages) for (const m of finChat.messages) if (m.streaming) { m.streaming = false; if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt }
    scrollToBottom(true)
  }
}

async function stopChat() {
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(props.chatId)
  const c = chatsStore.chats.find(c => c.id === props.chatId)
  if (c) { c.isRunning = false; c.isThinking = false; if (c.messages) for (const msg of c.messages) if (msg.streaming) msg.streaming = false }
}
</script>

<style scoped>
.grid-panel { display:flex; flex-direction:column; background:#FFFFFF; overflow:hidden; min-width:0; min-height:0; }

/* ── Header ── */
.gp-header { flex-shrink:0; border-bottom:1px solid var(--border,#E5E5EA); background:var(--bg-card,#FFFFFF); }
.gp-header-row { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; gap:6px; }
.gp-title-area { display:flex; align-items:center; gap:6px; min-width:0; flex:1; cursor:pointer; }
.gp-title-area:hover .gp-title { color:var(--accent,#007AFF); }
.gp-chat-icon { width:16px; height:16px; flex-shrink:0; color:var(--text-primary,#1A1A1A); }
.gp-title { font-family:'Inter',sans-serif; font-size:var(--fs-secondary,0.875rem); font-weight:600; color:var(--text-primary,#1A1A1A); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:color 0.15s ease; }
.gp-header-actions { display:flex; align-items:center; gap:4px; flex-shrink:0; }
.gp-running-badge { display:flex; align-items:center; gap:4px; font-size:var(--fs-small,0.75rem); font-weight:500; color:#FF9500; white-space:nowrap; }
.gp-running-dot { width:6px; height:6px; border-radius:50%; background:#FF9500; animation:gridPulse 1.2s ease-in-out infinite; }
@keyframes gridPulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
.gp-action-btn { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; color:var(--text-muted,#9CA3AF); cursor:pointer; transition:all 0.15s ease; }
.gp-action-btn:hover, .gp-action-btn.active { background:var(--bg-hover,#F5F5F5); color:var(--text-primary,#1A1A1A); }

/* Meta row */
.gp-meta-row { display:flex; align-items:center; gap:6px; padding:0 10px 6px; overflow:hidden; }
.gp-persona-chip { display:flex; align-items:center; gap:4px; min-width:0; max-width:140px; }
.gp-sys-avatar-stack { display:flex; align-items:center; flex-shrink:0; }
.gp-persona-avatar { width:20px; height:20px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; border:1.5px solid #fff; }
.gp-persona-avatar.user { background:linear-gradient(135deg,#007AFF,#5856D6); }
.gp-persona-avatar.system { background:linear-gradient(135deg,#0F0F0F,#374151); box-shadow:0 1px 3px rgba(0,0,0,0.08); }
.gp-persona-avatar-img { width:100%; height:100%; border-radius:50%; object-fit:cover; }
.gp-persona-initial { font-size:9px; font-weight:700; color:#fff; line-height:1; }
.gp-persona-overflow { background:#6B7280; }
.gp-persona-name { font-size:var(--fs-small,0.75rem); color:var(--text-secondary,#6B7280); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; }
.gp-arrow-icon { width:10px; height:10px; flex-shrink:0; color:#D1D1D6; }
.gp-model-badge { font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-muted,#9CA3AF); background:#F5F5F5; padding:1px 6px; border-radius:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; flex-shrink:0; }

/* ── Swap dropdown ── */
.gp-swap-wrap { position:relative; }
.gp-swap-dropdown { position:absolute; top:100%; right:0; z-index:100; width:240px; max-height:320px; background:#FFFFFF; border:1px solid var(--border,#E5E5EA); border-radius:var(--radius-md,12px); box-shadow:0 12px 40px rgba(0,0,0,0.14),0 4px 12px rgba(0,0,0,0.06); display:flex; flex-direction:column; overflow:hidden; }
.gp-swap-header { padding:8px 12px 4px; font-size:var(--fs-small,0.75rem); font-weight:600; color:var(--text-secondary,#6B7280); text-transform:uppercase; letter-spacing:0.04em; }
.gp-swap-search { margin:4px 8px; padding:6px 10px; border:1px solid var(--border,#E5E5EA); border-radius:var(--radius-sm,8px); font-size:var(--fs-secondary,0.875rem); font-family:'Inter',sans-serif; outline:none; color:var(--text-primary,#1A1A1A); }
.gp-swap-search:focus { border-color:var(--text-primary,#1A1A1A); box-shadow:0 0 0 3px rgba(0,0,0,0.06); }
.gp-swap-list { flex:1; overflow-y:auto; padding:4px; }
.gp-swap-list::-webkit-scrollbar { width:6px; }
.gp-swap-list::-webkit-scrollbar-thumb { background:#D1D1D6; border-radius:9999px; }
.gp-swap-item { display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 10px; border:none; border-radius:8px; background:transparent; cursor:pointer; transition:background 0.12s ease; gap:8px; text-align:left; }
.gp-swap-item:hover { background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); }
.gp-swap-item:hover .gp-swap-item-title, .gp-swap-item:hover .gp-swap-item-meta { color:#FFFFFF; }
.gp-swap-item-title { font-size:var(--fs-secondary,0.875rem); font-weight:500; color:var(--text-primary,#1A1A1A); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; flex:1; }
.gp-swap-item-meta { font-size:var(--fs-small,0.75rem); color:var(--text-muted,#9CA3AF); flex-shrink:0; }
.gp-swap-empty { padding:16px; text-align:center; font-size:var(--fs-secondary,0.875rem); color:var(--text-muted,#9CA3AF); }

/* ── Messages area (matches single view) ── */
.gp-messages { flex:1; overflow-y:auto; padding:16px 16px; display:flex; flex-direction:column; gap:14px; min-height:0; background:#FFFFFF; }

/* Scrollbar — dark / wide */
.gp-messages::-webkit-scrollbar { width:10px; }
.gp-messages::-webkit-scrollbar-track { background:#F2F2F7; border-radius:5px; }
.gp-messages::-webkit-scrollbar-thumb { background:linear-gradient(180deg,#1A1A1A 0%,#374151 100%); border-radius:5px; border:2px solid #F2F2F7; }
.gp-messages::-webkit-scrollbar-thumb:hover { background:linear-gradient(180deg,#0F0F0F 0%,#1A1A1A 100%); }

.gp-placeholder { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; }
.gp-empty-icon { width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08); }
.gp-spinner { width:24px; height:24px; border:2.5px solid #E5E5EA; border-top-color:#1A1A1A; border-radius:50%; animation:spin 0.6s linear infinite; }
@keyframes spin { to{transform:rotate(360deg);} }

/* ── Message avatars (same as single view) ── */
.gp-msg-avatar-col { display:flex; flex-direction:column; align-items:center; gap:3px; flex-shrink:0; }
.gp-msg-avatar-wrap { flex-shrink:0; }
.gp-msg-avatar-img { width:36px; height:36px; border-radius:50%; object-fit:cover; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.gp-msg-avatar-fallback { width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.gp-msg-avatar-fallback.system { background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08); }
.gp-msg-avatar-fallback.user { background:#007AFF; }
.gp-msg-name { display:inline-block; padding:1px 6px; border-radius:9999px; background:#1A1A1A; color:#fff; font-size:0.56rem; font-weight:600; font-family:'Inter',sans-serif; letter-spacing:-0.01em; line-height:1.5; white-space:nowrap; }

/* ── Message hover actions (same as single view) ── */
.gp-msg-action { width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; background:#1A1A1A; color:#fff; border:none; box-shadow:0 1px 3px rgba(0,0,0,0.12); transition:background 0.15s; }
.gp-msg-action:hover { background:#374151; }

/* ── Message bubbles (same as single view) ── */
.gp-msg-bubble { padding:12px 16px; line-height:1.65; border-radius:16px; font-family:'Inter',sans-serif; font-size:var(--fs-body,0.9375rem); }
.gp-msg-bubble :deep(> div:last-child p:last-child),
.gp-msg-bubble :deep(> div:last-child ul:last-child),
.gp-msg-bubble :deep(> div:last-child ol:last-child) { margin-bottom:0; }
.gp-msg-bubble-user { background:linear-gradient(135deg,#4338CA 0%,#6366F1 50%,#818CF8 100%); color:#ffffff; box-shadow:0 4px 16px rgba(99,102,241,0.25),0 1px 4px rgba(67,56,202,0.15); }
.gp-msg-bubble-user :deep(*) { color:#FFFFFF !important; }
.gp-msg-bubble-assistant { background:linear-gradient(135deg,#F3F4F6 0%,#E5E7EB 100%); border:none; color:#1A1A1A; box-shadow:0 2px 8px rgba(0,0,0,0.05),0 1px 3px rgba(0,0,0,0.03); }
.gp-msg-timestamp { font-family:'Inter',sans-serif; font-size:var(--fs-small,0.75rem); color:#9CA3AF; margin-top:2px; }

.gp-thinking { display:flex; gap:3px; padding:4px 0; }
.gp-thinking .dot { width:5px; height:5px; border-radius:50%; background:#9CA3AF; animation:gridBounce 1s ease-in-out infinite; }
.gp-thinking .dot:nth-child(2) { animation-delay:0.15s; }
.gp-thinking .dot:nth-child(3) { animation-delay:0.3s; }
@keyframes gridBounce { 0%,80%,100%{transform:translateY(0);} 40%{transform:translateY(-4px);} }

/* ── Input area (matches single view) ── */
.gp-input-area { padding:10px 16px 12px; flex-shrink:0; background:#FFFFFF; border-top:1px solid #E5E5EA; }
.gp-input-box { display:flex; gap:8px; align-items:flex-end; border-radius:14px; padding:10px 14px; background:#FFFFFF; border:1px solid #E5E5EA; box-shadow:0 1px 3px rgba(0,0,0,0.04); transition:border-color 0.2s,box-shadow 0.2s; }
.gp-input-box.focused { border-color:#1A1A1A; box-shadow:0 0 0 3px rgba(0,0,0,0.06); }
.gp-textarea { flex:1; resize:none; border:none; outline:none; background:transparent; font-family:'Inter',sans-serif; font-size:var(--fs-body,0.9375rem); color:var(--text-primary,#1A1A1A); line-height:1.5; min-height:44px; max-height:120px; overflow-y:auto; }
.gp-textarea::placeholder { color:var(--text-muted,#9CA3AF); }

.gp-btn { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; transition:all 0.15s ease; border:none; }
.gp-btn.stop { background:rgba(255,59,48,0.08); color:#FF3B30; }
.gp-btn.stop:hover { background:rgba(255,59,48,0.14); }
.gp-btn.send { background:#E5E5EA; color:#9CA3AF; cursor:not-allowed; }
.gp-btn.send.active { background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); color:#FFFFFF; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08); }
.gp-btn.send.active:hover { background:linear-gradient(135deg,#1A1A1A 0%,#2D2D2D 40%,#4B5563 100%); }
.gp-btn:disabled { cursor:not-allowed; }

@keyframes animate-fade-in { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
.animate-fade-in { animation:animate-fade-in 0.2s ease-out; }
</style>
