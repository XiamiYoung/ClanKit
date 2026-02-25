<template>
  <div class="config-page">

    <!-- Header -->
    <div class="config-header">
      <div class="config-header-top">
        <div>
          <h1 class="config-title">Configuration</h1>
          <p class="config-subtitle">LLM backend endpoint and model settings</p>
        </div>
      </div>
    </div>

    <!-- Top-level tab bar -->
    <div class="config-tab-bar">
      <div class="config-tab-group">
        <button
          v-for="tab in topTabs"
          :key="tab.value"
          @click="activeTopTab = tab.value"
          class="config-tab-btn"
          :class="{ active: activeTopTab === tab.value }"
        >
          <component :is="tab.icon" class="config-tab-icon" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="config-content">
      <div class="config-content-inner">

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- General tab -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general'">
          <div class="config-card">
            <div class="form-group">
              <label for="dataPath" class="form-label">
                Data Path
                <span class="form-label-hint">SPARKAI_DATA_PATH</span>
              </label>
              <input id="dataPath" v-model="form.dataPath" type="text" :placeholder="defaultDataPath" class="field font-mono" />
              <p class="hint">
                Directory where SparkAI stores all data (config, chats, personas, MCP servers, tools, souls).
                Default: <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultDataPath }}</code>
              </p>
            </div>
          </div>
          <div class="save-row">
            <AppButton size="save" @click="saveGeneral" :disabled="savingGeneral" :loading="savingGeneral">
              <svg v-if="!savingGeneral" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingGeneral ? 'Saving…' : 'Save Changes' }}
            </AppButton>
            <span v-if="savedGeneralMsg" class="save-indicator" :class="savedGeneralMsg.ok ? 'success' : 'error'">
              <svg v-if="savedGeneralMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedGeneralMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- AI Models tab -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'models'">

          <!-- Provider tab selector -->
          <div class="provider-tab-group">
            <button
              v-for="tab in providerOptions"
              :key="tab.value"
              @click="activeProviderTab = tab.value"
              class="config-tab-btn"
              :class="{ active: activeProviderTab === tab.value }"
            >
              <component :is="tab.icon" class="config-tab-icon" />
              {{ tab.label }}
            </button>
          </div>

          <!-- ── Anthropic Tab ─────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'anthropic'" class="config-card">

            <!-- API Key -->
            <div class="form-group">
              <label for="apiKey" class="form-label">
                API Key
                <span class="form-label-hint">ANTHROPIC_API_KEY</span>
              </label>
              <div class="input-with-action">
                <input
                  id="apiKey"
                  v-model="form.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  placeholder="sk-ant-…"
                  class="field font-mono"
                />
                <button @click="showKey = !showKey" class="field-action-btn" :aria-label="showKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">Stored locally in ~/.sparkai/config.json — never sent elsewhere</p>
            </div>

            <!-- Base URL -->
            <div class="form-group">
              <label for="baseURL" class="form-label">
                Base URL
                <span class="form-label-hint">ANTHROPIC_BASE_URL</span>
              </label>
              <input id="baseURL" v-model="form.baseURL" type="url" placeholder="https://api.anthropic.com" class="field" />
              <p class="hint">Change for custom backends: LiteLLM, Ollama, corporate proxy, etc.</p>
            </div>

            <!-- Models section -->
            <div class="form-divider"></div>
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              </div>
              <h3 class="form-section-title">Models</h3>
            </div>

            <div class="models-grid">
              <div class="form-group compact">
                <label for="sonnetModel" class="form-label">Sonnet Model</label>
                <input id="sonnetModel" v-model="form.sonnetModel" type="text" placeholder="anthropic/claude-sonnet-latest" class="field font-mono" />
              </div>
              <div class="form-group compact">
                <label for="opusModel" class="form-label">Opus Model</label>
                <input id="opusModel" v-model="form.opusModel" type="text" placeholder="anthropic/claude-opus-latest" class="field font-mono" />
              </div>
              <div class="form-group compact">
                <label for="haikuModel" class="form-label">Haiku Model</label>
                <input id="haikuModel" v-model="form.haikuModel" type="text" placeholder="anthropic/claude-3-5-haiku-20241022" class="field font-mono" />
              </div>
            </div>

            <!-- Default Model combo box -->
            <div class="form-divider"></div>
            <div class="form-group">
              <label class="form-label">Default Model</label>
              <ComboBox
                :model-value="form.activeModel"
                :options="anthropicComboOptions"
                :chip-label-override="anthropicDefaultPlaceholder"
                placeholder="Search models..."
                @update:model-value="onAnthropicDefaultChange"
              />
            </div>

            <!-- Test Connection -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test Connection</p>
                <p class="hint" style="margin-top:2px;">Verify Anthropic endpoint and key</p>
              </div>
              <div class="flex items-center gap-2">
                <AppButton v-if="testingAnthropic" variant="danger-ghost" @click="stopTest('anthropic')">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  Stop
                </AppButton>
                <AppButton @click="testConnection('anthropic')" :disabled="testingAnthropic" :loading="testingAnthropic">
                  <svg v-if="!testingAnthropic" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                  </svg>
                  {{ testingAnthropic ? 'Testing…' : 'Test' }}
                </AppButton>
              </div>
            </div>
            <div v-if="testResultAnthropic" class="test-result" :class="testResultAnthropic.ok ? 'success' : 'error'">
              <svg v-if="testResultAnthropic.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultAnthropic.message }}</span>
            </div>
          </div>

          <!-- ── OpenRouter Tab ────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'openrouter'" class="config-card">

            <div class="form-group">
              <label for="openrouterApiKey" class="form-label">
                API Key <span class="form-label-hint">OPENROUTER_API_KEY</span>
              </label>
              <div class="input-with-action">
                <input id="openrouterApiKey" v-model="form.openrouterApiKey" :type="showOpenRouterKey ? 'text' : 'password'" placeholder="sk-or-…" class="field font-mono" />
                <button @click="showOpenRouterKey = !showOpenRouterKey" class="field-action-btn" :aria-label="showOpenRouterKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showOpenRouterKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <p class="hint">Your OpenRouter API key — stored locally</p>
            </div>

            <div class="form-group">
              <label for="openrouterBaseURL" class="form-label">Base URL</label>
              <input id="openrouterBaseURL" v-model="form.openrouterBaseURL" type="url" placeholder="https://openrouter.ai/api" class="field" />
              <p class="hint">OpenRouter base URL (without /v1 — the SDK adds it). Change only for custom proxies.</p>
            </div>

            <!-- Available Models -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Available Models</p>
                <p class="hint" style="margin-top:2px;">{{ modelsStore.openrouterModels.length > 0 ? `${modelsStore.openrouterModels.length} models loaded` : 'Enter API key and fetch models' }}</p>
              </div>
              <AppButton size="compact" @click="fetchOrModels" :disabled="orModelsFetching || !form.openrouterApiKey" :loading="orModelsFetching">
                <svg v-if="!orModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                {{ orModelsFetching ? 'Fetching…' : 'Fetch Models' }}
              </AppButton>
            </div>
            <div v-if="modelsStore.openrouterModels.length > 0" class="model-list-area">
              <input v-model="orModelFilter" type="text" placeholder="Filter models…" class="field font-mono field-sm" />
              <select v-model="orSelectedTestModel" class="field font-mono field-sm" :size="Math.min(filteredOrModels.length, 8)" style="height:auto; padding:6px 8px;">
                <option v-for="m in filteredOrModels" :key="m.id" :value="m.id">{{ m.id }} — {{ m.name }}</option>
              </select>
              <p v-if="orSelectedTestModel" class="hint selected-hint">Selected: <span class="font-mono">{{ orSelectedTestModel }}</span></p>
            </div>
            <div v-if="orModelsFetchError" class="test-result error">
              <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ orModelsFetchError }}</span>
            </div>

            <!-- Test Connection -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test Connection</p>
                <p class="hint" style="margin-top:2px;">{{ orSelectedTestModel ? `Test with ${orSelectedTestModel}` : 'Select a model above first' }}</p>
              </div>
              <div class="flex items-center gap-2">
                <AppButton v-if="testingOpenRouter" variant="danger-ghost" @click="stopTest('openrouter')">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop
                </AppButton>
                <AppButton @click="testConnection('openrouter')" :disabled="testingOpenRouter || !orSelectedTestModel" :loading="testingOpenRouter">
                  <svg v-if="!testingOpenRouter" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingOpenRouter ? 'Testing…' : 'Test' }}
                </AppButton>
              </div>
            </div>
            <div v-if="testResultOpenRouter" class="test-result" :class="testResultOpenRouter.ok ? 'success' : 'error'">
              <svg v-if="testResultOpenRouter.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultOpenRouter.message }}</span>
            </div>

            <!-- Default Model combo box -->
            <div class="form-divider"></div>
            <div class="form-group">
              <label class="form-label">Default Model</label>
              <ComboBox
                :model-value="form.openrouterModel"
                :options="openrouterComboOptions"
                placeholder="Search models..."
                @update:model-value="onOrDefaultChange"
              />
            </div>
          </div>

          <!-- ── OpenAI Tab ──────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'openai'" class="config-card">

            <div class="form-group">
              <label for="openaiApiKey" class="form-label">
                API Key <span class="form-label-hint">x-api-key</span>
              </label>
              <div class="input-with-action">
                <input id="openaiApiKey" v-model="form.openaiApiKey" :type="showOpenAIKey ? 'text' : 'password'" placeholder="your-openai-api-key" class="field font-mono" />
                <button @click="showOpenAIKey = !showOpenAIKey" class="field-action-btn" :aria-label="showOpenAIKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showOpenAIKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <p class="hint">OpenAI x-api-key — stored locally</p>
            </div>

            <div class="form-group">
              <label for="openaiBaseURL" class="form-label">Base URL</label>
              <input id="openaiBaseURL" v-model="form.openaiBaseURL" type="url" placeholder="https://mlaas.virtuosgames.com" class="field" />
              <p class="hint">OpenAI base URL (without /proxy/openai/v1 — added automatically)</p>
            </div>

            <!-- Available Models -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Available Models</p>
                <p class="hint" style="margin-top:2px;">{{ modelsStore.openaiModels.length > 0 ? `${modelsStore.openaiModels.length} models loaded` : 'Enter API key and fetch models' }}</p>
              </div>
              <AppButton size="compact" @click="fetchOpenAIModelsLocal" :disabled="openaiModelsFetching || !form.openaiApiKey" :loading="openaiModelsFetching">
                <svg v-if="!openaiModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                {{ openaiModelsFetching ? 'Fetching…' : 'Fetch Models' }}
              </AppButton>
            </div>
            <div v-if="modelsStore.openaiModels.length > 0" class="model-list-area">
              <input v-model="openaiModelFilter" type="text" placeholder="Filter models…" class="field font-mono field-sm" />
              <select v-model="openaiSelectedTestModel" class="field font-mono field-sm" :size="Math.min(filteredOpenAIModels.length, 8)" style="height:auto; padding:6px 8px;">
                <option v-for="m in filteredOpenAIModels" :key="m.id" :value="m.id">{{ m.id }} — {{ m.name }}</option>
              </select>
              <p v-if="openaiSelectedTestModel" class="hint selected-hint">Selected: <span class="font-mono">{{ openaiSelectedTestModel }}</span></p>
            </div>
            <div v-if="openaiModelsFetchError" class="test-result error">
              <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ openaiModelsFetchError }}</span>
            </div>

            <!-- Test Connection -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test Connection</p>
                <p class="hint" style="margin-top:2px;">{{ openaiSelectedTestModel ? `Test with ${openaiSelectedTestModel}` : 'Select a model above first' }}</p>
              </div>
              <div class="flex items-center gap-2">
                <AppButton v-if="testingOpenAI" variant="danger-ghost" @click="stopTest('openai')">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Stop
                </AppButton>
                <AppButton @click="testConnection('openai')" :disabled="testingOpenAI || !openaiSelectedTestModel" :loading="testingOpenAI">
                  <svg v-if="!testingOpenAI" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingOpenAI ? 'Testing…' : 'Test' }}
                </AppButton>
              </div>
            </div>
            <div v-if="testResultOpenAI" class="test-result" :class="testResultOpenAI.ok ? 'success' : 'error'">
              <svg v-if="testResultOpenAI.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultOpenAI.message }}</span>
            </div>

            <!-- Default Model combo box -->
            <div class="form-divider"></div>
            <div class="form-group">
              <label class="form-label">Default Model</label>
              <ComboBox
                :model-value="form.openaiModel"
                :options="openaiComboOptions"
                placeholder="Search models..."
                @update:model-value="onOpenaiDefaultChange"
              />
            </div>
          </div>

          <!-- Save (AI Models) -->
          <div class="save-row">
            <AppButton size="save" @click="saveModels" :disabled="savingModels" :loading="savingModels">
              <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingModels ? 'Saving…' : 'Save Changes' }}
            </AppButton>
            <span v-if="savedModelsMsg" class="save-indicator" :class="savedModelsMsg.ok ? 'success' : 'error'">
              <svg v-if="savedModelsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedModelsMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- AI Skills tab -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'skills'">
          <div class="config-card">
            <div class="form-group">
              <label for="skillsPath" class="form-label">Skills Path</label>
              <input id="skillsPath" v-model="form.skillsPath" type="text" placeholder="~/.claude/skills" class="field font-mono" />
              <p class="hint">Directory containing skill folders. Leave empty for default: ~/.claude/skills</p>
            </div>
          </div>
          <div class="save-row">
            <AppButton size="save" @click="saveSkills" :disabled="savingSkills" :loading="savingSkills">
              <svg v-if="!savingSkills" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingSkills ? 'Saving…' : 'Save Changes' }}
            </AppButton>
            <span v-if="savedSkillsMsg" class="save-indicator" :class="savedSkillsMsg.ok ? 'success' : 'error'">
              <svg v-if="savedSkillsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedSkillsMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- AI Knowledge tab (Pinecone) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'knowledge'">
          <div class="config-card">

            <div class="form-group">
              <label for="pineconeApiKey" class="form-label">Pinecone API Key</label>
              <div class="input-with-action">
                <input id="pineconeApiKey" v-model="form.pineconeApiKey" :type="showPineconeKey ? 'text' : 'password'" placeholder="pcsk_..." class="field font-mono" />
                <button @click="showPineconeKey = !showPineconeKey" class="field-action-btn" :aria-label="showPineconeKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showPineconeKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <p class="hint">Your Pinecone API key — stored locally in ~/.sparkai/config.json</p>
            </div>

            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test Connection</p>
                <p class="hint" style="margin-top:2px;">Verify Pinecone API key access. Select an index on the Knowledge page.</p>
              </div>
              <AppButton @click="testPineconeConnection" :disabled="testingPinecone || !form.pineconeApiKey" :loading="testingPinecone">
                <svg v-if="!testingPinecone" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {{ testingPinecone ? 'Testing...' : 'Test' }}
              </AppButton>
            </div>
            <div v-if="testResultPinecone" class="test-result" :class="testResultPinecone.ok ? 'success' : 'error'">
              <svg v-if="testResultPinecone.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultPinecone.message }}</span>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveKnowledge" :disabled="savingKnowledge" :loading="savingKnowledge">
              <svg v-if="!savingKnowledge" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingKnowledge ? 'Saving...' : 'Save Changes' }}
            </AppButton>
            <span v-if="savedKnowledgeMsg" class="save-indicator" :class="savedKnowledgeMsg.ok ? 'success' : 'error'">
              <svg v-if="savedKnowledgeMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedKnowledgeMsg.text }}
            </span>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, defineComponent, h } from 'vue'
