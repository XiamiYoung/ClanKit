<template>
  <Teleport to="body">
    <div v-if="visible" class="wizard-backdrop">
      <div class="wizard-container">
        <!-- Header -->
        <div class="wizard-header">
          <h1 class="wizard-title">{{ currentLanguage === 'zh' ? '欢迎使用 ClankAI' : 'Welcome to ClankAI' }}</h1>
          <p class="wizard-subtitle">{{ currentLanguage === 'zh' ? '让我们来完成初始配置' : "Let's get you set up in just a few steps" }}</p>
        </div>

        <!-- Progress Steps -->
        <div class="wizard-progress">
          <div v-for="step in 5" :key="step" class="wizard-step" :class="{ active: currentStep >= step, current: currentStep === step }">
            <div class="wizard-step-circle">{{ step }}</div>
            <div class="wizard-step-label">{{ stepLabels[currentLanguage][step - 1] }}</div>
          </div>
        </div>

        <!-- Step Content -->
        <div class="wizard-content">
          <!-- Step 1: Language -->
          <div v-if="currentStep === 1" class="wizard-step-content">
            <h2 class="wizard-section-title">Select Language / 选择语言</h2>

            <div class="wizard-form-group">
              <select v-model="selectedLanguage" class="wizard-select" @change="onLanguageChange">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
          </div>

          <!-- Step 2: Data Paths -->
          <div v-if="currentStep === 2" class="wizard-step-content">
            <h2 class="wizard-section-title">{{ currentLanguage === 'zh' ? '数据存储 / Data Storage' : 'Data Storage' }}</h2>

            <div class="wizard-form-group">
              <label class="wizard-label">{{ currentLanguage === 'zh' ? '数据路径' : 'Data Path' }}</label>
              <div class="wizard-path-display">{{ defaultDataPath }}</div>
            </div>

            <div class="wizard-form-group">
              <label class="wizard-label">{{ currentLanguage === 'zh' ? 'Artifact 路径' : 'Artifact Path' }}</label>
              <input v-model="form.artifactPath" type="text" class="wizard-input font-mono" placeholder="Enter artifact path..." />
              <p class="wizard-hint">{{ currentLanguage === 'zh' ? '生成的文件将保存在此处。' : 'Where generated files will be saved.' }}</p>
            </div>
          </div>

          <!-- Step 3: AI Provider -->
          <div v-if="currentStep === 3" class="wizard-step-content">
            <h2 class="wizard-section-title">{{ currentLanguage === 'zh' ? 'AI 提供商 / AI Provider' : 'AI Provider' }}</h2>

            <div class="wizard-form-group">
              <label class="wizard-label">{{ currentLanguage === 'zh' ? 'Provider' : 'Provider' }}</label>
              <select v-model="providerType" class="wizard-select" @change="onProviderChange">
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="openai">OpenAI Compatible</option>
                <option value="deepseek">DeepSeek</option>
                <option value="google">Google</option>
                <option value="minimax">MiniMax</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div v-if="providerType === 'custom'" class="wizard-form-group">
              <label class="wizard-label">{{ currentLanguage === 'zh' ? 'Provider 名称' : 'Provider Name' }}</label>
              <input v-model="customProviderName" type="text" class="wizard-input" placeholder="My Custom Provider" />
            </div>

            <div class="wizard-form-group">
              <label class="wizard-label">Base URL</label>
              <input v-model="provider.baseURL" type="url" class="wizard-input" :placeholder="providerPreset?.defaultBaseURL || 'https://...'" />
            </div>

            <div class="wizard-form-group">
              <label class="wizard-label">API Key</label>
              <input v-model="provider.apiKey" type="password" class="wizard-input" :placeholder="currentLanguage === 'zh' ? '输入您的 API key...' : 'Enter your API key...'" />
            </div>

            <div class="wizard-form-group">
              <label class="wizard-label">Model</label>
              <input v-model="provider.model" type="text" class="wizard-input font-mono" placeholder="e.g. claude-sonnet-4-20250514" />
            </div>

            <div class="wizard-test-row">
              <AppButton variant="primary" size="compact" @click="testProvider" :disabled="!canTest" :loading="testingProvider">
                {{ testingProvider ? (currentLanguage === 'zh' ? '测试中...' : 'Testing...') : (currentLanguage === 'zh' ? '测试连接' : 'Test Connection') }}
              </AppButton>
              <span v-if="testResult" class="wizard-test-result" :class="testResult.ok ? 'success' : 'error'">
                {{ testResult.message }}
              </span>
            </div>
          </div>

          <!-- Step 4: Utility Model -->
          <div v-if="currentStep === 4" class="wizard-step-content">
            <h2 class="wizard-section-title">{{ currentLanguage === 'zh' ? '工具模型 / Utility Model' : 'Utility Model' }}</h2>

            <div class="wizard-form-group">
              <label class="wizard-label">{{ currentLanguage === 'zh' ? 'Provider' : 'Provider' }}</label>
              <select v-model="utilityProviderId" class="wizard-select">
                <option value="">{{ currentLanguage === 'zh' ? '选择 Provider...' : 'Select a provider...' }}</option>
                <option v-for="p in configuredProviders" :key="p.id" :value="p.id">{{ p.name || p.type }}</option>
              </select>
            </div>

            <div class="wizard-form-group">
              <label class="wizard-label">Model</label>
              <input v-model="utilityModel" type="text" class="wizard-input font-mono" placeholder="e.g. claude-haiku-latest" />
              <p class="wizard-hint">{{ currentLanguage === 'zh' ? '输入您配置的 Provider 的 model ID' : 'Enter the model ID from your configured provider' }}</p>
            </div>
          </div>

          <!-- Step 5: Confirm -->
          <div v-if="currentStep === 5" class="wizard-step-content">
            <h2 class="wizard-section-title">{{ currentLanguage === 'zh' ? '准备完成！/ Ready to start!' : 'Ready to start!' }}</h2>

            <div class="wizard-summary">
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">{{ currentLanguage === 'zh' ? '语言：' : 'Language:' }}</span>
                <span class="wizard-summary-value">{{ selectedLanguage === 'zh' ? '中文' : 'English' }}</span>
              </div>
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">{{ currentLanguage === 'zh' ? '数据路径：' : 'Data Path:' }}</span>
                <span class="wizard-summary-value">{{ defaultDataPath }}</span>
              </div>
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">{{ currentLanguage === 'zh' ? 'Artifact 路径：' : 'Artifact Path:' }}</span>
                <span class="wizard-summary-value">{{ form.artifactPath || defaultDataPath + '/artifact' }}</span>
              </div>
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">{{ currentLanguage === 'zh' ? 'AI Provider：' : 'AI Provider:' }}</span>
                <span class="wizard-summary-value">{{ provider.name || providerPreset?.name || providerType }}</span>
              </div>
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">Model:</span>
                <span class="wizard-summary-value font-mono">{{ provider.model }}</span>
              </div>
              <div class="wizard-summary-item">
                <span class="wizard-summary-label">{{ currentLanguage === 'zh' ? 'Utility Model：' : 'Utility Model:' }}</span>
                <span class="wizard-summary-value font-mono">{{ utilityModel }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="wizard-footer">
          <button v-if="currentStep > 1" class="wizard-btn secondary" @click="prevStep">{{ currentLanguage === 'zh' ? '上一步' : 'Back' }}</button>
          <div class="wizard-footer-right">
            <button class="wizard-btn text" @click="skipSetup">{{ currentLanguage === 'zh' ? '稍后配置' : 'Configure Later' }}</button>
            <button class="wizard-btn primary" @click="nextStep" :disabled="!canProceed">
              {{ currentStep === 5 ? (currentLanguage === 'zh' ? '开始使用' : 'Get Started') : (currentLanguage === 'zh' ? '下一步' : 'Next') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useConfigStore } from '../../stores/config'
import AppButton from '../common/AppButton.vue'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'complete'])

