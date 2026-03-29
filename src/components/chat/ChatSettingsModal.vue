<script setup>
import { ref, computed, watch } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'

const props = defineProps({
  visible: Boolean,
  chatId: String,
})

const emit = defineEmits(['close'])

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const { t } = useI18n()

// ── Tab state ──
const ccmActiveTab = ref('general')

// ── General tab draft state ──
const draftMaxAgentRounds = ref(10)
const draftWorkingPath = ref('')
const draftCodingMode = ref(false)
const draftCodingProvider = ref('claude-code')

// ── Permissions tab draft state ──
const draftPermissionMode = ref('inherit')
const draftChatAllowList = ref([])
const draftChatDangerOverrides = ref([]) // patterns un-blocked for this chat in all_permissions mode
const newAllowPattern = ref('')
const newAllowDesc = ref('')

// ── Coding mode tooltip state ──
const showCodingInfoTooltip = ref(false)
const showProviderInfoTooltip = ref(false)

function addChatAllowEntry() {
  const pattern = newAllowPattern.value.trim()
  if (!pattern) return
  draftChatAllowList.value.push({ id: `chat-allow-${Date.now()}`, pattern, description: newAllowDesc.value.trim() })
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}

function removeChatAllowEntry(idx) {
  draftChatAllowList.value.splice(idx, 1)
}

function addChatDangerOverride(pattern) {
  if (!draftChatDangerOverrides.value.includes(pattern))
    draftChatDangerOverrides.value.push(pattern)
}

function removeChatDangerOverride(pattern) {
  const idx = draftChatDangerOverrides.value.indexOf(pattern)
  if (idx !== -1) draftChatDangerOverrides.value.splice(idx, 1)
}

// Snapshot of draft state before modal opens (for cancel/revert)
let _draftSnapshot = null

// Load draft state when modal opens
watch(() => props.visible, (open) => {
  if (!open) return
  ccmActiveTab.value = 'general'
  _loadDraftFromChat()
  // Snapshot for cancel
  _draftSnapshot = {
    workingPath: draftWorkingPath.value,
    codingMode: draftCodingMode.value,
    codingProvider: draftCodingProvider.value,
    maxAgentRounds: draftMaxAgentRounds.value,
    permissionMode: draftPermissionMode.value,
    chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    chatDangerOverrides: JSON.parse(JSON.stringify(draftChatDangerOverrides.value)),
  }
})

function saveChatSettings() {
  const chatId = props.chatId
  if (!chatId) return
  const rawRounds = Number(draftMaxAgentRounds.value)
  const clampedRounds = Number.isFinite(rawRounds) ? Math.min(100, Math.max(1, rawRounds)) : 10
  chatsStore.setChatSettings(chatId, {
    workingPath: draftWorkingPath.value || null,
    codingMode: draftCodingMode.value,
    codingProvider: draftCodingProvider.value,
    maxAgentRounds: clampedRounds,
    permissionMode: draftPermissionMode.value,
    chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    chatDangerOverrides: JSON.parse(JSON.stringify(draftChatDangerOverrides.value)),
  })
  // If the agent is currently running, push the new permission mode to it immediately
  // so it takes effect for any pending/future tool calls in the current run.
  const runningChat = chatsStore.chats.find(c => c.id === chatId && c.isRunning)
  if (runningChat && window.electronAPI?.updatePermissionMode) {
    window.electronAPI.updatePermissionMode(chatId, {
      chatMode: draftPermissionMode.value,
      chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    })
  }
  _draftSnapshot = null
  emit('close')
}

function cancelChatSettings() {
  // Revert draft to snapshot
  if (_draftSnapshot) {
    draftWorkingPath.value = _draftSnapshot.workingPath
    draftCodingMode.value = _draftSnapshot.codingMode ?? false
    draftCodingProvider.value = _draftSnapshot.codingProvider ?? 'claude-code'
    draftMaxAgentRounds.value = _draftSnapshot.maxAgentRounds
    draftPermissionMode.value = _draftSnapshot.permissionMode
    draftChatAllowList.value = _draftSnapshot.chatAllowList
    draftChatDangerOverrides.value = _draftSnapshot.chatDangerOverrides
  }
  _draftSnapshot = null
  emit('close')
}

async function browseWorkingPath() {
  if (!window.electronAPI?.obsidian?.pickFolder) return
  const result = await window.electronAPI.obsidian.pickFolder()
  if (result) draftWorkingPath.value = result
}