import { useConfigStore } from '../stores/config'
import { useModelsStore } from '../stores/models'
import AppButton from '../components/common/AppButton.vue'
import ComboBox from '../components/common/ComboBox.vue'

const configStore = useConfigStore()
const modelsStore = useModelsStore()

const isElectron = !!(typeof window !== 'undefined' && window.electronAPI)
const showKey  = ref(false)
const showOpenRouterKey = ref(false)
const activeTopTab = ref('models')
const activeProviderTab = ref('anthropic')

// Per-tab save state
const savingModels = ref(false)
const savedModelsMsg = ref('')
const savingSkills = ref(false)
const savedSkillsMsg = ref('')

// Per-provider test state
const testingAnthropic = ref(false)
const testingOpenRouter = ref(false)
const testResultAnthropic = ref(null)
const testResultOpenRouter = ref(null)

// OpenRouter local state (fetch button + test model selection)
const orModelsFetching = ref(false)
const orModelsFetchError = ref('')
const orModelFilter = ref('')
const orSelectedTestModel = ref('')


// OpenAI state
const showOpenAIKey = ref(false)
const testingOpenAI = ref(false)
const testResultOpenAI = ref(null)
const openaiModelsFetching = ref(false)
const openaiModelsFetchError = ref('')
const openaiModelFilter = ref('')
const openaiSelectedTestModel = ref('')


