<template>
  <div class="config-page">

    <!-- Header -->
    <div class="config-header">
      <div class="config-header-top">
        <div>
          <h1 class="config-title">Configuration</h1>
          <p class="config-subtitle">Providers, paths, voice, knowledge, security and more</p>
        </div>
      </div>
    </div>

    <!-- Primary tab bar (2 tabs) -->
    <div class="config-primary-tabs">
      <button
        v-for="tab in topTabs" :key="tab.value"
        @click="switchTopTab(tab.value)"
        class="config-primary-tab"
        :class="{ active: activeTopTab === tab.value }"
      >
        <component :is="tab.icon" class="config-tab-icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Two-column body: left sub-nav + right content -->
    <div class="config-body">
      <!-- Left vertical sub-nav -->
      <nav class="config-subnav">
        <button
          v-for="sub in currentSubTabs" :key="sub.value"
          @click="activeSubTab = sub.value"
          class="config-subnav-item"
          :class="{ active: activeSubTab === sub.value }"
        >
          <component :is="sub.icon" class="config-subnav-icon" />
          <span class="config-subnav-label">{{ sub.label }}</span>
          <span v-if="getSubTabStatus(sub.value) === 'empty'" class="config-subnav-dot" />
        </button>
      </nav>

      <!-- Right scrollable content -->
      <div class="config-content">
        <div class="config-content-inner">

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Paths (General > Paths) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'paths'">

          <!-- Data Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <h3 class="form-section-title">Data Path</h3>
              <span class="form-label-hint">CLANKAI_DATA_PATH</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="dataPath" v-model="form.dataPath" type="text" :placeholder="defaultDataPath" class="field font-mono" />
                <button class="open-folder-btn" @click="openInExplorer(form.dataPath || defaultDataPath)" title="Open in file explorer">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              </div>
              <p class="hint">
                Directory where ClankAI stores all data (config, chats, personas, MCP servers, tools, souls).
                Stored in .env — requires restart to take effect.
                Default: <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultDataPath }}</code>
              </p>
            </div>
          </div>

          <!-- Artifact Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <h3 class="form-section-title">Artifact Path</h3>
              <span class="form-label-hint">CLANKAI_ARTIFACT_PATH</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="artifactPath" v-model="form.artifactPath" type="text" :placeholder="defaultArtifactPath" class="field font-mono" />
                <button class="open-folder-btn" @click="openInExplorer(form.artifactPath || defaultArtifactPath)" title="Open in file explorer">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              </div>
              <p class="hint">
                Directory where the AI creates artifacts (markdown, temp files, docs, exports) during chats.
                Default: <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultArtifactPath }}</code>
              </p>
            </div>
          </div>

          <!-- Skills Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 class="form-section-title">Skills Path</h3>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="skillsPath" v-model="form.skillsPath" type="text" placeholder="~/.claude/skills" class="field font-mono" />
                <button class="open-folder-btn" @click="openInExplorer(form.skillsPath || '~/.claude/skills')" title="Open in file explorer">
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              </div>
              <p class="hint">Directory containing skill folders. Leave empty for default: ~/.claude/skills</p>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveGeneral" :disabled="savingGeneral" :loading="savingGeneral">
              <svg v-if="!savingGeneral" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingGeneral ? 'Saving…' : 'Save' }}
            </AppButton>
            <span v-if="savedGeneralMsg" class="save-indicator" :class="savedGeneralMsg.ok ? 'success' : 'error'">
              <svg v-if="savedGeneralMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedGeneralMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Models (AI > Models) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'models'">

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
              <span class="prov-dot" :class="form[tab.value]?.isActive ? 'active' : 'inactive'" />
            </button>
          </div>

          <!-- ── Anthropic Tab ─────────────────────────────────────────── -->
          <template v-if="activeProviderTab === 'anthropic'">

            <!-- Credentials -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Credentials</h3>
              </div>

              <!-- API Key -->
              <div class="form-group">
                <label for="apiKey" class="form-label">
                  API Key
                  <span class="form-label-hint">ANTHROPIC_API_KEY</span>
                </label>
                <div class="input-with-action">
                  <input
                    id="apiKey"
                    v-model="form.anthropic.apiKey"
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
                <p class="hint">Stored locally in ~/.clankAI/config.json — never sent elsewhere</p>
              </div>

              <!-- Base URL -->
              <div class="form-group">
                <label for="baseURL" class="form-label">
                  Base URL
                  <span class="form-label-hint">ANTHROPIC_BASE_URL</span>
                </label>
                <input id="baseURL" v-model="form.anthropic.baseURL" type="url" placeholder="https://api.anthropic.com" class="field" />
                <p class="hint">Change for custom backends: LiteLLM, Ollama, corporate proxy, etc.</p>
              </div>
            </div>

            <!-- Models section -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                </div>
                <h3 class="form-section-title">Models</h3>
              </div>

              <div class="models-grid">
                <div class="form-group compact">
                  <label for="sonnetModel" class="form-label">Sonnet Model</label>
                  <input id="sonnetModel" v-model="form.anthropic.sonnetModel" type="text" placeholder="anthropic/claude-sonnet-latest" class="field font-mono"
                    @click="testModelAnthropicTemp = form.anthropic.sonnetModel" />
                </div>
                <div class="form-group compact">
                  <label for="opusModel" class="form-label">Opus Model</label>
                  <input id="opusModel" v-model="form.anthropic.opusModel" type="text" placeholder="anthropic/claude-opus-latest" class="field font-mono"
                    @click="testModelAnthropicTemp = form.anthropic.opusModel" />
                </div>
                <div class="form-group compact">
                  <label for="haikuModel" class="form-label">Haiku Model</label>
                  <input id="haikuModel" v-model="form.anthropic.haikuModel" type="text" placeholder="anthropic/claude-3-5-haiku-20241022" class="field font-mono"
                    @click="testModelAnthropicTemp = form.anthropic.haikuModel" />
                </div>
              </div>

              <div class="form-divider"></div>

              <div class="test-simple-row">
                <span class="test-selected-label">{{ testModelAnthropicTemp ? testModelAnthropicTemp : 'Click a model above to select' }}</span>
                <AppButton size="compact" @click="testProviderConnection('anthropic')" :disabled="testingProvider === 'anthropic' || !canTestAnthropic" :loading="testingProvider === 'anthropic'">
                  <svg v-if="testingProvider !== 'anthropic'" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingProvider === 'anthropic' ? 'Testing\u2026' : 'Test' }}
                </AppButton>
              </div>
              <div v-if="testResults.anthropic" class="test-result" :class="testResults.anthropic.ok ? 'success' : 'error'" style="margin-top:0.5rem;">
                <svg v-if="testResults.anthropic.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResults.anthropic.message }}</span>
              </div>
            </div>
          </template>

          <!-- ── OpenRouter Tab ────────────────────────────────────────── -->
          <template v-if="activeProviderTab === 'openrouter'">

            <!-- Credentials -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Credentials</h3>
              </div>

              <div class="form-group">
                <label for="openrouterApiKey" class="form-label">
                  API Key <span class="form-label-hint">OPENROUTER_API_KEY</span>
                </label>
                <div class="input-with-action">
                  <input id="openrouterApiKey" v-model="form.openrouter.apiKey" :type="showOpenRouterKey ? 'text' : 'password'" placeholder="sk-or-…" class="field font-mono" />
                  <button @click="showOpenRouterKey = !showOpenRouterKey" class="field-action-btn" :aria-label="showOpenRouterKey ? 'Hide key' : 'Show key'">
                    <svg v-if="!showOpenRouterKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <p class="hint">Your OpenRouter API key — stored locally</p>
              </div>

              <div class="form-group">
                <label for="openrouterBaseURL" class="form-label">Base URL</label>
                <input id="openrouterBaseURL" v-model="form.openrouter.baseURL" type="url" placeholder="https://openrouter.ai/api" class="field" />
                <p class="hint">OpenRouter base URL (without /v1 — the SDK adds it). Change only for custom proxies.</p>
              </div>
            </div>

            <!-- Available Models + Test -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Available Models</h3>
                <span class="form-label-hint" style="margin-left:auto;">{{ modelsStore.openrouterModels.length > 0 ? `${modelsStore.openrouterModels.length} loaded` : 'Enter API key and fetch' }}</span>
                <AppButton size="compact" @click="fetchOrModels" :disabled="orModelsFetching || !form.openrouter.apiKey" :loading="orModelsFetching">
                  <svg v-if="!orModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  {{ orModelsFetching ? 'Fetching…' : 'Fetch' }}
                </AppButton>
              </div>
              <div v-if="modelsStore.openrouterModels.length > 0" class="model-list-area">
                <input v-model="orModelFilter" type="text" placeholder="Filter models…" class="model-filter font-mono" />
                <div class="model-list font-mono">
                  <div v-for="m in filteredOrModels" :key="m.id"
                    class="model-list-item" :class="{ selected: orSelectedTestModel === m.id }"
                    @click="orSelectedTestModel = m.id; testModelOpenRouterTemp = m.id">{{ m.id }} — {{ m.name }}</div>
                </div>
              </div>
              <div v-if="orModelsFetchError" class="test-result error">
                <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ orModelsFetchError }}</span>
              </div>

              <div class="form-divider"></div>

              <div class="test-simple-row">
                <span class="test-selected-label">{{ testModelOpenRouterTemp ? testModelOpenRouterTemp : 'Select a model above to test' }}</span>
                <AppButton size="compact" @click="testProviderConnection('openrouter')" :disabled="testingProvider === 'openrouter' || !canTestOpenRouter" :loading="testingProvider === 'openrouter'">
                  <svg v-if="testingProvider !== 'openrouter'" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingProvider === 'openrouter' ? 'Testing\u2026' : 'Test' }}
                </AppButton>
              </div>
              <div v-if="testResults.openrouter" class="test-result" :class="testResults.openrouter.ok ? 'success' : 'error'" style="margin-top:0.5rem;">
                <svg v-if="testResults.openrouter.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResults.openrouter.message }}</span>
              </div>
            </div>
          </template>

          <!-- ── OpenAI Tab ──────────────────────────────────────────── -->
          <template v-if="activeProviderTab === 'openai'">

            <!-- Credentials -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Credentials</h3>
              </div>

              <div class="form-group">
                <label for="openaiApiKey" class="form-label">
                  API Key <span class="form-label-hint">x-api-key</span>
                </label>
                <div class="input-with-action">
                  <input id="openaiApiKey" v-model="form.openai.apiKey" :type="showOpenAIKey ? 'text' : 'password'" placeholder="your-openai-api-key" class="field font-mono" />
                  <button @click="showOpenAIKey = !showOpenAIKey" class="field-action-btn" :aria-label="showOpenAIKey ? 'Hide key' : 'Show key'">
                    <svg v-if="!showOpenAIKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <p class="hint">OpenAI x-api-key — stored locally</p>
              </div>

              <div class="form-group">
                <label for="openaiBaseURL" class="form-label">Base URL</label>
                <input id="openaiBaseURL" v-model="form.openai.baseURL" type="url" placeholder="https://mlaas.virtuosgames.com" class="field" />
                <p class="hint">OpenAI base URL (without /proxy/openai/v1 — added automatically)</p>
              </div>
            </div>

            <!-- Available Models + Test -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Available Models</h3>
                <span class="form-label-hint" style="margin-left:auto;">{{ modelsStore.openaiModels.length > 0 ? `${modelsStore.openaiModels.length} loaded` : 'Enter API key and fetch' }}</span>
                <AppButton size="compact" @click="fetchOpenAIModelsLocal" :disabled="openaiModelsFetching || !form.openai.apiKey" :loading="openaiModelsFetching">
                  <svg v-if="!openaiModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  {{ openaiModelsFetching ? 'Fetching…' : 'Fetch' }}
                </AppButton>
              </div>
              <div v-if="modelsStore.openaiModels.length > 0" class="model-list-area">
                <input v-model="openaiModelFilter" type="text" placeholder="Filter models…" class="model-filter font-mono" />
                <div class="model-list font-mono">
                  <div v-for="m in filteredOpenAIModels" :key="m.id"
                    class="model-list-item" :class="{ selected: openaiSelectedTestModel === m.id }"
                    @click="openaiSelectedTestModel = m.id; testModelOpenAITemp = m.id">{{ m.id }} — {{ m.name }}</div>
                </div>
              </div>
              <div v-if="openaiModelsFetchError" class="test-result error">
                <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ openaiModelsFetchError }}</span>
              </div>

              <div class="form-divider"></div>

              <div class="test-simple-row">
                <span class="test-selected-label">{{ testModelOpenAITemp ? testModelOpenAITemp : 'Select a model above to test' }}</span>
                <AppButton size="compact" @click="testProviderConnection('openai')" :disabled="testingProvider === 'openai' || !canTestOpenAI" :loading="testingProvider === 'openai'">
                  <svg v-if="testingProvider !== 'openai'" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingProvider === 'openai' ? 'Testing\u2026' : 'Test' }}
                </AppButton>
              </div>
              <div v-if="testResults.openai" class="test-result" :class="testResults.openai.ok ? 'success' : 'error'" style="margin-top:0.5rem;">
                <svg v-if="testResults.openai.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResults.openai.message }}</span>
              </div>
            </div>
          </template>

          <!-- ── DeepSeek Tab ────────────────────────────────────────── -->
          <template v-if="activeProviderTab === 'deepseek'">

            <!-- Credentials -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Credentials</h3>
              </div>

              <div class="form-group">
                <label for="deepseekApiKey" class="form-label">
                  API Key <span class="form-label-hint">Bearer token</span>
                </label>
                <div class="input-with-action">
                  <input id="deepseekApiKey" v-model="form.deepseek.apiKey" :type="showDeepSeekKey ? 'text' : 'password'" placeholder="sk-…" class="field font-mono" />
                  <button @click="showDeepSeekKey = !showDeepSeekKey" class="field-action-btn" :aria-label="showDeepSeekKey ? 'Hide key' : 'Show key'">
                    <svg v-if="!showDeepSeekKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <p class="hint">DeepSeek API key — stored locally</p>
              </div>

              <div class="form-group">
                <label for="deepseekBaseURL" class="form-label">Base URL</label>
                <input id="deepseekBaseURL" v-model="form.deepseek.baseURL" type="url" placeholder="https://api.deepseek.com" class="field" />
                <p class="hint">DeepSeek base URL. Leave blank to use the official API endpoint.</p>
              </div>
            </div>

            <!-- Available Models + Test -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Available Models</h3>
                <span class="form-label-hint" style="margin-left:auto;">{{ modelsStore.deepseekModels.length > 0 ? `${modelsStore.deepseekModels.length} loaded` : 'Enter API key and fetch' }}</span>
                <AppButton size="compact" @click="fetchDeepSeekModels" :disabled="deepseekModelsFetching || !form.deepseek.apiKey" :loading="deepseekModelsFetching">
                  <svg v-if="!deepseekModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                  {{ deepseekModelsFetching ? 'Fetching…' : 'Fetch' }}
                </AppButton>
              </div>
              <div v-if="modelsStore.deepseekModels.length > 0" class="model-list-area">
                <input v-model="deepseekModelFilter" type="text" placeholder="Filter models…" class="model-filter font-mono" />
                <div class="model-list font-mono">
                  <div v-for="m in filteredDeepSeekModels" :key="m.id"
                    class="model-list-item" :class="{ selected: deepseekSelectedTestModel === m.id }"
                    @click="deepseekSelectedTestModel = m.id; testModelDeepSeekTemp = m.id">{{ m.id }}</div>
                </div>
              </div>
              <div v-if="deepseekModelsFetchError" class="test-result error">
                <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ deepseekModelsFetchError }}</span>
              </div>

              <div class="form-divider"></div>

              <div class="test-simple-row">
                <span class="test-selected-label">{{ testModelDeepSeekTemp ? testModelDeepSeekTemp : 'Select a model above to test' }}</span>
                <AppButton size="compact" @click="testProviderConnection('deepseek')" :disabled="testingProvider === 'deepseek' || !canTestDeepSeek" :loading="testingProvider === 'deepseek'">
                  <svg v-if="testingProvider !== 'deepseek'" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingProvider === 'deepseek' ? 'Testing\u2026' : 'Test' }}
                </AppButton>
              </div>
              <div v-if="testResults.deepseek" class="test-result" :class="testResults.deepseek.ok ? 'success' : 'error'" style="margin-top:0.5rem;">
                <svg v-if="testResults.deepseek.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResults.deepseek.message }}</span>
              </div>
            </div>

            <!-- Limits -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </div>
                <h3 class="form-section-title">Limits</h3>
              </div>
              <div class="form-group" style="margin-bottom:0;">
                <label for="deepseekMaxTokens" class="form-label">
                  Max Output Tokens <span class="form-label-hint">1 – 8192</span>
                </label>
                <input
                  id="deepseekMaxTokens"
                  v-model.number="form.deepseek.maxTokens"
                  type="number"
                  min="1"
                  max="8192"
                  step="256"
                  class="field font-mono"
                  style="max-width:160px;"
                  placeholder="8192"
                />
                <p class="hint">DeepSeek enforces a hard limit of 8192 tokens per response.</p>
              </div>
            </div>
          </template>

          <!-- Global Model Settings (below provider tabs) -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
                </svg>
              </div>
              <h3 class="form-section-title">Global Model Settings</h3>
            </div>

            <div class="form-group">
              <label for="maxOutputTokens" class="form-label">
                Max Output Tokens
                <span class="form-label-hint">Per-turn output limit</span>
              </label>
              <input
                id="maxOutputTokens"
                v-model.number="form.maxOutputTokens"
                type="number"
                min="1024"
                max="98304"
                class="field font-mono"
                style="max-width: 160px;"
                @blur="form.maxOutputTokens = Math.min(98304, Math.max(1024, Number(form.maxOutputTokens) || 32768))"
              />
              <p class="hint">
                Maximum tokens the model can generate per turn. Default: 32768. Hard limit: 98304 (96k).
              </p>
            </div>

            <div class="form-divider"></div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">
                Utility Model <span class="cfg-required">*</span>
                <span class="form-label-hint">Background tasks</span>
              </label>
              <ProviderModelPicker
                :provider="form.utilityModel.provider"
                :model="form.utilityModel.model"
                @update:provider="form.utilityModel.provider = $event; form.utilityModel.model = ''; testUtilityModelResult = null"
                @update:model="form.utilityModel.model = $event; testUtilityModelResult = null"
              />
              <div class="test-simple-row" style="margin-top:0.5rem;">
                <span class="test-selected-label">{{ form.utilityModel.model || 'Select a provider and model above' }}</span>
                <AppButton
                  size="compact"
                  :disabled="testingUtilityModel || !form.utilityModel.provider || !form.utilityModel.model"
                  :loading="testingUtilityModel"
                  @click="testUtilityModel"
                >
                  <svg v-if="!testingUtilityModel" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  {{ testingUtilityModel ? 'Testing\u2026' : 'Test' }}
                </AppButton>
              </div>
              <div v-if="testUtilityModelResult" class="test-result" :class="testUtilityModelResult.ok ? 'success' : 'error'" style="margin-top:0.375rem;">
                {{ testUtilityModelResult.message }}
              </div>
              <p class="hint">
                Used for: @mention routing, context compaction, AI enhancements, title generation.
                Pick the cheapest/fastest model across any active provider.
              </p>
            </div>
          </div>

          <!-- Save (AI Models) -->
          <div class="save-row">
            <AppButton size="save" @click="saveModels" :disabled="savingModels" :loading="savingModels">
              <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingModels ? 'Saving…' : 'Save' }}
            </AppButton>
            <span v-if="savedModelsMsg" class="save-indicator" :class="savedModelsMsg.ok ? 'success' : 'error'">
              <svg v-if="savedModelsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedModelsMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Knowledge (AI > Knowledge) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'knowledge'">
          <div class="config-card">

            <!-- Credentials -->
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3 class="form-section-title">Pinecone Credentials</h3>
            </div>

            <div class="form-group">
              <label for="pineconeApiKey" class="form-label">Pinecone API Key</label>
              <div class="input-with-action">
                <input id="pineconeApiKey" v-model="form.pineconeApiKey" :type="showPineconeKey ? 'text' : 'password'" placeholder="pcsk_..." class="field font-mono" />
                <button @click="showPineconeKey = !showPineconeKey" class="field-action-btn" :aria-label="showPineconeKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showPineconeKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
              <p class="hint">Your Pinecone API key — stored locally in ~/.clankAI/config.json</p>
            </div>

            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test</p>
                <p class="hint" style="margin-top:2px;">Verify Pinecone API key access. Select an index on the Knowledge page.</p>
              </div>
              <AppButton @click="testPineconeConnection" :disabled="testingPinecone || !form.pineconeApiKey" :loading="testingPinecone">
                <svg v-if="!testingPinecone" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {{ testingPinecone ? 'Testing\u2026' : 'Test' }}
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
              {{ savingKnowledge ? 'Saving...' : 'Save' }}
            </AppButton>
            <span v-if="savedKnowledgeMsg" class="save-indicator" :class="savedKnowledgeMsg.ok ? 'success' : 'error'">
              <svg v-if="savedKnowledgeMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedKnowledgeMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Voice (AI > Voice) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'voice'">

          <!-- Whisper STT -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </div>
              <h3 class="form-section-title">Whisper STT (Speech-to-Text)</h3>
            </div>
            <p class="hint" style="margin-bottom:1rem;">
              Voice calls use OpenAI's Whisper API for speech recognition. Text-to-speech uses your browser's built-in SpeechSynthesis (free, no API key needed).
            </p>

            <!-- API Key -->
            <div class="form-group">
              <label for="whisperApiKey" class="form-label">
                OpenAI API Key
                <span class="form-label-hint">For Whisper STT</span>
              </label>
              <div class="input-with-action">
                <input
                  id="whisperApiKey"
                  v-model="form.voiceCall.whisperApiKey"
                  :type="showWhisperKey ? 'text' : 'password'"
                  placeholder="sk-..."
                  class="field font-mono"
                />
                <button @click="showWhisperKey = !showWhisperKey" class="field-action-btn" :aria-label="showWhisperKey ? 'Hide key' : 'Show key'">
                  <svg v-if="!showWhisperKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">Your OpenAI API key — used only for Whisper speech-to-text. Can be the same key as your OpenAI provider if you have one configured.</p>
            </div>

            <!-- Base URL -->
            <div class="form-group">
              <label for="whisperBaseURL" class="form-label">
                Base URL
                <span class="form-label-hint">Optional</span>
              </label>
              <input id="whisperBaseURL" v-model="form.voiceCall.whisperBaseURL" type="url" placeholder="https://api.openai.com" class="field font-mono" />
              <p class="hint">Leave blank for standard OpenAI. Change only if using a custom Whisper-compatible endpoint.</p>
            </div>

            <!-- STT Language -->
            <div class="form-group">
              <label for="whisperLanguage" class="form-label">
                STT Language
                <span class="form-label-hint">Recommended for noise reduction</span>
              </label>
              <input id="whisperLanguage" v-model="form.voiceCall.language" type="text" placeholder="e.g. en, zh, ja, fr (leave blank for auto)" class="field font-mono" />
              <p class="hint">Setting your language (e.g. <code>en</code>) prevents Whisper from misidentifying background noise or echo as speech in another language, significantly reducing false triggers.</p>
            </div>

            <!-- Test -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test</p>
                <p class="hint" style="margin-top:2px;">Verify Whisper API key and endpoint</p>
              </div>
              <AppButton @click="testWhisperConnection" :disabled="testingWhisper || !form.voiceCall.whisperApiKey" :loading="testingWhisper">
                <svg v-if="!testingWhisper" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {{ testingWhisper ? 'Testing\u2026' : 'Test' }}
              </AppButton>
            </div>
            <div v-if="testResultWhisper" class="test-result" :class="testResultWhisper.ok ? 'success' : 'error'" style="margin-top:10px;">
              <svg v-if="testResultWhisper.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultWhisper.message }}</span>
            </div>
          </div>

          <!-- Microphone Sensitivity (VAD) -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h3 class="form-section-title">Microphone Sensitivity (VAD)</h3>
            </div>
            <p class="hint" style="margin-bottom:1rem;">
              Controls when the mic starts and stops capturing. Tune these if the AI triggers on keyboard noise, background sound, or misses quiet speech.
            </p>

            <div class="vad-grid">
              <!-- Amplitude threshold -->
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">
                  Amplitude Threshold
                  <span class="form-label-hint">Current: {{ form.voiceCall.vadAmplitude }}</span>
                </label>
                <input
                  type="range" min="0.005" max="0.06" step="0.001"
                  v-model.number="form.voiceCall.vadAmplitude"
                  class="vad-slider"
                />
                <div class="vad-slider-labels"><span>Sensitive</span><span>Selective</span></div>
                <p class="hint">Minimum loudness to register as speech. Raise if keyboard/noise triggers the mic. Lower if quiet speech is missed. Default: 0.018</p>
              </div>

              <!-- Silence duration -->
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">
                  Silence Cutoff
                  <span class="form-label-hint">Current: {{ form.voiceCall.vadSilenceMs }}ms</span>
                </label>
                <input
                  type="range" min="300" max="2000" step="50"
                  v-model.number="form.voiceCall.vadSilenceMs"
                  class="vad-slider"
                />
                <div class="vad-slider-labels"><span>Faster (300ms)</span><span>Slower (2000ms)</span></div>
                <p class="hint">How long silence must last before audio is sent to Whisper. Lower = faster response, higher = fewer accidental cutoffs mid-sentence. Default: 700ms</p>
              </div>

              <!-- Min speech frames -->
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">
                  Min Speech Frames
                  <span class="form-label-hint">Current: {{ form.voiceCall.vadSpeechFrames }} (~{{ Math.round(form.voiceCall.vadSpeechFrames / 60 * 1000) }}ms)</span>
                </label>
                <input
                  type="range" min="5" max="60" step="1"
                  v-model.number="form.voiceCall.vadSpeechFrames"
                  class="vad-slider"
                />
                <div class="vad-slider-labels"><span>5 frames</span><span>60 frames</span></div>
                <p class="hint">How many consecutive loud frames before a recording starts. Higher values reject brief noise bursts and single key clicks. Default: 20</p>
              </div>

              <!-- Voice band ratio -->
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">
                  Voice Band Ratio
                  <span class="form-label-hint">Current: {{ Math.round(form.voiceCall.vadVoiceBandRatio * 100) }}%</span>
                </label>
                <input
                  type="range" min="0.05" max="0.6" step="0.01"
                  v-model.number="form.voiceCall.vadVoiceBandRatio"
                  class="vad-slider"
                />
                <div class="vad-slider-labels"><span>Permissive (5%)</span><span>Strict (60%)</span></div>
                <p class="hint">Minimum fraction of audio energy that must be in the 300–3400 Hz voice range. Keyboard clicks have ~10%, speech has ~40–70%. Raise to block more noise. Default: 25%</p>
              </div>

              <!-- Proximity multiplier -->
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">
                  Background Noise Rejection
                  <span class="form-label-hint">Current: {{ form.voiceCall.vadProximityMult }}×</span>
                </label>
                <input
                  type="range" min="1.2" max="5" step="0.1"
                  v-model.number="form.voiceCall.vadProximityMult"
                  class="vad-slider"
                />
                <div class="vad-slider-labels"><span>Relaxed (1.2×)</span><span>Strict (5×)</span></div>
                <p class="hint">How much louder you must be than the background before the mic activates. Higher values block people chatting nearby. If the mic stops picking up your voice, lower this. Default: 2.5×</p>
              </div>
            </div>
          </div>

          <!-- Text-to-Speech -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </div>
              <h3 class="form-section-title">Text-to-Speech</h3>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">TTS Mode</label>
              <div class="tts-option-list">

                <!-- Browser -->
                <div class="tts-option" :class="{ active: (form.voiceCall.ttsMode || 'browser') === 'browser' }" @click="form.voiceCall.ttsMode = 'browser'">
                  <div class="tts-option-left">
                    <div class="tts-option-icon">
                      <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      </svg>
                    </div>
                    <div>
                      <div class="tts-option-name">Browser <span class="sec-mode-badge">Free · Default</span></div>
                      <div class="tts-option-desc">Uses your system's built-in voices. No API cost. Quality depends on your OS.</div>
                    </div>
                  </div>
                  <button class="tts-demo-btn" :class="{ playing: demoingTts === 'browser' }" @click.stop="demoTts('browser')" :disabled="demoingTts !== null" title="Play demo">
                    <svg v-if="demoingTts !== 'browser'" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    {{ demoingTts === 'browser' ? 'Playing…' : 'Demo' }}
                  </button>
                </div>

                <!-- OpenAI TTS -->
                <div class="tts-option" :class="{ active: form.voiceCall.ttsMode === 'openai' }" @click="form.voiceCall.ttsMode = 'openai'">
                  <div class="tts-option-left">
                    <div class="tts-option-icon">
                      <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                      </svg>
                    </div>
                    <div>
                      <div class="tts-option-name">OpenAI TTS <span class="tts-cost-badge">$15 / 1M chars</span></div>
                      <div class="tts-option-desc">OpenAI tts-1 — natural voices. Requires Whisper API key.</div>
                    </div>
                  </div>
                  <button class="tts-demo-btn" :class="{ playing: demoingTts === 'openai' }" @click.stop="demoTts('openai')" :disabled="demoingTts !== null || !form.voiceCall.whisperApiKey" title="Play demo">
                    <svg v-if="demoingTts !== 'openai'" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    {{ demoingTts === 'openai' ? 'Playing…' : 'Demo' }}
                  </button>
                </div>

                <!-- OpenAI HD -->
                <div class="tts-option" :class="{ active: form.voiceCall.ttsMode === 'openai-hd' }" @click="form.voiceCall.ttsMode = 'openai-hd'">
                  <div class="tts-option-left">
                    <div class="tts-option-icon">
                      <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                      </svg>
                    </div>
                    <div>
                      <div class="tts-option-name">OpenAI HD <span class="tts-cost-badge">$30 / 1M chars</span></div>
                      <div class="tts-option-desc">OpenAI tts-1-hd — higher fidelity, more natural. Requires Whisper API key.</div>
                    </div>
                  </div>
                  <button class="tts-demo-btn" :class="{ playing: demoingTts === 'openai-hd' }" @click.stop="demoTts('openai-hd')" :disabled="demoingTts !== null || !form.voiceCall.whisperApiKey" title="Play demo">
                    <svg v-if="demoingTts !== 'openai-hd'" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                    {{ demoingTts === 'openai-hd' ? 'Playing…' : 'Demo' }}
                  </button>
                </div>

              </div>
              <p v-if="(form.voiceCall.ttsMode === 'openai' || form.voiceCall.ttsMode === 'openai-hd') && !form.voiceCall.whisperApiKey" class="hint" style="margin-top:8px; color:#EF4444;">
                Enter a Whisper API key above to enable Demo for OpenAI TTS.
              </p>
              <p class="hint" style="margin-top:6px; font-size:var(--fs-small);">Whisper STT: $0.006 / minute</p>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveVoice" :disabled="savingVoice" :loading="savingVoice">
              <svg v-if="!savingVoice" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingVoice ? 'Saving...' : 'Save' }}
            </AppButton>
            <span v-if="savedVoiceMsg" class="save-indicator" :class="savedVoiceMsg.ok ? 'success' : 'error'">
              <svg v-if="savedVoiceMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedVoiceMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Pricing (AI > Pricing) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'pricing'">

          <!-- Currency Rates -->
          <div class="config-card">
            <div class="form-section-header" style="margin-bottom:1rem;">
              <div class="section-icon-sm">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </div>
              <div>
                <h3 class="form-section-title">Currency Rates</h3>
                <p class="form-section-desc">USD is the base. Enter how many units equal $1 USD.</p>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
              <div class="form-group">
                <label class="form-label">CNY (¥) per $1</label>
                <input type="number" step="0.01" v-model.number="form.pricing.currencyRates.CNY" class="field font-mono" placeholder="7.28" />
              </div>
              <div class="form-group">
                <label class="form-label">SGD (S$) per $1</label>
                <input type="number" step="0.01" v-model.number="form.pricing.currencyRates.SGD" class="field font-mono" placeholder="1.35" />
              </div>
            </div>
          </div>

          <!-- Model Prices -->
          <div class="config-card">
            <div class="form-section-header" style="margin-bottom:0.75rem; align-items:flex-start;">
              <div class="section-icon-sm">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div style="flex:1;">
                <h3 class="form-section-title">Model Prices</h3>
                <p class="form-section-desc">USD per 1M tokens. Overrides built-in defaults.</p>
              </div>
              <button class="action-btn" @click="fetchOpenRouterPrices" :disabled="isFetchingPrices">
                <svg v-if="!isFetchingPrices" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5.88"/>
                </svg>
                <svg v-else class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {{ isFetchingPrices ? 'Updating…' : 'Update OpenRouter' }}
              </button>
            </div>
            <!-- Filter -->
            <div style="margin-bottom:0.625rem;">
              <input v-model="priceFilter" class="field font-mono field-sm" placeholder="Filter models…" style="width:100%;" />
            </div>
            <!-- Table header -->
            <div class="pricing-table-header">
              <span>Model ID</span>
              <span>Input ($/1M)</span>
              <span>Output ($/1M)</span>
              <span>Cache Write</span>
              <span>Cache Read</span>
              <span></span>
              <span></span>
            </div>
            <!-- Price rows -->
            <div v-if="priceFilter && Object.keys(filteredPriceRows).length === 0" style="padding:1rem 0; text-align:center; color:var(--text-muted); font-size:var(--fs-secondary);">
              No models match "{{ priceFilter }}"
            </div>
            <div v-for="(row, modelId) in filteredPriceRows" :key="modelId" class="pricing-table-row">
              <span class="font-mono" style="font-size:var(--fs-caption); color:#1A1A1A; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ modelId }}</span>
              <input type="number" step="0.001" :value="row.input"      @change="row.input      = +$event.target.value; onPriceEdit(modelId, row)" class="field font-mono" style="padding:0.25rem 0.375rem; font-size:var(--fs-caption);" placeholder="0.00" />
              <input type="number" step="0.001" :value="row.output"     @change="row.output     = +$event.target.value; onPriceEdit(modelId, row)" class="field font-mono" style="padding:0.25rem 0.375rem; font-size:var(--fs-caption);" placeholder="0.00" />
              <input type="number" step="0.001" :value="row.cacheWrite" @change="row.cacheWrite = +$event.target.value; onPriceEdit(modelId, row)" class="field font-mono" style="padding:0.25rem 0.375rem; font-size:var(--fs-caption);" placeholder="0.00" />
              <input type="number" step="0.001" :value="row.cacheRead"  @change="row.cacheRead  = +$event.target.value; onPriceEdit(modelId, row)" class="field font-mono" style="padding:0.25rem 0.375rem; font-size:var(--fs-caption);" placeholder="0.00" />
              <button @click="resetModelPrice(modelId)" title="Reset to default" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0.25rem;border-radius:var(--radius-sm);color:#9CA3AF;" @mouseenter="e=>e.currentTarget.style.background='var(--bg-hover)'" @mouseleave="e=>e.currentTarget.style.background='none'">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/>
                </svg>
              </button>
              <button @click="deleteModelPrice(modelId)" title="Delete model" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0.25rem;border-radius:var(--radius-sm);color:#9CA3AF;" @mouseenter="e=>{e.currentTarget.style.background='rgba(239,68,68,0.08)';e.currentTarget.style.color='#EF4444'}" @mouseleave="e=>{e.currentTarget.style.background='none';e.currentTarget.style.color='#9CA3AF'}">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            </div>
            <!-- Add custom model -->
            <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border);">
              <input v-model="newModelId" class="field font-mono" placeholder="Add custom model ID" style="flex:2;" />
              <AppButton variant="primary" size="compact" @click="addCustomModel" :disabled="!newModelId.trim()">Add</AppButton>
            </div>
          </div>

          <!-- Model Aliases -->
          <div class="config-card">
            <div class="form-section-header" style="margin-bottom:0.75rem;">
              <div class="section-icon-sm">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                </svg>
              </div>
              <div>
                <h3 class="form-section-title">Model Aliases</h3>
                <p class="form-section-desc">Map custom or provider-prefixed model names to a known price tier.</p>
              </div>
            </div>
            <div v-for="(target, alias) in form.pricing.modelPriceMap" :key="alias" style="display:grid; grid-template-columns:1fr 1.5rem 1fr 2rem; gap:0.5rem; align-items:center; padding:0.375rem 0; border-bottom:1px solid var(--border-light);">
              <span class="font-mono" style="color:#1A1A1A; font-size:var(--fs-caption); overflow:hidden; text-overflow:ellipsis;">{{ alias }}</span>
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              <select v-model="form.pricing.modelPriceMap[alias]" class="field font-mono field-sm">
                <option v-for="mid in allKnownModelIds" :key="mid" :value="mid">{{ mid }}</option>
              </select>
              <button @click="deleteAlias(alias)" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0.25rem;border-radius:var(--radius-sm);color:#EF4444;" @mouseenter="e=>e.currentTarget.style.background='var(--bg-hover)'" @mouseleave="e=>e.currentTarget.style.background='none'">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--border);">
              <input v-model="newAliasFrom" class="field font-mono" placeholder="Custom model ID (alias)" style="flex:2;" />
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              <select v-model="newAliasTo" class="field font-mono field-sm" style="flex:2;">
                <option value="">— select tier —</option>
                <option v-for="mid in allKnownModelIds" :key="mid" :value="mid">{{ mid }}</option>
              </select>
              <AppButton variant="primary" size="compact" @click="addAlias" :disabled="!newAliasFrom.trim() || !newAliasTo">Add</AppButton>
            </div>
          </div>

          <!-- Save row -->
          <div class="config-save-row">
            <span v-if="pricingSaved" class="save-status saved">Saved</span>
            <AppButton variant="primary" size="save" @click="savePricing">Save</AppButton>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Email (General > Email) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'email'">
          <div class="config-card">

            <!-- SMTP Server section -->
            <div class="form-section-header" style="margin-bottom:12px;">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h3 class="form-section-title">SMTP Server</h3>
            </div>
            <p class="hint" style="margin-bottom:16px;">
              Credentials for outbound email. The agent will use these to send emails when asked.
              Uses STARTTLS on port 587 (Office 365, Outlook, Gmail, etc.)
            </p>

            <!-- Host -->
            <div class="form-group">
              <label for="smtpHost" class="form-label">
                Host
                <span class="form-label-hint">SMTP server hostname</span>
              </label>
              <input id="smtpHost" v-model="form.smtp.host" type="text" placeholder="smtp.office365.com" class="field font-mono" />
            </div>

            <!-- Port -->
            <div class="form-group">
              <label for="smtpPort" class="form-label">
                Port
                <span class="form-label-hint">Default 587 (STARTTLS)</span>
              </label>
              <input id="smtpPort" v-model.number="form.smtp.port" type="number" placeholder="587" class="field font-mono" style="max-width:120px;" />
            </div>

            <!-- Username -->
            <div class="form-group">
              <label for="smtpUser" class="form-label">
                Username
                <span class="form-label-hint">Usually your full email address</span>
              </label>
              <input id="smtpUser" v-model="form.smtp.user" type="text" placeholder="you@yourdomain.com" class="field font-mono" />
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="smtpPass" class="form-label">
                Password
                <span class="form-label-hint">App password or account password</span>
              </label>
              <div class="input-with-action">
                <input
                  id="smtpPass"
                  v-model="form.smtp.pass"
                  :type="showSmtpPass ? 'text' : 'password'"
                  placeholder="••••••••"
                  class="field font-mono"
                />
                <button @click="showSmtpPass = !showSmtpPass" class="field-action-btn" :aria-label="showSmtpPass ? 'Hide password' : 'Show password'">
                  <svg v-if="!showSmtpPass" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">For Office 365 with MFA, use an app password from your Microsoft account security settings.</p>
            </div>

            <!-- Test Connection -->
            <div class="form-divider"></div>
            <div class="test-connection-row">
              <div>
                <p class="form-section-title">Test</p>
                <p class="hint" style="margin-top:2px;">Verify SMTP credentials and server connectivity</p>
              </div>
              <AppButton @click="testSmtpConnection" :disabled="testingSmtp || !form.smtp.host || !form.smtp.user" :loading="testingSmtp">
                <svg v-if="!testingSmtp" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                {{ testingSmtp ? 'Testing\u2026' : 'Test' }}
              </AppButton>
            </div>
            <div v-if="testResultSmtp" class="test-result" :class="testResultSmtp.ok ? 'success' : 'error'" style="margin-top:10px;">
              <svg v-if="testResultSmtp.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultSmtp.message }}</span>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveEmail" :disabled="savingEmail" :loading="savingEmail">
              <svg v-if="!savingEmail" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingEmail ? 'Saving...' : 'Save' }}
            </AppButton>
            <span v-if="savedEmailMsg" class="save-indicator" :class="savedEmailMsg.ok ? 'success' : 'error'">
              <svg v-if="savedEmailMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedEmailMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Security (General > Security) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'security'">

          <!-- Global Mode -->
          <div class="config-card">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Global Sandbox Mode</label>
              <p class="hint" style="margin-bottom:12px;">Controls how the agent handles shell commands and file writes across all chats. Per-chat settings can override this.</p>
              <div class="sec-mode-btns">
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'sandbox' }"
                  @click="sandboxForm.defaultMode = 'sandbox'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Sandbox
                  <span class="sec-mode-badge">Default</span>
                </button>
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'all_permissions' }"
                  @click="sandboxForm.defaultMode = 'all_permissions'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  All Permissions
                </button>
              </div>
              <p class="hint" style="margin-top:8px;">
                <template v-if="sandboxForm.defaultMode === 'sandbox'">Agent will ask before running shell commands or writing files. Use the allow list below to pre-approve safe patterns.</template>
                <template v-else>Agent can run any command freely. Only the danger block list below can restrict it.</template>
              </p>
            </div>
          </div>

          <!-- Conditional list: Allow list (Sandbox) or Block list (All Permissions) -->
          <div class="config-card">

            <!-- Sandbox → Global Allow List -->
            <template v-if="sandboxForm.defaultMode === 'sandbox'">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Global Allow List <span class="sec-count-badge">{{ sandboxForm.sandboxAllowList.length }}</span></label>
                <p class="hint" style="margin-bottom:10px;">Commands that bypass the permission prompt for all chats. Use glob patterns — <code class="inline-code">*</code> matches anything.</p>
                <div class="sec-list">
                  <div v-if="sandboxForm.sandboxAllowList.length === 0" class="sec-list-empty">No allow list entries yet. Add patterns below.</div>
                  <div v-for="(entry, idx) in sandboxForm.sandboxAllowList" :key="entry.id || idx" class="sec-list-entry">
                    <div class="sec-entry-info">
                      <span class="sec-entry-pattern">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="sec-entry-desc">{{ entry.description }}</span>
                    </div>
                    <button class="sec-entry-delete allow" @click="removeAllowEntry(idx)" title="Remove">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <div class="sec-add-row">
                  <input v-model="newAllowPattern" type="text" placeholder="Pattern (e.g. ls *)" class="sec-add-input" @keydown.enter.prevent="addAllowEntry" />
                  <input v-model="newAllowDesc" type="text" placeholder="Description" class="sec-add-input" @keydown.enter.prevent="addAllowEntry" />
                  <button class="sec-add-btn" @click="addAllowEntry" :disabled="!newAllowPattern.trim()">Add</button>
                </div>
              </div>
            </template>

            <!-- All Permissions → Danger Block List -->
            <template v-else>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">Danger Block List <span class="sec-count-badge danger">{{ sandboxForm.dangerBlockList.length }}</span></label>
                <p class="hint" style="margin-bottom:10px;">Commands that are always blocked, even in All Permissions mode. Protects against destructive operations.</p>
                <div class="sec-list">
                  <div v-if="sandboxForm.dangerBlockList.length === 0" class="sec-list-empty">No block list entries.</div>
                  <div v-for="(entry, idx) in sandboxForm.dangerBlockList" :key="entry.id || idx" class="sec-list-entry">
                    <div class="sec-entry-info">
                      <span class="sec-entry-pattern danger">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="sec-entry-desc">{{ entry.description }}</span>
                    </div>
                    <button class="sec-entry-delete danger" @click="removeDangerEntry(idx)" title="Remove">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <div class="sec-add-row">
                  <input v-model="newDangerPattern" type="text" placeholder="Pattern (e.g. rm -rf *)" class="sec-add-input" @keydown.enter.prevent="addDangerEntry" />
                  <input v-model="newDangerDesc" type="text" placeholder="Description" class="sec-add-input" @keydown.enter.prevent="addDangerEntry" />
                  <button class="sec-add-btn danger" @click="addDangerEntry" :disabled="!newDangerPattern.trim()">Add</button>
                </div>
              </div>
            </template>

          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveSecurity" :disabled="savingSecurity" :loading="savingSecurity">
              <svg v-if="!savingSecurity" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              {{ savingSecurity ? 'Saving...' : 'Save' }}
            </AppButton>
            <span v-if="savedSecurityMsg" class="save-indicator" :class="savedSecurityMsg.ok ? 'success' : 'error'">
              <svg v-if="savedSecurityMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedSecurityMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- IM Bridge (General > IM) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'im'">

          <!-- Telegram -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 class="form-section-title">Telegram</h3>
            </div>

            <div class="form-group">
              <label class="form-label">
                <input type="checkbox" v-model="form.im.telegram.enabled" style="margin-right:0.5rem;" />
                Enable Telegram Bot
              </label>
            </div>

            <div class="form-divider" />

            <div class="form-group">
              <label class="form-label" for="tgBotToken">Bot Token</label>
              <input
                id="tgBotToken"
                v-model="form.im.telegram.botToken"
                :type="showTgToken ? 'text' : 'password'"
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                class="field font-mono"
              />
              <p class="hint">Get a bot token from <strong>@BotFather</strong> on Telegram.</p>
            </div>

            <div class="form-group">
              <label class="form-label" for="tgAllowedUsers">Allowed Users <span class="form-label-hint">comma-separated usernames or chat IDs</span></label>
              <input
                id="tgAllowedUsers"
                :value="(form.im.telegram.allowedUsers || []).join(',')"
                @input="form.im.telegram.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                placeholder="username1,username2"
                class="field font-mono"
              />
              <p class="hint">Leave empty to allow all users (not recommended for public bots).</p>
            </div>
          </div>

          <!-- Status + Save row -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3 class="form-section-title">Bridge Status</h3>
            </div>
            <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
              <span :style="{ color: imStatus.running ? '#10B981' : '#9CA3AF', fontWeight: 600 }">
                {{ imStatus.running ? '● Running' : '○ Stopped' }}
              </span>
              <span v-if="imStatus.running" style="color:#6B7280; font-size:var(--fs-caption);">
                {{ imStatus.sessions?.length || 0 }} active session(s)
              </span>
            </div>
            <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
              <AppButton size="compact" @click="saveIM" :loading="savingIM">Save</AppButton>
              <AppButton v-if="!imStatus.running" size="compact" variant="secondary" @click="startBridge" :loading="startingBridge">Start Bridge</AppButton>
              <AppButton v-else size="compact" variant="danger-ghost" @click="stopBridge">Stop Bridge</AppButton>
            </div>
            <p v-if="savedIMMsg" :style="{ color: savedIMMsg.ok ? '#10B981' : '#EF4444', marginTop:'0.5rem', fontSize:'var(--fs-caption)' }">
              {{ savedIMMsg.text }}
            </p>
          </div>

        </template>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick, defineComponent, h } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '../stores/config'
