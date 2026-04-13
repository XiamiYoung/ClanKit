import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { storage } from '../services/storage'
import { v4 as uuidv4 } from 'uuid'

export const PROVIDER_PRESETS = {
  anthropic: {
    name: 'Anthropic',
    type: 'anthropic',
    auth: 'x-api-key',
    defaultBaseURL: 'https://api.anthropic.com',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  openai_official: {
    name: 'OpenAI',
    type: 'openai_official',
    auth: 'bearer',
    defaultBaseURL: 'https://api.openai.com/v1',
    defaultModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    hardLimits: {},
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  openai: {
    name: 'OpenAI Compatible',
    type: 'openai',
    auth: 'x-api-key',
    defaultBaseURL: '',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: null,
    freeInfo: null,
  },
  openrouter: {
    name: 'OpenRouter',
    type: 'openrouter',
    auth: 'bearer',
    defaultBaseURL: 'https://openrouter.ai/api',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: 'https://openrouter.ai/keys',
    freeInfo: { badge: 'free', labelKey: 'onboarding.freeInfo.openrouterFree' },
  },
  deepseek: {
    name: 'DeepSeek',
    type: 'deepseek',
    auth: 'bearer',
    defaultBaseURL: 'https://api.deepseek.com',
    defaultModels: ['deepseek-chat', 'deepseek-coder'],
    hardLimits: { maxOutputTokens: 65536 },
    apiKeyUrl: 'https://platform.deepseek.com/api-keys',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.deepseekPaid' },
  },
  google: {
    name: 'Google',
    type: 'google',
    auth: 'bearer',
    defaultBaseURL: 'https://generativelanguage.googleapis.com',
    defaultModels: [],
    hardLimits: { maxOutputTokens: 8192 },
    apiKeyUrl: 'https://aistudio.google.com/api-keys',
    freeInfo: { badge: 'free', labelKey: 'onboarding.freeInfo.googleFree' },
  },
  minimax: {
    name: 'MiniMax',
    type: 'minimax',
    auth: 'bearer',
    defaultBaseURL: 'https://api.minimax.chat',
    defaultModels: [],
    hardLimits: { maxOutputTokens: 6144 },
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  qwen: {
    name: 'Qwen',
    type: 'qwen',
    auth: 'bearer',
    defaultBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModels: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    hardLimits: { maxOutputTokens: 8192 },
    apiKeyUrl: 'https://bailian.console.aliyun.com/',
    freeInfo: { badge: 'trial', labelKey: 'onboarding.freeInfo.qwenTrial' },
  },
  glm: {
    name: 'GLM',
    type: 'glm',
    auth: 'bearer',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModels: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
    hardLimits: { maxOutputTokens: 4096 },
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    freeInfo: { badge: 'free', labelKey: 'onboarding.freeInfo.glmFree' },
  },
  mistral: {
    name: 'Mistral',
    type: 'mistral',
    auth: 'bearer',
    defaultBaseURL: 'https://api.mistral.ai/v1',
    defaultModels: ['mistral-large-latest', 'mistral-small-latest', 'open-mixtral-8x7b'],
    hardLimits: {},
    apiKeyUrl: 'https://console.mistral.ai/api-keys',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  groq: {
    name: 'Groq',
    type: 'groq',
    auth: 'bearer',
    defaultBaseURL: 'https://api.groq.com/openai/v1',
    defaultModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    hardLimits: {},
    apiKeyUrl: 'https://console.groq.com/keys',
    freeInfo: { badge: 'free', labelKey: 'onboarding.freeInfo.groqFree' },
  },
  xai: {
    name: 'xAI',
    type: 'xai',
    auth: 'bearer',
    defaultBaseURL: 'https://api.x.ai/v1',
    defaultModels: ['grok-3', 'grok-3-mini', 'grok-2'],
    hardLimits: {},
    apiKeyUrl: 'https://console.x.ai/',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  ollama: {
    name: 'Ollama',
    type: 'ollama',
    auth: 'none',
    defaultBaseURL: 'http://localhost:11434/v1',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: 'https://ollama.com/download',
    freeInfo: { badge: 'free', labelKey: 'onboarding.freeInfo.ollamaFree' },
  },
  moonshot: {
    name: 'Moonshot',
    type: 'moonshot',
    auth: 'bearer',
    defaultBaseURL: 'https://api.moonshot.cn/v1',
    defaultModels: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    hardLimits: { maxOutputTokens: 8192 },
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  doubao: {
    name: 'Doubao',
    type: 'doubao',
    auth: 'bearer',
    defaultBaseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    freeInfo: { badge: 'paid', labelKey: 'onboarding.freeInfo.paid' },
  },
  custom: {
    name: 'Custom',
    type: 'custom',
    auth: 'bearer',
    defaultBaseURL: '',
    defaultModels: [],
    hardLimits: {},
    apiKeyUrl: null,
    freeInfo: null,
  },
}

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    utilityModel: {
      provider: '',
      model: '',
    },
    providers: [],
    skillsPath: '',
    DoCPath: '',
    artifactPath: '',
    newsFeeds: [],
    feedSelection: [],
    skillHubSources: [
      {
        id: 'clawhub',
        name: 'ClawHub',
        url: 'https://clawhub.ai/skills?sort=downloads&nonSuspicious=true',
        apiUrl: 'https://api.clawhub.ai/v1/skills',
        type: 'clawhub',
        enabled: true,
        description: 'Community skill library with curated skills'
      },
      {
        id: 'tencent',
        name: 'Tencent SkillHub',
        url: 'https://skillhub.tencent.com/',
        apiUrl: 'https://skillhub.tencent.com/api/v1/skills',
        type: 'tencent',
        enabled: true,
        description: 'Tencent official skill repository'
      }
    ],
    sandboxConfig: {
      defaultMode: 'sandbox',
      sandboxAllowList: [],
      dangerBlockList: [
        { id: 'danger-1', pattern: 'rm -rf *', description: 'Recursive force delete' },
        { id: 'danger-2', pattern: 'sudo *', description: 'Superuser commands' },
        { id: 'danger-3', pattern: 'curl * | *sh', description: 'Remote script execution' },
        { id: 'danger-4', pattern: 'curl * | bash', description: 'Remote bash execution' },
        { id: 'danger-5', pattern: 'wget * | bash', description: 'Remote bash execution' },
        { id: 'danger-6', pattern: ':(){ :|:& };:', description: 'Fork bomb' },
        { id: 'danger-7', pattern: 'dd if=/dev/zero *', description: 'Disk wipe' },
        { id: 'danger-8', pattern: 'mkfs.*', description: 'Format filesystem' },
      ],
    },
    topStoriesCriteria: {
      highKeywords: 'artificial intelligence, ai, ai-powered, llm, gpt, claude, gemini, machine learning, deep learning, neural net, chatbot, generative ai, large language model, openai, anthropic, deepmind, foundation model, computer vision, natural language',
      medKeywords: 'robot, automation, algorithm, model, agent, chip, gpu, inference, training, transformer, diffusion, autonomous, self-driving, copilot, coding, benchmark, reasoning',
      breakingKeywords: 'breaking, exclusive, announces, launches, reveals, introduces, unveils, raises, acquires, partnership',
      timeWindowHours: 24,
    },
    smtp: {
      host: '',
      port: 587,
      user: '',
      pass: '',
      userEmail: '',
    },
    voiceCall: {
      ttsVoice: 'zh-CN-XiaoxiaoNeural',
      whisperApiKey: '',
      whisperBaseURL: '',
      whisperDirectAuth: false,
      ttsMode: 'browser',
      isActive: false,
    },
    im: {
      telegram: { enabled: false, botToken: '', allowedUsers: [] },
      whatsapp: { enabled: false, allowedUsers: [] },
      feishu: { enabled: false, appId: '', appSecret: '', allowedUsers: [] },
      teams: { enabled: false, tenantId: '', clientId: '', selfOnly: true, allowedUsers: [], pollInterval: 5 },
    },
    language: 'en',
    demoMode: false,
    setupDismissed: false,
    setupWizardStep: 0,
    onboardingCompleted: false,
  })

  function createProvider(presetType, name = null) {
    const preset = PROVIDER_PRESETS[presetType] || PROVIDER_PRESETS.custom
    const settings = {
      maxOutputTokens: preset.hardLimits?.maxOutputTokens || 32768,
    }
    if (presetType === 'anthropic') {
      settings.opusModel = ''
      settings.haikuModel = ''
    }
    if (presetType === 'custom') {
      settings.protocol = 'openai'
    }
    return {
      id: uuidv4(),
      name: name || preset.name,
      alias: '',
      type: preset.type,
      apiKey: '',
      baseURL: preset.defaultBaseURL || '',
      model: preset.defaultModels[0] || '',
      settings,
      modelSettings: {},
      isActive: false,
      testedAt: null,
    }
  }

  function addProvider(presetType, name = null) {
    const provider = createProvider(presetType, name)
    config.value.providers.push(provider)
    return provider
  }

  function sanitizeProviderSettings(provider) {
    const sanitizedSettings = { ...(provider?.settings || {}) }
    delete sanitizedSettings.temperature
    delete sanitizedSettings.topP
    if (sanitizedSettings.maxOutputTokens == null) {
      sanitizedSettings.maxOutputTokens = 32768
    }
    return {
      ...provider,
      settings: sanitizedSettings,
      modelSettings: provider.modelSettings || {},
    }
  }

  function removeProvider(providerId) {
    const index = config.value.providers.findIndex(p => p.id === providerId)
    if (index !== -1) {
      config.value.providers.splice(index, 1)
    }
  }

  function updateProvider(providerId, updates) {
    const provider = config.value.providers.find(p => p.id === providerId)
    if (provider) {
      Object.assign(provider, updates)
    }
  }

  function getProvider(providerId) {
    return config.value.providers.find(p => p.id === providerId)
  }

  const isConfigured = computed(() => {
    return config.value.providers.some(p => p.apiKey && p.baseURL && p.isActive)
  })

  const activeProviders = computed(() => {
    return config.value.providers
      .filter(p => p.isActive)
      .map(p => p.id)
  })

  let _loaded = false

  async function loadConfig() {
    const defaults = config.value
    const saved = await storage.getConfig()

    config.value = {
      ...defaults,
      ...saved,
      providers: (saved.providers || []).map(sanitizeProviderSettings),
    }

    const savedSandbox = saved?.sandboxConfig || {}
    config.value.sandboxConfig = {
      ...defaults.sandboxConfig,
      ...savedSandbox,
      sandboxAllowList: savedSandbox.sandboxAllowList || [],
      dangerBlockList: (savedSandbox.dangerBlockList && savedSandbox.dangerBlockList.length > 0)
        ? savedSandbox.dangerBlockList
        : defaults.sandboxConfig.dangerBlockList,
    }

    if (saved?.voiceCall) {
      config.value.voiceCall = { ...defaults.voiceCall, ...saved.voiceCall }
      // Migrate: local.ttsVoice → ttsVoice
      if (!saved.voiceCall.ttsVoice && saved.voiceCall.local?.ttsVoice) {
        config.value.voiceCall.ttsVoice = saved.voiceCall.local.ttsVoice
      }
    }
    if (saved?.smtp) {
      config.value.smtp = { ...defaults.smtp, ...saved.smtp }
    }
    if (saved?.utilityModel) {
      config.value.utilityModel = { ...defaults.utilityModel, ...saved.utilityModel }
    }
    if (saved?.im) {
      config.value.im = {
        telegram: { ...defaults.im.telegram, ...(saved.im?.telegram || {}) },
        whatsapp: { ...defaults.im.whatsapp, ...(saved.im?.whatsapp || {}) },
        feishu: { ...defaults.im.feishu, ...(saved.im?.feishu || {}) },
        teams: { ...defaults.im.teams, ...(saved.im?.teams || {}) },
      }
    }

    await loadEnvPaths()
    _loaded = true
  }


  async function loadEnvPaths() {
    if (!window.electronAPI?.getEnvPaths) return
    const paths = await window.electronAPI.getEnvPaths()
    config.value = { ...config.value, ...paths }
    // Also load the canonical data directory so UI can reference it (e.g. artifact path fallback)
    if (window.electronAPI?.getDataPath) {
      const { dataPath } = await window.electronAPI.getDataPath()
      if (dataPath) config.value.dataPath = dataPath
    }
  }

  async function saveEnvPath(key, value) {
    if (!window.electronAPI?.saveEnvPath) return
    await window.electronAPI.saveEnvPath(key, value)
    config.value = { ...config.value, [key]: value }
  }

  async function saveConfig(newConfig) {
    if (!_loaded) {
      console.warn('[CONFIG] saveConfig blocked — config not yet loaded, skipping to prevent data loss')
      return
    }
    const prev = config.value
    config.value = {
      ...prev,
      ...newConfig,
      providers: newConfig.providers || prev.providers,
      utilityModel: { ...prev.utilityModel, ...newConfig.utilityModel },
      voiceCall: { ...prev.voiceCall, ...newConfig.voiceCall },
      smtp: { ...prev.smtp, ...newConfig.smtp },
      sandboxConfig: { ...prev.sandboxConfig, ...newConfig.sandboxConfig },
      im: {
        telegram: { ...prev.im?.telegram, ...(newConfig.im?.telegram || {}) },
        whatsapp: { ...prev.im?.whatsapp, ...(newConfig.im?.whatsapp || {}) },
        feishu: { ...prev.im?.feishu, ...(newConfig.im?.feishu || {}) },
        teams: { ...prev.im?.teams, ...(newConfig.im?.teams || {}) },
      },
    }
    await storage.saveConfig(JSON.parse(JSON.stringify(toRaw(config.value))))
  }

  const isVoiceCallActive = computed(() => config.value.voiceCall?.isActive === true)
  const language = computed(() => config.value.language || 'en')

  /** Get user-facing display name for a provider (alias → name → type) */
  function getProviderDisplayName(providerOrId) {
    let p = providerOrId
    if (typeof p === 'string') {
      p = config.value.providers?.find(x => x.id === p || x.type === p)
    }
    if (!p) return providerOrId || ''
    return p.alias || p.name || p.type || ''
  }

  return {
    config,
    activeProviders,
    isConfigured,
    isVoiceCallActive,
    language,
    PROVIDER_PRESETS,
    getProviderDisplayName,
    createProvider,
    addProvider,
    removeProvider,
    updateProvider,
    getProvider,
    loadConfig, 
    loadEnvPaths, 
    saveEnvPath, 
    saveConfig 
  }
})