// Pinecone state
const showPineconeKey = ref(false)
const testingPinecone = ref(false)
const testResultPinecone = ref(null)
const savingKnowledge = ref(false)
const savedKnowledgeMsg = ref('')

// General tab state
const defaultDataPath = ref('')
const savingGeneral = ref(false)
const savedGeneralMsg = ref('')

// ── Tab icon components ─────────────────────────────────────────────────────
const IconGeneral = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
  ])
})
const IconModels = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' })
  ])
})
const IconSkills = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ])
})
const IconKnowledge = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }),
    h('path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' })
  ])
})

// Top-level tabs
const topTabs = [
  { value: 'general', label: 'General', icon: IconGeneral },
  { value: 'models', label: 'AI Models', icon: IconModels },
  { value: 'skills', label: 'AI Skills', icon: IconSkills },
  { value: 'knowledge', label: 'AI Knowledge', icon: IconKnowledge },
]

// Provider icon components
const IconAnthropic = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }),
    h('path', { d: 'M2 17l10 5 10-5' }),
    h('path', { d: 'M2 12l10 5 10-5' })
  ])
})
const IconOpenRouter = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ])
})
const IconOpenAI = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 8V4H8' }),
    h('rect', { x: '4', y: '4', width: '16', height: '16', rx: '2' }),
    h('path', { d: 'M8 12h8' }),
    h('path', { d: 'M12 8v8' })
  ])
})

