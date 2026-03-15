import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'
import { useConfigStore } from './config'

export const usePlazaStore = defineStore('plaza', () => {
  const topics = ref([])
  const isLoading = ref(false)

  async function loadTopics() {
    isLoading.value = true
    try {
      topics.value = await storage.getPlazaTopics() || []
    } finally {
      isLoading.value = false
    }
  }

  async function saveTopic(topic) {
    const idx = topics.value.findIndex(t => t.id === topic.id)
    if (idx >= 0) topics.value[idx] = topic
    else topics.value.push(topic)
    await storage.savePlazaTopics(JSON.parse(JSON.stringify(topics.value)))
  }

  async function deleteTopic(id) {
    topics.value = topics.value.filter(t => t.id !== id)
    await storage.savePlazaTopics(JSON.parse(JSON.stringify(topics.value)))
  }

  async function createSession({ topicId, agentIds, agentToolPermissions, maxRounds, language }) {
    const session = {
      id: uuidv4(),
      topicId,
      agentIds,
      agentToolPermissions,
      maxRounds,
      language: language || 'en',
      currentRound: 0,
      status: 'setup',
      messages: [],
      agentMemories: Object.fromEntries(agentIds.map(id => [id, []])),
      conclusion: null,
      startedAt: Date.now(),
    }
    await window.electronAPI.plaza.saveSession(session)
    return session
  }

  async function saveSession(session) {
    await window.electronAPI.plaza.saveSession(JSON.parse(JSON.stringify(session)))
  }

  async function runRound(topicId, sessionId) {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    return window.electronAPI.plaza.runRound({ topicId, sessionId, config })
  }

  async function extractMemories(session, agents) {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    return window.electronAPI.plaza.extractMemories({
      session: JSON.parse(JSON.stringify(session)),
      agents,
      config,
    })
  }

  async function generateConclusion(session, topicTitle, agents) {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    return window.electronAPI.plaza.generateConclusion({
      session: JSON.parse(JSON.stringify(session)),
      topicTitle,
      agents,
      config,
    })
  }

  async function commitMemories({ topicTitle, agentMemories, agentTypes }) {
    return window.electronAPI.plaza.commitMemories({ topicTitle, agentMemories, agentTypes })
  }

  async function surpriseMe(language = 'en') {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    return window.electronAPI.plaza.surpriseMe({ config, language })
  }

  async function generateTopics(language = 'en') {
    const config = JSON.parse(JSON.stringify(useConfigStore().config))
    const res = await window.electronAPI.plaza.generateTopics({ config, language })
    if (res.success) {
      // Replace all existing topics with the new batch
      topics.value = res.topics.map(t => ({
        id: uuidv4(),
        ...t,
        isBuiltin: true,
        createdAt: Date.now(),
        lastSessionId: null,
        lastSessionStatus: 'idle',
      }))
      await storage.savePlazaTopics(JSON.parse(JSON.stringify(topics.value)))
    }
    return res
  }

  return {
    topics,
    isLoading,
    loadTopics,
    saveTopic,
    deleteTopic,
    createSession,
    saveSession,
    runRound,
    extractMemories,
    generateConclusion,
    commitMemories,
    surpriseMe,
    generateTopics,
  }
})
