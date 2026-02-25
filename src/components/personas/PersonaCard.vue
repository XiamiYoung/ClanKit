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

      <!-- Footer -->
      <div class="persona-card-footer">
        <div class="persona-card-badges">
          <span v-if="persona.isDefault" class="persona-card-default-badge">
            <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Default
          </span>
          <span v-if="persona.isBuiltin" class="persona-card-builtin-badge">Built-in</span>
        </div>
        <div class="persona-card-actions">
          <button
            v-if="!persona.isDefault"
            @click.stop="$emit('set-default')"
            class="persona-action-btn"
            title="Set as default"
            aria-label="Set as default"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button
            @click.stop="$emit('edit')"
            class="persona-action-btn"
            title="Edit persona"
            aria-label="Edit persona"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button
            v-if="!persona.isBuiltin"
            @click.stop="$emit('delete')"
            class="persona-action-btn danger"
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

const props = defineProps({
  persona: { type: Object, required: true },
  gradient: { type: String, default: 'linear-gradient(135deg, #0F0F0F, #374151)' },
})

defineEmits(['click', 'edit', 'delete', 'set-default'])

const avatarDataUri = computed(() => getAvatarDataUri(props.persona.avatar))

const fallbackInitial = computed(() => {
  return (props.persona.name || '?').charAt(0).toUpperCase()
})
</script>

<style scoped>
.persona-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  max-height: 240px;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.persona-card:hover {
  transform: translateY(-3px);
  background: #FFFFFF;
  border-color: #E5E5EA;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.persona-card:active {
  transform: translateY(-1px);
  transition-duration: 0.1s;
}

.persona-card-accent { height: 3px; width: 100%; flex-shrink: 0; }
.persona-card-body { padding: 20px 20px 16px; display: flex; flex-direction: column; flex: 1; }
.persona-card-title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.persona-card-avatar { flex-shrink: 0; }
.persona-card-avatar-img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
.persona-card-avatar-fallback {
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: #fff;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);
}
.persona-card-title-col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.persona-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700;
  color: #1A1A1A; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.persona-card-type {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 7px;
  border-radius: 4px; width: fit-content;
}
.persona-card-type.system { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.persona-card-type.user { background: rgba(0, 0, 0, 0.06); color: #1A1A1A; }
.persona-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #6B7280;
  line-height: 1.55; margin: 0 0 16px; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.persona-card-footer {
  border-top: 1px solid rgba(229, 229, 234, 0.5); padding-top: 12px; margin-top: auto;
  display: flex; align-items: center; justify-content: space-between;
}
.persona-card-badges { display: flex; gap: 6px; }
.persona-card-default-badge {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #FFFFFF; display: flex; align-items: center; gap: 4px;
}
.persona-card-builtin-badge {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 2px 8px; border-radius: 9999px; background: rgba(0,0,0,0.06);
  color: #1A1A1A; display: flex; align-items: center;
}
.persona-card-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s ease; }
.persona-card:hover .persona-card-actions { opacity: 1; }
.persona-action-btn {
  width: 28px; height: 28px; border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #9CA3AF; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.persona-action-btn:hover { background: #F5F5F5; color: #1A1A1A; }
.persona-action-btn.danger:hover { background: #FEE2E2; color: #DC2626; }

@media (prefers-reduced-motion: reduce) {
  .persona-card, .persona-card-actions { transition: none; }
  .persona-card:hover { transform: none; }
}
</style>
