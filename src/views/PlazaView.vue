<template>
  <div class="plaza-view">
    <!-- Header -->
    <div class="plaza-header">
      <div class="plaza-header-left">
        <div class="plaza-header-icon">
          <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>
          </svg>
        </div>
        <div>
          <h1 class="plaza-title">{{ t('plaza.title') }}</h1>
          <p class="plaza-subtitle">{{ t('plaza.subtitle') }}</p>
        </div>
      </div>
      <div class="plaza-header-actions">
        <div class="plaza-lang-group">
          <select v-model="topicLang" class="plaza-lang-select">
            <option value="en">English</option>
            <option value="zh">Chinese</option>
          </select>
          <AppButton size="compact" @click="doGenerateTopics" :loading="generatingTopics">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {{ plazaStore.topics.length > 0 ? 'Rotate Topics' : 'Generate Topics' }}
          </AppButton>
        </div>
        <AppButton size="compact" variant="ghost" @click="doSurpriseMe">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Surprise Me
        </AppButton>
        <AppButton size="compact" @click="showCreateModal = true">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Topic
        </AppButton>
      </div>
    </div>

    <!-- Content -->
    <div class="plaza-content">
      <!-- Loading -->
      <div v-if="plazaStore.isLoading" class="plaza-loading">
        <div class="plaza-spinner"></div>
      </div>

      <!-- Empty state -->
      <div v-else-if="plazaStore.topics.length === 0" class="plaza-empty">
        <div class="plaza-empty-icon">
          <svg style="width:36px;height:36px;" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>
          </svg>
        </div>
        <h2 class="plaza-empty-title">{{ t('plaza.noTopicsYet') }}</h2>
        <p class="plaza-empty-desc">Generate AI-powered debate topics or create your own.</p>
        <div class="plaza-lang-group">
          <select v-model="topicLang" class="plaza-lang-select">
            <option value="en">English</option>
            <option value="zh">Chinese</option>
          </select>
          <AppButton @click="doGenerateTopics" :loading="generatingTopics">
            Generate Topics
          </AppButton>
        </div>
      </div>

      <!-- Topic grid -->
      <div v-else class="plaza-grid">
        <TopicCard
          v-for="topic in plazaStore.topics"
          :key="topic.id"
          :topic="topic"
          @click="onTopicClick(topic)"
          @start="onTopicStart(topic)"
          @history="onTopicHistory(topic)"
          @delete="onTopicDelete(topic)"
        />
      </div>
    </div>

    <!-- Modals -->
    <TopicCreateModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @created="onTopicCreated"
    />

    <SessionSetupModal
      v-if="setupTopic"
      :topicTitle="setupTopic.title"
      :prefillAgentIds="prefillAgentIds"
      @close="setupTopic = null; prefillAgentIds = []"
      @start="onSessionStart"
    />

    <SessionHistoryModal
      v-if="historyTopic"
      :topicId="historyTopic.id"
      @close="historyTopic = null"
      @open-session="onOpenSession"
    />

    <SurpriseModal
      v-if="showSurpriseModal"
      :language="topicLang"
      @close="showSurpriseModal = false"
      @confirm="onSurpriseConfirm"
    />

    <ConfirmModal
      v-if="deleteTopic"
      :visible="!!deleteTopic"
      :title="t('plaza.deleteTopic')"
      :message="t('plaza.deleteTopicConfirm', { name: deleteTopic.title })"
      confirm-text="Delete"
      confirm-class="danger"
      @confirm="confirmDeleteTopic"
      @close="deleteTopic = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlazaStore } from '../stores/plaza'
import { useAgentsStore } from '../stores/agents'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import TopicCard from '../components/plaza/TopicCard.vue'
import TopicCreateModal from '../components/plaza/TopicCreateModal.vue'
import SessionSetupModal from '../components/plaza/SessionSetupModal.vue'
import SessionHistoryModal from '../components/plaza/SessionHistoryModal.vue'
import SurpriseModal from '../components/plaza/SurpriseModal.vue'

