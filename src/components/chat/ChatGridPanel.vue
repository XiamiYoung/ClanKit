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
      @start-call="cId => $emit('start-call', cId)"
    >
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
      @pause="pauseChat"
      @stop="stopChat"
      @delete-message="deleteMessage"
    >
      <template #input>
        <div class="gp-input-area">
          <!-- Attachment preview strip -->
          <div v-if="gpAttachments.length > 0" class="gp-attach-strip">
            <template v-for="att in gpAttachments" :key="att.id">
              <!-- Image thumbnail -->
              <div
                v-if="att.type === 'image' && att.preview"
                class="gp-att-img-wrap"
              >
                <img :src="att.preview" :alt="att.name" class="gp-att-img" />
                <button @click="removeGpAttachment(att.id)" class="gp-att-remove" aria-label="Remove image">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <!-- File chip -->
              <div v-else class="gp-att-chip" :style="att.type === 'error' ? 'background:#FEE2E2;color:#991B1B;border-color:#FCA5A5;' : ''">
                <svg v-if="att.type === 'image'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <svg v-else-if="att.type === 'folder'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <svg v-else-if="att.type === 'error'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <svg v-else class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="gp-att-name">{{ att.name }}</span>
                <button @click="removeGpAttachment(att.id)" class="gp-att-chip-remove" aria-label="Remove attachment">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </template>
          </div>

          <!-- Input box row -->
          <div class="gp-input-box" :class="{ focused: gpInputFocused }">
            <!-- Attach button -->
            <button
              @click="pickGpFiles"
              :disabled="isRunning"
              class="gp-icon-btn"
              aria-label="Attach files"
              title="Attach files or folders"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>

            <ChatMentionInput
              ref="mentionInputRef"
              v-model="gpInputText"
              :personaIds="chatPersonaIds"
              :isGroupChat="isGroupChat"
              :isRunning="isRunning"
              :compact="true"
              @send="onMentionSend"
              @focus="gpInputFocused = true"
              @blur="gpInputFocused = false"
              @attach="atts => gpAttachments.push(...atts)"
            />

            <!-- Pause / Stop buttons -->
            <template v-if="isRunning">
              <button
                @click="pauseChat"
                class="gp-icon-btn gp-stop-btn"
                aria-label="Pause agent"
                title="Pause (Esc) — interrupt but keep queue"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              </button>
              <button
                @click="stopChat"
                class="gp-icon-btn gp-stop-btn"
                aria-label="Stop agent"
                title="Stop — interrupt and clear queue"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </button>
            </template>

            <!-- Send button -->
            <button
              @click="onMentionSend(gpInputText)"
              :disabled="!gpInputText.trim() && gpAttachments.length === 0"
              class="gp-icon-btn gp-send-btn"
              :class="{ active: gpInputText.trim() || gpAttachments.length > 0 }"
              aria-label="Send message"
              :title="isRunning ? 'Send (queued)' : 'Send message'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          <!-- Hint bar -->
          <div class="gp-hint-bar">
            <div class="gp-hint-left">
              <span v-if="gpAttachments.length > 0" class="gp-att-count">{{ gpAttachments.length }} file{{ gpAttachments.length !== 1 ? 's' : '' }} attached</span>
              <span v-if="isGroupChat && stickyTargetLabel" class="gp-sticky-indicator">
                Talking to <strong>{{ stickyTargetLabel }}</strong>
                <button class="gp-sticky-clear" @click="clearStickyTarget" title="Reset to all">
                  <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </span>
            </div>
            <span class="gp-hint-right">↵ send · ⇧↵ newline</span>
          </div>
        </div>
      </template>
    </ChatWindow>
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
        <template v-if="swapTree.length > 0">
          <template v-for="node in swapTree" :key="node.type === 'folder' ? 'f-' + node.id : node.id">
            <!-- Folder row -->
            <template v-if="node.type === 'folder'">
              <button class="gp-swap-folder" @click.stop="toggleSwapFolder(node.id)">
                <svg style="width:12px;height:12px;flex-shrink:0;transition:transform 0.15s;" :style="collapsedFolders.has(node.id) ? '' : 'transform:rotate(90deg)'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                <span class="gp-swap-folder-name">{{ node.name }}</span>
                <span class="gp-swap-folder-count">{{ node.children.length }}</span>
              </button>
              <template v-if="!collapsedFolders.has(node.id)">
                <button v-for="c in node.children" :key="c.id" class="gp-swap-item gp-swap-item-indent" @click="doSwap(c.id)">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span class="gp-swap-item-title">{{ c.title || 'Untitled' }}</span>
                  <span class="gp-swap-item-meta">{{ c.messages?.length ?? '?' }} msgs</span>
                </button>
              </template>
            </template>
            <!-- Root chat row -->
            <button v-else class="gp-swap-item" @click="doSwap(node.id)">
              <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span class="gp-swap-item-title">{{ node.title || 'Untitled' }}</span>
              <span class="gp-swap-item-meta">{{ node.messages?.length ?? '?' }} msgs</span>
            </button>
          </template>
        </template>
        <div v-else class="gp-swap-empty">No other chats</div>
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
import ChatMentionInput from './ChatMentionInput.vue'
import { parseMentions } from '../../utils/mentions'

