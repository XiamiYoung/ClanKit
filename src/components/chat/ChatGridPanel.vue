<template>
  <div class="grid-panel" v-bind="$attrs">
    <!-- ── Shared ChatHeader ── -->
    <ChatHeader
      :chatId="chatId"
      :isGridView="true"
      :compactPersonas="true"
      @open-chat-settings="$emit('open-chat-settings', chatId)"
      @open-soul-viewer="(id, type, name) => $emit('open-soul-viewer', id, type, name)"
      @remove-group-persona="(cId, pid) => $emit('remove-group-persona', cId, pid)"
    >
      <template #row-bottom-left>
        <span v-if="chatsStore.pendingPermissionChatIds.has(props.chatId)" class="gp-approval-badge">
          <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Approval
        </span>
        <span v-else-if="isRunning" class="gp-running-badge">
          <span class="gp-running-dot"></span>
          Running
        </span>
      </template>
      <template #actions>
        <!-- Maximize (black gradient style) -->
        <button class="gp-maximize-btn" @click.stop="$emit('maximize')" title="Open in single view">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <!-- Swap -->
        <div class="gp-swap-wrap" ref="swapWrapEl">
          <button ref="swapBtnEl" class="gp-swap-btn" :class="{ active: showSwapMenu }" @click.stop="toggleSwapMenu" title="Switch to another chat">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
          </button>
        </div>
      </template>
    </ChatHeader>

    <!-- ── Shared ChatWindow (messages + input) ── -->
    <ChatWindow
      :chatId="chatId"
      :showQuote="true"
      :showDelete="true"
      @send="onSend"
      @send-with-attachments="onSendWithAttachments"
      @stop="stopChat"
      @delete-message="deleteMessage"
    />
  </div>

  <!-- Teleported swap dropdown (escapes grid cell overflow:hidden) -->
  <Teleport to="body">
    <div v-if="showSwapMenu" class="gp-swap-dropdown" :style="swapDropdownStyle" @click.stop>
      <div class="gp-swap-header">
        <div class="gp-swap-header-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </div>
        <span>Switch Chat</span>
      </div>
      <div class="gp-swap-search-wrap">
        <svg style="width:14px;height:14px;color:#6B7280;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input v-model="swapSearch" type="text" placeholder="Search chats..." class="gp-swap-search" ref="swapSearchEl" />
      </div>
      <div class="gp-swap-list">
        <button v-for="c in swapCandidates" :key="c.id" class="gp-swap-item" @click="doSwap(c.id)">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span class="gp-swap-item-title">{{ c.title || 'Untitled' }}</span>
          <span class="gp-swap-item-meta">{{ c.messages?.length ?? '?' }} msgs</span>
        </button>
        <div v-if="swapCandidates.length === 0" class="gp-swap-empty">No other chats</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineOptions({ inheritAttrs: false })
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { usePersonasStore } from '../../stores/personas'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import { useToolsStore } from '../../stores/tools'
import { useKnowledgeStore } from '../../stores/knowledge'
import { v4 as uuidv4 } from 'uuid'
import ChatHeader from './ChatHeader.vue'
import ChatWindow from './ChatWindow.vue'

const props = defineProps({
  chatId: { type: String, required: true },
  gridChatIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['select', 'swap-chat', 'maximize', 'open-chat-settings', 'open-soul-viewer', 'remove-group-persona'])

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const skillsStore = useSkillsStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const knowledgeStore = useKnowledgeStore()

// Swap menu state
const showSwapMenu = ref(false)
const swapSearch = ref('')
const swapWrapEl = ref(null)
const swapBtnEl = ref(null)
const swapSearchEl = ref(null)
const swapDropdownPos = reactive({ top: 0, right: 0 })

const swapDropdownStyle = computed(() => ({
  position: 'fixed',
  top: swapDropdownPos.top + 'px',
  left: swapDropdownPos.right + 'px',
  zIndex: 9999,
}))

function toggleSwapMenu() {
  showSwapMenu.value = !showSwapMenu.value
  if (showSwapMenu.value && swapBtnEl.value) {
    const rect = swapBtnEl.value.getBoundingClientRect()
    swapDropdownPos.top = rect.bottom + 6
    // Align right edge of dropdown to right edge of button
    const dropdownWidth = 300
    swapDropdownPos.right = Math.max(8, rect.right - dropdownWidth)
  }
}

const chat = computed(() => chatsStore.chats.find(c => c.id === props.chatId) || null)
const isRunning = computed(() => chat.value?.isRunning ?? false)

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
  if (!showSwapMenu.value) return
  // Check if click is inside the button or the teleported dropdown
  if (swapWrapEl.value && swapWrapEl.value.contains(e.target)) return
  const dropdown = document.querySelector('.gp-swap-dropdown')
  if (dropdown && dropdown.contains(e.target)) return
  showSwapMenu.value = false
  swapSearch.value = ''
}
watch(showSwapMenu, v => { if (v) nextTick(() => swapSearchEl.value?.focus()) })

