<template>
  <div class="agent-card" @click="$emit('click')">
    <!-- Gradient accent bar -->
    <div class="agent-card-accent" :style="{ background: gradient }"></div>

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

      <!-- Provider + Model metadata — only shown for system agents -->
      <div v-if="agent.type !== 'user' && (agent.providerId || agent.modelId)" class="pc-model-meta">
        <span v-if="agentProviderLabel" class="pc-provider-badge">
          {{ agentProviderLabel }}
        </span>
        <span v-if="agent.modelId" class="pc-model-id">{{ agent.modelId }}</span>
        <span v-if="isProviderInactive" class="pc-inactive-warn">&#9888; {{ t('agents.providerInactive') }}</span>
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
            {{ agent.voiceId }}
          </span>
        </div>
        <div class="agent-card-footer-right">
          <button
            v-if="!agent.isDefault && !hideSetDefault && !showUnassign"
            @click.stop="$emit('set-default')"
            class="agent-action-btn star-btn-always"
            :title="t('agents.setAsDefault')"
            :aria-label="t('agents.setAsDefault')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button
            v-if="showUnassign"
            @click.stop="$emit('unassign')"
            class="unassign-chip"
            :title="t('agents.unassignFromCategory')"
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
            :title="deleteTitle"
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
import { computed } from 'vue'
import { getAvatarDataUri } from './agentAvatars'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

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
  hideDelete:     { type: Boolean, default: false },
  hideSetDefault: { type: Boolean, default: false },
  showUnassign:   { type: Boolean, default: false },
  deleteDisabled: { type: Boolean, default: false },
  deleteTitle:    { type: String,  default: 'Delete Agent' },
})

defineEmits(['click', 'delete', 'unassign', 'set-default'])

const avatarDataUri = computed(() => getAvatarDataUri(props.agent.avatar))

const fallbackInitial = computed(() => {
  return (props.agent.name || '?').charAt(0).toUpperCase()
})

const agentProviderLabel = computed(() => {
  const pid = props.agent.providerId
  if (!pid) return ''
  const provider = configStore.config.providers?.find(p => p.id === pid)
  if (provider?.name) return provider.name
  return PROVIDER_LABELS[pid] || pid.slice(0, 8)
})

const isProviderInactive = computed(() => {
  if (!props.agent.providerId) return false
  const provider = configStore.config.providers?.find(p => p.id === props.agent.providerId)
  return !provider?.isActive
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
  background: #FFFFFF;
  border-color: #E5E5EA;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.agent-card:active {
  transform: translateY(-0.0625rem);
  transition-duration: 0.1s;
}

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
  max-height: calc(var(--fs-secondary) * 1.55 * 2); /* 2 lines — matches default agent */
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
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
.agent-card-footer {
  border-top: 1px solid rgba(229, 229, 234, 0.5); padding-top: 0.75rem; margin-top: auto;
  display: flex; align-items: center; justify-content: space-between;
}
.agent-card-badges { display: flex; align-items: center; gap: 0.375rem; }
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
