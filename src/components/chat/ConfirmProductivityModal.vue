<template>
  <Teleport to="body">
    <div class="cpm-backdrop">
      <div class="cpm-dialog" role="dialog" aria-modal="true">
        <h3 class="cpm-title">{{ t('chats.productivityFirstNoticeTitle') }}</h3>
        <p class="cpm-body">{{ t('chats.productivityFirstNoticeBody') }}</p>
        <div class="cpm-actions">
          <AppButton size="compact" @click="emit('cancel')">{{ t('common.cancel') }}</AppButton>
          <AppButton size="compact" variant="primary" @click="emit('confirm')">{{ t('common.ok') }}</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import AppButton from '@/components/common/AppButton.vue'
const { t } = useI18n()
const emit = defineEmits(['confirm', 'cancel'])
</script>

<style scoped>
.cpm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  z-index: 9999;
}
.cpm-dialog {
  background: var(--bg-card, #fff);
  padding: 1.5rem;
  border-radius: var(--radius-lg, 0.75rem);
  max-width: 26rem;
  box-shadow: 0 1.25rem 2.5rem rgba(0, 0, 0, 0.2);
}
.cpm-title {
  margin: 0 0 0.75rem;
  font-size: var(--fs-section, 1.25rem);
  font-weight: 600;
}
.cpm-body {
  margin: 0 0 1.25rem;
  font-size: var(--fs-secondary, 0.875rem);
  color: var(--text-secondary, #4b5563);
  line-height: 1.5;
}
.cpm-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
</style>
