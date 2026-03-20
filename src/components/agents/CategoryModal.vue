<template>
  <Teleport v-if="visible" to="body">
    <div class="cat-modal-backdrop">
      <div class="cat-modal" role="dialog" aria-modal="true">

        <!-- Header -->
        <div class="cat-modal-header">
          <div class="cat-modal-header-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="cat-modal-title">{{ detectedMode === 'create' ? t('categoryModal.new', { noun: noun }) : (renameTitle || t('categoryModal.rename', { noun: noun })) }}</span>
          <button class="cat-modal-close" @click="$emit('close')" aria-label="Close">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="cat-modal-body">
          <!-- Type selector (create mode only, agent categories) -->
          <template v-if="showTypeSelector">
            <div v-if="detectedMode === 'create'" class="cat-type-row">
              <button
                class="cat-type-btn"
                :class="{ active: localType === 'system' }"
                @click="localType = 'system'"
              >{{ t('categoryModal.system') }}</button>
              <button
                class="cat-type-btn"
                :class="{ active: localType === 'user' }"
                @click="localType = 'user'"
              >{{ t('categoryModal.user') }}</button>
            </div>
            <p v-else class="cat-modal-subtitle">
              {{ type === 'system' ? t('categoryModal.systemCategory') : t('categoryModal.userCategory') }}
            </p>
          </template>

          <div class="cat-field-row">
            <!-- Emoji button -->
            <div class="cat-field cat-field-emoji">
              <label class="cat-label">{{ t('categoryModal.emoji') }}</label>
              <button class="cat-emoji-btn" @click="showEmojiPicker = true" :title="t('categoryModal.chooseEmoji')">
                <span class="cat-emoji-display">{{ localEmoji }}</span>
                <svg class="cat-emoji-edit-icon" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>

            <!-- Name -->
            <div class="cat-field cat-field-name">
              <label class="cat-label">{{ t('categoryModal.name') }}</label>
              <input
                ref="nameRef"
                v-model="localName"
                class="cat-input"
                :class="{ 'cat-input--error': nameError }"
                type="text"
                maxlength="40"
                :placeholder="t('categoryModal.namePlaceholder')"
                @keydown.enter="submit"
                @input="nameError = ''"
              />
              <span v-if="nameError" class="cat-name-error">{{ nameError }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="cat-modal-footer">
          <button class="cat-btn-cancel" @click="$emit('close')">{{ t('common.cancel') }}</button>
          <button class="cat-btn-confirm" @click="submit">
            {{ detectedMode === 'create' ? t('common.create') : t('common.save') }}
          </button>
        </div>

      </div>
    </div>

    <!-- Emoji picker (nested teleport — renders on top) -->
    <EmojiPicker
      v-if="showEmojiPicker"
      :current="localEmoji"
      @select="onEmojiSelect"
      @close="showEmojiPicker = false"
    />

  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import EmojiPicker from './EmojiPicker.vue'
import { useI18n } from '../../i18n/useI18n'

defineOptions({ inheritAttrs: false })

const { t } = useI18n()

const props = defineProps({
  visible:             { type: Boolean, default: false },
  category:            { type: Object,  default: null },
  mode:                { type: String,  default: null },  // 'create' | 'rename' | null (auto-detect)
  type:                { type: String,  default: 'system' },  // 'system' | 'user'
  initial:             { type: Object,  default: () => ({ name: '', emoji: '📁' }) },
  noun:                { type: String,  default: 'Category' }, // e.g. 'Category' | 'Folder'
  renameTitle:         { type: String,  default: '' },          // override rename mode title
  showTypeSelector:    { type: Boolean, default: true },
  existingCategories:  { type: Array,   default: () => [] },   // for duplicate check
})

const emit = defineEmits(['confirm', 'close', 'saved'])

// Auto-detect mode: if category is provided, it's rename; otherwise create
const detectedMode = computed(() => props.mode || (props.category ? 'rename' : 'create'))

const localName      = ref(props.initial?.name  || '')
const localEmoji     = ref(props.initial?.emoji || '📁')
const localType      = ref(props.type || 'system')
const showEmojiPicker = ref(false)
const nameRef        = ref(null)
const nameError      = ref('')

// Re-sync local state whenever the modal opens (props may differ between opens)
watch(() => props.visible, (val) => {
  if (val) {
    localName.value  = props.initial?.name  || ''
    localEmoji.value = props.initial?.emoji || '📁'
    localType.value  = props.type || 'system'
    showEmojiPicker.value = false
    nameError.value = ''
  }
})

onMounted(async () => {
  await nextTick()
  nameRef.value?.focus()
  nameRef.value?.select()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showEmojiPicker.value) { showEmojiPicker.value = false; return }
    emit('close')
  }
}