const props = defineProps({
  chatId: { type: String, required: true },
  gridChatIds: { type: Array, default: () => [] }
})

const emit = defineEmits(['select', 'swap-chat', 'maximize', 'open-chat-settings', 'open-soul-viewer', 'remove-group-persona', 'start-call'])

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const skillsStore = useSkillsStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const knowledgeStore = useKnowledgeStore()

// ── Input area state ──
const gpInputText = ref('')
const mentionInputRef = ref(null)
const gpAttachments = ref([])
const gpInputFocused = ref(false)

// ── Sticky target label for hint bar ──
const stickyTargetLabel = computed(() => {
  if (!stickyTarget.value?.length) return ''
  const names = stickyTarget.value
    .map(id => personasStore.getPersonaById(id)?.name)
    .filter(Boolean)
  return names.join(', ')
})

// ── Chat persona info (for @mention support) ──
const chatPersonaIds = computed(() => {
  const c = chatsStore.chats.find(c => c.id === props.chatId)
  if (!c) return []
  if (c.groupPersonaIds?.length > 0) return [...c.groupPersonaIds]
  const id = c.systemPersonaId || personasStore.defaultSystemPersona?.id
  return id ? [id] : []
})

const isGroupChat = computed(() => {
  const c = chatsStore.chats.find(c => c.id === props.chatId)
  return c?.isGroupChat ?? false
})

// ── Sticky @mention target for this grid panel ──
const stickyTarget = ref(null)

// ── Swap menu state
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
const collapsedFolders = ref(new Set())
function toggleSwapFolder(id) {
  const s = new Set(collapsedFolders.value)
  s.has(id) ? s.delete(id) : s.add(id)
  collapsedFolders.value = s
}

