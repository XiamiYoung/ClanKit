<template>
  <Teleport v-if="visible" to="body">
    <div class="cm-backdrop">
      <div class="cm-modal" role="dialog" aria-modal="true">

        <!-- Header -->
        <div class="cm-header">
          <div class="cm-header-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span class="cm-title">{{ title }}</span>
          <button class="cm-close" @click="$emit('close')" aria-label="Close">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="cm-tabs">
          <button
            class="cm-tab"
            :class="{ 'cm-tab--active': activeTab === 'chat' }"
            @click="activeTab = 'chat'"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {{ chatTabLabel || t('createMethod.tabChat') }}
          </button>
          <button
            class="cm-tab"
            :class="{ 'cm-tab--active': activeTab === 'manual' }"
            @click="activeTab = 'manual'"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            {{ manualTabLabel || t('createMethod.tabManual') }}
          </button>
        </div>

        <!-- Body — switches by tab -->
        <div class="cm-body">
          <template v-if="activeTab === 'chat'">
            <p class="cm-desc">{{ chatDesc || t('createMethod.chatDesc') }}</p>
            <!-- Preview of the prefill that will land in the chat input -->
            <div v-if="chatPreview" class="cm-preview">
              <span class="cm-preview-label">{{ t('createMethod.previewLabel') }}</span>
              <pre class="cm-preview-text">{{ chatPreview }}</pre>
            </div>
            <button class="cm-cta" @click="onChat">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {{ chatCtaLabel || t('createMethod.chatCta') }}
            </button>
          </template>
          <template v-else>
            <p class="cm-desc">{{ manualDesc || t('createMethod.manualDesc') }}</p>
            <button class="cm-cta" @click="onManual">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              {{ manualCtaLabel || t('createMethod.manualCta') }}
            </button>
          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from '../../i18n/useI18n'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

const props = defineProps({
  visible:         { type: Boolean, default: false },
  title:           { type: String,  required: true },
  chatTabLabel:    { type: String,  default: '' },
  manualTabLabel:  { type: String,  default: '' },
  chatDesc:        { type: String,  default: '' },
  manualDesc:      { type: String,  default: '' },
  chatCtaLabel:    { type: String,  default: '' },
  manualCtaLabel:  { type: String,  default: '' },
  chatPreview:     { type: String,  default: '' },
})

const emit = defineEmits(['chat', 'manual', 'close'])

const activeTab = ref('chat')

// Reset to chat tab whenever the modal opens.
watch(() => props.visible, (val) => {
  if (val) activeTab.value = 'chat'
})

function onChat() {
  emit('chat')
  emit('close')
}
function onManual() {
  emit('manual')
  emit('close')
}

function onKeydown(e) {
  if (props.visible && e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style>
/* Unscoped — content is teleported outside the component DOM */
.cm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: cmBackdropIn 0.15s ease-out;
}
@keyframes cmBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cm-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 28rem;
  max-width: calc(100vw - 2rem);
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: cmModalIn 0.2s ease-out;
}
@keyframes cmModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.cm-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 1rem 0.875rem;
  border-bottom: 1px solid #1F1F1F;
}
.cm-header-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  flex-shrink: 0;
}
.cm-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.cm-close {
  background: none;
  border: none;
  color: #6B7280;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease;
}
.cm-close:hover { color: #FFFFFF; }

/* Tabs */
.cm-tabs {
  display: flex;
  gap: 0.375rem;
  padding: 0.75rem 1rem 0;
}
.cm-tab {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4375rem;
  padding: 0.5rem 0;
  border-radius: 0.5rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #6B7280;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.cm-tab:hover { border-color: #4B5563; color: #FFFFFF; }
.cm-tab--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

/* Body */
.cm-body {
  padding: 1rem 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.cm-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #9CA3AF;
  line-height: 1.55;
  margin: 0;
}
.cm-preview {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
}
.cm-preview-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.75rem);
  font-weight: 600;
  color: #6B7280;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.cm-preview-text {
  margin: 0;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #D1D5DB;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.cm-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.125rem;
  border-radius: 0.5rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.cm-cta:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 4px 12px rgba(0,0,0,0.28);
}
</style>