const configStore = useConfigStore()

const currentStep = ref(1)
const stepLabels = {
  en: ['Language', 'Data Path', 'AI Provider', 'Utility Model', 'Ready'],
  zh: ['语言', '数据路径', 'AI 提供商', '工具模型', '完成']
}

const selectedLanguage = ref('en')
const currentLanguage = computed(() => selectedLanguage.value)

const defaultDataPath = ref('')
const form = ref({
  dataPath: '',
  artifactPath: ''
})

const providerType = ref('anthropic')
const customProviderName = ref('')
const provider = ref({
  name: '',
  baseURL: '',
  apiKey: '',
  model: ''
})

const testingProvider = ref(false)
const testResult = ref(null)

const utilityProviderId = ref('')
const utilityModel = ref('')

const providerPreset = computed(() => {
  const presets = {
    anthropic: { name: 'Anthropic', defaultBaseURL: 'https://api.anthropic.com', defaultModels: ['claude-sonnet-latest', 'claude-opus-latest', 'claude-haiku-latest'] },
    openrouter: { name: 'OpenRouter', defaultBaseURL: 'https://openrouter.ai/api', defaultModels: [] },
    openai: { name: 'OpenAI Compatible', defaultBaseURL: '', defaultModels: [] },
    deepseek: { name: 'DeepSeek', defaultBaseURL: 'https://api.deepseek.com', defaultModels: ['deepseek-chat', 'deepseek-coder'] },
    google: { name: 'Google', defaultBaseURL: 'https://generativelanguage.googleapis.com', defaultModels: [] },
    minimax: { name: 'MiniMax', defaultBaseURL: 'https://api.minimax.chat', defaultModels: [] },
    custom: { name: '', defaultBaseURL: '', defaultModels: [] }
  }
  return presets[providerType.value]
})