import { useModelsStore } from '../stores/models'
import AppButton from '../components/common/AppButton.vue'
import ProviderModelPicker from '../components/common/ProviderModelPicker.vue'
import { DEFAULT_PRICES } from '../utils/pricing.js'

const configStore = useConfigStore()
const modelsStore = useModelsStore()
const route = useRoute()

const isElectron = !!(typeof window !== 'undefined' && window.electronAPI)

function openInExplorer(path) {
  if (!path || !window.electronAPI?.showInFolder) return
  window.electronAPI.showInFolder(path)
}
const showKey  = ref(false)
const showOpenRouterKey = ref(false)
const VALID_TABS = ['general', 'ai', 'models', 'skills', 'knowledge', 'voice', 'email', 'security']
const activeTopTab = ref('general')
const activeProviderTab = ref('openai')

// Respond to ?tab= query param (e.g. from ToolsView → "Configure SMTP" button)
// Map old flat tab values to new two-level structure
watch(() => route.query.tab, (tab) => {
  if (!tab) return
  // New top-level tabs
  if (tab === 'general') { activeTopTab.value = 'general'; activeSubTab.value = 'paths'; return }
  if (tab === 'ai') { activeTopTab.value = 'ai'; activeSubTab.value = 'models'; return }
  // Old flat tab values → remap
  if (tab === 'models') { activeTopTab.value = 'ai'; activeSubTab.value = 'models'; return }
  if (tab === 'voice') { activeTopTab.value = 'ai'; activeSubTab.value = 'voice'; return }
  if (tab === 'knowledge') { activeTopTab.value = 'ai'; activeSubTab.value = 'knowledge'; return }
  if (tab === 'security') { activeTopTab.value = 'general'; activeSubTab.value = 'security'; return }
  if (tab === 'email') { activeTopTab.value = 'general'; activeSubTab.value = 'email'; return }
  if (tab === 'skills') { activeTopTab.value = 'general'; activeSubTab.value = 'paths'; return }
}, { immediate: true })

