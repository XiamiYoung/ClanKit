<template>
  <div class="agent-card" :class="`agent-card--${(props.index ?? 0) % 8}`" @click="$emit('click')">
    <!-- Gradient accent bar — matches the per-card hover background -->
    <div class="agent-card-accent" :style="{ background: accentGradient }"></div>

    <!-- Corner button cluster — top-right of the card. Analysis button (AI,
         only for imported-history agents) sits to the LEFT of the chat
         button (always visible for system agents). -->
    <div class="agent-card-actions">
      <button
        v-if="hasImportedHistory"
        class="agent-analysis-btn"
        v-tooltip="t('agents.analysis.buttonTitle')"
        :aria-label="t('agents.analysis.buttonTitle')"
        @click.stop="openOrCreateAnalysisChat(agent)"
      >
        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="5" r="2"/>
          <circle cx="5" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
          <circle cx="8" cy="19" r="2"/>
          <circle cx="16" cy="19" r="2"/>
          <line x1="12" y1="7" x2="7" y2="10"/>
          <line x1="12" y1="7" x2="17" y2="10"/>
          <line x1="7" y1="12" x2="9" y2="17"/>
          <line x1="17" y1="12" x2="15" y2="17"/>
        </svg>
        AI
      </button>
      <button
        v-if="agent.type !== 'user'"
        class="agent-chat-btn"
        v-tooltip="t('agents.chatWithAgent', 'Chat with this agent')"
        :aria-label="t('agents.chatWithAgent', 'Chat with this agent')"
        @click.stop="openChatWithAgent(agent)"
      >
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <button
        class="agent-view-btn"
        v-tooltip="t('agents.viewAgent', 'View agent details')"
        :aria-label="t('agents.viewAgent', 'View agent details')"
        @click.stop="$emit('click')"
      >
        <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </button>
    </div>

    <div class="agent-card-body">
      <!-- Avatar + title row -->
      <div class="agent-card-title-row">
        <div class="agent-card-avatar">
          <img
            v-if="avatarDataUri"
            :src="avatarDataUri"
            class="agent-card-avatar-img"
            alt=""
          />
          <div v-else class="agent-card-avatar-fallback" :style="{ background: gradient }">
            {{ fallbackInitial }}
          </div>
        </div>
        <div class="agent-card-title-col">
          <p class="agent-card-name">{{ agent.name }}</p>
        </div>
      </div>

      <!-- Description -->
      <p class="agent-card-desc">{{ agent.description || t('agents.noDescription') }}</p>

      <!-- Capabilities row: Skills, Tools, MCP, RAG counts — always rendered for system agents to ensure consistent card height -->
      <div v-if="agent.type !== 'user'" class="agent-capabilities-row">
        <span v-if="agent.requiredSkillIds?.length > 0" class="capability-badge skills-badge">
          ⚡ {{ agent.requiredSkillIds.length }} {{ t('agents.skills') }}
        </span>
        <span v-if="agent.requiredToolIds?.length > 0" class="capability-badge tools-badge">
          🔧 {{ agent.requiredToolIds.length }} {{ t('agents.tools') }}
        </span>
        <span v-if="agent.requiredMcpServerIds?.length > 0" class="capability-badge mcp-badge">
          🌐 {{ agent.requiredMcpServerIds.length }} {{ t('agents.mcp') }}
        </span>
        <span v-if="agent.requiredKnowledgeBaseIds?.length > 0" class="capability-badge rag-badge">
          📚 {{ agent.requiredKnowledgeBaseIds.length }} {{ t('agents.knowledge') }}
        </span>
      </div>

      <!-- Provider + Model metadata — only shown for system agents -->
      <div v-if="agent.type !== 'user'" class="pc-model-meta">
        <template v-if="agent.providerId || agent.modelId">
          <span v-if="agentProviderLabel" class="pc-provider-badge">{{ agentProviderLabel }}</span>
          <span v-if="agent.modelId" class="pc-model-id">{{ agent.modelId }}</span>
          <span v-if="isProviderInactive" class="pc-inactive-warn">&#9888; {{ t('agents.providerInactive') }}</span>
        </template>
        <span v-else-if="isNoProviderConfigured" class="pc-no-provider-warn">&#9888; {{ t('agents.noProviderConfigured') }}</span>
      </div>

      <!-- Footer -->
      <div class="agent-card-footer">
        <div class="agent-card-badges">
          <span v-if="agent.isDefault" class="agent-card-default-badge">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {{ t('agents.default') }}
          </span>
          <span v-if="agent.isBuiltin" class="agent-card-builtin-badge">{{ t('agents.builtin') }}</span>
          <span v-if="agent.voiceId" class="agent-card-voice-badge">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            {{ voiceLabel(agent.voiceId) }}
          </span>
        </div>
        <div class="agent-card-footer-right">
          <button
            v-if="!agent.isDefault && !hideSetDefault && !showUnassign"
            @click.stop="$emit('set-default')"
            class="agent-action-btn star-btn-always"
            v-tooltip="t('agents.setAsDefault')"
            :aria-label="t('agents.setAsDefault')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button
            v-if="showUnassign"
            @click.stop="$emit('unassign')"
            class="unassign-chip"
            v-tooltip="t('agents.unassignFromCategory')"
            :aria-label="t('agents.unassignFromCategory')"
          >
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {{ t('agents.unassign') }}
          </button>
          <button
            v-if="!agent.isBuiltin && !hideDelete"
            @click.stop="!deleteDisabled && $emit('delete')"
            :disabled="deleteDisabled"
            class="agent-action-btn delete-btn-always"
            v-tooltip="deleteTitle"
            :aria-label="t('agents.deleteAgent')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getAvatarDataUri } from './agentAvatars'