const swapTree = computed(() => {
  const q = swapSearch.value.toLowerCase()
  const excluded = new Set(props.gridChatIds)

  function matchChat(c) {
    return !excluded.has(c.id) && (!q || (c.title || '').toLowerCase().includes(q))
  }

  function buildTree(nodes) {
    const result = []
    for (const node of nodes) {
      if (node.type === 'folder') {
        const children = (node.children || []).filter(c => c.type === 'chat' && matchChat(c))
        if (!q || children.length > 0 || node.name.toLowerCase().includes(q)) {
          if (children.length > 0) result.push({ ...node, children })
        }
      } else if (matchChat(node)) {
        result.push(node)
      }
    }
    return result
  }

  return buildTree(chatsStore.chatTree)
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

// ── File attachment helpers ──
async function pickGpFiles() {
  if (!window.electronAPI?.pickFiles) return
  try {
    const results = await window.electronAPI.pickFiles()
    if (results?.length) gpAttachments.value.push(...results)
  } catch { /* ignore */ }
}

function removeGpAttachment(id) {
  gpAttachments.value = gpAttachments.value.filter(a => a.id !== id)
}

function clearStickyTarget() {
  stickyTarget.value = null
}

// ── Send from mention input (handles group chat @mention routing) ──
async function onMentionSend(text) {
  const hasAttachments = gpAttachments.value.length > 0
  if (!text?.trim() && !hasAttachments) return
  const chatId = props.chatId
  const targetChat = chatsStore.chats.find(c => c.id === chatId)
  if (!targetChat || targetChat.isRunning) return

  const pendingAttachments = [...gpAttachments.value]
  gpInputText.value = ''
  gpAttachments.value = []
  mentionInputRef.value?.resetHeight()

  const groupIds = chatPersonaIds.value
  if (isGroupChat.value && groupIds.length > 1) {
    // GROUP CHAT: resolve @mention routing
    const groupPersonas = groupIds.map(id => personasStore.getPersonaById(id)).filter(Boolean)
    const { mentions, mentionAll } = parseMentions(text, groupPersonas)
    const cfg = { ...configStore.config }

    let addressees = mentions
    if (!mentionAll && mentions.length >= 2) {
      try {
        const mentionedPersonas = mentions.map(id => {
          const p = personasStore.getPersonaById(id)
          return p ? { id, name: p.name } : null
        }).filter(Boolean)
        const result = await window.electronAPI.resolveAddressees({
          message: text,
          personas: mentionedPersonas,
          config: JSON.parse(JSON.stringify(cfg)),
        })
        if (result?.addresseeIds?.length > 0) addressees = result.addresseeIds
      } catch { /* fallback to all mentions */ }
    }

    let respondingIds
    if (mentionAll) {
      respondingIds = [...groupIds]
      stickyTarget.value = null
    } else if (addressees.length > 0) {
      respondingIds = [...new Set(addressees)]
      stickyTarget.value = [...respondingIds]
    } else if (stickyTarget.value?.length > 0) {
      respondingIds = stickyTarget.value.filter(id => groupIds.includes(id))
      if (respondingIds.length === 0) { respondingIds = [...groupIds]; stickyTarget.value = null }
    } else {
      respondingIds = [...groupIds]
    }

    // Add user message
    const attachmentMeta = pendingAttachments.map(a => ({ id: a.id, name: a.name, type: a.type, path: a.path, size: a.size, preview: a.preview, mediaType: a.mediaType }))
    await chatsStore.addMessage(chatId, { role: 'user', content: text, mentions, mentionAll, ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}) })
    if (targetChat.messages) for (const m of targetChat.messages) if (m.streaming) m.streaming = false

    // Run each responding persona sequentially
    const chatProvider = targetChat.provider || 'anthropic'
    const apiMessages = targetChat.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content }))

    targetChat.isRunning = true
    try {
      for (const personaId of respondingIds) {
        const persona = personasStore.getPersonaById(personaId)
        if (!persona) continue
        const streamingMsgId = uuidv4()
        await chatsStore.addMessage(chatId, {
          id: streamingMsgId, role: 'assistant', content: '', streaming: true,
          streamingStartedAt: Date.now(), segments: [], personaId, personaName: persona.name,
        })
        const singleCfg = { ...cfg }
        const pProvider = persona.providerId || chatProvider
        if (pProvider === 'anthropic') { singleCfg.apiKey = cfg.anthropic?.apiKey || ''; singleCfg.baseURL = cfg.anthropic?.baseURL || '' }
        else if (pProvider === 'openrouter') { singleCfg.apiKey = cfg.openrouter?.apiKey || ''; singleCfg.baseURL = cfg.openrouter?.baseURL || '' }
        else if (pProvider === 'openai') { singleCfg.openaiApiKey = cfg.openai?.apiKey || ''; singleCfg.openaiBaseURL = cfg.openai?.baseURL || ''; singleCfg._resolvedProvider = 'openai'; singleCfg.defaultProvider = 'openai' }
        const pModel = persona.modelId || targetChat.model || null
        if (pModel) singleCfg.customModel = pModel
        if (targetChat.workingPath) singleCfg.chatWorkingPath = targetChat.workingPath

        const usrPersona = targetChat.userPersonaId ? personasStore.getPersonaById(targetChat.userPersonaId) : personasStore.defaultUserPersona
        const personaPrompts = { systemPersonaId: personaId, userPersonaId: usrPersona?.id || '__default_user__' }
        if (persona.prompt) personaPrompts.systemPersonaPrompt = persona.prompt
        if (usrPersona?.prompt) personaPrompts.userPersonaPrompt = usrPersona.prompt

        try {
          const res = await window.electronAPI.runAgent({
            chatId, messages: JSON.parse(JSON.stringify(apiMessages)),
            config: JSON.parse(JSON.stringify(singleCfg)),
            enabledAgents: [], enabledSkills: JSON.parse(JSON.stringify(skillsStore.allSkillObjects)),
            personaPrompts,
            mcpServers: (targetChat.enabledMcpIds ? mcpStore.servers.filter(s => targetChat.enabledMcpIds.includes(s.id)) : mcpStore.servers).map(s => JSON.parse(JSON.stringify(s))),
            httpTools: (targetChat.enabledToolIds ? toolsStore.tools.filter(t => targetChat.enabledToolIds.includes(t.id)) : toolsStore.tools).map(t => JSON.parse(JSON.stringify(t))),
            knowledgeConfig: { ragEnabled: knowledgeStore.ragEnabled, pineconeApiKey: knowledgeStore.pineconeApiKey, pineconeIndexName: knowledgeStore.pineconeIndexName, embeddingProvider: knowledgeStore.embeddingProvider, embeddingModel: knowledgeStore.embeddingModel, indexConfigs: JSON.parse(JSON.stringify(knowledgeStore.indexConfigs)) },
          })
          const currentChat = chatsStore.chats.find(c => c.id === chatId)
          if (currentChat?.messages) {
            const msg = currentChat.messages.find(m => m.id === streamingMsgId)
            if (msg) {
              if (res.success) { if (!msg.content && res.result) { msg.segments = [{ type: 'text', content: res.result }]; msg.content = res.result } }
              else { msg.segments = [{ type: 'text', content: `Error: ${res.error}` }]; msg.content = `Error: ${res.error}` }
              msg.streaming = false
              if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
            }
          }
          // Append this persona's reply to apiMessages for next persona's context
          const replyContent = res.success ? (res.result || '') : `Error: ${res.error}`
          apiMessages.push({ role: 'assistant', content: replyContent })
        } catch (err) {
          const currentChat = chatsStore.chats.find(c => c.id === chatId)
          if (currentChat?.messages) {
            const msg = currentChat.messages.find(m => m.id === streamingMsgId)
            if (msg) { msg.content = `Error: ${err.message}`; msg.streaming = false; if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt }
          }
        }
      }
    } finally {
      const finChat = chatsStore.chats.find(c => c.id === chatId)
      if (finChat) { finChat.isRunning = false; finChat.isThinking = false }
      if (finChat?.messages) for (const m of finChat.messages) if (m.streaming) { m.streaming = false; if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt }
      await chatsStore.persist?.()
    }
  } else {
    // SINGLE PERSONA: delegate to existing onSend
    await onSend(text, pendingAttachments)
  }
}