function onEmojiSelect(emoji) {
  localEmoji.value   = emoji
  showEmojiPicker.value = false
}

function submit() {
  const name = localName.value.trim()
  if (!name) return
  nameError.value = ''
  // Duplicate check: same type, exclude self when renaming
  const editId = props.category?.id
  const activeType = detectedMode.value === 'create' ? localType.value : (props.type || 'system')
  const duplicate = props.existingCategories.find(c =>
    c.type === activeType &&
    c.name?.trim().toLowerCase() === name.toLowerCase() &&
    c.id !== editId
  )
  if (duplicate) {
    nameError.value = `A category named "${duplicate.name}" already exists.`
    return
  }
  const data = { name, emoji: localEmoji.value || '📁', type: localType.value }
  emit('confirm', data)
  emit('saved', data)
}
</script>

<style>
/* Unscoped — content is teleported outside component DOM */
.cat-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: catBackdropIn 0.15s ease-out;
}
@keyframes catBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cat-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 26rem;
  max-width: calc(100vw - 2rem);
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  animation: catModalIn 0.2s ease-out;
}
@keyframes catModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.cat-modal-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 1rem 1rem 0.875rem;
  border-bottom: 1px solid #1F1F1F;
}
.cat-modal-header-icon {
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
.cat-modal-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.cat-modal-close {
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
.cat-modal-close:hover { color: #FFFFFF; }

.cat-modal-body {
  padding: 1.25rem 1rem 1rem;
}
.cat-type-row {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 1rem;
}
.cat-type-btn {
  flex: 1;
  padding: 0.4375rem 0;
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
.cat-type-btn:hover { border-color: #4B5563; color: #FFFFFF; }
.cat-type-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.cat-modal-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #6B7280;
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.cat-field-row {
  display: flex;
  gap: 0.625rem;
  align-items: flex-end;
}
.cat-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.cat-field-emoji { flex: 0 0 auto; }
.cat-field-name  { flex: 1; }
.cat-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  color: #9CA3AF;
}

/* Emoji pick button */
.cat-emoji-btn {
  position: relative;
  width: 3.5rem;
  height: 2.75rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  background: #1A1A1A;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, background 0.15s;
  overflow: hidden;
}
.cat-emoji-btn:hover {
  border-color: #4B5563;
  background: #222222;
}
.cat-emoji-display {
  font-size: 1.5rem;
  line-height: 1;
  pointer-events: none;
}
.cat-emoji-edit-icon {
  position: absolute;
  bottom: 0.25rem;
  right: 0.25rem;
  color: #6B7280;
  opacity: 0;
  transition: opacity 0.15s;
}
.cat-emoji-btn:hover .cat-emoji-edit-icon { opacity: 1; }

.cat-input {
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.5625rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
  outline: none;
  height: 2.75rem;
}
.cat-input::placeholder { color: #4B5563; }
.cat-input:focus { border-color: #4B5563; }
.cat-input--error { border-color: #EF4444 !important; }
.cat-name-error {
  display: block;
  margin-top: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  color: #EF4444;
}

.cat-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #0A0A0A;
  border-top: 1px solid #1F1F1F;
  border-radius: 0 0 1rem 1rem;
}
.cat-btn-cancel {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.cat-btn-cancel:hover { background: #2A2A2A; color: #FFFFFF; }
.cat-btn-confirm {
  padding: 0.5rem 1.125rem;
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
.cat-btn-confirm:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.cat-btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
