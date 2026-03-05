import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { storage } from '../services/storage'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    anthropic: {
      apiKey:      '',
      baseURL:     '',
      sonnetModel: 'anthropic/claude-sonnet-latest',
      opusModel:   'anthropic/claude-opus-latest',
      haikuModel:  'anthropic/claude-haiku-latest',
      utilityModel: '',
      isActive:    false,
      testedAt:    null,
    },
    openrouter: {
      apiKey:  '',
      baseURL: '',
      utilityModel: '',
      isActive:    false,
      testedAt:    null,
    },
    openai: {
      apiKey:       '',
      baseURL:      '',
      utilityModel: '',
      isActive:    false,
      testedAt:    null,
    },
    deepseek: {
      apiKey:     '',
      baseURL:    '',
      utilityModel: '',
      isActive:    false,
      testedAt:    null,
      maxTokens:  8192,
    },
    skillsPath:  '',
    DoCPath:     '',
    artyfactPath: '',
    pineconeApiKey:    '',
    defaultToolIds:    null,       // null = all tools enabled by default; array = specific IDs
    defaultMcpServerIds: null,     // null = all MCP servers enabled by default; array = specific IDs
    newsFeeds:         [],         // populated from config.json at startup
    feedSelection:     [],         // array of 6 feed IDs for the news cards
    sandboxConfig: {
      defaultMode: 'sandbox',
      sandboxAllowList: [],
      dangerBlockList: [
        { id: 'danger-1', pattern: 'rm -rf *',        description: 'Recursive force delete' },
        { id: 'danger-2', pattern: 'sudo *',           description: 'Superuser commands' },
        { id: 'danger-3', pattern: 'curl * | *sh',     description: 'Remote script execution' },
        { id: 'danger-4', pattern: 'curl * | bash',    description: 'Remote bash execution' },
        { id: 'danger-5', pattern: 'wget * | bash',    description: 'Remote bash execution' },
        { id: 'danger-6', pattern: ':(){ :|:& };:',    description: 'Fork bomb' },
        { id: 'danger-7', pattern: 'dd if=/dev/zero *',description: 'Disk wipe' },
        { id: 'danger-8', pattern: 'mkfs.*',           description: 'Format filesystem' },
      ],
    },
    topStoriesCriteria: {
      highKeywords: 'artificial intelligence, ai, ai-powered, llm, gpt, claude, gemini, machine learning, deep learning, neural net, chatbot, generative ai, large language model, openai, anthropic, deepmind, foundation model, computer vision, natural language',
      medKeywords: 'robot, automation, algorithm, model, agent, chip, gpu, inference, training, transformer, diffusion, autonomous, self-driving, copilot, coding, benchmark, reasoning',
      breakingKeywords: 'breaking, exclusive, announces, launches, reveals, introduces, unveils, raises, acquires, partnership',
      timeWindowHours: 24,
    },
    maxOutputTokens: 32768,  // global default; per-chat can override; hard limit 98304 (96k)
    smtp: {
      host:      '',
      port:      587,
      user:      '',
      pass:      '',
      userEmail: '',
    },
    voiceCall: {
      whisperApiKey: '',     // OpenAI API key for Whisper STT
      whisperBaseURL: '',    // Base URL (defaults to https://api.openai.com)
      ttsMode: 'browser',   // 'browser' = free SpeechSynthesis, 'openai' = TTS $15/1M chars, 'openai-hd' = TTS HD $30/1M chars
      isActive: false,       // set to true after successful test connection
    },
  })

  // True when at least one provider has both an API key and a baseURL configured.
  const isConfigured = computed(() => {
    const c = config.value
    return !!(
      (c.anthropic?.apiKey && c.anthropic?.baseURL) ||
      (c.openrouter?.apiKey && c.openrouter?.baseURL) ||
      (c.openai?.apiKey && c.openai?.baseURL) ||
      (c.deepseek?.apiKey && c.deepseek?.baseURL)
    )
  })

  const activeProviders = computed(() => {
    const c = config.value
    return ['anthropic', 'openrouter', 'openai', 'deepseek'].filter(
      p => c[p]?.isActive === true
    )
  })

  async function loadConfig() {
    const defaults = config.value
    const saved = await storage.getConfig()
    // Deep-merge nested provider objects
    const savedSandbox = saved.sandboxConfig || {}
    config.value = {
      ...defaults,
      ...saved,
      anthropic:  { ...defaults.anthropic,  ...saved.anthropic },
      openrouter: { ...defaults.openrouter, ...saved.openrouter },
      openai:     { ...defaults.openai,     ...saved.openai },
      deepseek:   { ...defaults.deepseek,   ...saved.deepseek },
      voiceCall:  { ...defaults.voiceCall,  ...saved.voiceCall },
      smtp:       { ...defaults.smtp,       ...saved.smtp },
      sandboxConfig: {
        ...defaults.sandboxConfig,
        ...savedSandbox,
        sandboxAllowList: savedSandbox.sandboxAllowList || [],
        dangerBlockList: (savedSandbox.dangerBlockList && savedSandbox.dangerBlockList.length > 0)
          ? savedSandbox.dangerBlockList
          : defaults.sandboxConfig.dangerBlockList,
      },
    }
    // Also load the env-backed paths
    await loadEnvPaths()
  }

  async function loadEnvPaths() {
    if (!window.electronAPI?.getEnvPaths) return
    const paths = await window.electronAPI.getEnvPaths()
    config.value = { ...config.value, ...paths }
  }

  async function saveEnvPath(key, value) {
    if (!window.electronAPI?.saveEnvPath) return
    await window.electronAPI.saveEnvPath(key, value)
    config.value = { ...config.value, [key]: value }
  }

  async function saveConfig(newConfig) {
    const prev = config.value
    config.value = {
      ...prev,
      ...newConfig,
      anthropic:  { ...prev.anthropic,  ...newConfig.anthropic },
      openrouter: { ...prev.openrouter, ...newConfig.openrouter },
      openai:     { ...prev.openai,     ...newConfig.openai },
      deepseek:   { ...prev.deepseek,   ...newConfig.deepseek },
      voiceCall:  { ...prev.voiceCall,  ...newConfig.voiceCall },
      smtp:       { ...prev.smtp,       ...newConfig.smtp },
    }
    await storage.saveConfig(JSON.parse(JSON.stringify(toRaw(config.value))))
  }

  const isVoiceCallActive = computed(() => config.value.voiceCall?.isActive === true)

  return { config, activeProviders, isConfigured, isVoiceCallActive, loadConfig, loadEnvPaths, saveEnvPath, saveConfig }
})