// Per-tab save state
const savingModels = ref(false)
const savedModelsMsg = ref('')
const savingSkills = ref(false)
const savedSkillsMsg = ref('')

// Unified provider test state
const testingProvider = ref(null)  // 'anthropic' | 'openrouter' | 'openai' | 'deepseek' | null
const testResults = ref({})        // { [provider]: { ok, message } }

// Utility model test state
const testingUtilityModel = ref(false)
const testUtilityModelResult = ref(null)

// OpenRouter local state (fetch button + test model selection)
const orModelsFetching = ref(false)
const orModelsFetchError = ref('')
const orModelFilter = ref('')
const orSelectedTestModel = ref('')

// OpenAI state
const showOpenAIKey = ref(false)
const openaiModelsFetching = ref(false)
const openaiModelsFetchError = ref('')
const openaiModelFilter = ref('')
const openaiSelectedTestModel = ref('')

// DeepSeek state
const showDeepSeekKey = ref(false)
const deepseekModelsFetching = ref(false)
const deepseekModelsFetchError = ref('')
const deepseekModelFilter = ref('')
const deepseekSelectedTestModel = ref('')

// Ephemeral test ping models (not persisted)
const testModelAnthropicTemp = ref('')
const testModelOpenRouterTemp = ref('')
const testModelOpenAITemp = ref('')
const testModelDeepSeekTemp = ref('')