import { useConfigStore } from '../../stores/config'
import { useChatsStore } from '../../stores/chats'
import { useI18n } from '../../i18n/useI18n'
import { useAgentAnalysisChat } from '../../composables/useAgentAnalysisChat'
import { triggerAgentGreeting } from '../../composables/useAgentGreeting'
import { useNewChatGuard } from '../../composables/useNewChatGuard'
import { EDGE_VOICES, OPENAI_VOICES } from '../../utils/edgeVoices'

const _allVoices = [...EDGE_VOICES, ...OPENAI_VOICES]
function voiceLabel(id) {
  const v = _allVoices.find(v => v.id === id)
  return v ? v.name : id
}

const { t } = useI18n()
const { openOrCreateAnalysisChat } = useAgentAnalysisChat()
const _router = useRouter()
const _chatsStore = useChatsStore()
const _newChatGuard = useNewChatGuard()

/**
 * Open or create a regular chat with this agent pre-selected.
 * Looks for an existing chat that targets exactly this single agent; if none,
 * creates a new one titled after the agent's name and navigates to /chats.
 */
async function openChatWithAgent(agent) {
  if (!agent?.id) return
  // Click-to-chat already supplies the system side, so only require a user agent.
  if (_newChatGuard.blockIfNeeded({ requireSystem: false })) return
  const name = agent.name || ''
  const title = t('chats.chatWithAgentTitle', { name })
  const existing = _chatsStore.chats.find(c =>
    c.type !== 'analysis' &&
    c.title === title &&
    !c.isGroupChat &&
    c.systemAgentId === agent.id
  )
  if (existing) {
    _chatsStore.setActiveChat(existing.id)
    _router.push('/chats')
    return
  }
  const chat = await _chatsStore.createChat(title, [agent.id])
  if (!chat) return
  _chatsStore.setActiveChat(chat.id)
  // Brand-new single-agent chat → fire an in-character greeting.
  triggerAgentGreeting({ chatId: chat.id, agentId: agent.id })
  _router.push('/chats')
}

const PROVIDER_LABELS = {
  anthropic:  'Anthropic',
  openrouter: 'OpenRouter',
  openai:     'OpenAI',
  deepseek:   'DeepSeek',
}

const configStore = useConfigStore()
const props = defineProps({
  agent:      { type: Object,  required: true },
  gradient:     { type: String,  default: 'linear-gradient(135deg, #0F0F0F, #374151)' },
  index:        { type: Number,  default: 0 },
  hideDelete:     { type: Boolean, default: false },
  hideSetDefault: { type: Boolean, default: false },
  showUnassign:   { type: Boolean, default: false },
  deleteDisabled: { type: Boolean, default: false },
  deleteTitle:    { type: String,  default: '' },
  refreshToken:   { type: Number,  default: 0 },
})

defineEmits(['click', 'delete', 'unassign', 'set-default'])