const codingProviderInfo = computed(() => {
  const providers = {
    'claude-code': {
      label: 'Claude Code',
      description: 'Loads CLAUDE.md instruction files from your project hierarchy, identical to how the Claude Code CLI works. Each file is watched for live changes.',
      files: [
        '~/.claude/CLAUDE.md (global)',
        '<parent-dirs>/CLAUDE.md (ancestors)',
        '<working-path>/CLAUDE.md (project root)',
        '<working-path>/**/CLAUDE.md (sub-dirs, if any)',
      ],
    },
  }
  return providers[draftCodingProvider.value] || providers['claude-code']
})

// Load draft state from the chat's persisted settings
function _loadDraftFromChat() {
  const chat = chatsStore.chats.find(c => c.id === props.chatId)
  if (!chat) return
  // Working path
  draftWorkingPath.value = chat.workingPath || ''
  draftCodingMode.value = chat.codingMode ?? false
  draftCodingProvider.value = chat.codingProvider ?? 'claude-code'
  // Max agent rounds (null in JSON = use default 10)
  draftMaxAgentRounds.value = chat.maxAgentRounds ?? 10
  // Permissions
  draftPermissionMode.value = chat.permissionMode || 'inherit'
  draftChatAllowList.value = JSON.parse(JSON.stringify(chat.chatAllowList || []))
  draftChatDangerOverrides.value = JSON.parse(JSON.stringify(chat.chatDangerOverrides || []))
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}
</script>