// Pinecone state
const showPineconeKey = ref(false)
const testingPinecone = ref(false)
const testResultPinecone = ref(null)
const savingKnowledge = ref(false)
const savedKnowledgeMsg = ref('')

// Voice Call tab state
const showWhisperKey = ref(false)
const savingVoice = ref(false)
const savedVoiceMsg = ref(null)
const testingWhisper = ref(false)
const testResultWhisper = ref(null)
const demoingTts = ref(null)   // 'browser' | 'openai' | 'openai-hd' | null
let _demoAudio = null           // current HTMLAudioElement for OpenAI TTS

// Email tab state
const showSmtpPass = ref(false)
const savingEmail = ref(false)
const savedEmailMsg = ref(null)
const testingSmtp = ref(false)
const testResultSmtp = ref(null)

// Security tab state
const savingSecurity = ref(false)
const savedSecurityMsg = ref(null)
const sandboxForm = reactive({
  defaultMode: 'sandbox',
  sandboxAllowList: [],
  dangerBlockList: [],
})
const newAllowPattern = ref('')
const newAllowDesc = ref('')
const newDangerPattern = ref('')
const newDangerDesc = ref('')

function addAllowEntry() {
  const p = newAllowPattern.value.trim()
  if (!p) return
  sandboxForm.sandboxAllowList.push({ id: `manual-${Date.now()}`, pattern: p, description: newAllowDesc.value.trim() })
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}
function removeAllowEntry(idx) { sandboxForm.sandboxAllowList.splice(idx, 1) }
function addDangerEntry() {
  const p = newDangerPattern.value.trim()
  if (!p) return
  sandboxForm.dangerBlockList.push({ id: `manual-${Date.now()}`, pattern: p, description: newDangerDesc.value.trim() })
  newDangerPattern.value = ''
  newDangerDesc.value = ''
}
function removeDangerEntry(idx) { sandboxForm.dangerBlockList.splice(idx, 1) }