const providerOptions = [
  { value: 'anthropic',   label: 'Anthropic',   icon: IconAnthropic   },
  { value: 'openrouter',  label: 'OpenRouter',  icon: IconOpenRouter  },
  { value: 'openai',      label: 'OpenAI',       icon: IconOpenAI      }
]

const filteredOrModels = computed(() => {
  const models = modelsStore.openrouterModels
  if (!orModelFilter.value) return models
  const q = orModelFilter.value.toLowerCase()
  return models.filter(m => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
})

const filteredOpenAIModels = computed(() => {
  const models = modelsStore.openaiModels
  if (!openaiModelFilter.value) return models
  const q = openaiModelFilter.value.toLowerCase()
  return models.filter(m => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
})

// ── ComboBox options for default model selectors ────────────────────────────
const anthropicComboOptions = computed(() => {
  const list = []
  if (form.sonnetModel) list.push({ id: 'sonnet', name: 'Sonnet', detail: form.sonnetModel })
  if (form.opusModel) list.push({ id: 'opus', name: 'Opus', detail: form.opusModel })
  if (form.haikuModel) list.push({ id: 'haiku', name: 'Haiku', detail: form.haikuModel })
  return list
})

const anthropicDefaultPlaceholder = computed(() => {
  const m = anthropicComboOptions.value.find(m => m.id === form.activeModel)
  return m ? `${m.name} (${m.detail})` : 'Select a model...'
})

function onAnthropicDefaultChange(val) {
  form.activeModel = val
}

const openrouterComboOptions = computed(() =>
  modelsStore.openrouterModels.map(m => ({ id: m.id, name: m.name || m.id, detail: m.id }))
)

function onOrDefaultChange(val) {
  form.openrouterModel = val
  form.openrouterDefaultModel = val
}

const openaiComboOptions = computed(() =>
  modelsStore.openaiModels.map(m => ({ id: m.id, name: m.name || m.id, detail: m.id }))
)

function onOpenaiDefaultChange(val) {
  form.openaiModel = val
  form.openaiDefaultModel = val
}

function modelIdPreview(which) {
  if (which === 'opus')  return form.opusModel  || '—'
  if (which === 'haiku') return form.haikuModel || '—'
  return form.sonnetModel || '—'
}

const form = reactive({
  apiKey:      '',
  baseURL:     '',
  sonnetModel: '',
  opusModel:   '',
  haikuModel:  '',
  activeModel: 'sonnet',
  skillsPath:  '',
  openrouterApiKey:  '',
  openrouterBaseURL: 'https://openrouter.ai/api',
  openrouterModel:   '',
  openrouterDefaultModel: '',
  openaiApiKey:      '',
  openaiBaseURL:     'https://mlaas.virtuosgames.com',
  openaiModel:       '',
  openaiDefaultModel: '',
  pineconeApiKey:      '',
  ragEnabled:          true,
  dataPath:            '',
})

onMounted(async () => {
  const c = JSON.parse(JSON.stringify(configStore.config))
  delete c.defaultProvider
  Object.assign(form, c)
  if (!form.openrouterDefaultModel && form.openrouterModel) {
    form.openrouterDefaultModel = form.openrouterModel
  }
  if (!form.openaiDefaultModel && form.openaiModel) {
    form.openaiDefaultModel = form.openaiModel
  }
  // Load Pinecone config from .env via knowledge IPC
  if (window.electronAPI?.knowledge?.getConfig) {
    const kc = await window.electronAPI.knowledge.getConfig()
    form.pineconeApiKey = kc.pineconeApiKey || ''
    form.ragEnabled = kc.ragEnabled !== false
  }
  // Load default data path from main process
  if (window.electronAPI?.getDataPath) {
    const info = await window.electronAPI.getDataPath()
    defaultDataPath.value = info.defaultDataPath || ''
    if (!form.dataPath) {
      form.dataPath = info.dataPath || info.defaultDataPath || ''
    }
  }
})

async function fetchOrModels() {
  if (!window.electronAPI?.fetchOpenRouterModels) { orModelsFetchError.value = 'Not running inside Electron.'; return }
  if (!form.openrouterApiKey) { orModelsFetchError.value = 'Enter an API key first.'; return }
  orModelsFetching.value = true
  orModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenRouterModels({ apiKey: form.openrouterApiKey, baseURL: form.openrouterBaseURL })
    if (result.success) { modelsStore.openrouterModels = result.models; modelsStore.openrouterCached = true; orSelectedTestModel.value = '' }
    else { orModelsFetchError.value = result.error || 'Unknown error' }
  } catch (err) { orModelsFetchError.value = err.message }
  finally { orModelsFetching.value = false }
}

async function fetchOpenAIModelsLocal() {
  if (!window.electronAPI?.fetchOpenAIModels) { openaiModelsFetchError.value = 'Not running inside Electron.'; return }
  if (!form.openaiApiKey) { openaiModelsFetchError.value = 'Enter an API key first.'; return }
  openaiModelsFetching.value = true
  openaiModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenAIModels({ apiKey: form.openaiApiKey, baseURL: form.openaiBaseURL })
    if (result.success) { modelsStore.openaiModels = result.models; modelsStore.openaiCached = true; openaiSelectedTestModel.value = '' }
    else { openaiModelsFetchError.value = result.error || 'Unknown error' }
  } catch (err) { openaiModelsFetchError.value = err.message }
  finally { openaiModelsFetching.value = false }
}