// Only show AI analysis button for agents that have imported chat history
const hasImportedHistory = ref(false)
async function checkImportedHistory() {
  if (props.agent.isBuiltin) return
  try {
    const res = await window.electronAPI?.agentAnalysis?.hasHistory({ agentId: props.agent.id })
    hasImportedHistory.value = !!res?.hasHistory
  } catch {
    hasImportedHistory.value = false
  }
}
onMounted(checkImportedHistory)
watch(() => props.refreshToken, checkImportedHistory)

// Shared 8-color palette used across the app (NewsView / Skills / Tools / MCP / Chat tree).
const CARD_GRADIENTS = [
  'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)',
  'linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%)',
  'linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%)',
  'linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%)',
  'linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%)',
  'linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%)',
  'linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%)',
  'linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%)',
]
const accentGradient = computed(() => CARD_GRADIENTS[(props.index ?? 0) % CARD_GRADIENTS.length])

const avatarDataUri = computed(() => getAvatarDataUri(props.agent.avatar))

const fallbackInitial = computed(() => {
  return (props.agent.name || '?').charAt(0).toUpperCase()
})

const agentProviderLabel = computed(() => {
  const pid = props.agent.providerId
  if (!pid) return ''
  const provider = configStore.config.providers?.find(p => p.id === pid || p.type === pid)
  if (provider) return provider.alias || provider.name || provider.type
  return PROVIDER_LABELS[pid] || pid.slice(0, 8)
})

const isProviderInactive = computed(() => {
  if (!props.agent.providerId) return false
  const provider = configStore.config.providers?.find(p => p.id === props.agent.providerId || p.type === props.agent.providerId)
  // "Inactive" now means: provider's apiKey was cleared / provider was deleted.
  // The user no longer has to flip an explicit isActive flag to "activate" a
  // provider — credentials alone make it usable. Ollama is the exception:
  // it runs locally with no auth, so an empty apiKey is fine.
  if (!provider) return true
  if (provider.type === 'ollama') return false
  return !provider.apiKey
})

// Show "no provider" warning when an agent has no provider/model set.
// For custom agents: always warn (they must have an explicit provider).
// For builtin/default agents: warn only when no active providers exist at all.
const isNoProviderConfigured = computed(() => {
  if (props.agent.providerId || props.agent.modelId) return false
  if (props.agent.isBuiltin || props.agent.isDefault) {
    return !(configStore.config.providers?.some(p => p.apiKey))
  }
  return true
})


</script>

<style scoped>
.agent-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 12.5rem;
  border-radius: 1rem;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.agent-card:hover {
  transform: translateY(-0.1875rem);
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.10);
}
.agent-card:active {
  transform: translateY(-0.0625rem);
  transition-duration: 0.1s;
}

/* Footer-only colored hover — body of the card stays white. */
.agent-card-footer {
  transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-top-color 0.2s ease,
              padding 0.2s ease;
}
.agent-card--0:hover .agent-card-footer { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.agent-card--1:hover .agent-card-footer { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%); }
.agent-card--2:hover .agent-card-footer { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%); }
.agent-card--3:hover .agent-card-footer { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%); }
.agent-card--4:hover .agent-card-footer { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%); }
.agent-card--5:hover .agent-card-footer { background: linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%); }
.agent-card--6:hover .agent-card-footer { background: linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%); }
.agent-card--7:hover .agent-card-footer { background: linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%); }

