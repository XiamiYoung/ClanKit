<template>
  <div class="flex h-screen w-screen overflow-hidden" style="background:#F2F2F7; color:#1A1A1A;">
    <Sidebar />
    <main class="flex-1 min-w-0 overflow-hidden">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import Sidebar  from './components/layout/Sidebar.vue'
import { useChatsStore }  from './stores/chats'
import { useSkillsStore } from './stores/skills'
import { useConfigStore }   from './stores/config'
import { useObsidianStore } from './stores/obsidian'
import { usePersonasStore } from './stores/personas'
import { useMcpStore } from './stores/mcp'
import { useModelsStore } from './stores/models'
import { useToolsStore } from './stores/tools'
import { useKnowledgeStore } from './stores/knowledge'

const chatsStore    = useChatsStore()
const skillsStore   = useSkillsStore()
const configStore   = useConfigStore()
const obsidianStore = useObsidianStore()
const personasStore = usePersonasStore()
const mcpStore      = useMcpStore()
const modelsStore   = useModelsStore()
const toolsStore    = useToolsStore()
const knowledgeStore = useKnowledgeStore()

onMounted(async () => {
  // Load config first so skillsPath is available
  await configStore.loadConfig()

  // Auto-fetch models for providers that have API keys configured
  if (configStore.config.openrouterApiKey) modelsStore.fetchOpenRouterModels()
  if (configStore.config.openaiApiKey) modelsStore.fetchOpenAIModels()

  // Fire all store loads concurrently — none blocks the UI
  Promise.all([
    chatsStore.loadChats().then(() => {
      // Initialize the persistent agent chunk listener after chats are available
      chatsStore.initChunkListener()
    }),
    personasStore.loadPersonas(),
    mcpStore.loadServers(),
    toolsStore.loadTools(),
    skillsStore.loadSkills(configStore.config.skillsPath).then(() =>
      skillsStore.loadSkillPrompts(configStore.config.skillsPath)
    ),
    obsidianStore.loadConfig(),
    knowledgeStore.loadConfig()
  ])
})
</script>