<template>
<Teleport to="body">
  <div v-if="visible" class="ccm-backdrop">
    <div class="ccm-dialog">
      <!-- Header -->
      <div class="ccm-header">
        <div class="ccm-header-left">
          <div class="ccm-header-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <h2 class="ccm-title">{{ t('chats.chatSettings') }}</h2>
        </div>
        <button class="ccm-close" @click="cancelChatSettings">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Tab bar -->
      <div class="ccm-tabs">
        <button class="ccm-tab" :class="{ active: ccmActiveTab === 'general' }" @click="ccmActiveTab = 'general'">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {{ t('chats.general') }}
        </button>
        <button class="ccm-tab" :class="{ active: ccmActiveTab === 'permissions' }" @click="ccmActiveTab = 'permissions'">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          {{ t('chats.permissions') }}
        </button>
      </div>

      <!-- Body -->
      <div class="ccm-body">
        <!-- GENERAL TAB -->
        <div v-if="ccmActiveTab === 'general'" class="ccm-tab-content">
          <div class="ccm-dark-section">
            <div class="ccm-dark-section-label">{{ t('chats.workingPath') }} <span class="ccm-dark-badge">{{ t('chats.artifactDirectory') }}</span></div>
            <div class="ccm-working-path-row">
              <input v-model="draftWorkingPath" type="text" :placeholder="configStore.config.artifactPath || `${configStore.config.dataPath}/artifact`" class="ccm-working-path-input" />
              <button class="ccm-working-path-browse" @click="browseWorkingPath" :title="t('chats.browseFolder')">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              </button>
            </div>
            <span class="ccm-working-path-hint">{{ t('chats.globalDefaultPath') }}</span>
          </div>

          <!-- Coding Mode toggle + provider selector -->
          <div class="ccm-dark-section">
            <div class="ccm-dark-section-label">
              {{ t('chats.codingMode') }}
              <span class="ccm-coding-info-chip" @mouseenter="showCodingInfoTooltip = true" @mouseleave="showCodingInfoTooltip = false">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <div v-if="showCodingInfoTooltip" class="ccm-coding-tooltip">
                  <div class="ccm-coding-tooltip-title">{{ t('chats.whatIsCodingMode') }}</div>
                  <div class="ccm-coding-tooltip-body">{{ t('chats.codingModeDescription') }}</div>
                  <div class="ccm-coding-tooltip-hint">{{ t('chats.codingModeHint') }}</div>
                </div>
              </span>
            </div>
            <div class="ccm-coding-toggle-row">
              <span class="ccm-coding-toggle-label">{{ t('chats.enableCodingMode') }}</span>
              <label class="ccm-coding-switch" @click.stop>
                <input type="checkbox" v-model="draftCodingMode" />
                <span class="ccm-coding-switch-track"><span class="ccm-coding-switch-thumb"></span></span>
              </label>
            </div>
            <div v-if="draftCodingMode" class="ccm-working-path-row" style="margin-top:10px;">
              <label style="font-size:var(--fs-small);color:#9CA3AF;min-width:90px;">{{ t('chats.chatSettingsProvider') }}</label>
              <select v-model="draftCodingProvider" class="ccm-working-path-input" style="max-width:200px; cursor:pointer;">
                <option value="claude-code">Claude Code</option>
              </select>
              <span class="ccm-provider-info-anchor" @mouseenter="showProviderInfoTooltip = true" @mouseleave="showProviderInfoTooltip = false">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <div v-if="showProviderInfoTooltip" class="ccm-coding-tooltip ccm-coding-tooltip-right">
                  <div class="ccm-coding-tooltip-title">{{ codingProviderInfo.label }}</div>
                  <div class="ccm-coding-tooltip-body">{{ codingProviderInfo.description }}</div>
                  <div class="ccm-coding-tooltip-files">
                    <div class="ccm-coding-tooltip-files-label">{{ t('chats.filesLoaded') }}</div>
                    <div v-for="f in codingProviderInfo.files" :key="f" class="ccm-coding-tooltip-file">
                      <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <code>{{ f }}</code>
                    </div>
                  </div>
                </div>
              </span>
            </div>
          </div>

          <div class="ccm-dark-section">
            <div class="ccm-dark-section-label">
              {{ t('chats.maxAgentChatRounds') }}
              <span class="ccm-dark-badge">{{ t('chats.groupChat') }}</span>
            </div>
            <div class="ccm-stepper-row">
              <button class="ccm-stepper-btn" @click="draftMaxAgentRounds = Math.max(1, draftMaxAgentRounds - 1)">−</button>
              <input v-model.number="draftMaxAgentRounds" type="number" min="1" max="100" class="ccm-stepper-input" @blur="draftMaxAgentRounds = Math.min(100, Math.max(1, Number(draftMaxAgentRounds) || 10))" />
              <button class="ccm-stepper-btn" @click="draftMaxAgentRounds = Math.min(100, draftMaxAgentRounds + 1)">+</button>
            </div>
            <span class="ccm-working-path-hint">{{ t('chats.maxAgentChatRoundsHint') }}</span>
          </div>

        </div>

        <!-- PERMISSIONS TAB -->
        <div v-else-if="ccmActiveTab === 'permissions'" class="ccm-tab-content">
          <div class="ccm-dark-section">
            <div class="ccm-dark-section-label">{{ t('chats.permissionMode') }}</div>
            <div class="ccm-provider-btns">
              <button v-for="m in [{ id: 'inherit', label: t('chats.inherit') }, { id: 'chat_only', label: t('chats.chatOnly') }, { id: 'all_permissions', label: t('chats.allPermissions') }]"
                :key="m.id"
                class="ccm-provider-btn" :class="{ active: draftPermissionMode === m.id }"
                @click="draftPermissionMode = m.id">{{ m.label }}</button>
            </div>
            <p class="ccm-perm-mode-hint">
              <template v-if="draftPermissionMode === 'inherit'">{{ t('chats.permissionModeInherit') }}</template>
              <template v-else-if="draftPermissionMode === 'chat_only'">{{ t('chats.permissionModeChatOnly') }}</template>
              <template v-else>{{ t('chats.permissionModeAllPermissions') }}</template>
            </p>
          </div>

          <!-- INHERIT -->
          <template v-if="draftPermissionMode === 'inherit'">
            <div class="ccm-dark-section" style="flex:0 0 auto;">
              <div class="ccm-dark-section-label">{{ t('chats.chatAllowList') }} <span class="ccm-dark-badge">{{ draftChatAllowList.length }}</span></div>
              <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">{{ t('chats.chatAllowListHintInherit') }}</p>
              <div class="ccm-allow-list">
                <div v-if="draftChatAllowList.length === 0" class="ccm-list-empty">{{ t('chats.noEntriesYet') }}</div>
                <div v-for="(entry, idx) in draftChatAllowList" :key="entry.id || idx" class="ccm-allow-entry">
                  <div class="ccm-allow-entry-info">
                    <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                    <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                  </div>
                  <button class="ccm-allow-delete" @click="removeChatAllowEntry(idx)" :title="t('common.remove')">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
              <div class="ccm-allow-add-row">
                <input v-model="newAllowPattern" type="text" :placeholder="t('chats.pattern')" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                <input v-model="newAllowDesc" type="text" :placeholder="t('chats.description')" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                <button class="ccm-allow-add-btn" @click="addChatAllowEntry" :disabled="!newAllowPattern.trim()">{{ t('common.add') }}</button>
              </div>
            </div>
            <div class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
              <div class="ccm-dark-section-label">
                {{ t('chats.globalAllowList') }} <span class="ccm-dark-badge">{{ (configStore.config.sandboxConfig?.sandboxAllowList || []).length }}</span>
              </div>
              <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">{{ t('chats.permissionModeInherit') }}</p>
              <div class="ccm-allow-list">
                <div v-if="!(configStore.config.sandboxConfig?.sandboxAllowList || []).length" class="ccm-list-empty">{{ t('chats.noEntriesYet') }}</div>
                <div v-for="entry in (configStore.config.sandboxConfig?.sandboxAllowList || [])" :key="entry.id" class="ccm-allow-entry ccm-allow-entry-readonly">
                  <div class="ccm-allow-entry-info">
                    <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                    <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- CHAT ONLY -->
          <div v-else-if="draftPermissionMode === 'chat_only'" class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
            <div class="ccm-dark-section-label">{{ t('chats.chatAllowList') }} <span class="ccm-dark-badge">{{ draftChatAllowList.length }}</span></div>
            <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">{{ t('chats.chatAllowListHintChatOnly') }}</p>
            <div class="ccm-allow-list">
              <div v-if="draftChatAllowList.length === 0" class="ccm-list-empty">{{ t('chats.noEntriesYet') }}</div>
              <div v-for="(entry, idx) in draftChatAllowList" :key="entry.id || idx" class="ccm-allow-entry">
                <div class="ccm-allow-entry-info">
                  <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                  <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                </div>
                <button class="ccm-allow-delete" @click="removeChatAllowEntry(idx)" :title="t('common.remove')">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div class="ccm-allow-add-row">
              <input v-model="newAllowPattern" type="text" :placeholder="t('chats.pattern')" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
              <input v-model="newAllowDesc" type="text" :placeholder="t('chats.description')" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
              <button class="ccm-allow-add-btn" @click="addChatAllowEntry" :disabled="!newAllowPattern.trim()">{{ t('common.add') }}</button>
            </div>
          </div>

          <!-- ALL PERMISSIONS -->
          <div v-else class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
            <div class="ccm-dark-section-label">
              {{ t('chats.dangerBlockList') }}
              <span class="ccm-dark-badge" style="background:rgba(239,68,68,0.2);color:#f87171;">{{ (configStore.config.sandboxConfig?.dangerBlockList || []).length }}</span>
            </div>
            <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">{{ t('chats.chatAllowListHintAllPermissions') }}</p>
            <div class="ccm-allow-list">
              <div v-if="!(configStore.config.sandboxConfig?.dangerBlockList || []).length" class="ccm-list-empty">{{ t('chats.noEntriesYet') }}</div>
              <div v-for="entry in (configStore.config.sandboxConfig?.dangerBlockList || [])" :key="entry.id"
                class="ccm-allow-entry"
                :class="draftChatDangerOverrides.includes(entry.pattern) ? 'ccm-danger-overridden' : ''">
                <div class="ccm-allow-entry-info">
                  <span class="ccm-allow-pattern" style="color:#f87171;">{{ entry.pattern }}</span>
                  <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                </div>
                <button v-if="!draftChatDangerOverrides.includes(entry.pattern)"
                  class="ccm-allow-delete ccm-danger-remove-btn"
                  @click="addChatDangerOverride(entry.pattern)"
                  :title="t('chats.allowForThisChat')">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <button v-else
                  class="ccm-allow-add-btn"
                  style="font-size:0.65rem;padding:3px 8px;"
                  @click="removeChatDangerOverride(entry.pattern)">
                  {{ t('chats.undo') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="ccm-footer">
        <div class="ccm-footer-actions">
          <button class="ccm-cancel-btn" @click="cancelChatSettings">{{ t('common.cancel') }}</button>
          <button class="ccm-save-btn" @click="saveChatSettings">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>
  </div>
</Teleport>
</template>

<style>
/* ── Chat Settings Modal (dark theme) ──────────────────────────────────── */
.ccm-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: ccm-fade 0.15s ease-out;
}
@keyframes ccm-fade { from { opacity: 0; } to { opacity: 1; } }
.ccm-dialog {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1.25rem;
  width: 56.25rem;
  max-width: 95vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0,0,0,0.5);
  animation: ccm-enter 0.2s ease-out;
  overflow: hidden;
}
@keyframes ccm-enter {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.ccm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.ccm-header-left { display: flex; align-items: center; gap: 0.75rem; }
.ccm-header-icon {
  width: 2.125rem; height: 2.125rem; border-radius: 0.625rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ccm-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-section);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.ccm-close {
  width: 2.125rem; height: 2.125rem; border-radius: 0.5rem; border: none;
  background: transparent; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.ccm-close:hover { background: #1F1F1F; color: #FFFFFF; }

/* Tab bar */
.ccm-tabs {
  display: flex; gap: 0.25rem; padding: 0.5rem 1.5rem;
  border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.ccm-tab {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 1rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #6B7280; background: transparent; border: none; cursor: pointer;
  transition: all 0.15s;
}
.ccm-tab:hover { color: #9CA3AF; background: #1A1A1A; }
.ccm-tab.active {
  color: #FFFFFF;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ccm-tab-badge {
  font-size: 10px; font-weight: 700;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem;
  background: rgba(255,255,255,0.1); color: inherit;
}
.ccm-tab.active .ccm-tab-badge {
  background: rgba(255,255,255,0.15);
}

/* Body */
.ccm-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
}
.ccm-tab-content {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  
  
}

/* Dark sections (used in Model & RAG tabs) */
.ccm-dark-section {
  margin-bottom: 1.25rem;
}
.ccm-dark-section-label {
  display: flex; align-items: center; gap: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #9CA3AF; margin-bottom: 0.625rem;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.ccm-dark-badge {
  font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0;
  padding: 0.125rem 0.5rem; border-radius: 0.375rem;
  background: #1F1F1F; color: #9CA3AF;
  font-family: 'JetBrains Mono', monospace;
}
.ccm-dark-badge.badge-on { background: #064E3B; color: #6EE7B7; }
.ccm-dark-badge.badge-off { background: #451A1A; color: #FCA5A5; }

/* ── Coding Mode — info chip & tooltips ──────────────────────────────── */
.ccm-coding-info-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem; height: 1.25rem;
  border-radius: 50%;
  background: #1F1F1F;
  border: 1px solid #2A2A2A;
  color: #6B7280;
  cursor: help;
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.ccm-coding-info-chip:hover { background: #2A2A2A; color: #9CA3AF; }

.ccm-coding-tooltip {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  width: 17.5rem;
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.75rem 0.875rem;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  z-index: 9999;
  pointer-events: none;
  font-family: 'Inter', sans-serif;
}
.ccm-coding-tooltip-right {
  left: auto;
  right: 0;
}
.ccm-coding-tooltip-title {
  font-size: 12px; font-weight: 700; color: #E5E5EA; margin-bottom: 0.375rem;
}
.ccm-coding-tooltip-body {
  font-size: 11px; font-weight: 400; color: #9CA3AF; line-height: 1.55;
}
.ccm-coding-tooltip-body code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: #67E8F9;
  background: #0C1F26; padding: 0.0625rem 0.3125rem; border-radius: 0.25rem;
}
.ccm-coding-tooltip-hint {
  margin-top: 0.5rem;
  font-size: 11px; font-weight: 500; color: #4B5563;
  border-top: 1px solid #1F1F1F; padding-top: 0.5rem;
}
.ccm-coding-tooltip-files { margin-top: 0.5rem; }
.ccm-coding-tooltip-files-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: #4B5563; margin-bottom: 0.3125rem;
}
.ccm-coding-tooltip-file {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.1875rem 0; color: #6B7280;
}
.ccm-coding-tooltip-file code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: #67E8F9;
}

/* ── Coding Mode — toggle row ──────────────────────────────────────────── */
.ccm-coding-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem; padding: 0.625rem 0.875rem;
  background: #1A1A1A; border: 1px solid #222;
  border-radius: 0.625rem;
}
.ccm-coding-toggle-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 500;
  color: #9CA3AF;
}

/* ── Coding Mode — switch (teal accent, not black) ─────────────────────── */
.ccm-coding-switch {
  display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0;
}
.ccm-coding-switch input { display: none; }
.ccm-coding-switch-track {
  position: relative; width: 2.375rem; height: 1.375rem;
  border-radius: 0.6875rem; background: #2A2A2A;
  border: 1px solid #333;
  transition: background 0.2s, border-color 0.2s;
}
.ccm-coding-switch input:checked + .ccm-coding-switch-track {
  background: #0E7490;
  border-color: #0891B2;
}
.ccm-coding-switch-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1rem; height: 1rem; border-radius: 50%;
  background: #4B5563;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  transition: transform 0.2s, background 0.2s;
}
.ccm-coding-switch input:checked + .ccm-coding-switch-track .ccm-coding-switch-thumb {
  transform: translateX(1rem); background: #FFFFFF;
}

/* ── Provider info anchor ─────────────────────────────────────────────── */
.ccm-provider-info-anchor {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.375rem; height: 1.375rem;
  border-radius: 50%;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #4B5563; cursor: help;
  position: relative; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.ccm-provider-info-anchor:hover { background: #2A2A2A; color: #9CA3AF; }

/* Provider buttons (dark) — used in Permissions tab */
.ccm-provider-btns {
  display: flex; gap: 0.5rem;
}
.ccm-provider-btn {
  flex: 1; padding: 0.625rem 0; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #6B7280;
  cursor: pointer; transition: all 0.15s; text-align: center;
}
.ccm-provider-btn:hover { border-color: #4B5563; color: #9CA3AF; }
.ccm-provider-btn.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563; color: #FFFFFF;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}

/* Step number badge */
.ccm-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.125rem; height: 1.125rem; border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  color: #FFFFFF; font-size: 10px; font-weight: 700;
  margin-right: 0.25rem; flex-shrink: 0;
}

/* Provider cards (Model tab — 2-level selection) */
.ccm-provider-cards {
  display: flex; gap: 0.5rem;
}
.ccm-provider-card {
  flex: 1; padding: 0.75rem 0.625rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s; text-align: center;
  display: flex; flex-direction: column; gap: 0.1875rem;
}
.ccm-provider-card:hover { border-color: #4B5563; }
.ccm-provider-card.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.ccm-provider-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #9CA3AF; transition: color 0.15s;
}
.ccm-provider-card.active .ccm-provider-card-name { color: #FFFFFF; }
.ccm-provider-card-sub {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: #4B5563; transition: color 0.15s;
}
.ccm-provider-card.active .ccm-provider-card-sub { color: rgba(255,255,255,0.5); }
.ccm-provider-card:hover:not(.active) .ccm-provider-card-name { color: #D1D5DB; }

/* Model search (dark) */
.ccm-model-search {
  width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); outline: none;
  color: #FFFFFF; transition: border-color 0.15s;
}
.ccm-model-search:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.ccm-model-search::placeholder { color: #4B5563; }

/* Model list (dark) */
.ccm-model-list {
  flex: 1; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.75rem;
  display: flex; flex-direction: column;
   
  background: #1A1A1A;
}
.ccm-model-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; padding: 0.625rem 0.875rem; border: none; background: transparent;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 500; color: #9CA3AF; text-align: left;
  transition: all 0.12s; border-bottom: 1px solid #1F1F1F;
}
.ccm-model-item:last-child { border-bottom: none; }
.ccm-model-item:first-child { border-radius: 0.6875rem 0.6875rem 0 0; }
.ccm-model-item:last-child { border-radius: 0 0 0.6875rem 0.6875rem; }
.ccm-model-item:hover { background: #222222; color: #FFFFFF; }
.ccm-model-item.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.ccm-model-item.active .ccm-model-id { color: rgba(255,255,255,0.4); }
.ccm-model-id {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: #4B5563; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 12.5rem;
}
.ccm-model-loading {
  padding: 1rem; text-align: center; font-size: var(--fs-caption); color: #4B5563;
}

/* ── Tools/MCP list toolbar ────────────────────────────────────────────── */
.ccm-list-toolbar {
  display: flex; align-items: center; gap: 0.625rem;
  margin-bottom: 1rem; flex-shrink: 0;
}
.ccm-list-search-wrap {
  flex: 1; display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.875rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  transition: border-color 0.15s;
}
.ccm-list-search-wrap:focus-within { border-color: #4B5563; }
.ccm-list-search-wrap:focus-within svg { color: #9CA3AF; }
.ccm-list-search {
  flex: 1; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; background: transparent;
}
.ccm-list-search::placeholder { color: #4B5563; }
.ccm-list-actions {
  display: flex; gap: 0.25rem;
}
.ccm-list-action-btn {
  padding: 0.375rem 0.75rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #6B7280;
  cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.ccm-list-action-btn:hover { border-color: #4B5563; color: #FFFFFF; background: #222222; }
.ccm-list-summary {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: #4B5563; white-space: nowrap; flex-shrink: 0;
}

/* ── Item cards (Tools/MCP) ────────────────────────────────────────────── */
.ccm-item-list {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.375rem;
   
}
.ccm-item-card {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 0.75rem 1rem; border-radius: 0.75rem;
  border: 1px solid #1F1F1F; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s;
}
.ccm-item-card:hover {
  border-color: #2A2A2A; background: #222222;
}
.ccm-item-card.enabled {
  border-color: #374151;
  background: linear-gradient(135deg, #1A1A1A 0%, #1F2937 100%);
  box-shadow: 0 1px 6px rgba(0,0,0,0.2);
}
.ccm-item-card-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1875rem;
}
.ccm-item-card-top {
  display: flex; align-items: center; gap: 0.5rem;
}
.ccm-item-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 600; color: #FFFFFF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-card:not(.enabled) .ccm-item-card-name { color: #9CA3AF; }
.ccm-item-card-type {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
}
.ccm-type-http { background: rgba(37,99,235,0.15); color: #60A5FA; }
.ccm-type-code { background: rgba(22,163,74,0.15); color: #4ADE80; }
.ccm-type-prompt { background: rgba(124,58,237,0.15); color: #A78BFA; }

.ccm-item-card-status {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
}
.ccm-item-card-status.status-running { background: rgba(52,199,89,0.15); color: #4ADE80; }
.ccm-item-card-status.status-stopped { background: rgba(107,114,128,0.15); color: #6B7280; }
.ccm-status-dot {
  width: 0.3125rem; height: 0.3125rem; border-radius: 50%;
}
.status-running .ccm-status-dot { background: #4ADE80; }
.status-stopped .ccm-status-dot { background: #4B5563; }

.ccm-item-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-card.enabled .ccm-item-card-desc { color: #6B7280; }

/* Grouped tool list */
.ccm-group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.625rem 0.25rem 0.25rem;
  border-bottom: 1px solid #1F1F1F;
  margin-bottom: 0.125rem;
}
.ccm-group-header:not(:first-child) { margin-top: 0.75rem; }
.ccm-group-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.06em;
}
.ccm-group-count {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563;
}
.ccm-item-row {
  display: flex; align-items: flex-start; gap: 0.625rem;
  padding: 0.5rem 0.5rem; border-radius: 0.5rem;
  cursor: pointer; transition: background 0.12s;
}
.ccm-item-row:hover { background: rgba(255,255,255,0.04); }
.ccm-item-row.enabled { background: rgba(55,65,81,0.2); }
.ccm-item-row.enabled:hover { background: rgba(55,65,81,0.3); }
.ccm-row-checkbox {
  margin-top: 0.1875rem; flex-shrink: 0;
  width: 0.875rem; height: 0.875rem; accent-color: #6B7280; cursor: pointer;
}
.ccm-row-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.125rem;
}
.ccm-row-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 500; color: #9CA3AF; line-height: 1.3;
}
.ccm-item-row.enabled .ccm-row-name { color: #FFFFFF; font-weight: 600; }
.ccm-row-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-row.enabled .ccm-row-desc { color: #6B7280; }

/* Toggle switch (dark) */
.ccm-toggle {
  display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0;
}
.ccm-toggle input { display: none; }
.ccm-toggle-track {
  position: relative; width: 2.375rem; height: 1.375rem;
  border-radius: 0.6875rem; background: #2A2A2A;
  transition: background 0.2s;
}
.ccm-toggle input:checked + .ccm-toggle-track {
  background: linear-gradient(135deg, #374151 0%, #4B5563 100%);
}
.ccm-toggle-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1.125rem; height: 1.125rem; border-radius: 50%;
  background: #6B7280; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  transition: transform 0.2s, background 0.2s;
}
.ccm-toggle input:checked + .ccm-toggle-track .ccm-toggle-thumb {
  transform: translateX(1rem); background: #FFFFFF;
}

/* List empty */
.ccm-list-empty {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #4B5563; text-align: center; padding: 2.5rem 1.25rem;
}

/* RAG list (dark) */
.ccm-rag-list {
  display: flex; flex-direction: column; gap: 0.375rem;
}
.ccm-rag-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; padding: 0.625rem 0.875rem; border-radius: 0.625rem;
  background: #1A1A1A; border: 1px solid #1F1F1F;
}
.ccm-rag-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #FFFFFF;
}
.ccm-rag-meta {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #4B5563;
}

/* Footer (dark) */
.ccm-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F;
  background: #0A0A0A; flex-shrink: 0;
}
.ccm-footer-tokens {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #4B5563;
}
.ccm-footer-actions {
  display: flex; gap: 0.5rem; align-items: center;
}
.ccm-cancel-btn {
  padding: 0.5rem 1.25rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A; cursor: pointer;
  transition: all 0.15s;
}
.ccm-cancel-btn:hover {
  background: #2A2A2A; color: #FFFFFF; border-color: #374151;
}
.ccm-save-btn {
  padding: 0.5rem 1.5rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; border: 1px solid #374151; cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ccm-save-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
}

/* Working path field */
.ccm-working-path-row {
  display: flex; gap: 0.5rem; align-items: center;
}
.ccm-working-path-input {
  flex: 1; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.ccm-working-path-input:focus { border-color: #4B5563; }
.ccm-working-path-input::placeholder { color: #4B5563; }
.ccm-working-path-browse {
  display: flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; border-radius: 0.5rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #9CA3AF; cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.ccm-working-path-browse:hover {
  background: #2A2A2A; border-color: #374151; color: #FFFFFF;
}
.ccm-working-path-hint {
  font-family: 'Inter', sans-serif; font-size: 11px; color: #4B5563;
  margin-top: 0.25rem; display: block;
}

/* Stepper control — number fields with styled +/- buttons */
.ccm-stepper-row {
  display: flex; align-items: center; gap: 0.25rem;
}
.ccm-stepper-btn {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 0.5rem; flex-shrink: 0;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #9CA3AF; font-size: 16px; font-family: 'Inter', sans-serif;
  line-height: 1; cursor: pointer; transition: all 0.15s; user-select: none;
}
.ccm-stepper-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  border-color: #4B5563; color: #FFFFFF;
}
.ccm-stepper-input {
  width: 4rem; padding: 0.375rem 0.5rem; border-radius: 0.5rem; text-align: center;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
  /* hide native spinners */
  -moz-appearance: textfield;
}
.ccm-stepper-input::-webkit-outer-spin-button,
.ccm-stepper-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ccm-stepper-input:focus { border-color: #4B5563; }
.ccm-stepper-input::placeholder { color: #4B5563; }
.ccm-stepper-input--wide { width: 5.625rem; }
.ccm-stepper-reset {
  padding: 0.3125rem 0.625rem; border-radius: 0.5rem; margin-left: 0.25rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #6B7280; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.ccm-stepper-reset:hover {
  background: #2A2A2A; border-color: #374151; color: #9CA3AF;
}

/* ── Permissions tab ──────────────────────────────────────────────────── */
.ccm-perm-mode-hint {
  font-family: 'Inter', sans-serif; font-size: 11px; color: #6B7280;
  margin: 0.25rem 0 0; display: block;
}
.ccm-allow-list {
  display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem;
}
.ccm-allow-entry {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.375rem 0.625rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
}
.ccm-allow-entry-info {
  display: flex; flex-direction: column; gap: 0.125rem; flex: 1; min-width: 0;
}
.ccm-allow-pattern {
  font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
  color: #60a5fa; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-allow-desc {
  font-size: 0.68rem; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-allow-delete {
  display: flex; align-items: center; justify-content: center;
  width: 1.25rem; height: 1.25rem; flex-shrink: 0;
  background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.2);
  border-radius: 0.375rem; color: #FF3B30; cursor: pointer; transition: all 0.15s;
}
.ccm-allow-delete:hover { background: rgba(255,59,48,0.18); }
.ccm-allow-add-row {
  display: flex; gap: 0.375rem; align-items: center;
}
.ccm-allow-input {
  flex: 1; min-width: 0; padding: 0.3125rem 0.5625rem; background: #1A1A1A;
  border: 1px solid #2A2A2A; border-radius: 0.5rem; color: #FFFFFF;
  font-family: 'Inter', sans-serif; font-size: 0.75rem; outline: none;
  transition: border-color 0.15s;
}
.ccm-allow-input:focus { border-color: #4B5563; }
.ccm-allow-input::placeholder { color: #4B5563; }
.ccm-allow-add-btn {
  padding: 0.3125rem 0.75rem; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem; color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.ccm-allow-add-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.ccm-allow-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ccm-allow-entry-readonly { opacity: 0.6; pointer-events: none; }
.ccm-danger-overridden { opacity: 0.4; }
.ccm-danger-overridden .ccm-allow-pattern { text-decoration: line-through; }
.ccm-danger-remove-btn {
  background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: #f87171;
}
</style>
