<template>
  <div class="persona-card" @click="$emit('click')">
    <!-- Gradient accent bar -->
    <div class="persona-card-accent" :style="{ background: gradient }"></div>

    <div class="persona-card-body">
      <!-- Avatar + title row -->
      <div class="persona-card-title-row">
        <div class="persona-card-avatar">
          <img
            v-if="avatarDataUri"
            :src="avatarDataUri"
            class="persona-card-avatar-img"
            alt=""
          />
          <div v-else class="persona-card-avatar-fallback" :style="{ background: gradient }">
            {{ fallbackInitial }}
          </div>
        </div>
        <div class="persona-card-title-col">
          <h3 class="persona-card-name">{{ persona.name }}</h3>
          <span class="persona-card-type" :class="persona.type">{{ persona.type }}</span>
        </div>
      </div>

      <!-- Description -->
      <p class="persona-card-desc">{{ persona.description || 'No description' }}</p>

      <!-- Provider + Model metadata -->
      <div v-if="persona.providerId || persona.modelId" class="pc-model-meta">
        <span v-if="persona.providerId" class="pc-provider-badge">
          {{ PROVIDER_LABELS[persona.providerId] || persona.providerId }}
        </span>
        <span v-if="persona.modelId" class="pc-model-id">{{ persona.modelId }}</span>
        <span v-if="isProviderInactive" class="pc-inactive-warn">&#9888; Provider inactive</span>
      </div>

      <!-- Footer -->
      <div class="persona-card-footer">
        <div class="persona-card-badges">
          <span v-if="persona.isDefault" class="persona-card-default-badge">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Default
          </span>
          <span v-if="persona.isBuiltin" class="persona-card-builtin-badge">Built-in</span>
          <span v-if="persona.voiceId" class="persona-card-voice-badge">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
            {{ persona.voiceId }}
          </span>
        </div>
        <div class="persona-card-footer-right">
          <button
            v-if="!persona.isDefault"
            @click.stop="$emit('set-default')"
            class="persona-action-btn star-btn-always"
            title="Set as default"
            aria-label="Set as default"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button
            v-if="!persona.isBuiltin"
            @click.stop="$emit('delete')"
            class="persona-action-btn delete-btn-always"
            title="Delete persona"
            aria-label="Delete persona"
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
import { getAvatarDataUri } from './personaAvatars'
import { useConfigStore } from '../../stores/config'

const PROVIDER_LABELS = {
  anthropic:  'Anthropic',
  openrouter: 'OpenRouter',
  openai:     'OpenAI',
  deepseek:   'DeepSeek',
}

const configStore = useConfigStore()

const props = defineProps({
  persona: { type: Object, required: true },
  gradient: { type: String, default: 'linear-gradient(135deg, #0F0F0F, #374151)' },
})

defineEmits(['click', 'delete', 'set-default'])

const avatarDataUri = computed(() => getAvatarDataUri(props.persona.avatar))

const fallbackInitial = computed(() => {
  return (props.persona.name || '?').charAt(0).toUpperCase()
})

const isProviderInactive = computed(() => {
  if (!props.persona.providerId) return false
  return !configStore.config[props.persona.providerId]?.isActive
})
</script>

<style scoped>
.persona-card {
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
.persona-card:hover {
  transform: translateY(-0.1875rem);
  background: #FFFFFF;
  border-color: #E5E5EA;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.persona-card:active {
  transform: translateY(-0.0625rem);
  transition-duration: 0.1s;
}

.persona-card-accent { height: 3px; width: 100%; flex-shrink: 0; }
.persona-card-body { padding: 1rem 1rem 0.75rem; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.persona-card-title-row { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.625rem; }
.persona-card-avatar { flex-shrink: 0; }
.persona-card-avatar-img { width: 2.625rem; height: 2.625rem; border-radius: 50%; object-fit: cover; }
.persona-card-avatar-fallback {
  width: 2.625rem; height: 2.625rem; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1rem; font-weight: 700; color: #fff;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
}
.persona-card-title-col { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
.persona-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700;
  color: #1A1A1A; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.persona-card-type {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; padding: 0.0625rem 0.4375rem;
  border-radius: 0.25rem; width: fit-content;
}
.persona-card-type.system { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.persona-card-type.user { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.persona-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #6B7280;
  line-height: 1.55; margin: 0 0 0.625rem;
  max-height: calc(var(--fs-secondary) * 1.55 * 2); /* 2 lines — matches default persona */
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
.persona-card-footer {
  border-top: 1px solid rgba(229, 229, 234, 0.5); padding-top: 0.75rem; margin-top: auto;
  display: flex; align-items: center; justify-content: space-between;
}
.persona-card-badges { display: flex; align-items: center; gap: 0.375rem; }
.persona-card-default-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #FFFFFF; display: flex; align-items: center; gap: 0.25rem;
}
.persona-card-builtin-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px; background: rgba(0,0,0,0.06);
  color: #1A1A1A; display: flex; align-items: center;
}
.persona-card-voice-badge {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 9999px; background: rgba(0,0,0,0.06);
  color: #6B7280; display: flex; align-items: center; gap: 0.1875rem;
  text-transform: capitalize;
}
.persona-card-footer-right { display: flex; align-items: center; gap: 0.125rem; }
.persona-action-btn {
  width: 1.75rem; height: 1.75rem; border-radius: 0.375rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; cursor: pointer;
  transition: background 0.15s, color 0.15s; flex-shrink: 0;
}
.star-btn-always { color: #D1D5DB; }
.star-btn-always:hover { background: #F5F5F5; color: #F59E0B; }
.delete-btn-always { color: #D1D5DB; }
.delete-btn-always:hover { background: #FEE2E2; color: #DC2626; }

@media (prefers-reduced-motion: reduce) {
  .persona-card { transition: none; }
  .persona-card:hover { transform: none; }
}
</style>