async function saveGeneral() {
  savingGeneral.value = true
  try {
    await configStore.saveConfig({ dataPath: String(form.dataPath) })
    savedGeneralMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedGeneralMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingGeneral.value = false
    setTimeout(() => { savedGeneralMsg.value = '' }, 3000)
  }
}

async function saveModels() {
  savingModels.value = true
  try {
    const modelFields = JSON.parse(JSON.stringify(form))
    delete modelFields.skillsPath
    await configStore.saveConfig(modelFields)
    savedModelsMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedModelsMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingModels.value = false
    setTimeout(() => { savedModelsMsg.value = '' }, 3000)
  }
}

async function saveSkills() {
  savingSkills.value = true
  try {
    await configStore.saveConfig({ skillsPath: String(form.skillsPath) })
    savedSkillsMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedSkillsMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingSkills.value = false
    setTimeout(() => { savedSkillsMsg.value = '' }, 3000)
  }
}

async function saveKnowledge() {
  savingKnowledge.value = true
  try {
    if (window.electronAPI?.knowledge?.saveConfig) {
      await window.electronAPI.knowledge.saveConfig({ pineconeApiKey: form.pineconeApiKey, ragEnabled: form.ragEnabled })
    }
    savedKnowledgeMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedKnowledgeMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingKnowledge.value = false
    setTimeout(() => { savedKnowledgeMsg.value = '' }, 3000)
  }
}