const configuredProviders = computed(() => {
  const providers = [...configStore.config.providers]
  const currentType = providerType.value
  const currentName = currentType === 'custom' ? (customProviderName.value || 'Custom') : providerPreset.value.name
  const currentBaseURL = provider.value.baseURL
  const currentApiKey = provider.value.apiKey
  
  if (currentBaseURL && currentApiKey) {
    const exists = providers.some(p => p.type === currentType && p.baseURL === currentBaseURL)
    if (!exists) {
      providers.push({
        id: 'wizard-temp-provider',
        type: currentType,
        name: currentName,
        baseURL: currentBaseURL,
        apiKey: currentApiKey,
        isActive: true
      })
    }
  }
  return providers.filter(p => p.isActive && p.apiKey && p.baseURL)
})

const canTest = computed(() => {
  return provider.value.apiKey && provider.value.baseURL && provider.value.model
})

const canProceed = computed(() => {
  if (currentStep.value === 1) {
    return selectedLanguage.value
  }
  if (currentStep.value === 2) {
    return true
  }
  if (currentStep.value === 3) {
    return provider.value.apiKey && provider.value.baseURL && provider.value.model
  }
  if (currentStep.value === 4) {
    return utilityProviderId.value && utilityModel.value
  }
  return true
})

function onLanguageChange() {
}

watch(providerType, () => {
  provider.value = {
    name: providerType.value === 'custom' ? '' : providerPreset.value.name,
    baseURL: providerPreset.value.defaultBaseURL || '',
    apiKey: '',
    model: ''
  }
  testResult.value = null
})

function onProviderChange() {
  if (providerType.value === 'custom') {
    provider.value.name = customProviderName.value || 'Custom'
  } else {
    provider.value.name = providerPreset.value.name
    provider.value.baseURL = providerPreset.value.defaultBaseURL
    if (providerPreset.value.defaultModels?.length > 0) {
      provider.value.model = providerPreset.value.defaultModels[0]
    }
  }
}

async function testProvider() {
  testingProvider.value = true
  testResult.value = null
  try {
    const res = await window.electronAPI.testProvider({
      provider: providerType.value,
      baseURL: provider.value.baseURL,
      apiKey: provider.value.apiKey,
      model: provider.value.model
    })
    testResult.value = { ok: res.success, message: res.success ? (selectedLanguage.value === 'zh' ? '连接成功！' : 'Connection successful!') : (res.error || (selectedLanguage.value === 'zh' ? '连接失败' : 'Connection failed')) }
  } catch (err) {
    testResult.value = { ok: false, message: err.message }
  } finally {
    testingProvider.value = false
  }
}

function prevStep() {
  if (currentStep.value > 1) currentStep.value--
}

function nextStep() {
  if (currentStep.value < 5) {
    currentStep.value++
  } else {
    completeSetup()
  }
}

async function completeSetup() {
  try {
    await configStore.saveConfig({ language: selectedLanguage.value })

    if (form.value.artifactPath) {
      await configStore.saveEnvPath('artifactPath', form.value.artifactPath)
    }

    const providerName = providerType.value === 'custom' ? (customProviderName.value || 'Custom') : providerPreset.value.name
    const newProvider = configStore.addProvider(providerType.value, providerName)
    configStore.updateProvider(newProvider.id, {
      baseURL: provider.value.baseURL,
      apiKey: provider.value.apiKey,
      model: provider.value.model,
      isActive: true
    })

    const providerId = newProvider.id

    const modelFields = {
      providers: JSON.parse(JSON.stringify(configStore.config.providers)),
      utilityModel: {
        provider: providerId,
        model: utilityModel.value
      }
    }
    await configStore.saveConfig(modelFields)

    emit('complete')
  } catch (err) {
    console.error('Failed to save setup:', err)
  }
}

function skipSetup() {
  emit('close')
}