async function saveSecurity() {
  savingSecurity.value = true
  try {
    await configStore.saveConfig({ sandboxConfig: JSON.parse(JSON.stringify(sandboxForm)) })
    savedSecurityMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedSecurityMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingSecurity.value = false
    setTimeout(() => { savedSecurityMsg.value = null }, 3000)
  }
}

// General tab state
const defaultDataPath = ref('')
const defaultArtifactPath = computed(() => {
  const dp = form.dataPath || defaultDataPath.value
  return dp ? `${dp}/artifact` : ''
})
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
const IconSecurity = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' })
  ])
})
const IconVoice = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
    h('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
    h('line', { x1: '12', y1: '19', x2: '12', y2: '23' }),
    h('line', { x1: '8', y1: '23', x2: '16', y2: '23' })
  ])
})
const IconEmail = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }),
    h('polyline', { points: '22,6 12,13 2,6' })
  ])
})
const IconPaths = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })
  ])
})
const IconIM = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ])
})
const IconPricing = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('line', { x1: '12', y1: '1', x2: '12', y2: '23' }),
    h('path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' })
  ])
})
// Top-level tabs (2 primary)
const topTabs = [
  { value: 'general', label: 'General', icon: IconGeneral },
  { value: 'ai',      label: 'AI',      icon: IconModels  },
]

// Sub-tab arrays
const subTabsGeneral = [
  { value: 'paths',    label: 'Paths',    icon: IconPaths    },
  { value: 'security', label: 'Security', icon: IconSecurity },
  { value: 'email',    label: 'Email',    icon: IconEmail    },
  { value: 'im',       label: 'IM',       icon: IconIM       },
]
const subTabsAI = [
  { value: 'models',    label: 'Models',    icon: IconModels    },
  { value: 'voice',     label: 'Voice',     icon: IconVoice     },
  { value: 'knowledge', label: 'Knowledge', icon: IconKnowledge },
  { value: 'pricing',   label: 'Pricing',   icon: IconPricing   },
]

const activeSubTab = ref('paths')

const currentSubTabs = computed(() =>
  activeTopTab.value === 'general' ? subTabsGeneral : subTabsAI
)