// ── Lifecycle ──
onMounted(() => { document.addEventListener('click', onDocClick) })
onUnmounted(() => { document.removeEventListener('click', onDocClick) })

// ── Send with attachments ──
async function onSendWithAttachments(text, pendingAttachments) {
  return onSend(text, pendingAttachments)
}

// ── Send (receives text from ChatWindow) ──
async function onSend(text, pendingAttachments = []) {
  if (!text && pendingAttachments.length === 0) return
  if (!props.chatId) return
  const chatId = props.chatId
  const targetChat = chatsStore.chats.find(c => c.id === chatId); if (!targetChat) return
  if (targetChat.isRunning) return
  // Build display content with attachment labels
  let displayContent = text || ''
  if (pendingAttachments.length > 0) {
    const labels = pendingAttachments.map(a => `[Attached: ${a.name}]`).join(' ')
    displayContent = displayContent ? `${displayContent}\n${labels}` : labels
  }
  const attachmentMeta = pendingAttachments.map(a => ({
    id: a.id, name: a.name, type: a.type, path: a.path, size: a.size, preview: a.preview, mediaType: a.mediaType
  }))
  if (!window.electronAPI?.runAgent) {
    await chatsStore.addMessage(chatId, { role: 'user', content: displayContent, ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}) })
    await chatsStore.addMessage(chatId, { role: 'assistant', content: 'Agent loop is not available in browser mode.' })
    return
  }
  await chatsStore.addMessage(chatId, { role: 'user', content: displayContent, ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}) })
  if (targetChat.messages) for (const m of targetChat.messages) if (m.streaming) m.streaming = false
  const streamingMsgId = uuidv4()
  await chatsStore.addMessage(chatId, { id: streamingMsgId, role: 'assistant', content: '', streaming: true, streamingStartedAt: Date.now(), segments: [] })
  targetChat.isRunning = true
  const apiMessages = targetChat.messages.filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content)).map(m => ({ role: m.role, content: m.content }))
  const cfg = { ...configStore.config }
  const chatProvider = targetChat.provider || 'anthropic'
  if (chatProvider === 'anthropic') { cfg.apiKey = cfg.anthropic?.apiKey || ''; cfg.baseURL = cfg.anthropic?.baseURL || 'https://api.anthropic.com' }
  else if (chatProvider === 'openrouter') { cfg.apiKey = cfg.openrouter?.apiKey || ''; cfg.baseURL = cfg.openrouter?.baseURL || 'https://openrouter.ai/api' }
  else if (chatProvider === 'openai') { cfg.openaiApiKey = cfg.openai?.apiKey || ''; cfg.openaiBaseURL = cfg.openai?.baseURL || 'https://mlaas.virtuosgames.com'; cfg._resolvedProvider = 'openai'; cfg.defaultProvider = 'openai' }
  if (targetChat.model) cfg.customModel = targetChat.model
  if (targetChat.workingPath) cfg.chatWorkingPath = targetChat.workingPath
  const sysPersona = targetChat.systemPersonaId ? personasStore.getPersonaById(targetChat.systemPersonaId) : personasStore.defaultSystemPersona
  const usrPersona = targetChat.userPersonaId ? personasStore.getPersonaById(targetChat.userPersonaId) : personasStore.defaultUserPersona
  const personaPrompts = {}
  if (sysPersona?.prompt) personaPrompts.systemPersonaPrompt = sysPersona.prompt
  if (usrPersona?.prompt) personaPrompts.userPersonaPrompt = usrPersona.prompt
  personaPrompts.systemPersonaId = sysPersona?.id || '__default_system__'
  personaPrompts.userPersonaId = usrPersona?.id || '__default_user__'
  const singleCfg = { ...cfg }
  const personaProvider = sysPersona?.providerId || chatProvider
  if (personaProvider === 'anthropic') { singleCfg.apiKey = cfg.anthropic?.apiKey || ''; singleCfg.baseURL = cfg.anthropic?.baseURL || 'https://api.anthropic.com' }
  else if (personaProvider === 'openrouter') { singleCfg.apiKey = cfg.openrouter?.apiKey || ''; singleCfg.baseURL = cfg.openrouter?.baseURL || 'https://openrouter.ai/api' }
  else if (personaProvider === 'openai') { singleCfg.openaiApiKey = cfg.openai?.apiKey || ''; singleCfg.openaiBaseURL = cfg.openai?.baseURL || 'https://mlaas.virtuosgames.com'; singleCfg._resolvedProvider = 'openai'; singleCfg.defaultProvider = 'openai' }
  const personaModel = sysPersona?.modelId || targetChat.model || null
  if (personaModel) singleCfg.customModel = personaModel
  try {
    const res = await window.electronAPI.runAgent({
      chatId, messages: JSON.parse(JSON.stringify(apiMessages)), config: JSON.parse(JSON.stringify(singleCfg)),
      enabledAgents: [], enabledSkills: JSON.parse(JSON.stringify(skillsStore.allSkillObjects)), personaPrompts,
      ...(pendingAttachments.length > 0 ? { currentAttachments: JSON.parse(JSON.stringify(pendingAttachments)) } : {}),
      mcpServers: (targetChat.enabledMcpIds
        ? mcpStore.servers.filter(s => targetChat.enabledMcpIds.includes(s.id))
        : mcpStore.servers
      ).map(s => JSON.parse(JSON.stringify(s))),
      httpTools: (targetChat.enabledToolIds
        ? toolsStore.tools.filter(t => targetChat.enabledToolIds.includes(t.id))
        : toolsStore.tools
      ).map(t => JSON.parse(JSON.stringify(t))),
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
  }
}

async function stopChat() {
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(props.chatId)
  const c = chatsStore.chats.find(c => c.id === props.chatId)
  if (c) { c.isRunning = false; c.isThinking = false; if (c.messages) for (const msg of c.messages) if (msg.streaming) msg.streaming = false }
}

function deleteMessage(msg) {
  chatsStore.deleteMessage(props.chatId, msg.id)
}
</script>

<style scoped>
.grid-panel { display:flex; flex-direction:column; background:#FFFFFF; overflow:hidden; min-width:0; min-height:0; }

/* ── Approval badge (red, pulsing) ── */
.gp-approval-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 10px 3px 8px; border-radius: var(--radius-full, 9999px);
  background: #EF4444;
  color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem); font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(239,68,68,0.3);
  animation: approvalPulse 1.5s ease-in-out infinite;
}
@keyframes approvalPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.65; } }

