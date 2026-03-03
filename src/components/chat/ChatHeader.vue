<template>
  <div class="chat-header">
    <!-- Row 1: Centered title badge + slot for extra actions -->
    <div class="ch-row-top">
      <!-- Centered chat title badge -->
      <div class="ch-title-badge" v-if="!isEditing">
        <div class="ch-title-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <span v-if="isRunning" class="ch-title-spinner"></span>
        <span class="chat-header-title">{{ truncatedTitle }}</span>
        <button class="ch-edit-btn" @click.stop="startEdit" title="Rename chat">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      <!-- Inline edit mode -->
      <div class="ch-title-edit" v-else>
        <div class="ch-title-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <input
          ref="editInputEl"
          v-model="editTitle"
          class="ch-title-input"
          maxlength="60"
          @keydown.enter="confirmEdit"
          @keydown.escape="cancelEdit"
          @blur="confirmEdit"
        />
        <button class="ch-edit-confirm" @click.stop="confirmEdit" title="Save">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
      <!-- Extra action buttons slot (grid view inserts maximize + swap here) -->
      <div class="ch-row-top-actions">
        <!-- Voice call button (hidden for group chats) -->
        <button
          v-if="canStartCall"
          class="ch-call-btn"
          @click.stop="startCall"
          title="Start voice call"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </button>
        <slot name="actions" />
      </div>
    </div>

    <!-- Row 2: Personas (right-aligned, left of Chat Settings) + Chat Settings button -->
    <div class="ch-row-bottom">
      <slot name="row-bottom-left" />
      <div class="ch-row-bottom-right">
        <!-- Persona selectors -->
        <div class="persona-section">
          <!-- ── User persona ── -->
          <div class="persona-group">
            <div class="persona-card-wrap" ref="usrChipWrap">
              <div class="persona-card user" @mouseenter="showPersonaTooltip($event, resolvedUserPersonaId)" @mouseleave="hidePersonaTooltip">
                <div class="persona-card-avatar">
                  <img v-if="activeUserAvatarDataUri" :src="activeUserAvatarDataUri" alt="" class="persona-card-avatar-img" />
                  <div v-else class="persona-card-avatar-default user">
                    <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                </div>
                <div v-if="!compactPersonas" class="persona-card-info">
                  <span class="persona-card-name">{{ activeUserPersonaName }}</span>
                  <span v-if="activeUserPersona?.description" class="persona-card-desc">{{ activeUserPersona.description }}</span>
                </div>
                <button
                  class="persona-card-summary-btn"
                  @click.stop="$emit('open-soul-viewer', activeUserPersona?.id || '__default_user__', 'users', activeUserPersona?.name || 'User')"
                  title="View summary"
                >
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                    <line x1="10" y1="22" x2="14" y2="22"/>
                  </svg>
                </button>
              </div>
              <!-- User persona select button -->
              <button class="sys-add-btn" @click.stop="togglePopover('user')" title="Switch user persona">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              <!-- User popover -->
              <div v-if="showUsrPopover" class="persona-popover user-popover" @click.stop>
                <div class="persona-popover-header">User Persona</div>
                <button
                  v-for="p in sortedUserPersonas"
                  :key="p.id"
                  class="persona-popover-item has-description"
                  :class="{ selected: resolvedUserPersonaId === p.id }"
                  @click="selectPersona('user', p.isDefault ? null : p.id)"
                >
                  <div class="persona-popover-avatar-wrap">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:36px;height:36px;border-radius:50%;" />
                    <span v-else class="persona-popover-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="persona-popover-item-text">
                    <span>{{ p.name }}</span>
                    <span v-if="p.description" class="persona-popover-item-desc">{{ p.description }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <!-- ── System personas ── -->
          <div class="persona-group system-group">
            <!-- Overlapping avatar stack -->
            <div class="sys-avatar-stack">
              <div
                v-for="(pid, idx) in visibleSystemPersonaIds"
                :key="pid"
                class="sys-avatar-item"
                :class="{ active: sysPersonaConfigId === pid }"
                :style="{ zIndex: activeSystemPersonaIds.length - idx }"
                @click.stop="onSysAvatarClick(pid)"
                @mouseenter="showPersonaTooltip($event, pid)"
                @mouseleave="hidePersonaTooltip"
              >
                <img v-if="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" :src="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" alt="" class="sys-avatar-img" />
                <span v-else class="sys-avatar-fallback">{{ (personasStore.getPersonaById(pid)?.name || '?').charAt(0) }}</span>
                <button
                  v-if="activeSystemPersonaIds.length > 1"
                  class="sys-avatar-remove"
                  @click.stop="$emit('remove-group-persona', resolvedChatId, pid)"
                >
                  <svg style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <!-- Overflow count -->
              <div
                v-if="overflowSystemCount > 0"
                class="sys-avatar-item sys-avatar-overflow"
                :style="{ zIndex: 0 }"
                @click.stop="showGroupAddPopover = !showGroupAddPopover"
              >
                <span class="sys-avatar-fallback">+{{ overflowSystemCount }}</span>
              </div>
            </div>

            <!-- Active persona name label (no click) -->
            <template v-if="!compactPersonas">
              <div
                v-if="activeSystemPersonaIds.length === 1"
                class="sys-persona-label"
                @mouseenter="showPersonaTooltip($event, activeSystemPersonaIds[0])"
                @mouseleave="hidePersonaTooltip"
              >
                <span class="sys-persona-name">{{ personasStore.getPersonaById(activeSystemPersonaIds[0])?.name || 'Unknown' }}</span>
                <span v-if="personasStore.getPersonaById(activeSystemPersonaIds[0])?.description" class="sys-persona-desc">{{ personasStore.getPersonaById(activeSystemPersonaIds[0]).description }}</span>
              </div>
              <div v-else-if="activeSystemPersonaIds.length > 1" class="sys-persona-label">
                <span class="sys-persona-name">{{ activeSystemPersonaIds.length }} personas</span>
              </div>
            </template>

            <!-- Summary button (single persona) — also opens model config popover -->
            <button
              v-if="activeSystemPersonaIds.length === 1"
              class="persona-card-summary-btn"
              @click.stop="openSysPersonaConfig(activeSystemPersonaIds[0]); $emit('open-soul-viewer', activeSystemPersonaIds[0], 'system', personasStore.getPersonaById(activeSystemPersonaIds[0])?.name || 'System')"
              title="View summary"
            >
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                <line x1="10" y1="22" x2="14" y2="22"/>
              </svg>
            </button>

            <!-- Configure persona button + combobox -->
            <div class="persona-chip-wrap" ref="groupAddChipWrap">
              <button class="sys-add-btn" @click.stop="openPersonaCombobox" title="Configure personas">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
              <div v-if="showGroupAddPopover" class="sys-combobox" @click.stop>
                <div class="sys-combobox-search">
                  <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input
                    ref="personaSearchEl"
                    v-model="personaSearchQuery"
                    type="text"
                    placeholder="Search personas..."
                    class="sys-combobox-input"
                  />
                </div>
                <div class="sys-combobox-list">
                  <label
                    v-for="p in filteredSystemPersonas"
                    :key="p.id"
                    class="sys-combobox-item"
                    :class="{ selected: activeSystemPersonaIds.includes(p.id) }"
                  >
                    <div class="sys-combobox-check">
                      <input
                        type="checkbox"
                        :checked="activeSystemPersonaIds.includes(p.id)"
                        @change="toggleSystemPersona(p.id)"
                      />
                      <svg v-if="activeSystemPersonaIds.includes(p.id)" class="sys-combobox-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div class="sys-combobox-avatar">
                      <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" class="sys-combobox-avatar-img" />
                      <span v-else class="sys-combobox-avatar-fallback">{{ p.name.charAt(0) }}</span>
                    </div>
                    <div class="sys-combobox-info">
                      <span class="sys-combobox-name">{{ p.name }}</span>
                      <span v-if="p.description" class="sys-combobox-desc">{{ p.description }}</span>
                    </div>
                  </label>
                  <div v-if="filteredSystemPersonas.length === 0" class="sys-combobox-empty">No personas match your search</div>
                </div>
              </div>
            </div>

            <!-- Config popover (anchored to the system group) -->
            <div v-if="sysPersonaConfigId" class="sys-persona-config-popover" @click.stop>
              <div class="spc-header">
                <span class="spc-header-name">{{ personasStore.getPersonaById(sysPersonaConfigId)?.name || 'Persona' }}</span>
                <span v-if="personasStore.getPersonaById(sysPersonaConfigId)?.description" class="spc-header-desc">{{ personasStore.getPersonaById(sysPersonaConfigId).description }}</span>
                <button v-if="activeSystemPersonaIds.length > 1" class="persona-card-summary-btn" style="margin-left:auto;" @click.stop="openSysPersonaConfig(sysPersonaConfigId); $emit('open-soul-viewer', sysPersonaConfigId, 'system', personasStore.getPersonaById(sysPersonaConfigId)?.name || 'System')" title="View summary">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                    <line x1="10" y1="22" x2="14" y2="22"/>
                  </svg>
                </button>
              </div>
              <div class="spc-section">
                <div class="spc-label">Provider</div>
                <div class="spc-btn-row">
                  <button
                    v-for="prov in ['anthropic', 'openrouter', 'openai']"
                    :key="prov"
                    class="spc-btn"
                    :class="{ active: (personasStore.getPersonaById(sysPersonaConfigId)?.providerId || 'anthropic') === prov }"
                    @click="setSysPersonaProvider(sysPersonaConfigId, prov)"
                  >{{ prov === 'anthropic' ? 'Anthropic' : prov === 'openrouter' ? 'OpenRouter' : 'OpenAI' }}</button>
                </div>
              </div>
              <div class="spc-section">
                <div class="spc-label">Model</div>
                <input
                  v-if="sysConfigProvider !== 'anthropic'"
                  v-model="sysConfigModelFilter"
                  type="text"
                  placeholder="Search models..."
                  class="spc-search"
                  @click.stop
                />
                <div class="spc-model-list">
                  <button class="spc-model-item" :class="{ active: !personasStore.getPersonaById(sysPersonaConfigId)?.modelId }" @click="setSysPersonaModel(sysPersonaConfigId, null)">
                    <span>Default</span>
                    <span class="spc-model-id">{{ sysConfigDefaultModelLabel }}</span>
                  </button>
                  <button
                    v-for="m in sysConfigModelOptions"
                    :key="m.id"
                    class="spc-model-item"
                    :class="{ active: personasStore.getPersonaById(sysPersonaConfigId)?.modelId === m.id }"
                    @click="setSysPersonaModel(sysPersonaConfigId, m.id)"
                  >
                    <span>{{ m.name || m.label || m.id }}</span>
                    <span v-if="m.id !== (m.name || m.label)" class="spc-model-id">{{ m.id }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat Settings button -->
        <div class="chat-config-btn-wrap">
          <button class="chat-config-btn" @click="$emit('open-chat-settings')">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <!-- Hover tooltip summary -->
          <div class="chat-config-tooltip">
            <div class="chat-config-tooltip-row"><span class="cct-key">Provider</span><span class="cct-val">{{ effectiveProviderLabel }}</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">Model</span><span class="cct-val">{{ effectiveModelLabel }}</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">Tools</span><span class="cct-val">{{ enabledHttpTools.length }}/{{ toolsStore.tools.length }} ({{ formatTokens(toolsTokenEstimate) }})</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">MCP</span><span class="cct-val">{{ enabledMcpServers.length }}/{{ mcpStore.servers.length }} ({{ formatTokens(mcpTokenEstimate) }})</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">RAG</span><span class="cct-val">{{ ragEnabledCount }} index{{ ragEnabledCount !== 1 ? 'es' : '' }}</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">Path</span><span class="cct-val">{{ effectiveWorkingPath }}</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">Rounds</span><span class="cct-val">{{ effectivePersonaRounds }}</span></div>
            <div class="chat-config-tooltip-row"><span class="cct-key">Max Tokens</span><span class="cct-val">{{ effectiveMaxOutputTokens.toLocaleString() }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating persona tooltip (Teleport to body so it escapes overflow:hidden) -->
  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="ch-persona-tooltip-fixed"
      :style="{ top: tooltipState.y + 'px', left: tooltipState.x + 'px' }"
    >
      <div class="ch-persona-tooltip-name">{{ tooltipState.name }}</div>
      <div class="ch-persona-tooltip-text">{{ tooltipState.text }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { usePersonasStore } from '../../stores/personas'
import { useModelsStore } from '../../stores/models'
import { useToolsStore } from '../../stores/tools'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { getAvatarDataUri } from '../personas/personaAvatars'
import { estimateToolTokens, estimateMcpTokens, formatTokens } from '../../utils/tokenEstimate'
import { useVoiceStore } from '../../stores/voice'

const props = defineProps({
  chatId: { type: String, required: true },
  isGridView: { type: Boolean, default: false },
  compactPersonas: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-chat-settings',
  'open-soul-viewer',
  'remove-group-persona',
  'start-call',
])

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const voiceStore = useVoiceStore()

// ── Voice call ──
const isGroupChat = computed(() => chat.value?.isGroupChat ?? false)
const canStartCall = computed(() => {
  if (isGroupChat.value) return false
  if (voiceStore.isCallActive) return false
  return true
})

function startCall() {
  if (!canStartCall.value) return
  emit('start-call', props.chatId)
}
const modelsStore = useModelsStore()
const toolsStore = useToolsStore()
const mcpStore = useMcpStore()
const knowledgeStore = useKnowledgeStore()

// ── Computed chat reference ──
const chat = computed(() => chatsStore.chats.find(c => c.id === props.chatId) || null)
const resolvedChatId = computed(() => props.chatId)

// ── Running state ──
const isRunning = computed(() => chat.value?.isRunning ?? false)

// ── Truncated title ──
const titleMaxLen = computed(() => props.isGridView ? 20 : 100)
const truncatedTitle = computed(() => {
  const title = chat.value?.title || 'Chat'
  const max = titleMaxLen.value
  return title.length > max ? title.slice(0, max) + '…' : title
})

// ── Inline title editing ──
const isEditing = ref(false)
const editTitle = ref('')
const editInputEl = ref(null)

function startEdit() {
  editTitle.value = chat.value?.title || ''
  isEditing.value = true
  nextTick(() => editInputEl.value?.focus())
}

async function confirmEdit() {
  if (!isEditing.value) return
  const newTitle = editTitle.value.trim()
  if (newTitle && newTitle !== chat.value?.title) {
    await chatsStore.renameChat(props.chatId, newTitle)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

// ── User persona popover ──
const showUsrPopover = ref(false)
const usrChipWrap = ref(null)

// ── Group add popover ──
const showGroupAddPopover = ref(false)
const groupAddChipWrap = ref(null)
const personaSearchEl = ref(null)
const personaSearchQuery = ref('')

// ── System persona config popover ──
const sysPersonaConfigId = ref(null)
const sysConfigModelFilter = ref('')

// ── Own tooltip state (not shared with parent) ──
const tooltipState = reactive({ visible: false, name: '', text: '', x: 0, y: 0 })

// ── Persona computed ──
function getAvatarDataUriForPersona(persona) {
  if (!persona?.avatar) return null
  return getAvatarDataUri(persona.avatar)
}

const activeUserPersona = computed(() => {
  const id = chat.value?.userPersonaId
  return id ? personasStore.getPersonaById(id) : personasStore.defaultUserPersona
})
const activeUserAvatarDataUri = computed(() => getAvatarDataUriForPersona(activeUserPersona.value))
const activeUserPersonaName = computed(() => activeUserPersona.value?.name || 'Default')

const resolvedUserPersonaId = computed(() => {
  const id = chat.value?.userPersonaId
  return id || personasStore.defaultUserPersona?.id || null
})

const sortedUserPersonas = computed(() =>
  [...personasStore.userPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const sortedSystemPersonas = computed(() =>
  [...personasStore.systemPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const activeSystemPersonaIds = computed(() => {
  const c = chat.value
  if (!c) return []
  if (c.groupPersonaIds?.length > 0) return [...c.groupPersonaIds]
  const id = c.systemPersonaId || personasStore.defaultSystemPersona?.id
  return id ? [id] : []
})

const MAX_VISIBLE_AVATARS = 4
const visibleSystemPersonaIds = computed(() => activeSystemPersonaIds.value.slice(0, MAX_VISIBLE_AVATARS))
const overflowSystemCount = computed(() => Math.max(0, activeSystemPersonaIds.value.length - MAX_VISIBLE_AVATARS))

const filteredSystemPersonas = computed(() => {
  const q = personaSearchQuery.value.toLowerCase().trim()
  const list = sortedSystemPersonas.value
  if (!q) return list
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description && p.description.toLowerCase().includes(q))
  )
})

// ── Popover functions ──
function togglePopover(type) {
  if (type === 'user') {
    showUsrPopover.value = !showUsrPopover.value
  }
}

function selectPersona(type, id) {
  if (props.chatId) chatsStore.setChatPersona(props.chatId, type, id)
  showUsrPopover.value = false
}

function openPersonaCombobox() {
  showGroupAddPopover.value = !showGroupAddPopover.value
  if (showGroupAddPopover.value) {
    personaSearchQuery.value = ''
    nextTick(() => personaSearchEl.value?.focus())
  }
}

function toggleSystemPersona(personaId) {
  const chatId = props.chatId
  if (!chatId) return
  const c = chat.value
  const currentIds = activeSystemPersonaIds.value

  if (currentIds.includes(personaId)) {
    if (currentIds.length <= 1) return
    chatsStore.removeGroupPersona(chatId, personaId)
  } else {
    if (!c.isGroupChat) {
      chatsStore.toggleGroupMode(chatId, true)
    }
    chatsStore.addGroupPersona(chatId, personaId)
  }
}

// ── System avatar click: grid/group → soul viewer; normal → nothing ──
function onSysAvatarClick(pid) {
  if (props.compactPersonas || activeSystemPersonaIds.value.length > 1) {
    // Grid view or group chat: icon click opens soul viewer
    emit('open-soul-viewer', pid, 'system', personasStore.getPersonaById(pid)?.name || 'System')
  }
  // Normal single-persona view: no action on avatar click (use View Summary btn instead)
}

// ── System persona config popover ──
function openSysPersonaConfig(pid) {
  if (sysPersonaConfigId.value === pid) {
    sysPersonaConfigId.value = null
  } else {
    sysPersonaConfigId.value = pid
    sysConfigModelFilter.value = ''
    const persona = personasStore.getPersonaById(pid)
    const prov = persona?.providerId || 'anthropic'
    if (prov === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
    if (prov === 'openai' && !modelsStore.openaiCached) modelsStore.fetchOpenAIModels()
  }
}

function setSysPersonaProvider(pid, provider) {
  const persona = personasStore.getPersonaById(pid)
  if (!persona) return
  personasStore.savePersona({ ...persona, providerId: provider || null, modelId: null })
  if (provider === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (provider === 'openai' && !modelsStore.openaiCached) modelsStore.fetchOpenAIModels()
}

function setSysPersonaModel(pid, model) {
  const persona = personasStore.getPersonaById(pid)
  if (!persona) return
  personasStore.savePersona({ ...persona, modelId: model || null })
}

const sysConfigProvider = computed(() => {
  if (!sysPersonaConfigId.value) return 'anthropic'
  const p = personasStore.getPersonaById(sysPersonaConfigId.value)
  return p?.providerId || 'anthropic'
})

const sysConfigDefaultModelLabel = computed(() => {
  const chatModel = chat.value?.model
  if (chatModel) return chatModel
  return modelsStore.getDefaultModelLabel(sysConfigProvider.value)
})

const sysConfigModelOptions = computed(() => {
  const provider = sysConfigProvider.value
  const q = sysConfigModelFilter.value.trim().toLowerCase()
  const models = modelsStore.getModelsForProvider(provider)
  if (!q) return models
  return models.filter(m =>
    (m.name || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

// ── Persona tooltip (header-only) ──
function showPersonaTooltip(event, pid) {
  const persona = personasStore.getPersonaById(pid)
  if (!persona?.description) { tooltipState.visible = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  tooltipState.name = persona.name
  tooltipState.text = persona.description
  const tooltipWidth = 280
  let left = rect.left + rect.width / 2
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8))
  tooltipState.x = left
  tooltipState.y = rect.bottom + 10
  tooltipState.visible = true
}

function hidePersonaTooltip() {
  tooltipState.visible = false
}

// ── Chat Settings tooltip data ──
const effectiveProvider = computed(() => chat.value?.provider || 'anthropic')

const effectiveProviderLabel = computed(() => {
  const p = effectiveProvider.value
  if (p === 'openrouter') return 'OpenRouter'
  if (p === 'openai') return 'OpenAI'
  return 'Anthropic'
})

const effectiveModelLabel = computed(() => {
  const model = chat.value?.model
  if (!model) return 'Default'
  const orMatch = modelsStore.openrouterModels.find(m => m.id === model)
  if (orMatch) return orMatch.name
  const openaiMatch = modelsStore.openaiModels.find(m => m.id === model)
  if (openaiMatch) return openaiMatch.name || openaiMatch.id
  const anMatch = modelsStore.anthropicModels.find(m => m.id === model)
  if (anMatch) return anMatch.label
  return model.length > 30 ? '…' + model.slice(-28) : model
})

// Chat-level tool/MCP/RAG counts for the tooltip
const chatEnabledToolIds = computed(() => chat.value?.enabledToolIds ? new Set(chat.value.enabledToolIds) : new Set(toolsStore.tools.map(t => t.id)))
const enabledHttpTools = computed(() => toolsStore.tools.filter(t => chatEnabledToolIds.value.has(t.id)))
const toolsTokenEstimate = computed(() => enabledHttpTools.value.reduce((sum, t) => sum + estimateToolTokens(t), 0))

const chatEnabledMcpIds = computed(() => chat.value?.enabledMcpIds ? new Set(chat.value.enabledMcpIds) : new Set(mcpStore.servers.map(s => s.id)))
const enabledMcpServers = computed(() => mcpStore.servers.filter(s => chatEnabledMcpIds.value.has(s.id)))
const mcpTokenEstimate = computed(() =>
  enabledMcpServers.value.reduce((sum, s) => {
    const status = mcpStore.runningStatus[s.id]
    const toolCount = status?.toolCount ?? 10
    return sum + estimateMcpTokens(s, toolCount)
  }, 0)
)

const ragEnabledCount = computed(() => {
  const configs = knowledgeStore.indexConfigs
  return Object.values(configs).filter(c => c.enabled).length
})

const effectiveWorkingPath = computed(() => {
  return chat.value?.workingPath || configStore.config.artyfactPath || '~/.sparkai/artyfact'
})

const effectivePersonaRounds = computed(() => {
  return chat.value?.maxPersonaRounds ?? 10
})

const effectiveMaxOutputTokens = computed(() => {
  return chat.value?.maxOutputTokens ?? configStore.config.maxOutputTokens ?? 32768
})

// ── Click-outside handler ──
function handleOutsideClick(e) {
  if (usrChipWrap.value && !usrChipWrap.value.contains(e.target)) showUsrPopover.value = false
  if (groupAddChipWrap.value && !groupAddChipWrap.value.contains(e.target)) showGroupAddPopover.value = false
  if (sysPersonaConfigId.value) {
    const el = document.querySelector('.sys-persona-config-popover')
    if (el && !el.contains(e.target)) {
      const card = e.target.closest('.sys-avatar-item')
      if (!card) sysPersonaConfigId.value = null
    }
  }
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>

<style scoped>
.chat-header {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  position: relative;
  z-index: 20;
}

/* ── Row 1: Title row ── */
.ch-row-top {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px 4px;
  position: relative;
  min-height: 36px;
}

/* ── Title badge (centered) ── */
.ch-title-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: 9999px;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  transition: all 0.15s;
}
.ch-title-badge:hover {
  background: #EFEFEF;
  border-color: #D1D1D6;
}
.ch-title-icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
/* ── Running spinner (before title) ── */
.ch-title-spinner {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #1A1A1A;
  border-right-color: rgba(26, 26, 26, 0.4);
  animation: ch-title-spin 0.7s linear infinite;
}
@keyframes ch-title-spin {
  to { transform: rotate(360deg); }
}

.chat-header-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  max-width: 200px;
  letter-spacing: -0.01em;
}
.ch-edit-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.ch-edit-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}

/* ── Inline edit mode (centered) ── */
.ch-title-edit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px 4px 10px;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1.5px solid #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.ch-title-input {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #1A1A1A;
  border: none;
  outline: none;
  background: transparent;
  width: 180px;
  letter-spacing: -0.01em;
}
.ch-title-input::placeholder { color: #D1D1D6; }
.ch-edit-confirm {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.ch-edit-confirm:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── Actions (right-aligned over the centered content) ── */
.ch-row-top-actions {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* ── Call button ── */
.ch-call-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; cursor: pointer; transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.ch-call-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}

/* ── Row 2: Personas + Chat Settings ── */
.ch-row-bottom {
  display: flex;
  align-items: center;
  padding: 4px 16px 8px;
}
.ch-row-bottom-right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

/* ── Chat config button ── */
.chat-config-btn-wrap {
  position: relative;
  flex-shrink: 0;
}
.chat-config-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  font-family: 'Inter', sans-serif;
  flex-shrink: 0;
}
.chat-config-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.chat-config-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #1A1A1A;
  border-radius: 10px;
  padding: 10px 14px;
  min-width: 220px;
  z-index: 50;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
  pointer-events: none;
}
.chat-config-btn-wrap:hover .chat-config-tooltip {
  display: block;
}
.chat-config-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 2px 0;
}
.cct-key {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.cct-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

/* ── Persona section layout ── */
.persona-section {
  display: flex;
  align-items: center;
  gap: 10px;
}
.persona-group {
  display: flex;
  align-items: center;
  gap: 6px;
  position: relative;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 4px 8px;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* ── User persona card ── */
.persona-card-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.persona-card {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  transition: none;
  font-family: 'Inter', sans-serif;
  position: relative;
}
.persona-card-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.persona-card-avatar-img {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
}
.persona-card-avatar-default {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.persona-card-avatar-default.user {
  background: rgba(255,255,255,0.15);
}
.persona-card-info {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.persona-card-name {
  font-size: 11px;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  flex-shrink: 0;
}
.persona-card-desc {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80px;
}
.persona-card-summary-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.persona-card-summary-btn:hover {
  background: rgba(255,255,255,0.25);
  color: #FFFFFF;
  transform: scale(1.1);
}

/* ── System personas: Teams-style avatar stack ── */
.sys-avatar-stack {
  display: flex;
  align-items: center;
}
.sys-avatar-item {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.2);
  margin-left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  overflow: visible;
  flex-shrink: 0;
}
.sys-avatar-stack > .sys-avatar-item:first-child {
  margin-left: 0;
}
.sys-avatar-item:hover {
  transform: scale(1.12);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 20 !important;
}
.sys-avatar-item.active {
  box-shadow: 0 0 0 2px #1A1A1A;
  z-index: 20 !important;
}
.sys-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.sys-avatar-fallback {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  user-select: none;
}
.sys-avatar-overflow {
  background: #6B7280;
  cursor: pointer;
}
.sys-avatar-remove {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #EF4444;
  color: #fff;
  border: 1.5px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 10;
}
.sys-avatar-item:hover .sys-avatar-remove {
  opacity: 1;
}

/* System persona name label */
.sys-persona-label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}
.sys-persona-name {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  flex-shrink: 0;
}
.sys-persona-desc {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

/* Add persona button */
.sys-add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px dashed rgba(255,255,255,0.3);
  background: transparent;
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sys-add-btn:hover {
  border-color: rgba(255,255,255,0.6);
  color: #FFFFFF;
  background: rgba(255,255,255,0.1);
}

/* ── System persona combobox ── */
.sys-combobox {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 320px;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);
  z-index: 60;
  overflow: hidden;
}
.sys-combobox-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid #F0F0F0;
  color: #9CA3AF;
}
.sys-combobox-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #1A1A1A;
}
.sys-combobox-input::placeholder {
  color: #D1D1D6;
}
.sys-combobox-list {
  max-height: 340px;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sys-combobox-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.12s;
  border-radius: 10px;
  border: 1px solid transparent;
}
.sys-combobox-item:hover {
  background: #F5F5F5;
  border-color: #E5E5EA;
}
.sys-combobox-item.selected {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
}
.sys-combobox-item.selected:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.sys-combobox-check {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid #D1D1D6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  transition: all 0.12s;
}
.sys-combobox-item.selected .sys-combobox-check {
  background: rgba(255,255,255,0.2);
  border-color: rgba(255,255,255,0.4);
}
.sys-combobox-check input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  margin: 0;
}
.sys-combobox-check-icon {
  width: 12px;
  height: 12px;
  color: #fff;
}
.sys-combobox-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #374151 0%, #4B5563 100%);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.sys-combobox-item.selected .sys-combobox-avatar {
  box-shadow: 0 1px 4px rgba(255,255,255,0.15);
}
.sys-combobox-avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.sys-combobox-avatar-fallback {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  user-select: none;
}
.sys-combobox-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.sys-combobox-name {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
}
.sys-combobox-item.selected .sys-combobox-name {
  color: #fff;
}
.sys-combobox-desc {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 400;
  color: #374151;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.sys-combobox-item.selected .sys-combobox-desc {
  color: rgba(255,255,255,0.65);
}
.sys-combobox-empty {
  padding: 20px 14px;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  color: #9CA3AF;
}

/* ── System persona config popover ── */
.sys-persona-config-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 300px;
  max-height: 420px;
  overflow-y: auto;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
  z-index: 60;
  padding: 10px;
  scrollbar-width: thin;
}
.spc-header {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 2px 8px;
  border-bottom: 1px solid #E5E5EA;
  margin-bottom: 10px;
}
.spc-header-name {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #1A1A1A;
}
.spc-header-desc {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 500;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.spc-section {
  margin-bottom: 10px;
}
.spc-section:last-child {
  margin-bottom: 0;
}
.spc-label {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  padding: 0 2px 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.spc-btn-row {
  display: flex;
  gap: 4px;
}
.spc-btn {
  flex: 1;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid #E5E5EA;
  background: #FAFAFA;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.spc-btn:hover {
  border-color: #9CA3AF;
  background: #F5F5F5;
}
.spc-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.spc-search {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid #E5E5EA;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  outline: none;
  background: #FAFAFA;
  color: #1A1A1A;
  margin-bottom: 4px;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.spc-search::placeholder { color: #9CA3AF; }
.spc-search:focus { border-color: #1A1A1A; }
.spc-model-list {
  max-height: 140px;
  overflow-y: auto;
  scrollbar-width: thin;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.spc-model-item {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 5px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: #1A1A1A;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.spc-model-item:hover { background: #F5F5F5; }
.spc-model-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}
.spc-model-id {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.spc-model-item.active .spc-model-id { color: rgba(255,255,255,0.5); }

/* ── Persona chip wrap (legacy) ── */
.persona-chip-wrap {
  position: relative;
}

/* ── Popover dropdown ── */
.persona-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 280px;
  max-height: 360px;
  overflow-y: auto;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 50;
  padding: 6px;
  scrollbar-width: thin;
}
.user-popover {
  right: -28px; /* align under the group-icon button */
}
.persona-popover-header {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  padding: 8px 10px 4px;
}
.persona-popover-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #1A1A1A;
  transition: background 0.12s;
  text-align: left;
}
.persona-popover-item:hover {
  background: #F5F5F5;
}
.persona-popover-item.selected {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.persona-popover-avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.persona-popover-avatar-fallback {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}
.persona-popover-item.selected .persona-popover-avatar-fallback {
  background: rgba(255,255,255,0.15);
}
.persona-popover-item.has-description {
  align-items: flex-start;
  padding: 10px;
}
.persona-popover-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.persona-popover-item-desc {
  font-size: 11px;
  font-weight: 400;
  color: #374151;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
.persona-popover-item.selected .persona-popover-item-desc {
  color: rgba(255,255,255,0.6);
}
</style>

<!-- Global styles for teleported tooltip (unscoped) -->
<style>
.ch-persona-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  transform: translateX(-50%);
  min-width: 200px;
  max-width: 300px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.92);
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.ch-persona-tooltip-name {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #F5F5F5;
  margin-bottom: 4px;
}
.ch-persona-tooltip-text {
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 400;
  color: #D1D1D6;
  line-height: 1.5;
}
</style>