function switchTopTab(tab) {
  activeTopTab.value = tab
  activeSubTab.value = tab === 'general' ? 'paths' : 'models'
}

function getSubTabStatus(subTab) {
  switch (subTab) {
    case 'paths':     return (form.dataPath || form.artifactPath || form.skillsPath) ? 'configured' : 'empty'
    case 'security':  return 'configured'
    case 'email':     return form.smtp?.host ? 'configured' : 'empty'
    case 'im':        return form.im?.telegram?.botToken ? 'configured' : 'empty'
    case 'models':    return Object.values(form).some(v => v?.apiKey) ? 'configured' : 'empty'
    case 'voice':     return form.voiceCall?.whisperApiKey ? 'configured' : 'empty'
    case 'knowledge': return form.pineconeApiKey ? 'configured' : 'empty'
    case 'pricing':   return 'configured'
    default:          return 'empty'
  }
}

// ── IM Bridge state & handlers ────────────────────────────────────────────────
const showTgToken    = ref(false)
const savingIM       = ref(false)
const startingBridge = ref(false)
const savedIMMsg     = ref(null)
const imStatus       = ref({ running: false, sessions: [] })

async function loadIMStatus() {
  if (window.electronAPI?.im) {
    imStatus.value = await window.electronAPI.im.getStatus()
  }
}

async function saveIM() {
  savingIM.value = true
  savedIMMsg.value = null
  try {
    await configStore.saveConfig({ im: JSON.parse(JSON.stringify(form.im)) })
    savedIMMsg.value = { ok: true, text: 'Saved' }
  } catch (err) {
    savedIMMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingIM.value = false
  }
}

async function startBridge() {
  startingBridge.value = true
  try {
    imStatus.value = await window.electronAPI.im.start()
  } finally {
    startingBridge.value = false
  }
}

async function stopBridge() {
  imStatus.value = await window.electronAPI.im.stop()
}

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
    h('path', { d: 'M12 22V16' }),
    h('path', { d: 'M8 22V16' }),
    h('path', { d: 'M16 22V16' }),
    h('rect', { x: '6', y: '10', width: '12', height: '6', rx: '2' }),
    h('path', { d: 'M9 10V7a3 3 0 0 1 6 0v3' }),
  ])
})

const IconDeepSeek = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' }),
    h('path', { d: 'M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z' }),
    h('path', { d: 'M12 8V6M12 18v-2M8 12H6M18 12h-2' })
  ])
})

const providerOptions = [
  { value: 'openai',      label: 'OpenAI (Compatible)',        icon: IconOpenAI      },
  { value: 'anthropic',   label: 'Anthropic',                  icon: IconAnthropic   },
  { value: 'openrouter',  label: 'OpenRouter',                 icon: IconOpenRouter  },
  { value: 'deepseek',    label: 'DeepSeek',                   icon: IconDeepSeek    },
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

const filteredDeepSeekModels = computed(() => {
  if (!deepseekModelFilter.value) return modelsStore.deepseekModels
  const q = deepseekModelFilter.value.toLowerCase()
  return modelsStore.deepseekModels.filter(m => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
})


// ── Test Connection (new unified approach using agent:test-provider IPC) ─────
const canTestAnthropic  = computed(() => !!(form.anthropic.apiKey  && form.anthropic.baseURL  && testModelAnthropicTemp.value))
const canTestOpenRouter = computed(() => !!(form.openrouter.apiKey && form.openrouter.baseURL && testModelOpenRouterTemp.value))
const canTestOpenAI     = computed(() => !!(form.openai.apiKey     && form.openai.baseURL     && testModelOpenAITemp.value))
const canTestDeepSeek   = computed(() => !!(form.deepseek.apiKey   && form.deepseek.baseURL   && testModelDeepSeekTemp.value))

const testModelTempMap = {
  anthropic:  testModelAnthropicTemp,
  openrouter: testModelOpenRouterTemp,
  openai:     testModelOpenAITemp,
  deepseek:   testModelDeepSeekTemp,
}

async function testProviderConnection(provider) {
  testingProvider.value = provider
  testResults.value[provider] = null
  const pCfg = form[provider]
  const pingModel = testModelTempMap[provider]?.value?.trim()
  try {
    const res = await window.electronAPI.testProvider({
      provider,
      apiKey: pCfg.apiKey,
      baseURL: pCfg.baseURL,
      utilityModel: pingModel,
    })
    if (res.success) {
      form[provider].isActive = true
      form[provider].testedAt = Date.now()
      testResults.value[provider] = { ok: true, message: `Connected \u00B7 ${res.ms}ms` }
    } else {
      form[provider].isActive = false
      testResults.value[provider] = { ok: false, message: res.error }
    }
    // Auto-save the isActive + testedAt
    await configStore.saveConfig(JSON.parse(JSON.stringify(form)))
  } catch (err) {
    form[provider].isActive = false
    testResults.value[provider] = { ok: false, message: err.message || 'Test failed' }
  } finally {
    testingProvider.value = null
  }
}

async function testUtilityModel() {
  if (testingUtilityModel.value || !form.utilityModel.provider || !form.utilityModel.model) return
  testingUtilityModel.value = true
  testUtilityModelResult.value = null
  const provider = form.utilityModel.provider
  const pCfg = form[provider] || {}
  try {
    const res = await window.electronAPI.testProvider({
      provider,
      apiKey: pCfg.apiKey,
      baseURL: pCfg.baseURL,
      utilityModel: form.utilityModel.model,
    })
    if (res.success) {
      testUtilityModelResult.value = { ok: true, message: `Connected \u00B7 ${res.ms}ms` }
    } else {
      testUtilityModelResult.value = { ok: false, message: res.error }
    }
  } catch (err) {
    testUtilityModelResult.value = { ok: false, message: err.message || 'Test failed' }
  } finally {
    testingUtilityModel.value = false
  }
}

const form = reactive({
  anthropic: {
    apiKey:      '',
    baseURL:     '',
    sonnetModel: '',
    opusModel:   '',
    haikuModel:  '',
    isActive:    false,
    testedAt:    null,
  },
  openrouter: {
    apiKey:  '',
    baseURL: '',
    isActive:    false,
    testedAt:    null,
  },
  openai: {
    apiKey:       '',
    baseURL:      '',
    isActive:    false,
    testedAt:    null,
  },
  deepseek: {
    apiKey:    '',
    baseURL:   '',
    isActive:    false,
    testedAt:    null,
    maxTokens: 8192,
  },
  utilityModel: {
    provider: '',
    model:    '',
  },
  skillsPath:  '',
  pineconeApiKey:      '',
  ragEnabled:          true,
  dataPath:            '',
  artifactPath:        '',
  maxOutputTokens:     32768,
  voiceCall: {
    whisperApiKey:  '',
    whisperBaseURL: '',
    ttsMode: 'browser',
    language: '',
    vadAmplitude:      0.018,
    vadSilenceMs:      700,
    vadSpeechFrames:   20,
    vadVoiceBandRatio: 0.25,
    vadProximityMult:  2.5,
    isActive: false,
  },
  smtp: {
    host: '',
    port: 587,
    user: '',
    pass: '',
  },
  pricing: {
    models: {},
    modelPriceMap: {},
    currencyRates: { USD: 1, CNY: 7.28, SGD: 1.35 },
  },
  im: {
    telegram: {
      enabled: false,
      botToken: '',
      allowedUsers: [],
    },
  },
})

// Reset isActive when key fields change (skip initial population)
const formReady = ref(false)
function resetActive(provider) {
  if (!formReady.value) return
  form[provider].isActive = false
  testResults.value[provider] = null
}
watch(() => [form.anthropic.apiKey, form.anthropic.baseURL], () => resetActive('anthropic'))
watch(() => [form.openrouter.apiKey, form.openrouter.baseURL], () => resetActive('openrouter'))
watch(() => [form.openai.apiKey, form.openai.baseURL], () => resetActive('openai'))
watch(() => [form.deepseek.apiKey, form.deepseek.baseURL], () => resetActive('deepseek'))

onMounted(async () => {
  const c = JSON.parse(JSON.stringify(configStore.config))
  delete c.defaultProvider
  // Deep-merge nested provider objects
  if (c.anthropic)    Object.assign(form.anthropic, c.anthropic)
  if (c.openrouter)   Object.assign(form.openrouter, c.openrouter)
  if (c.openai)       Object.assign(form.openai, c.openai)
  if (c.deepseek)     Object.assign(form.deepseek, c.deepseek)
  if (c.voiceCall)    Object.assign(form.voiceCall, c.voiceCall)
  if (c.smtp)         Object.assign(form.smtp, c.smtp)
  if (c.utilityModel) Object.assign(form.utilityModel, c.utilityModel)
  form.im = {
    telegram: {
      enabled:      c.im?.telegram?.enabled      ?? false,
      botToken:     c.im?.telegram?.botToken      ?? '',
      allowedUsers: c.im?.telegram?.allowedUsers  ?? [],
    },
  }
  form.pricing = {
    models: {},
    modelPriceMap: {},
    currencyRates: { USD: 1, CNY: 7.28, SGD: 1.35 },
    ...(c.pricing || {})
  }
  // Merge top-level scalar fields
  const NESTED_KEYS = new Set(['anthropic', 'openrouter', 'openai', 'deepseek', 'voiceCall', 'smtp', 'utilityModel', 'pricing'])
  for (const key of Object.keys(c)) {
    if (!NESTED_KEYS.has(key) && key in form) {
      form[key] = c[key]
    }
  }
  // Load Pinecone config from .env via knowledge IPC
  if (window.electronAPI?.knowledge?.getConfig) {
    const kc = await window.electronAPI.knowledge.getConfig()
    form.pineconeApiKey = kc.pineconeApiKey || ''
    form.ragEnabled = kc.ragEnabled !== false
  }
  // Load data path from .env via main process
  if (window.electronAPI?.getDataPath) {
    const info = await window.electronAPI.getDataPath()
    defaultDataPath.value = info.defaultDataPath || ''
    form.dataPath = info.dataPath || info.defaultDataPath || ''
  }
  // Load env-backed paths (skillsPath, artifactPath)
  if (window.electronAPI?.getEnvPaths) {
    const envPaths = await window.electronAPI.getEnvPaths()
    form.skillsPath  = envPaths.skillsPath  || ''
    form.artifactPath = envPaths.artifactPath || ''
  }
  // Load sandboxConfig for security tab
  const sc = c.sandboxConfig || {}
  sandboxForm.defaultMode = sc.defaultMode || 'sandbox'
  sandboxForm.sandboxAllowList = JSON.parse(JSON.stringify(sc.sandboxAllowList || []))
  sandboxForm.dangerBlockList  = JSON.parse(JSON.stringify(sc.dangerBlockList  || []))
  // Load IM bridge status
  await loadIMStatus()
  // Enable watcher-based isActive reset now that initial population is done
  nextTick(() => { formReady.value = true })
})

async function fetchOrModels() {
  if (!window.electronAPI?.fetchOpenRouterModels) { orModelsFetchError.value = 'Not running inside Electron.'; return }
  if (!form.openrouter.apiKey) { orModelsFetchError.value = 'Enter an API key first.'; return }
  orModelsFetching.value = true
  orModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenRouterModels({ apiKey: form.openrouter.apiKey, baseURL: form.openrouter.baseURL })
    if (result.success) { modelsStore.openrouterModels = result.models; modelsStore.openrouterCached = true; orSelectedTestModel.value = '' }
    else { orModelsFetchError.value = result.error || 'Unknown error' }
  } catch (err) { orModelsFetchError.value = err.message }
  finally { orModelsFetching.value = false }
}

async function fetchOpenAIModelsLocal() {
  if (!window.electronAPI?.fetchOpenAIModels) { openaiModelsFetchError.value = 'Not running inside Electron.'; return }
  if (!form.openai.apiKey) { openaiModelsFetchError.value = 'Enter an API key first.'; return }
  openaiModelsFetching.value = true
  openaiModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenAIModels({ apiKey: form.openai.apiKey, baseURL: form.openai.baseURL })
    if (result.success) { modelsStore.openaiModels = result.models; modelsStore.openaiCached = true; openaiSelectedTestModel.value = '' }
    else { openaiModelsFetchError.value = result.error || 'Unknown error' }
  } catch (err) { openaiModelsFetchError.value = err.message }
  finally { openaiModelsFetching.value = false }
}