onMounted(async () => {
  if (window.electronAPI?.getDataPath) {
    const info = await window.electronAPI.getDataPath()
    defaultDataPath.value = info.defaultDataPath || ''
    form.value.dataPath = info.dataPath || ''
  }
  
  const separator = navigator.platform.indexOf('Win') > -1 ? '\\' : '/'
  const defaultArtifactPath = defaultDataPath.value 
    ? defaultDataPath.value.replace(/[/\\]+$/, '') + separator + 'artifact' 
    : ''
  
  if (window.electronAPI?.getEnvPaths) {
    const envPaths = await window.electronAPI.getEnvPaths()
    form.value.artifactPath = envPaths.artifactPath || defaultArtifactPath
  } else {
    form.value.artifactPath = defaultArtifactPath
  }

  selectedLanguage.value = configStore.config.language || 'en'
  
  onProviderChange()
})
</script>

<style scoped>
.wizard-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.wizard-container {
  background: #ffffff;
  border-radius: 12px;
  width: 90%;
  max-width: 50vw;
  max-height: 50vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.wizard-header {
  text-align: center;
  padding: 2rem 1.5rem 1rem;
  background: #1a1a1a;
  color: white;
}

.wizard-title {
  font-size: 1.75rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.wizard-subtitle {
  font-size: 1rem;
  color: #9ca3af;
  margin: 0;
}

.wizard-progress {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e5e5e5;
}

.wizard-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.wizard-step-circle {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: #e5e5e5;
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 1rem;
  transition: all 0.2s;
}

.wizard-step.active .wizard-step-circle {
  background: #1a1a1a;
  color: white;
}

.wizard-step.current .wizard-step-circle {
  background: #000;
  color: white;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
}

.wizard-step-label {
  font-size: 0.8rem;
  color: #999;
  font-weight: 500;
}

.wizard-step.active .wizard-step-label {
  color: #333;
}

.wizard-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.wizard-step-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.wizard-section-title {
  font-size: 1.35rem;
  font-weight: 600;
  color: #1a1a1a;
  margin: 0 0 1rem;
}

.wizard-section-desc {
  font-size: 0.95rem;
  color: #666;
  margin: 0 0 1.25rem;
}

.wizard-form-group {
  margin-bottom: 1.25rem;
}

.wizard-label {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
}

.wizard-input, .wizard-select {
  width: 100%;
  padding: 0.75rem 0.875rem;
  border: 1px solid #d1d1d1;
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: #fff;
  color: #1a1a1a;
}

.wizard-input:focus, .wizard-select:focus {
  outline: none;
  border-color: #1a1a1a;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.05);
}

.wizard-path-display {
  padding: 0.875rem;
  background: #f5f5f5;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  font-size: 0.95rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  color: #333;
}

.wizard-input-row {
  display: flex;
  gap: 0.5rem;
}

.wizard-input-row .wizard-input {
  flex: 1;
}

.wizard-browse-btn {
  padding: 0.75rem 1rem;
  background: #f5f5f5;
  border: 1px solid #d1d1d1;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s;
  color: #333;
}

.wizard-browse-btn:hover {
  background: #e5e5e5;
}

.wizard-hint {
  font-size: 0.85rem;
  color: #999;
  margin: 0.25rem 0 0;
}

.wizard-test-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.wizard-test-result {
  font-size: 0.95rem;
}

.wizard-test-result.success { color: #16a34a; }
.wizard-test-result.error { color: #dc2626; }

.wizard-summary {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 1rem;
}

.wizard-summary-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #e5e5e5;
}

.wizard-summary-item:last-child {
  border-bottom: none;
}

.wizard-summary-label {
  font-size: 0.95rem;
  color: #666;
  font-weight: 500;
}

.wizard-summary-value {
  font-size: 0.95rem;
  color: #1a1a1a;
  font-weight: 600;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
}

.wizard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e5e5;
  background: #fafafa;
}

.wizard-footer-right {
  display: flex;
  gap: 0.5rem;
}

.wizard-btn {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.wizard-btn.primary {
  background: #1a1a1a;
  color: white;
  border: none;
}

.wizard-btn.primary:hover:not(:disabled) {
  background: #000;
}

.wizard-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.wizard-btn.secondary {
  background: #fff;
  color: #333;
  border: 1px solid #d1d1d1;
}

.wizard-btn.secondary:hover {
  background: #f5f5f5;
}

.wizard-btn.text {
  background: transparent;
  color: #666;
  border: none;
}

.wizard-btn.text:hover {
  color: #333;
}
</style>