/* ── Running badge (black gradient) ── */
.gp-running-badge {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 10px 3px 8px; border-radius: var(--radius-full, 9999px);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem); font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  animation: gridPulse 1.2s ease-in-out infinite;
}
.gp-running-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #FFFFFF;
  animation: gridPulse 1.2s ease-in-out infinite;
}
@keyframes gridPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }

/* ── Maximize button (icon-only, black gradient) ── */
.gp-maximize-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}
.gp-maximize-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}

/* ── Swap button (icon-only, black gradient) ── */
.gp-swap-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  flex-shrink: 0;
}
.gp-swap-btn:hover, .gp-swap-btn.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}

.gp-swap-wrap { position: relative; }
</style>

<!-- Unscoped styles for teleported swap dropdown -->
<style>
.gp-swap-dropdown {
  width: 300px;
  max-height: 400px;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: gp-swap-enter 0.15s ease-out;
}
@keyframes gp-swap-enter { from { opacity:0; transform:scale(0.96) translateY(4px); } to { opacity:1; transform:scale(1) translateY(0); } }
.gp-swap-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #1F1F1F;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 700;
  color: #FFFFFF;
}
.gp-swap-header-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.gp-swap-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px;
  padding: 8px 12px;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  background: #1A1A1A;
  transition: border-color 0.15s;
}
.gp-swap-search-wrap:focus-within { border-color: #4B5563; }
.gp-swap-search {
  flex: 1;
  padding: 0;
  border: none;
  background: transparent;
  font-size: var(--fs-secondary, 0.875rem);
  font-family: 'Inter', sans-serif;
  outline: none;
  color: #FFFFFF;
}
.gp-swap-search::placeholder { color: #6B7280; }
.gp-swap-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  scrollbar-width: thin;
}
.gp-swap-list::-webkit-scrollbar { width: 6px; }
.gp-swap-list::-webkit-scrollbar-track { background: transparent; }
.gp-swap-list::-webkit-scrollbar-thumb { background: #374151; border-radius: 9999px; }
.gp-swap-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s ease;
  gap: 10px;
  text-align: left;
  color: #9CA3AF;
}
.gp-swap-item:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
}
.gp-swap-item:hover .gp-swap-item-title { color: #FFFFFF; }
.gp-swap-item:hover .gp-swap-item-meta { color: rgba(255,255,255,0.5); }
.gp-swap-item:hover svg { color: #FFFFFF; }
.gp-swap-item-title {
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  color: #D1D1D6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.gp-swap-item-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  color: #6B7280;
  flex-shrink: 0;
}
.gp-swap-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: var(--fs-secondary, 0.875rem);
  color: #6B7280;
}
</style>
