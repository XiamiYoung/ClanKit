<template>
  <template v-if="!focusModeStore.isMinibarMode">
    <div class="flex flex-col h-screen w-screen overflow-hidden" style="background:#F2F2F7; color:#1A1A1A; border-radius:10px;">

      <TitleBar @toggle-sidebar="sidebarRef?.toggleCollapse()" />
      <div class="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar ref="sidebarRef" />
        <main class="flex-1 min-w-0 overflow-hidden flex flex-col">
          <!-- Setup banner: shown when no provider is configured -->
          <div v-if="configLoaded && !configStore.isConfigured && !bannerDismissed" class="setup-banner">
            <svg class="setup-banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="setup-banner-text">No AI provider configured. Set up your API key and endpoint to start chatting.</span>
            <button class="setup-banner-btn" @click="router.push('/config')">Configure now</button>
            <button class="setup-banner-dismiss" @click="bannerDismissed = true" title="Dismiss">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <RouterView v-slot="{ Component }">
            <!-- KeepAlive on ChatsView keeps the mic/VAD/TTS alive when user navigates away during a call -->
            <KeepAlive :include="['ChatsView']">
              <component :is="Component" class="flex-1 min-h-0" />
            </KeepAlive>
          </RouterView>
        </main>

        <!-- Global voice call components -->
        <CallOverlay @end-call="handleEndCall" @toggle-mute="handleToggleMute" />
        <CallPip @end-call="handleEndCall" @toggle-mute="handleToggleMute" />
      </div>
    </div>

    <!-- Focus Mode overlay (teleports to body) -->
    <FocusModeView />
  </template>

  <!-- Minibar overlay (teleports to body, always mounted so store state persists) -->
  <MinibarOverlay />
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useFocusModeStore } from './stores/focusMode'
import { RouterView, useRouter } from 'vue-router'
import Sidebar  from './components/layout/Sidebar.vue'
import TitleBar from './components/layout/TitleBar.vue'
import CallOverlay from './components/voice/CallOverlay.vue'
import CallPip from './components/voice/CallPip.vue'
import FocusModeView from './views/FocusModeView.vue'
import MinibarOverlay from './components/focus/MinibarOverlay.vue'
import { useChatsStore }  from './stores/chats'
import { useSkillsStore } from './stores/skills'
import { useConfigStore }   from './stores/config'
import { useObsidianStore } from './stores/obsidian'
import { usePersonasStore } from './stores/personas'
import { useMcpStore } from './stores/mcp'
import { useModelsStore } from './stores/models'
import { useToolsStore } from './stores/tools'
import { useKnowledgeStore } from './stores/knowledge'
import { useVoiceStore } from './stores/voice'

const sidebarRef    = ref(null)
const router        = useRouter()
const chatsStore    = useChatsStore()
const skillsStore   = useSkillsStore()
const configStore   = useConfigStore()
const obsidianStore = useObsidianStore()
const personasStore = usePersonasStore()
const mcpStore      = useMcpStore()
const modelsStore   = useModelsStore()
const toolsStore    = useToolsStore()
const knowledgeStore = useKnowledgeStore()
const focusModeStore = useFocusModeStore()

const voiceStore = useVoiceStore()

const configLoaded = ref(false)
const bannerDismissed = ref(false)

// Handle quick-send from minibar — runs here so it works even when ChatsView is unmounted
watch(() => chatsStore.pendingMinibarSend, async (pending) => {
  if (!pending) return
  const { text, chatId } = pending
  chatsStore.clearMinibarSend()
  if (text) await chatsStore.sendMinibarMessage(text, chatId)
})

// ── Voice call handlers ──
function handleEndCall() {
  if (window.electronAPI?.voice?.stop) window.electronAPI.voice.stop()
  voiceStore.endCall()
}

function handleToggleMute() {
  const newMuted = !voiceStore.isMuted
  voiceStore.setMuted(newMuted)
  if (window.electronAPI?.voice?.mute) window.electronAPI.voice.mute({ muted: newMuted })
}

onMounted(async () => {
  // Load config first so skillsPath is available
  await configStore.loadConfig()
  configLoaded.value = true

  // Auto-fetch models for providers that have API keys configured
  if (configStore.config.openrouter?.apiKey) modelsStore.fetchOpenRouterModels()
  if (configStore.config.openai?.apiKey) modelsStore.fetchOpenAIModels()
  if (configStore.config.deepseek?.apiKey && configStore.config.deepseek?.baseURL) modelsStore.fetchDeepSeekModels()

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

<style scoped>
.setup-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #FFFBEB;
  border-bottom: 1px solid #FCD34D;
  flex-shrink: 0;
}

.setup-banner-icon {
  width: 16px;
  height: 16px;
  color: #D97706;
  flex-shrink: 0;
}

.setup-banner-text {
  flex: 1;
  font-size: var(--fs-secondary, 0.875rem);
  color: #92400E;
  font-weight: 500;
}

.setup-banner-btn {
  padding: 4px 12px;
  border-radius: var(--radius-sm, 8px);
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.setup-banner-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

.setup-banner-dismiss {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: #92400E;
  cursor: pointer;
  border-radius: 4px;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.setup-banner-dismiss:hover {
  background: rgba(217, 119, 6, 0.12);
}
</style>