async function fetchDeepSeekModels() {
  if (!form.deepseek.apiKey) { deepseekModelsFetchError.value = 'Enter an API key first.'; return }
  if (!form.deepseek.baseURL) { deepseekModelsFetchError.value = 'Enter a Base URL first.'; return }
  deepseekModelsFetching.value = true
  deepseekModelsFetchError.value = ''
  try {
    // Sync current form values into config store so the store fetch picks them up
    configStore.config.deepseek = configStore.config.deepseek || {}
    configStore.config.deepseek.apiKey = form.deepseek.apiKey
    configStore.config.deepseek.baseURL = form.deepseek.baseURL
    await modelsStore.fetchDeepSeekModels()
    if (!modelsStore.deepseekCached) { deepseekModelsFetchError.value = 'Fetch failed — check API key and Base URL.'; return }
    deepseekSelectedTestModel.value = ''
  } catch (err) { deepseekModelsFetchError.value = err.message }
  finally { deepseekModelsFetching.value = false }
}

async function saveGeneral() {
  savingGeneral.value = true
  try {
    // Save dataPath to .env (not config.json)
    if (window.electronAPI?.saveDataPath) {
      const result = await window.electronAPI.saveDataPath(String(form.dataPath))
      if (!result.success) throw new Error(result.error || 'Failed to save data path')
    }
    // Save artifactPath to .env
    await configStore.saveEnvPath('artifactPath', String(form.artifactPath))
    // Save skillsPath to config (merged into Paths section)
    await configStore.saveEnvPath('skillsPath', String(form.skillsPath))
    savedGeneralMsg.value = { ok: true, text: 'Saved — restart app for data path changes' }
  } catch (err) {
    savedGeneralMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingGeneral.value = false
    setTimeout(() => { savedGeneralMsg.value = '' }, 4000)
  }
}

async function saveModels() {
  if (!form.utilityModel.provider || !form.utilityModel.model) {
    savedModelsMsg.value = { ok: false, text: 'Utility Model is required — select a provider and model in Global Model Settings' }
    setTimeout(() => { savedModelsMsg.value = '' }, 5000)
    return
  }
  savingModels.value = true
  try {
    const modelFields = JSON.parse(JSON.stringify(form))
    delete modelFields.skillsPath
    delete modelFields.dataPath
    delete modelFields.artifactPath
    delete modelFields.DoCPath
    delete modelFields.voiceCall
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
    await configStore.saveEnvPath('skillsPath', String(form.skillsPath))
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

async function saveVoice() {
  savingVoice.value = true
  try {
    await configStore.saveConfig({ voiceCall: JSON.parse(JSON.stringify(form.voiceCall)) })
    savedVoiceMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedVoiceMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingVoice.value = false
    setTimeout(() => { savedVoiceMsg.value = null }, 3000)
  }
}

async function testWhisperConnection() {
  const key = form.voiceCall.whisperApiKey
  if (!key) { testResultWhisper.value = { ok: false, message: 'Enter a Whisper API key first.' }; return }
  testingWhisper.value = true
  testResultWhisper.value = null
  try {
    // Send a tiny silent WAV to Whisper to verify credentials
    const baseURL = (form.voiceCall.whisperBaseURL || 'https://api.openai.com').replace(/\/+$/, '')
    const isStandard = baseURL.includes('api.openai.com')
    const url = isStandard ? `${baseURL}/v1/models` : `${baseURL}/proxy/openai/v1/models`
    const authHeader = isStandard ? { 'Authorization': `Bearer ${key}` } : { 'x-api-key': key }
    const resp = await fetch(url, { headers: authHeader })
    if (resp.ok) {
      testResultWhisper.value = { ok: true, message: 'Connected — Whisper API key is valid' }
      form.voiceCall.isActive = true
      await configStore.saveConfig({ voiceCall: JSON.parse(JSON.stringify(form.voiceCall)) })
    } else {
      const body = await resp.text()
      testResultWhisper.value = { ok: false, message: `API error ${resp.status}: ${body.slice(0, 120)}` }
      form.voiceCall.isActive = false
    }
  } catch (err) {
    testResultWhisper.value = { ok: false, message: err.message }
    form.voiceCall.isActive = false
  } finally {
    testingWhisper.value = false
  }
}

async function demoTts(mode) {
  // Stop anything currently playing
  if (_demoAudio) { _demoAudio.pause(); _demoAudio = null }
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()

  const DEMO_TEXT = "Hello, I'm ClankAI. How can I help you today?"

  demoingTts.value = mode
  try {
    if (mode === 'browser') {
      await new Promise((resolve, reject) => {
        const utt = new SpeechSynthesisUtterance(DEMO_TEXT)
        utt.onend = resolve
        utt.onerror = reject
        window.speechSynthesis.speak(utt)
      })
    } else {
      const key = form.voiceCall.whisperApiKey
      if (!key) return
      const ttsModel = mode === 'openai-hd' ? 'tts-1-hd' : 'tts-1'
      const baseURL = (form.voiceCall.whisperBaseURL || 'https://api.openai.com').replace(/\/+$/, '')
      const isStandard = baseURL.includes('api.openai.com')
      const url = isStandard ? `${baseURL}/v1/audio/speech` : `${baseURL}/proxy/openai/v1/audio/speech`
      const authHeader = isStandard ? { 'Authorization': `Bearer ${key}` } : { 'x-api-key': key }
      const resp = await fetch(url, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ttsModel, input: DEMO_TEXT, voice: 'alloy' }),
      })
      if (!resp.ok) throw new Error(`TTS API error ${resp.status}`)
      const blob = await resp.blob()
      const audio = new Audio(URL.createObjectURL(blob))
      _demoAudio = audio
      await new Promise((resolve, reject) => {
        audio.onended = resolve
        audio.onerror = reject
        audio.play()
      })
    }
  } catch (_) {
    // Silently swallow — user can see nothing happened
  } finally {
    demoingTts.value = null
    _demoAudio = null
  }
}

async function saveEmail() {
  savingEmail.value = true
  try {
    await configStore.saveConfig({ smtp: JSON.parse(JSON.stringify(form.smtp)) })
    savedEmailMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedEmailMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingEmail.value = false
    setTimeout(() => { savedEmailMsg.value = null }, 3000)
  }
}

async function testSmtpConnection() {
  if (!form.smtp.host || !form.smtp.user || !form.smtp.pass) {
    testResultSmtp.value = { ok: false, message: 'Fill in host, user, and password first.' }
    return
  }
  if (!window.electronAPI?.testSmtp) {
    testResultSmtp.value = { ok: false, message: 'Not running inside Electron.' }
    return
  }
  testingSmtp.value = true
  testResultSmtp.value = null
  try {
    const result = await window.electronAPI.testSmtp(JSON.parse(JSON.stringify(form.smtp)))
    testResultSmtp.value = result.success
      ? { ok: true, message: 'Connected — SMTP credentials verified' }
      : { ok: false, message: result.error || 'Connection failed' }
  } catch (err) {
    testResultSmtp.value = { ok: false, message: err.message }
  } finally {
    testingSmtp.value = false
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

// ── Pricing tab state ────────────────────────────────────────────────────────
const isFetchingPrices = ref(false)
const pricingSaved = ref(false)
const newModelId   = ref('')
const newAliasFrom = ref('')
const newAliasTo   = ref('')
const priceFilter  = ref('')

const mergedPriceRows = computed(() => {
  const userModels = form.pricing?.models || {}
  const merged = { ...DEFAULT_PRICES }
  for (const [k, v] of Object.entries(userModels)) {
    if (v?._deleted) { delete merged[k]; continue }
    merged[k] = { ...merged[k], ...v }
  }
  return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)))
})

const filteredPriceRows = computed(() => {
  const q = priceFilter.value.trim().toLowerCase()
  if (!q) return mergedPriceRows.value
  return Object.fromEntries(
    Object.entries(mergedPriceRows.value).filter(([id]) => id.toLowerCase().includes(q))
  )
})

const allKnownModelIds = computed(() => Object.keys(mergedPriceRows.value))

function onPriceEdit(modelId, row) {
  if (!form.pricing.models) form.pricing.models = {}
  form.pricing.models[modelId] = { input: row.input || 0, output: row.output || 0, cacheWrite: row.cacheWrite || 0, cacheRead: row.cacheRead || 0 }
}

function resetModelPrice(modelId) {
  if (form.pricing?.models?.[modelId]) {
    delete form.pricing.models[modelId]
  }
}

function deleteModelPrice(modelId) {
  if (!form.pricing.models) form.pricing.models = {}
  // Mark as deleted by storing a sentinel so mergedPriceRows excludes it
  form.pricing.models[modelId] = { _deleted: true }
}

function addCustomModel() {
  const id = newModelId.value.trim()
  if (!id) return
  if (!form.pricing.models) form.pricing.models = {}
  form.pricing.models[id] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  newModelId.value = ''
}

function addAlias() {
  if (!newAliasFrom.value.trim() || !newAliasTo.value) return
  if (!form.pricing.modelPriceMap) form.pricing.modelPriceMap = {}
  form.pricing.modelPriceMap[newAliasFrom.value.trim()] = newAliasTo.value
  newAliasFrom.value = ''
  newAliasTo.value = ''
}

function deleteAlias(alias) {
  if (form.pricing?.modelPriceMap) delete form.pricing.modelPriceMap[alias]
}

async function fetchOpenRouterPrices() {
  isFetchingPrices.value = true
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/models')
    const data = await resp.json()
    if (!form.pricing.models) form.pricing.models = {}
    for (const m of (data.data || [])) {
      const id = m.id
      const pricing = m.pricing
      if (!id || !pricing) continue
      form.pricing.models[id] = {
        input:      parseFloat(pricing.prompt)     * 1_000_000 || 0,
        output:     parseFloat(pricing.completion) * 1_000_000 || 0,
        cacheWrite: 0,
        cacheRead:  0,
      }
    }
  } catch (err) {
    console.error('fetchOpenRouterPrices error', err)
  } finally {
    isFetchingPrices.value = false
  }
}

