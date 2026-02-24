<template>
  <div class="flex h-screen w-screen overflow-hidden" style="background:#F8FAFC; color:#1E293B;">
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

const chatsStore    = useChatsStore()
const skillsStore   = useSkillsStore()
const configStore   = useConfigStore()
const obsidianStore = useObsidianStore()
const personasStore = usePersonasStore()
const mcpStore      = useMcpStore()

onMounted(async () => {
  // Load config first so skillsPath is available
  await configStore.loadConfig()
  await Promise.all([
    chatsStore.loadChats(),
    personasStore.loadPersonas(),
    mcpStore.loadServers(),
    skillsStore.loadSkills(configStore.config.skillsPath).then(() =>
      skillsStore.loadSkillPrompts(configStore.config.skillsPath)
    ),
    obsidianStore.loadConfig()
  ])
})
</script>