// ── Send with attachments ──
async function onSendWithAttachments(text, pendingAttachments) {
  return onSend(text, pendingAttachments)
}

// ── Send (receives text from ChatWindow default input) ──
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
  if (chatProvider === 'anthropic') { cfg.apiKey = cfg.anthropic?.apiKey || ''; cfg.baseURL = cfg.anthropic?.baseURL || '' }
  else if (chatProvider === 'openrouter') { cfg.apiKey = cfg.openrouter?.apiKey || ''; cfg.baseURL = cfg.openrouter?.baseURL || '' }
  else if (chatProvider === 'openai') { cfg.openaiApiKey = cfg.openai?.apiKey || ''; cfg.openaiBaseURL = cfg.openai?.baseURL || ''; cfg._resolvedProvider = 'openai'; cfg.defaultProvider = 'openai' }
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
  if (personaProvider === 'anthropic') { singleCfg.apiKey = cfg.anthropic?.apiKey || ''; singleCfg.baseURL = cfg.anthropic?.baseURL || '' }
  else if (personaProvider === 'openrouter') { singleCfg.apiKey = cfg.openrouter?.apiKey || ''; singleCfg.baseURL = cfg.openrouter?.baseURL || '' }
  else if (personaProvider === 'openai') { singleCfg.openaiApiKey = cfg.openai?.apiKey || ''; singleCfg.openaiBaseURL = cfg.openai?.baseURL || ''; singleCfg._resolvedProvider = 'openai'; singleCfg.defaultProvider = 'openai' }
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

