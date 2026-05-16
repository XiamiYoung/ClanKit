<script setup>
import { computed, ref } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import ConfirmModal from '../common/ConfirmModal.vue'

const props = defineProps({
  message: { type: Object, required: true },
})
const emit = defineEmits(['delete'])

const { t } = useI18n()

function _formatBytes(b) {
  const n = Number(b) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function _formatTime(ts) {
  if (!ts) return ''
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const humanSize = computed(() => _formatBytes(props.message.totalBytes || props.message.contentBytes || 0))
const humanTime = computed(() => _formatTime(props.message.ts || props.message.created_at))
const agentName = computed(() => props.message.agent_name || props.message.agentName || t('chats.oversizeMessageUnknownAgent'))

const showConfirm = ref(false)
const confirmMessage = computed(() =>
  t('chats.oversizeMessageConfirm', { size: humanSize.value }).replace('{size}', humanSize.value)
)

function openConfirm() {
  showConfirm.value = true
}
function onConfirm() {
  showConfirm.value = false
  emit('delete', props.message.id)
}
function onCancel() {
  showConfirm.value = false
}
</script>

<template>
  <div class="oversize-card">
    <div class="oversize-card__title">
      {{ t('chats.oversizeMessageTitle', { size: humanSize }).replace('{size}', humanSize) }}
    </div>
    <div class="oversize-card__meta">
      {{ t('chats.oversizeMessageFrom', { agent: agentName, time: humanTime })
          .replace('{agent}', agentName).replace('{time}', humanTime) }}
    </div>
    <div class="oversize-card__body">
      {{ t('chats.oversizeMessageBody') }}
    </div>
    <div class="oversize-card__actions">
      <button type="button" class="oversize-card__delete" @click="openConfirm">
        {{ t('chats.oversizeMessageDelete') }}
      </button>
    </div>
    <ConfirmModal
      v-if="showConfirm"
      :visible="true"
      :title="t('chats.deleteMessage')"
      :message="confirmMessage"
      :confirm-text="t('common.delete')"
      confirm-class="danger"
      @confirm="onConfirm"
      @close="onCancel"
    />
  </div>
</template>

<style scoped>
.oversize-card {
  margin: 0.5rem 0;
  padding: 0.875rem 1rem;
  border: 1px solid #FCA5A5;
  background: #FEF2F2;
  border-radius: 0.5rem;
  color: #7F1D1D;
  font-size: var(--fs-small, 0.875rem);
  line-height: 1.5;
}
.oversize-card__title {
  font-weight: 600;
  font-size: 0.95rem;
  margin-bottom: 0.25rem;
}
.oversize-card__meta {
  font-size: 0.75rem;
  color: #991B1B;
  opacity: 0.8;
  margin-bottom: 0.5rem;
}
.oversize-card__body {
  white-space: pre-line;
  margin-bottom: 0.75rem;
}
.oversize-card__actions {
  display: flex;
  justify-content: flex-end;
}
.oversize-card__delete {
  font-size: 0.8rem;
  padding: 0.375rem 0.875rem;
  border-radius: 0.375rem;
  background: #DC2626;
  color: #fff;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.12s;
}
.oversize-card__delete:hover {
  background: #B91C1C;
}
.oversize-card__delete:active {
  background: #991B1B;
}
</style>