/* Footer-content legibility on colored bg */
.agent-card:hover .agent-card-footer { border-top-color: transparent; }
.agent-card:hover .agent-card-builtin-badge,
.agent-card:hover .agent-card-voice-badge { background: rgba(255, 255, 255, 0.22); color: #FFFFFF; }
.agent-card:hover .agent-card-default-badge { background: rgba(255, 255, 255, 0.28); box-shadow: none; }
.agent-card:hover .star-btn-always,
.agent-card:hover .delete-btn-always { color: rgba(255, 255, 255, 0.7); }
.agent-card:hover .star-btn-always:hover { background: rgba(255, 255, 255, 0.22); color: #FBBF24; }
.agent-card:hover .delete-btn-always:hover { background: rgba(239, 68, 68, 0.45); color: #FFFFFF; }

.agent-card-accent { height: 3px; width: 100%; flex-shrink: 0; }
.agent-card-body { padding: 1rem 1rem 0.75rem; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.agent-card-title-row { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.625rem; }
.agent-card-avatar { flex-shrink: 0; }
.agent-card-avatar-img { width: 2.625rem; height: 2.625rem; border-radius: 50%; object-fit: cover; }
.agent-card-avatar-fallback {
  width: 2.625rem; height: 2.625rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700; color: #fff;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
}
.agent-card-title-col { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.agent-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700;
  color: #1A1A1A; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.agent-card-type {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; padding: 0.0625rem 0.4375rem;
  border-radius: 0.25rem; width: fit-content;
}
.agent-card-type.system { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.agent-card-type.user { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.agent-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #6B7280;
  line-height: 1.55; margin: 0 0 0.625rem;
  height: calc(var(--fs-secondary) * 1.55 * 2); /* fixed 2-line height for consistent card height */
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.agent-capabilities-row {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  align-items: center;
  min-height: 1.875rem;
  margin-bottom: 0.5rem;
}
.capability-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.375rem;
  white-space: nowrap;
  line-height: 1.4;
}
.skills-badge {
  background: #FEF3C7;
  color: #92400E;
}
.tools-badge {
  background: #D1FAE5;
  color: #065F46;
}
.mcp-badge {
  background: #E0E7FF;
  color: #312E81;
}
.rag-badge {
  background: #FCE7F3;
  color: #831843;
}
.pc-model-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.pc-provider-badge {
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-full);
  background: rgba(0,0,0,0.06);
  color: var(--text-secondary);
}
.pc-model-id {
  font-size: var(--fs-small);
  font-family: 'JetBrains Mono', monospace;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 11.25rem;
}
.pc-inactive-warn {
  font-size: var(--fs-small);
  color: #EF4444;
  font-weight: 600;
}
.pc-no-provider-warn {
  font-size: var(--fs-small);
  color: #EF4444;
  font-weight: 600;
}
.agent-card-footer {
  border-top: 1px solid rgba(229, 229, 234, 0.5);
  margin: auto -1rem -0.75rem -1rem;
  padding: 0.75rem 1rem;
  display: flex; align-items: center; justify-content: space-between;
  min-height: 2.875rem;
}
.agent-card-badges { display: flex; align-items: center; gap: 0.375rem; flex-wrap: nowrap; overflow: hidden; }
.agent-card-default-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #FFFFFF; display: flex; align-items: center; gap: 0.25rem;
}
.agent-card-builtin-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px; background: rgba(0,0,0,0.06);
  color: #1A1A1A; display: flex; align-items: center;
}
.agent-card-voice-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px; background: rgba(0,0,0,0.06);
  color: #6B7280; display: flex; align-items: center; gap: 0.1875rem;
  text-transform: capitalize;
}
.agent-card-footer-right { display: flex; align-items: center; gap: 0.125rem; }
.agent-action-btn {
  width: 1.75rem; height: 1.75rem; border-radius: 0.375rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; cursor: pointer;
  transition: background 0.15s, color 0.15s; flex-shrink: 0;
}
.star-btn-always { color: #D1D5DB; }
.star-btn-always:hover { background: #F5F5F5; color: #F59E0B; }
.delete-btn-always { color: #D1D5DB; }
.delete-btn-always:hover { background: #FEE2E2; color: #DC2626; }
.agent-card-actions {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.3125rem;
}
.agent-analysis-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3125rem 0.5625rem;
  border-radius: 9999px;
  border: none;
  background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
  color: #FFFFFF;
  font-size: 0.6875rem;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
  transition: all 0.15s ease;
  letter-spacing: 0.03em;
  white-space: nowrap;
}
.agent-chat-btn,
.agent-view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border-radius: 9999px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: all 0.15s ease;
}
.agent-chat-btn:hover,
.agent-view-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 4px 14px rgba(0,0,0,0.26);
  transform: translateY(-1px);
}
.agent-chat-btn:active,
.agent-view-btn:active { transform: translateY(0); }
.agent-analysis-btn:hover {
  background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%);
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.5);
  transform: translateY(-1px);
}
.agent-analysis-btn:active {
  transform: translateY(0);
}
.unassign-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid #E5E5EA;
  background: #F5F5F5;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.unassign-chip:hover {
  background: #FFF3CD;
  border-color: #FCD34D;
  color: #92400E;
}

@media (prefers-reduced-motion: reduce) {
  .agent-card { transition: none; }
  .agent-card:hover { transform: none; }
}
</style>