function _getLastActiveMessage() {
  const c = chatsStore.chats.find(c => c.id === props.chatId)
  if (!c?.messages?.length) return { chat: null, msg: null }
  const streaming = [...c.messages].reverse().find(m => m.streaming)
  return { chat: c, msg: streaming ?? ([...c.messages].reverse().find(m => m.role === 'assistant') ?? null) }
}

function _applyInterrupt(chat, msg, type) {
  const inlineMarker = type === 'stop'
    ? '[Request interrupted by user. Queue cleared.]'
    : '[Request interrupted by user]'
  const bubbleText = type === 'stop'
    ? 'Request stopped by user. Type a new message to continue.'
    : 'Request interrupted by user.'

  if (!msg) {
    chat?.messages?.push({
      id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
      segments: [{ type: 'text', content: bubbleText }],
      streaming: false, timestamp: Date.now(),
    })
    return
  }

  const hasContent = msg.content?.trim().length > 0
  if (hasContent) {
    msg.content += `\n\n${inlineMarker}`
    msg.streaming = false
  } else {
    const idx = chat?.messages?.indexOf(msg) ?? -1
    if (idx !== -1) chat.messages.splice(idx, 1)
    chat?.messages?.push({
      id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
      segments: [{ type: 'text', content: bubbleText }],
      streaming: false, timestamp: Date.now(),
    })
  }
}

// Pause: interrupt the agent, preserve queue (grid panels manage their own send guards)
async function pauseChat() {
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(props.chatId)
  const { chat, msg } = _getLastActiveMessage()
  _applyInterrupt(chat, msg, 'pause')
}

// Stop: same as pause for grid panels (no global queue to clear)
async function stopChat() {
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(props.chatId)
  const { chat, msg } = _getLastActiveMessage()
  _applyInterrupt(chat, msg, 'stop')
}

function deleteMessage(msg) {
  chatsStore.deleteMessage(props.chatId, msg.id)
}
</script>