async function testPineconeConnection() {
  if (!window.electronAPI?.knowledge?.verifyConnection) { testResultPinecone.value = { ok: false, message: 'Not running inside Electron.' }; return }
  testingPinecone.value = true
  testResultPinecone.value = null
  try {
    const result = await window.electronAPI.knowledge.verifyConnection({ apiKey: form.pineconeApiKey })
    testResultPinecone.value = result.success
      ? { ok: true, message: result.message || 'Connected' }
      : { ok: false, message: result.error || 'Connection failed' }
  } catch (err) { testResultPinecone.value = { ok: false, message: err.message } }
  finally { testingPinecone.value = false }
}

const TEST_TIMEOUT_MS = 20000
let testAbortAnthropic = false
let testAbortOpenRouter = false
let testAbortOpenAI = false

function stopTest(provider) {
  const chatIdMap = { anthropic: 'test', openrouter: 'test-openrouter', openai: 'test-openai' }
  if (provider === 'anthropic') testAbortAnthropic = true
  else if (provider === 'openai') testAbortOpenAI = true
  else testAbortOpenRouter = true
  if (window.electronAPI?.stopAgent) window.electronAPI.stopAgent(chatIdMap[provider] || 'test')
}

async function testConnection(provider) {
  if (!window.electronAPI?.runAgent) {
    const result = { ok: false, message: 'Not running inside Electron. Open the app with npm run dev from WSL — do not use the browser tab at localhost:5173.' }
    if (provider === 'anthropic') testResultAnthropic.value = result
    else if (provider === 'openai') testResultOpenAI.value = result
    else testResultOpenRouter.value = result
    return
  }

  if (provider === 'anthropic') {
    testingAnthropic.value = true; testResultAnthropic.value = null; testAbortAnthropic = false
    const timer = setTimeout(() => stopTest('anthropic'), TEST_TIMEOUT_MS)
    try {
      const res = await window.electronAPI.runAgent({ chatId: 'test', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], config: { ...form }, enabledAgents: [], enabledSkills: [] })
      clearTimeout(timer)
      testResultAnthropic.value = testAbortAnthropic
        ? { ok: false, message: 'Test stopped.' }
        : res.success ? { ok: true, message: `Connected · ${modelIdPreview(form.activeModel)} · "${res.result?.substring(0, 60)}"` } : { ok: false, message: res.error }
    } catch (err) { clearTimeout(timer); testResultAnthropic.value = testAbortAnthropic ? { ok: false, message: 'Test stopped.' } : { ok: false, message: err.message } }
    finally { testingAnthropic.value = false }
  } else if (provider === 'openai') {
    testingOpenAI.value = true; testResultOpenAI.value = null; testAbortOpenAI = false
    const testModel = openaiSelectedTestModel.value
    if (!testModel) { testResultOpenAI.value = { ok: false, message: 'Select a model from the list above first.' }; testingOpenAI.value = false; return }
    const timer = setTimeout(() => stopTest('openai'), TEST_TIMEOUT_MS)
    try {
      const res = await window.electronAPI.runAgent({ chatId: 'test-openai', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], config: { ...form, openaiApiKey: form.openaiApiKey, openaiBaseURL: form.openaiBaseURL, customModel: testModel, _resolvedProvider: 'openai' }, enabledAgents: [], enabledSkills: [] })
      clearTimeout(timer)
      testResultOpenAI.value = testAbortOpenAI
        ? { ok: false, message: 'Test stopped.' }
        : res.success ? { ok: true, message: `Connected · ${testModel} · "${res.result?.substring(0, 60)}"` } : { ok: false, message: res.error }
    } catch (err) { clearTimeout(timer); testResultOpenAI.value = testAbortOpenAI ? { ok: false, message: 'Test stopped.' } : { ok: false, message: err.message } }
    finally { testingOpenAI.value = false }
  } else {
    testingOpenRouter.value = true; testResultOpenRouter.value = null; testAbortOpenRouter = false
    const testModel = orSelectedTestModel.value
    if (!testModel) { testResultOpenRouter.value = { ok: false, message: 'Select a model from the list above first.' }; testingOpenRouter.value = false; return }
    const timer = setTimeout(() => stopTest('openrouter'), TEST_TIMEOUT_MS)
    try {
      const res = await window.electronAPI.runAgent({ chatId: 'test-openrouter', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], config: { ...form, apiKey: form.openrouterApiKey, baseURL: form.openrouterBaseURL, customModel: testModel }, enabledAgents: [], enabledSkills: [] })
      clearTimeout(timer)
      testResultOpenRouter.value = testAbortOpenRouter
        ? { ok: false, message: 'Test stopped.' }
        : res.success ? { ok: true, message: `Connected · ${testModel} · "${res.result?.substring(0, 60)}"` } : { ok: false, message: res.error }
    } catch (err) { clearTimeout(timer); testResultOpenRouter.value = testAbortOpenRouter ? { ok: false, message: 'Test stopped.' } : { ok: false, message: err.message } }
    finally { testingOpenRouter.value = false }
  }
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   CONFIG PAGE — Matches Sidebar / ChatsView / PersonasView design language
   ══════════════════════════════════════════════════════════════════════════ */