const { t } = useI18n()

const router = useRouter()
const plazaStore = usePlazaStore()
const agentsStore = useAgentsStore()

const showCreateModal = ref(false)
const setupTopic = ref(null)
const historyTopic = ref(null)
const deleteTopic = ref(null)
const prefillAgentIds = ref([])
const showSurpriseModal = ref(false)
const generatingTopics = ref(false)
const topicLang = ref('en')

onMounted(async () => {
  await plazaStore.loadTopics()
  await agentsStore.loadAgents()
})

function onTopicClick(topic) {
  // If there's a running session, navigate to it
  if (topic.lastSessionId && topic.lastSessionStatus === 'running') {
    router.push(`/plaza/${topic.lastSessionId}`)
  } else {
    onTopicStart(topic)
  }
}

function onTopicStart(topic) {
  setupTopic.value = topic
  prefillAgentIds.value = []
}

function onTopicHistory(topic) {
  historyTopic.value = topic
}

function onTopicDelete(topic) {
  deleteTopic.value = topic
}

async function confirmDeleteTopic() {
  if (!deleteTopic.value) return
  await plazaStore.deleteTopic(deleteTopic.value.id)
  deleteTopic.value = null
}

async function onTopicCreated(topic) {
  await plazaStore.saveTopic(topic)
  showCreateModal.value = false
}

async function onSessionStart({ agentIds, agentToolPermissions, maxRounds }) {
  if (!setupTopic.value) return
  const session = await plazaStore.createSession({
    topicId: setupTopic.value.id,
    agentIds,
    agentToolPermissions,
    maxRounds,
    language: topicLang.value,
  })
  // Update topic with session reference
  await plazaStore.saveTopic({
    ...setupTopic.value,
    lastSessionId: session.id,
    lastSessionStatus: 'setup',
  })
  setupTopic.value = null
  prefillAgentIds.value = []
  router.push(`/plaza/${session.id}`)
}

function onOpenSession(session) {
  historyTopic.value = null
  router.push(`/plaza/${session.id}`)
}

function doSurpriseMe() {
  showSurpriseModal.value = true
}

async function onSurpriseConfirm({ topic, agentIds }) {
  showSurpriseModal.value = false
  // Save topic to store
  await plazaStore.saveTopic(topic)
  // Open session setup with prefilled agents
  setupTopic.value = topic
  prefillAgentIds.value = agentIds || []
}

async function doGenerateTopics() {
  generatingTopics.value = true
  try {
    await plazaStore.generateTopics(topicLang.value)
  } finally {
    generatingTopics.value = false
  }
}
</script>

<style scoped>
.plaza-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-main);
}
.plaza-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem 1rem;
  gap: 1rem;
}
.plaza-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.plaza-header-icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.plaza-title {
  font-size: var(--fs-page-title);
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.02em;
}
.plaza-subtitle {
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  margin: 0;
}
.plaza-header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.plaza-lang-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.plaza-lang-select {
  padding: 0.3125rem 0.5rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--fs-caption);
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s ease;
  height: 1.875rem;
}
.plaza-lang-select:focus {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.plaza-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 2rem 2rem;
}
.plaza-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
}
.plaza-spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid var(--border);
  border-top-color: var(--text-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.plaza-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 0;
  gap: 0.75rem;
}
.plaza-empty-icon {
  width: 5rem;
  height: 5rem;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}
.plaza-empty-title {
  font-size: var(--fs-section);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}
.plaza-empty-desc {
  font-size: var(--fs-body);
  color: #9CA3AF;
  margin: 0;
  line-height: 1.6;
}
.plaza-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}
@media (min-width: 1920px) {
  .plaza-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (min-width: 2560px) {
  .plaza-grid { grid-template-columns: repeat(4, 1fr); }
}
</style>