<style scoped>
.grid-panel { display:flex; flex-direction:column; background:#FFFFFF; overflow:hidden; min-width:0; min-height:0; }

/* ── Input area wrapper ── */
.gp-input-area {
  padding: 0.5rem 0.75rem 0.375rem;
  border-top: 1px solid var(--border, #E5E5EA);
  background: #FFFFFF;
}

/* ── Attachment preview strip ── */
.gp-attach-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-bottom: 0.375rem;
  padding: 0 0.125rem;
}
.gp-att-img-wrap {
  position: relative;
  width: 4rem;
  height: 4rem;
  border-radius: 0.625rem;
  overflow: hidden;
  border: 1px solid #93C5FD;
  background: #EFF6FF;
  flex-shrink: 0;
}
.gp-att-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.gp-att-remove {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.gp-att-chip {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.25rem 0.375rem 0.25rem 0.5rem;
  border-radius: 0.5rem;
  font-size: var(--fs-small, 0.75rem);
  max-width: 11.25rem;
  background: #F5F5F5;
  color: #6B7280;
  border: 1px solid #E5E5EA;
}
.gp-att-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.gp-att-chip-remove {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.25rem;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  flex-shrink: 0;
  padding: 0;
}
.gp-att-chip-remove:hover { opacity: 1; }

/* ── Input box row (attach + textarea + stop + send) ── */
.gp-input-box {
  display: flex;
  align-items: flex-end;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border, #E5E5EA);
  border-radius: 0.875rem;
  background: #FAFAFA;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.gp-input-box.focused {
  border-color: #1A1A1A;
  background: #FFFFFF;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.04);
}

/* ── Icon buttons (attach, stop, send) ── */
.gp-icon-btn {
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 0.625rem;
  border: none;
  background: #F5F5F5;
  color: #9CA3AF;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s ease;
  margin-bottom: 0.125rem;
  padding: 0;
}
.gp-icon-btn:hover:not(:disabled) { background: #E5E5EA; color: #1A1A1A; }
.gp-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.gp-stop-btn { background: rgba(255,59,48,0.08); color: #FF3B30; }
.gp-stop-btn:hover { background: rgba(255,59,48,0.14) !important; color: #FF3B30 !important; }
.gp-send-btn { background: #E5E5EA; color: #9CA3AF; }
.gp-send-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.gp-send-btn.active:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%) !important; color: #FFFFFF !important; }

/* ── Hint bar ── */
.gp-hint-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.25rem;
  padding: 0 0.125rem;
}
.gp-hint-left { display: flex; align-items: center; gap: 0.5rem; }
.gp-att-count { font-size: var(--fs-small, 0.75rem); color: #1A1A1A; font-weight: 500; }
.gp-hint-right { font-size: var(--fs-small, 0.75rem); color: #9CA3AF; }
.gp-sticky-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-small, 0.75rem);
  color: #6B7280;
  background: rgba(0,0,0,0.04);
  border-radius: 0.375rem;
  padding: 0.125rem 0.375rem 0.125rem 0.5rem;
}
.gp-sticky-indicator strong { color: #1A1A1A; }
.gp-sticky-clear {
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 0.25rem;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.gp-sticky-clear:hover { color: #1A1A1A; }

/* ── Approval badge (red, pulsing) ── */
.gp-approval-badge {
  display: flex; align-items: center; gap: 0.3125rem;
  padding: 0.1875rem 0.625rem 0.1875rem 0.5rem; border-radius: var(--radius-full, 9999px);
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
  display: flex; align-items: center; gap: 0.3125rem;
  padding: 0.1875rem 0.625rem 0.1875rem 0.5rem; border-radius: var(--radius-full, 9999px);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem); font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  animation: gridPulse 1.2s ease-in-out infinite;
}
.gp-running-dot {
  width: 0.375rem; height: 0.375rem; border-radius: 50%;
  background: #FFFFFF;
  animation: gridPulse 1.2s ease-in-out infinite;
}
@keyframes gridPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }

/* ── Maximize button (icon-only, black gradient) ── */
.gp-maximize-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  padding: 0;
  border-radius: 0.5rem;
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
  width: 1.875rem;
  height: 1.875rem;
  padding: 0;
  border-radius: 0.5rem;
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
  width: 18.75rem;
  max-height: 25rem;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
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
  gap: 0.625rem;
  padding: 0.875rem 1rem 0.625rem;
  border-bottom: 1px solid #1F1F1F;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 700;
  color: #FFFFFF;
}
.gp-swap-header-icon {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
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
  gap: 0.5rem;
  margin: 0.5rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
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
  padding: 0.375rem;
  scrollbar-width: thin;
}
.gp-swap-list::-webkit-scrollbar { width: 6px; }
.gp-swap-list::-webkit-scrollbar-track { background: transparent; }
.gp-swap-list::-webkit-scrollbar-thumb { background: #374151; border-radius: 9999px; }
.gp-swap-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s ease;
  gap: 0.625rem;
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
  font-size: 0.625rem;
  font-weight: 500;
  color: #6B7280;
  flex-shrink: 0;
}
.gp-swap-empty {
  padding: 1.5rem 1rem;
  text-align: center;
  font-size: var(--fs-secondary, 0.875rem);
  color: #6B7280;
}
.gp-swap-folder {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: background 0.12s, color 0.12s;
}
.gp-swap-folder:hover { background: rgba(255,255,255,0.06); color: #9CA3AF; }
.gp-swap-folder-name { flex: 1; }
.gp-swap-folder-count {
  font-size: 0.7rem;
  background: rgba(255,255,255,0.08);
  border-radius: 0.25rem;
  padding: 0.1rem 0.35rem;
}
.gp-swap-item-indent { padding-left: 1.75rem; }
</style>