.config-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }

/* ── Header ─────────────────────────────────────────────────────────────── */
.config-header { padding: 24px 32px 20px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.config-header-top { display: flex; align-items: flex-start; justify-content: space-between; }
.config-title { font-family: 'Inter', sans-serif; font-size: var(--fs-page-title); font-weight: 700; color: var(--text-primary); margin: 0; }
.config-subtitle { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-primary); margin: 4px 0 0 0; }

/* ── Top-level tab bar ──────────────────────────────────────────────────── */
.config-tab-bar { padding: 12px 32px 0; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.config-tab-group { display: flex; gap: 2px; padding-bottom: 12px; }
.config-tab-btn {
  display: flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 500;
  color: var(--text-primary); background: transparent; border: none; cursor: pointer; transition: all 0.15s ease;
}
.config-tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.config-tab-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.config-tab-icon { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Content area ───────────────────────────────────────────────────────── */
.config-content { flex: 1; overflow-y: auto; padding: 24px 32px 32px; scrollbar-width: thin; }
.config-content-inner { max-width: 640px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }

/* ── Provider tabs (same style as top-level tabs) ──────────────────────── */
.provider-tab-group { display: flex; gap: 2px; margin-bottom: 4px; }

/* ── Config card ────────────────────────────────────────────────────────── */
.config-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

/* ── Form elements ──────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-group:last-child { margin-bottom: 0; }
.form-group.compact { margin-bottom: 10px; }
.form-label { display: block; margin-bottom: 6px; font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 500; color: var(--text-primary); }
.form-label-hint { color: var(--text-primary); font-weight: 400; margin-left: 4px; }
.form-divider { height: 1px; background: var(--border); margin: 16px 0; }
.form-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.section-icon-sm { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; background: var(--text-primary); color: #fff; flex-shrink: 0; }
.form-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 600; color: var(--text-primary); margin: 0; }
.hint { margin-top: 4px; color: var(--text-primary); font-family: 'Inter', sans-serif; font-size: var(--fs-caption); }
.selected-hint { color: var(--text-primary); }

/* ── Input fields ───────────────────────────────────────────────────────── */
.field {
  width: 100%; display: block; padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06); }
.field-sm { font-size: var(--fs-secondary); }
.input-with-action { position: relative; }
.input-with-action .field { padding-right: 38px; }
.field-action-btn {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  padding: 4px; border-radius: 4px; transition: color 0.15s;
}
.field-action-btn:hover { color: var(--accent); }
.field-action-btn.danger:hover { color: #FF3B30; }

/* ── Icon sizes ─────────────────────────────────────────────────────────── */
.icon-sm { width: 18px; height: 18px; flex-shrink: 0; }
.icon-xs { width: 14px; height: 14px; flex-shrink: 0; }

/* ── Models grid ────────────────────────────────────────────────────────── */
.models-grid { display: flex; flex-direction: column; gap: 0; }

/* ── Model list area ────────────────────────────────────────────────────── */
.model-list-area { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }

/* ── Test connection row ────────────────────────────────────────────────── */
.test-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.test-result {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 10px 14px;
  border-radius: var(--radius-sm); font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
}
.test-result.success { background: rgba(0,122,255,0.06); border: 1px solid rgba(0,122,255,0.3); color: var(--text-primary); }
.test-result.success .icon-sm { color: var(--accent); }
.test-result.error { background: rgba(255,59,48,0.05); border: 1px solid rgba(255,59,48,0.3); color: #FF3B30; }
.test-result.error .icon-sm { color: #FF3B30; }

/* ── Save row ───────────────────────────────────────────────────────────── */
.save-row { display: flex; align-items: center; gap: 12px; }
.save-indicator {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  padding: 6px 14px; border-radius: 8px; animation: fadeIn 0.2s ease;
}
.save-indicator.success { background: rgba(52,199,89,0.1); color: #34C759; }
.save-indicator.error { background: rgba(255,59,48,0.08); color: #FF3B30; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