async function savePricing() {
  // Strip _deleted sentinels before persisting
  const cleanModels = {}
  for (const [k, v] of Object.entries(form.pricing?.models || {})) {
    if (!v?._deleted) cleanModels[k] = v
  }
  configStore.config.pricing = { ...form.pricing, models: cleanModels }
  await configStore.saveConfig()
  pricingSaved.value = true
  setTimeout(() => { pricingSaved.value = false }, 2000)
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

/* ── Primary tab bar ────────────────────────────────────────────────────── */
.config-primary-tabs {
  display: flex;
  gap: 4px;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}
.config-primary-tab {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.75rem 1.125rem;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.config-primary-tab:hover { color: var(--text-primary); }
.config-primary-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}
.config-tab-icon { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Two-column body ─────────────────────────────────────────────────────── */
.config-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Left sub-nav ────────────────────────────────────────────────────────── */
.config-subnav {
  width: 11rem;
  min-width: 11rem;
  padding: 0.75rem 0.5rem;
  border-right: 1px solid var(--border);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow-y: auto;
  flex-shrink: 0;
}
@media (min-width: 2560px) {
  .config-subnav { width: 12.5rem; min-width: 12.5rem; }
}
.config-subnav-item {
  display: flex;
  align-items: center;
  gap: 0.5625rem;
  padding: 0.5625rem 0.75rem;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: var(--text-secondary);
  text-align: left;
  transition: all 0.15s ease;
  width: 100%;
}
.config-subnav-item:hover:not(.active) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.config-subnav-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.config-subnav-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
.config-subnav-label { flex: 1; }
.config-subnav-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.config-subnav-dot { background: #EF4444; }
.config-subnav-item.active .config-subnav-dot { background: #FCA5A5; }

/* ── Content area ───────────────────────────────────────────────────────── */
.config-content { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem 2rem 2rem; scrollbar-width: thin; }
.config-content-inner { max-width: 860px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
@media (min-width: 2560px) {
  .config-content-inner { max-width: 1000px; }
}

/* ── Provider tabs ──────────────────────────────────────────────────────── */
.provider-tab-group { display: flex; gap: 2px; margin-bottom: 4px; }
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
.form-label-hint { color: var(--text-muted); font-weight: 400; margin-left: 0.25rem; font-size: var(--fs-caption); font-family: 'JetBrains Mono', monospace; }
.form-divider { height: 1px; background: var(--border); margin: 1rem 0; }


.form-section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.section-icon-sm { width: 1.75rem; height: 1.75rem; border-radius: 0.4375rem; display: flex; align-items: center; justify-content: center; background: var(--text-primary); color: #fff; flex-shrink: 0; }
.form-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700; color: var(--text-primary); margin: 0; }
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

/* ── Input with trailing button ────────────────────────────────────────── */
.input-with-trailing-btn { display: flex; gap: 6px; align-items: stretch; }
.input-with-trailing-btn .field { flex: 1; }
.open-folder-btn {
  display: flex; align-items: center; justify-content: center;
  padding: 0 10px; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; cursor: pointer; transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.open-folder-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.field-action-btn.danger:hover { color: #FF3B30; }

/* ── Icon sizes ─────────────────────────────────────────────────────────── */
.icon-sm { width: 18px; height: 18px; flex-shrink: 0; }
.icon-xs { width: 14px; height: 14px; flex-shrink: 0; }

/* ── Models grid ────────────────────────────────────────────────────────── */
.models-grid { display: flex; flex-direction: column; gap: 0; }

/* ── Model list area ────────────────────────────────────────────────────── */
.model-list-area { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }

/* ── Model filter + select ──────────────────────────────────────────────── */
.model-filter {
  width: 100%; display: block;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: var(--fs-secondary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.model-filter::placeholder { color: var(--text-muted); }
.model-filter:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

.model-list {
  width: 100%;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  padding: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: #D1D1D6 transparent;
}
.model-list:focus-within { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

.model-list-item {
  padding: 0.3125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: var(--fs-caption);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s, color 0.1s;
  user-select: none;
}
.model-list-item:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FFFFFF; }
.model-list-item.selected {
  background: #1A1A1A;
  color: #FFFFFF;
}

/* ── Test connection row ────────────────────────────────────────────────── */
.test-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.test-result {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 10px 14px;
  border-radius: var(--radius-sm); font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.test-result.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; }
.test-result.success .icon-sm { color: #FFFFFF; }
.test-result.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FF6B6B; }
.test-result.error .icon-sm { color: #FF6B6B; }

/* ── Simple test row (selected model label + Test button) ───────────────── */
.test-simple-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.test-selected-label {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* ── Provider status dot on tab buttons ────────────────────────────────── */
.prov-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-left: 2px;
}
.prov-dot.active   { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.prov-dot.inactive { background: #9CA3AF; }
.cfg-required { color: #EF4444; margin-left: 2px; }
.cfg-hint { display: block; font-size: var(--fs-caption); color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }

/* ── Save row ───────────────────────────────────────────────────────────── */
.save-row { display: flex; align-items: center; gap: 12px; }
.save-indicator {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  padding: 6px 14px; border-radius: 8px; animation: fadeIn 0.2s ease;
}
.save-indicator.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.save-indicator.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FF6B6B; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Inline code ────────────────────────────────────────────────────────── */
.inline-code {
  font-family: 'JetBrains Mono', monospace; font-size: 0.85em;
  background: var(--accent-light, rgba(0,122,255,0.08)); color: var(--accent, #007AFF);
  padding: 1px 4px; border-radius: 4px;
}

/* ── Security tab ───────────────────────────────────────────────────────── */
.sec-mode-btns {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.sec-mode-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px; border: 1px solid #E5E5EA;
  background: #FFFFFF; color: #6B7280; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; cursor: pointer;
  transition: all 0.15s ease;
}
.sec-mode-btn:hover { border-color: #1A1A1A; color: #1A1A1A; }
.sec-mode-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent; color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.sec-mode-badge {
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em;
  background: rgba(255,255,255,0.15); padding: 1px 5px; border-radius: 99px;
}
.sec-mode-btn:not(.active) .sec-mode-badge {
  background: #F0F0F0; color: #9CA3AF;
}
/* ── TTS option list ────────────────────────────────────────────────────── */
.tts-option-list { display: flex; flex-direction: column; gap: 0.5rem; }
.tts-option {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border);
  background: var(--bg-card); cursor: pointer; transition: all 0.15s ease;
}
.tts-option:hover { border-color: #C0C0C0; background: var(--bg-hover); }
.tts-option.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.tts-option-left { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }
.tts-option-icon {
  width: 2rem; height: 2rem; border-radius: 0.5rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.06); color: #6B7280;
  transition: all 0.15s ease;
}
.tts-option.active .tts-option-icon { background: rgba(255,255,255,0.12); color: #FFFFFF; }
.tts-option-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: var(--text-primary); display: flex; align-items: center; gap: 0.375rem;
}
.tts-option.active .tts-option-name { color: #FFFFFF; }
.tts-option-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); color: var(--text-muted);
  margin-top: 0.125rem; line-height: 1.4;
}
.tts-option.active .tts-option-desc { color: rgba(255,255,255,0.55); }
.tts-cost-badge {
  font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em;
  background: rgba(0,0,0,0.07); color: #6B7280;
  padding: 1px 5px; border-radius: 99px;
}
.tts-option.active .tts-cost-badge { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.7); }
.tts-demo-btn {
  display: flex; align-items: center; gap: 0.3125rem; flex-shrink: 0;
  padding: 0.3125rem 0.625rem; border-radius: var(--radius-sm);
  border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.04);
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease;
  white-space: nowrap;
}
.tts-demo-btn:hover:not(:disabled) { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.tts-demo-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tts-demo-btn.playing { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.tts-option.active .tts-demo-btn {
  border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #FFFFFF;
}
.tts-option.active .tts-demo-btn:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
.tts-option.active .tts-demo-btn.playing { background: rgba(255,255,255,0.18); }

.sec-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: #F0F0F0; color: #6B7280;
  border-radius: 99px; font-size: 0.65rem; font-weight: 700;
  margin-left: 6px; vertical-align: middle;
}
.sec-count-badge.danger { background: rgba(239,68,68,0.1); color: #DC2626; }
.sec-list {
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;
  max-height: 220px; overflow-y: auto;
}
.sec-list-empty {
  font-size: var(--fs-caption); color: #9CA3AF;
  padding: 8px 0; font-style: italic;
}
.sec-list-entry {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 7px 10px; background: #F9F9F9; border: 1px solid #E5E5EA;
  border-radius: 8px;
}
.sec-entry-info {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
}
.sec-entry-pattern {
  font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
  color: #1A1A1A; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sec-entry-pattern.danger { color: #DC2626; }
.sec-entry-desc {
  font-size: var(--fs-small); color: #9CA3AF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sec-entry-delete {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex-shrink: 0;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px; color: #DC2626; cursor: pointer; transition: all 0.15s;
}
.sec-entry-delete:hover { background: rgba(239,68,68,0.18); }
.sec-add-row {
  display: flex; gap: 6px; align-items: center; margin-top: 2px;
}
.sec-add-input {
  flex: 1; min-width: 0; padding: 6px 10px;
  background: #FFFFFF; border: 1px solid #E5E5EA;
  border-radius: 8px; color: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); outline: none;
  transition: border-color 0.15s;
}
.sec-add-input:focus { border-color: #1A1A1A; }
.sec-add-input::placeholder { color: #9CA3AF; }
.sec-add-btn {
  padding: 6px 14px; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 8px; color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600; cursor: pointer; transition: all 0.15s;
  white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.sec-add-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.sec-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sec-add-btn.danger {
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  color: #DC2626; box-shadow: none;
}
.sec-add-btn.danger:hover { background: rgba(239,68,68,0.18); }

/* ── Voice tab ─────────────────────────────────────────────────────────── */
.vad-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 4px;
}
.vad-slider {
  width: 100%;
  accent-color: var(--text-primary);
  cursor: pointer;
  margin: 6px 0 2px;
}
.vad-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-small);
  color: var(--text-muted);
  margin-bottom: 4px;
}

/* Pricing table */
.pricing-table-header,
.pricing-table-row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr 2rem 2rem;
  gap: 0.5rem;
  align-items: center;
  padding: 0.375rem 0;
}
.pricing-table-header {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
  margin-bottom: 0.25rem;
}
.pricing-table-row {
  border-bottom: 1px solid var(--border-light);
}
.pricing-table-row:last-child { border-bottom: none; }

/* Pricing save row */
.config-save-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.save-status {
  display: inline-flex;
  align-items: center;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  padding: 0.375rem 0.875rem;
  border-radius: 0.5rem;
  animation: fadeIn 0.2s ease;
}
.save-status.saved {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* Pricing action button */
.action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border-radius: var(--radius-sm, 0.5rem);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  white-space: nowrap;
  flex-shrink: 0;
}
.action-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* form-section-desc used in pricing cards */
.form-section-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin: 0.125rem 0 0;
}
</style>
