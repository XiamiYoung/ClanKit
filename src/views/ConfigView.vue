<template>
  <div class="config-page">

    <!-- Header -->
    <div class="config-header">
      <div class="config-header-top">
        <div>
          <h1 class="config-title">{{ t('config.title') }}</h1>
          <p class="config-subtitle">{{ t('config.configSubtitle') }}</p>
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
        <!-- Language (General > Language) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'language'">

          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3 class="form-section-title">Language / 语言</h3>
            </div>
            <div class="form-group">
              <label class="form-label">{{ form.language === 'zh' ? '应用语言' : 'Application Language' }}</label>
              <select v-model="form.language" class="field" @change="handleLanguageChange">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
              <p class="hint">
                {{ form.language === 'zh' ? '选择应用的默认语言。这将用于界面文字和新创建智能体的默认语言。' : 'Select the default language for the application. This will be used for UI text and as the default language for new agents.' }}
              </p>
            </div>
          </div>

        </template>

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
              <h3 class="form-section-title">{{ t('config.dataPath') }}</h3>
              <span class="form-label-hint">CLANKAI_DATA_PATH</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="dataPath" type="text" :value="form.dataPath || defaultDataPath" readonly class="field font-mono" style="background:#f5f5f5;" />
              </div>
              <p class="hint">
                {{ t('config.dataPathHint') }} <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultDataPath }}</code>
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
              <h3 class="form-section-title">{{ t('config.artifactPath') }}</h3>
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
                {{ t('config.artifactPathHint') }} <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultArtifactPath }}</code>
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
              <h3 class="form-section-title">{{ t('config.skillsPath') }}</h3>
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
              <p class="hint">{{ t('config.skillsPathHint') }}</p>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveGeneral" :disabled="savingGeneral" :loading="savingGeneral">
              <svg v-if="!savingGeneral" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
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

          <!-- New layout: left sidebar + right content -->
          <div class="models-page-layout">
            <!-- Left Sidebar -->
            <div class="models-left-nav">
              <!-- Add button -->
              <button class="models-add-btn" @click="showAddProviderModal = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                <span>{{ t('common.add', 'Add Provider') }}</span>
              </button>

              <div class="models-nav-divider"></div>

              <!-- Models section -->
              <div class="models-nav-section">
                <div class="models-nav-section-label">{{ t('config.models') }}</div>
                <button
                  v-for="p in configStore.config.providers"
                  :key="p.id"
                  class="models-nav-item"
                  :class="{ active: modelsLeftNav === p.id }"
                  @click="modelsLeftNav = p.id"
                >
                  <span class="models-nav-name">{{ p.name }}</span>
                  <span class="models-nav-dot" :class="p.isActive ? 'active' : 'inactive'"></span>
                </button>
                <div v-if="configStore.config.providers.length === 0" class="models-nav-empty">
                  No providers configured
                </div>
              </div>

              <div class="models-nav-divider"></div>

              <!-- Global Settings section -->
              <div class="models-nav-section">
                <div class="models-nav-section-label">{{ t('config.globalSettings') }}</div>
                <button
                  class="models-nav-item"
                  :class="{ active: modelsLeftNav === 'global' }"
                  @click="modelsLeftNav = 'global'"
                >
                  <span class="models-nav-name">{{ t('config.models', 'Models') }}</span>
                </button>
                <button
                  class="models-nav-item"
                  :class="{ active: modelsLeftNav === 'utility' }"
                  @click="modelsLeftNav = 'utility'"
                >
                  <span class="models-nav-name">{{ t('config.utilityModel', 'Utility Model') }}</span>
                </button>
              </div>
            </div>

            <!-- Right Content -->
            <div class="models-right-content">
              <!-- Empty state -->
              <template v-if="modelsLeftNav === 'empty'">
                <div class="config-card">
                  <div style="text-align:center; padding: 3rem 1rem; color: var(--text-muted);">
                    <svg style="width:48px;height:48px;margin:0 auto 1rem;display:block;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    <p style="font-size:var(--fs-body); margin-bottom:0.5rem;">Select a provider or setting to configure</p>
                    <p style="font-size:var(--fs-secondary);">Click the <span style="font-weight:600;">+</span> button to add a new provider</p>
                  </div>
                </div>
              </template>

              <!-- Global Model Settings -->
              <template v-else-if="modelsLeftNav === 'global'">
                <div class="config-card">
                  <div class="form-section-header">
                    <div class="section-icon-sm">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/>
                      </svg>
                    </div>
                    <h3 class="form-section-title">{{ t('config.models', 'Models') }}</h3>
                  </div>
                  <div class="form-group">
                    <label for="maxOutputTokens" class="form-label">
                      Max Output Tokens
                      <span class="form-label-hint">{{ t('config.perTurnOutputLimit') }}</span>
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
                </div>
                <div class="save-row">
                  <AppButton size="save" @click="saveModels" :disabled="savingModels" :loading="savingModels">
                    <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                  </AppButton>
                  <span v-if="savedModelsMsg" class="save-indicator" :class="savedModelsMsg.ok ? 'success' : 'error'">
                    <svg v-if="savedModelsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ savedModelsMsg.text }}
                  </span>
                </div>
              </template>

              <!-- Utility Model -->
              <template v-else-if="modelsLeftNav === 'utility'">
                <div class="config-card">
                  <div class="form-section-header">
                    <div class="section-icon-sm">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <h3 class="form-section-title">{{ t('config.utilityModel', 'Utility Model') }}</h3>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">
                      Utility Model <span class="cfg-required">*</span>
                      <span class="form-label-hint">{{ t('config.backgroundTasks') }}</span>
                    </label>
                    <div class="test-connection-row">
                      <div style="flex:1;">
                        <ProviderModelPicker
                          :provider="form.utilityModel.provider"
                          :model="form.utilityModel.model"
                          @update:provider="form.utilityModel.provider = $event; form.utilityModel.model = ''; testUtilityModelResult = null"
                          @update:model="form.utilityModel.model = $event; testUtilityModelResult = null"
                        />
                      </div>
                      <AppButton
                        size="compact"
                        :disabled="testingUtilityModel || !form.utilityModel.provider || !form.utilityModel.model"
                        :loading="testingUtilityModel"
                        @click="testUtilityModel"
                      >
                        <svg v-if="!testingUtilityModel" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        {{ testingUtilityModel ? 'Testing…' : 'Test' }}
                      </AppButton>
                    </div>
                    <div v-if="testUtilityModelResult" class="test-result" :class="testUtilityModelResult.ok ? 'success' : 'error'" style="margin-top:0.375rem;">
                      {{ testUtilityModelResult.message }}
                    </div>
                    <p class="hint">
                      Used for generic background Tasks.
                      Pick the cheapest/fastest model across any active provider.
                    </p>
                  </div>
                </div>
                <div class="save-row">
                  <AppButton size="save" @click="saveModels" :disabled="savingModels" :loading="savingModels">
                    <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                  </AppButton>
                  <span v-if="savedModelsMsg" class="save-indicator" :class="savedModelsMsg.ok ? 'success' : 'error'">
                    <svg v-if="savedModelsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ savedModelsMsg.text }}
                  </span>
                </div>
              </template>

              <!-- Provider Config -->
              <template v-else-if="selectedProvider">
                <div class="config-card">
                  <div class="form-section-header" style="justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div class="section-icon-sm">
                        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                      <h3 class="form-section-title">{{ selectedProvider.name }}</h3>
                    </div>
                    <div class="header-actions">
                      <button class="action-btn danger" @click="deleteProvider(selectedProvider.id)" :title="t('config.deleteProvider', 'Delete provider')">
                        <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                      <AppButton size="icon" @click="saveModels" :disabled="savingModels" :loading="savingModels" :title="t('common.save', 'Save')">
                        <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                          <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                        </svg>
                      </AppButton>
                    </div>
                  </div>

                  <!-- Credentials -->
                  <div class="form-section-subheader">
                    <div class="section-icon-sm" style="width: 1.25rem; height: 1.25rem;">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem;">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    Credentials
                  </div>
                  <div class="form-group">
                    <label class="form-label">API Key</label>
                    <div class="input-with-action">
                      <input
                        v-model="selectedProvider.apiKey"
                        :type="showProviderKey ? 'text' : 'password'"
                        placeholder="sk-..."
                        class="field font-mono"
                      />
                      <button @click="showProviderKey = !showProviderKey" class="field-action-btn">
                        <svg v-if="!showProviderKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Base URL</label>
                    <input v-model="selectedProvider.baseURL" type="url" :placeholder="configStore.PROVIDER_PRESETS[selectedProvider.type]?.defaultBaseURL || 'https://...'" class="field" />
                  </div>

                  <!-- Model -->
                  <div class="form-divider"></div>
                  <div class="form-section-subheader">
                    <div class="section-icon-sm" style="width: 1.25rem; height: 1.25rem;">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      </svg>
                    </div>
                    {{ selectedProvider.type === 'anthropic' ? 'Models' : 'Available Models' }}
                  </div>

                  <!-- Anthropic: 3 model inputs with Test -->
                  <template v-if="selectedProvider.type === 'anthropic'">
                    <div class="form-group compact">
                      <label class="form-label">Sonnet Model</label>
                      <input v-model="selectedProvider.model" type="text" class="field font-mono" placeholder="claude-sonnet-latest" />
                    </div>
                    <div class="form-group compact">
                      <label class="form-label">Opus Model</label>
                      <input v-model="selectedProvider.settings.opusModel" type="text" class="field font-mono" placeholder="claude-opus-latest" />
                    </div>
                    <div class="form-group compact">
                      <label class="form-label">Haiku Model</label>
                      <input v-model="selectedProvider.settings.haikuModel" type="text" class="field font-mono" placeholder="claude-3-5-haiku-20241022" />
                    </div>
                    <div class="test-connection-row" style="margin-top: 0.5rem;">
                      <select v-model="selectedTestModel" class="field font-mono" style="flex:1;">
                        <option value="">Select a model...</option>
                        <option v-for="m in testableModels" :key="m.id" :value="m.id">{{ m.label }}</option>
                      </select>
                      <AppButton @click="testProviderNew" :disabled="testingProviderNew || !canTestNew" :loading="testingProviderNew">
                        <svg v-if="!testingProviderNew" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        {{ testingProviderNew ? 'Testing…' : 'Test' }}
                      </AppButton>
                    </div>
                    <div v-if="testResultNew" class="test-result" :class="testResultNew.ok ? 'success' : 'error'" style="margin-top: 0.5rem;">
                      <svg v-if="testResultNew.ok" class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ testResultNew.message }}</span>
                    </div>
                  </template>

                  <!-- Other providers: model list selection -->
                  <template v-else>
                    <div class="test-connection-row">
                      <div>
                        <p class="hint" style="margin-top:2px;">{{ selectedProviderModels.length > 0 ? `${selectedProviderModels.length} models loaded` : 'Enter API key and fetch models' }}</p>
                      </div>
                      <AppButton size="compact" @click="fetchProviderModels" :disabled="providerModelsFetching || !selectedProvider.apiKey || !selectedProvider.baseURL" :loading="providerModelsFetching">
                        <svg v-if="!providerModelsFetching" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        {{ providerModelsFetching ? 'Fetching…' : 'Fetch Models' }}
                      </AppButton>
                    </div>
                    <div v-if="selectedProviderModels.length > 0" style="margin-top: 0.5rem;">
                      <input v-model="providerModelFilter" type="text" placeholder="Filter models…" class="field font-mono field-sm" style="width: 100%; margin-bottom: 0.5rem;" />
                      <select v-model="selectedProvider.model" class="field font-mono field-sm" :size="Math.min(filteredProviderModels.length, 8)" style="width: 100%; height: auto; padding: 6px 8px;">
                        <option v-for="m in filteredProviderModels" :key="m.id" :value="m.id">{{ m.id }} — {{ m.name || m.id }}</option>
                      </select>
                      <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
                        <AppButton size="compact" @click="testProviderNew" :disabled="testingProviderNew || !canTestNew" :loading="testingProviderNew">
                          <svg v-if="!testingProviderNew" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          {{ testingProviderNew ? 'Testing…' : 'Test' }}
                        </AppButton>
                      </div>
                    </div>
                    <div v-if="providerModelsFetchError" class="test-result error" style="margin-top: 0.5rem;">
                      <svg class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ providerModelsFetchError }}</span>
                    </div>
                    <div v-if="testResultNew" class="test-result" :class="testResultNew.ok ? 'success' : 'error'" style="margin-top: 0.5rem;">
                      <svg v-if="testResultNew.ok" class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ testResultNew.message }}</span>
                    </div>
                  </template>

                  <!-- Generic Settings -->
                  <div class="form-divider"></div>
                  <div class="form-section-subheader">
                    <div class="section-icon-sm" style="width: 1.25rem; height: 1.25rem;">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem;">
                        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                      </svg>
                    </div>
                    Generic Settings
                  </div>
                  <div class="form-group">
                    <label class="form-label">
                      Max Output Tokens
                      <span v-if="getHardLimit(selectedProvider, 'maxOutputTokens')" class="form-label-hint" style="color:#EF4444;">
                        Max: {{ getHardLimit(selectedProvider, 'maxOutputTokens') }}
                      </span>
                    </label>
                    <input
                      v-model.number="selectedProvider.settings.maxOutputTokens"
                      type="number"
                      min="1"
                      :max="getHardLimit(selectedProvider, 'maxOutputTokens') || 98304"
                      class="field font-mono"
                      style="max-width: 160px;"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Temperature</label>
                    <input
                      v-model.number="selectedProvider.settings.temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      class="field font-mono"
                      style="max-width: 100px;"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Top P</label>
                    <input
                      v-model.number="selectedProvider.settings.topP"
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      class="field font-mono"
                      style="max-width: 100px;"
                    />
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Add Provider Modal -->
          <Teleport to="body">
            <div v-if="showAddProviderModal" class="modal-backdrop" @click.self="showAddProviderModal = false">
              <div class="modal-content" style="max-width:400px;">
                <div class="modal-header">
                  <h3>{{ t('config.addProvider', 'Add Provider') }}</h3>
                  <button class="modal-close" @click="showAddProviderModal = false">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="modal-body">
                  <div class="form-group">
                    <label class="form-label">Provider Type</label>
                    <select v-model="addProviderPreset" class="field">
                      <option v-for="opt in providerPresetOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                  <div v-if="addProviderPreset === 'custom'" class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Provider Name</label>
                    <input v-model="addProviderName" type="text" class="field" placeholder="My Custom Provider" />
                  </div>
                </div>
                <div class="modal-footer">
                  <AppButton variant="secondary" @click="showAddProviderModal = false">Cancel</AppButton>
                  <AppButton variant="primary" @click="confirmAddProvider">Add</AppButton>
                </div>
              </div>
            </div>
          </Teleport>

        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Knowledge (AI > Knowledge) -->
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
              <h3 class="form-section-title">{{ t('config.pineconeCredentials') }}</h3>
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
              <p class="hint">Your Pinecone API key — stored locally in {{ form.dataPath || defaultDataPath }}/config.json</p>
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
              <h3 class="form-section-title">{{ t('config.whisperSTT') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:1rem;">
              Voice calls use OpenAI's Whisper API for speech recognition. Text-to-speech uses your browser's built-in SpeechSynthesis (free, no API key needed).
            </p>

            <!-- API Key -->
            <div class="form-group">
              <label for="whisperApiKey" class="form-label">
                OpenAI API Key
                <span class="form-label-hint">{{ t('config.forWhisperSTT') }}</span>
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
                <span class="form-label-hint">{{ t('config.optional') }}</span>
              </label>
              <input id="whisperBaseURL" v-model="form.voiceCall.whisperBaseURL" type="url" placeholder="https://api.openai.com" class="field font-mono" />
              <p class="hint">Leave blank for standard OpenAI. Change only if using a custom Whisper-compatible endpoint.</p>
            </div>

            <!-- STT Language -->
            <div class="form-group">
              <label for="whisperLanguage" class="form-label">
                STT Language
                <span class="form-label-hint">{{ t('config.recommendedNoiseReduction') }}</span>
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
              <h3 class="form-section-title">{{ t('config.microphoneSensitivity') }}</h3>
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
              <h3 class="form-section-title">{{ t('config.textToSpeech') }}</h3>
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
                <h3 class="form-section-title">{{ t('config.currencyRates') }}</h3>
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
                <h3 class="form-section-title">{{ t('config.modelPrices') }}</h3>
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
                <h3 class="form-section-title">{{ t('config.modelAliases') }}</h3>
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
              <h3 class="form-section-title">{{ t('config.smtpServer') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:16px;">
              {{ t('config.emailCredentials') }}
            </p>

            <!-- Host -->
            <div class="form-group">
              <label for="smtpHost" class="form-label">
                {{ t('config.smtpServerHostname') }}
              </label>
              <input id="smtpHost" v-model="form.smtp.host" type="text" placeholder="smtp.office365.com" class="field font-mono" />
            </div>

            <!-- Port -->
            <div class="form-group">
              <label for="smtpPort" class="form-label">
                {{ t('config.smtpServerPort') }}
                <span class="form-label-hint">{{ t('config.smtpServerPortHint') }}</span>
              </label>
              <input id="smtpPort" v-model.number="form.smtp.port" type="number" placeholder="587" class="field font-mono" style="max-width:120px;" />
            </div>

            <!-- Username -->
            <div class="form-group">
              <label for="smtpUser" class="form-label">
                {{ t('config.smtpUsername') }}
                <span class="form-label-hint">{{ t('config.smtpUsernameHint') }}</span>
              </label>
              <input id="smtpUser" v-model="form.smtp.user" type="text" placeholder="you@yourdomain.com" class="field font-mono" />
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="smtpPass" class="form-label">
                {{ t('config.smtpPassword') }}
                <span class="form-label-hint">{{ t('config.smtpPasswordHint') }}</span>
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
              <p class="hint">{{ t('config.emailMfaHint') }}</p>
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
              <label class="form-label">{{ t('config.globalSandboxMode') }}</label>
              <p class="hint" style="margin-bottom:12px;">{{ t('config.sandboxControls') }}</p>
              <div class="sec-mode-btns">
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'sandbox' }"
                  @click="sandboxForm.defaultMode = 'sandbox'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {{ t('config.sandboxModeSandbox') }}
                  <span class="sec-mode-badge">{{ t('config.sandboxModeDefault') }}</span>
                </button>
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'all_permissions' }"
                  @click="sandboxForm.defaultMode = 'all_permissions'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {{ t('config.sandboxModeAll') }}
                </button>
              </div>
              <p class="hint" style="margin-top:8px;">
                <template v-if="sandboxForm.defaultMode === 'sandbox'">{{ t('config.sandboxModeSandboxHint') }}</template>
                <template v-else>{{ t('config.sandboxModeAllHint') }}</template>
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
                <label class="form-label">{{ t('config.dangerBlockList') }} <span class="sec-count-badge danger">{{ sandboxForm.dangerBlockList.length }}</span></label>
                <p class="hint" style="margin-bottom:10px;">{{ t('config.dangerBlockListHint') }}</p>
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

          <!-- IM platform tab bar: Telegram | WhatsApp | Feishu | Bridge -->
          <div class="provider-tab-group">
            <button @click="activeIMTab = 'telegram'" class="config-tab-btn" :class="{ active: activeIMTab === 'telegram' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Telegram
              <span class="prov-dot" :class="telegramReady ? 'active' : 'inactive'" />
            </button>
            <button @click="activeIMTab = 'whatsapp'" class="config-tab-btn" :class="{ active: activeIMTab === 'whatsapp' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp
              <span class="prov-dot" :class="whatsappReady ? 'active' : (whatsappQr ? 'pending' : 'inactive')" />
            </button>
            <button @click="activeIMTab = 'feishu'" class="config-tab-btn" :class="{ active: activeIMTab === 'feishu' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Feishu
              <span class="prov-dot" :class="feishuReady ? 'active' : 'inactive'" />
            </button>
            <button @click="activeIMTab = 'bridge'" class="config-tab-btn" :class="{ active: activeIMTab === 'bridge' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Bridge
              <span class="prov-dot" :class="imStatus.running ? 'active' : 'inactive'" />
            </button>
          </div>

          <!-- ══════════ TELEGRAM TAB ══════════ -->
          <template v-if="activeIMTab === 'telegram'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.telegram') }}</h3>
                <span class="im-platform-status" :class="telegramReady ? 'ready' : 'idle'">
                  {{ telegramReady ? '● Configured' : '○ Not configured' }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.telegramEnable') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.telegram.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="tgBotToken">{{ t('config.telegramBotToken') }}</label>
                <div style="position:relative;">
                  <input
                    id="tgBotToken"
                    v-model="form.im.telegram.botToken"
                    :type="showTgToken ? 'text' : 'password'"
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    class="field font-mono"
                    style="padding-right:2.5rem;"
                  />
                  <button type="button" @click="showTgToken = !showTgToken" class="im-reveal-btn" :title="showTgToken ? 'Hide' : 'Show'">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <template v-if="showTgToken"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></template>
                      <template v-else><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></template>
                    </svg>
                  </button>
                </div>
                <p class="hint">{{ t('config.telegramBotTokenHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="tgAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedUsernames') }}</span></label>
                <input
                  id="tgAllowedUsers"
                  :value="(form.im.telegram.allowedUsers || []).join(',')"
                  @input="form.im.telegram.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="username1,username2"
                  class="field font-mono"
                />
                <p class="hint">Leave empty to allow all users.</p>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  Setup Guide
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>{{ t('config.telegramInstructions') }}</li>
                </ol>
                <p class="im-setup-note">{{ t('config.telegramAllowedUsers') }}</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ WHATSAPP TAB ══════════ -->
          <template v-else-if="activeIMTab === 'whatsapp'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.whatsapp') }}</h3>
                <span class="im-platform-status" :class="whatsappReady ? 'ready' : (whatsappQr ? 'pending' : 'idle')">
                  {{ whatsappReady ? '● Connected' : (whatsappQr ? '◌ Awaiting scan' : '○ Not connected') }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">Enable WhatsApp</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.whatsapp.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="waAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedPhones') }}</span></label>
                <input
                  id="waAllowedUsers"
                  :value="(form.im.whatsapp.allowedUsers || []).join(',')"
                  @input="form.im.whatsapp.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="6512345678,6587654321"
                  class="field font-mono"
                />
                <p class="hint">Leave empty to allow all senders. Use phone numbers without the + prefix.</p>
              </div>

              <div class="form-divider" />

              <!-- Device linking section -->
              <div class="im-wa-link-section">
                <div class="im-wa-link-header">
                  <div>
                    <p class="form-label" style="margin:0 0 0.2rem;">Device Linking</p>
                    <p class="hint" style="margin:0;">
                      <template v-if="whatsappReady">Your phone is linked. Session is saved and persists across restarts.</template>
                      <template v-else>Link a WhatsApp account to this device by scanning a QR code.</template>
                    </p>
                  </div>
                  <AppButton size="compact" variant="primary" @click="requestWhatsAppLink" :loading="waLinking" :disabled="waLinking">
                    <svg v-if="!waLinking" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    {{ waLinking ? 'Generating…' : (whatsappReady ? 'Re-link Device' : 'Link Device') }}
                  </AppButton>
                </div>

                <!-- QR code -->
                <div v-if="whatsappQr && !whatsappConnected" class="im-qr-block">
                  <img :src="whatsappQr" alt="WhatsApp QR Code" class="im-qr-img" />
                  <div class="im-qr-instructions">
                    <p style="margin:0 0 0.4rem; font-weight:600; font-size:var(--fs-secondary); color:var(--text-primary);">Scan with WhatsApp</p>
                    <ol class="im-inline-steps" style="margin:0; padding-left:1rem;">
                      <li>Open WhatsApp on your phone</li>
                      <li>Go to Settings → Linked Devices</li>
                      <li>Tap <strong>Link a Device</strong> and scan this QR</li>
                    </ol>
                    <p class="im-inline-note" style="margin-top:0.5rem;">QR expires after 60 seconds — click Link Device again if it disappears.</p>
                  </div>
                </div>

                <!-- Connected state -->
                <div v-else-if="whatsappReady" class="im-wa-connected">
                  <svg style="width:18px;height:18px;color:#10B981;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Phone linked successfully. Session is active.</span>
                </div>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  Setup Guide
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>Toggle <strong>Enable WhatsApp</strong> on and click <strong>Save</strong></li>
                  <li>Click the <strong>Link Device</strong> button above — a QR code will appear</li>
                  <li>Open WhatsApp on your phone → tap <strong>Settings</strong> (or the three-dot menu) → <strong>Linked Devices</strong> → <strong>Link a Device</strong></li>
                  <li>Point your phone at the QR code to scan it — WhatsApp will confirm the link instantly</li>
                  <li>Go to the <strong>Bridge</strong> tab and click <strong>Start Bridge</strong></li>
                  <li>From any other phone or your own phone, open WhatsApp and send a message <strong>to your linked number</strong> (the same number whose phone you used to scan the QR) — ClankAI will reply to that message</li>
                </ol>
                <p class="im-setup-note">The session is saved automatically — no need to scan again after restarts. Your phone must remain connected to the internet (same as WhatsApp Web).</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ FEISHU TAB ══════════ -->
          <template v-else-if="activeIMTab === 'feishu'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.feishu') }}</h3>
                <span class="im-platform-status" :class="feishuReady ? 'ready' : 'idle'">
                  {{ feishuReady ? '● Configured' : '○ Not configured' }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">Enable Feishu / Lark Bot</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.feishu.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="feishuAppId">App ID</label>
                <input
                  id="feishuAppId"
                  v-model="form.im.feishu.appId"
                  type="text"
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  class="field font-mono"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="feishuAppSecret">App Secret</label>
                <div style="position:relative;">
                  <input
                    id="feishuAppSecret"
                    v-model="form.im.feishu.appSecret"
                    :type="showWaSecret ? 'text' : 'password'"
                    placeholder="••••••••••••••••"
                    class="field font-mono"
                    style="padding-right:2.5rem;"
                  />
                  <button type="button" @click="showWaSecret = !showWaSecret" class="im-reveal-btn" :title="showWaSecret ? 'Hide' : 'Show'">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <template v-if="showWaSecret"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></template>
                      <template v-else><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></template>
                    </svg>
                  </button>
                </div>
                <p class="hint">Get App ID and App Secret from <strong>open.feishu.cn/app</strong>.</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="feishuAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedOpenIds') }}</span></label>
                <input
                  id="feishuAllowedUsers"
                  :value="(form.im.feishu.allowedUsers || []).join(',')"
                  @input="form.im.feishu.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="ou_xxxxxxxx,ou_yyyyyyyy"
                  class="field font-mono"
                />
                <p class="hint">Leave empty to allow all workspace users.</p>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  Setup Guide
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>Go to <strong>open.feishu.cn/app</strong> (or <strong>open.larksuite.com/app</strong> for Lark) and create a new <em>Custom App</em></li>
                  <li>Under <strong>Capabilities</strong>, enable the <strong>Bot</strong> feature</li>
                  <li>Under <strong>Permissions &amp; Scopes</strong>, add the permission <code>im:message:receive_v1</code></li>
                  <li>Under <strong>Event Subscriptions</strong>, add the <code>im.message.receive_v1</code> event and set connection mode to <strong>Long Connection (WebSocket)</strong></li>
                  <li>Under <strong>Credentials &amp; Basic Info</strong>, copy your <strong>App ID</strong> and <strong>App Secret</strong></li>
                  <li>Paste them in the fields above, toggle <strong>Enable</strong> on, and click <strong>Save</strong></li>
                  <li>Publish the app to your workspace (release → publish)</li>
                  <li>Go to the <strong>Bridge</strong> tab and click <strong>Start Bridge</strong></li>
                  <li>In Feishu, open a chat with your bot (search its name in the top bar) and send it a message — ClankAI will respond</li>
                </ol>
                <p class="im-setup-note">No public URL required — the bridge uses a persistent WebSocket connection to Feishu's servers.</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Save
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ BRIDGE TAB ══════════ -->
          <template v-else-if="activeIMTab === 'bridge'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.bridgeControl') }}</h3>
              </div>

              <!-- Per-platform toggle rows -->
              <div class="im-bridge-rows">
                <!-- Telegram -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">Telegram</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.telegram ? 'running' : (telegramReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.telegram ? '● Running' : (telegramReady ? '○ Configured' : '○ Not configured') }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !telegramReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.telegram" :disabled="!telegramReady"
                      @change="togglePlatform('telegram', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>

                <div class="form-divider" style="margin:0;" />

                <!-- WhatsApp -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">WhatsApp</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.whatsapp ? 'running' : (whatsappReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.whatsapp ? '● Running' : (whatsappReady ? '○ Linked' : '○ Not linked') }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !whatsappReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.whatsapp" :disabled="!whatsappReady"
                      @change="togglePlatform('whatsapp', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>

                <div class="form-divider" style="margin:0;" />

                <!-- Feishu -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">Feishu / Lark</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.feishu ? 'running' : (feishuReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.feishu ? '● Running' : (feishuReady ? '○ Configured' : '○ Not configured') }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !feishuReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.feishu" :disabled="!feishuReady"
                      @change="togglePlatform('feishu', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>
              </div>

              <!-- Active sessions -->
              <div v-if="imStatus.sessions?.length" style="margin-top:1.25rem;">
                <p class="form-label" style="margin-bottom:0.5rem;">Active Sessions</p>
                <div class="im-sessions-list">
                  <div v-for="(session, i) in imStatus.sessions" :key="i" class="im-session-row">
                    <span class="font-mono" style="font-size:var(--fs-caption);color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {{ session.channelId || session.id || session }}
                    </span>
                    <span v-if="session.platform" class="im-session-badge">{{ session.platform }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

        </template>

        </div>
      </div>
    </div>
  </div>

  <!-- IM Setup Guide Modal -->
  <Teleport to="body">
    <div v-if="showIMGuide" class="im-guide-backdrop" @keydown.esc="showIMGuide = false">
      <div class="im-guide-modal" role="dialog" aria-modal="true">
        <div class="im-guide-header">
          <div class="im-guide-header-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="im-guide-title">IM Bridge Setup Guide</span>
          <button class="im-guide-close" @click="showIMGuide = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="im-guide-body">

          <!-- Telegram Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Telegram — 4 steps
            </div>
            <ol class="im-guide-steps">
              <li>Open Telegram and search for <code>@BotFather</code></li>
              <li>Send <code>/newbot</code>, follow the prompts to name your bot</li>
              <li>Copy the bot token (looks like <code>123456:ABC-xyz…</code>)</li>
              <li>Paste the token here, check <em>Enable Telegram Bot</em>, click <strong>Save</strong> then <strong>Start Bridge</strong></li>
            </ol>
            <p class="im-guide-note">To restrict access, add your Telegram username to <em>Allowed Users</em>. Leave empty to allow anyone.</p>
          </div>

          <div class="im-guide-divider" />

          <!-- WhatsApp Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp — 3 steps
            </div>
            <ol class="im-guide-steps">
              <li>Enable WhatsApp, click <strong>Save</strong> then <strong>Start Bridge</strong></li>
              <li>A QR code appears in the config page — open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan the QR</li>
              <li>Session is saved automatically — no need to scan again after restarts</li>
            </ol>
            <p class="im-guide-note">Your phone must stay connected to the internet (same as WhatsApp Web). To restrict access, add phone numbers (without +) to <em>Allowed Users</em>.</p>
          </div>

          <div class="im-guide-divider" />

          <!-- Feishu Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Feishu / Lark — 6 steps
            </div>
            <ol class="im-guide-steps">
              <li>Go to <strong>open.feishu.cn/app</strong> → Create App (Custom App)</li>
              <li>Under <em>Capabilities</em>, enable <strong>Bot</strong></li>
              <li>Under <em>Permissions &amp; Scopes</em>, add <code>im:message:receive_v1</code></li>
              <li>Under <em>Event Subscriptions</em>, add event <code>im.message.receive_v1</code> and set delivery to <strong>WebSocket</strong> mode</li>
              <li>Publish the app to your workspace</li>
              <li>Paste App ID and App Secret here, enable Feishu, click <strong>Save</strong> then <strong>Start Bridge</strong></li>
            </ol>
            <p class="im-guide-note">No public URL is required — the bridge uses a persistent WebSocket connection to Feishu's servers.</p>
          </div>

          <div class="im-guide-divider" />

          <!-- Agents -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              Agents
            </div>
            <p class="im-guide-note" style="border-color:#10B981;">
              Each chat automatically uses the agent assigned to it. In a group chat, all assigned agents respond in turn.
            </p>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>/agents</code></td><td>List all available agents</td></tr>
                <tr><td><code>/agent &lt;name&gt;</code></td><td>Show agent details (prompt, model, provider)</td></tr>
                <tr><td><code>/agent add &lt;name&gt;</code></td><td>Add a agent to the current chat</td></tr>
                <tr><td><code>/agent remove &lt;name&gt;</code></td><td>Remove a agent from the current chat</td></tr>
                <tr><td><code>/agent model &lt;name&gt;</code></td><td>Change agent's provider &amp; model via inline buttons</td></tr>
              </tbody>
            </table>
          </div>

          <div class="im-guide-divider" />

          <!-- @mentions -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
              @mentions in group chats
            </div>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>@all</code></td><td>All agents in the chat respond</td></tr>
                <tr><td><code>@Mark</code></td><td>Only Mark responds (case-insensitive)</td></tr>
                <tr><td><em>no mention</em></td><td>All agents respond (same as @all)</td></tr>
              </tbody>
            </table>
          </div>

          <div class="im-guide-divider" />

          <!-- Voice -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              Voice notes (Telegram)
            </div>
            <p class="im-guide-note">
              Voice messages are automatically transcribed via Whisper and routed as text. Requires an <strong>OpenAI API key</strong> configured in <em>AI → Models → OpenAI</em>.
            </p>
          </div>

          <div class="im-guide-divider" />

          <!-- Commands Reference -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              Chat Commands
            </div>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>/list</code></td><td>Show all chats with numbers</td></tr>
                <tr><td><code>/switch &lt;n&gt;</code></td><td>Switch active chat to #n from /list</td></tr>
                <tr><td><code>/new [title]</code></td><td>Create a new chat and switch to it</td></tr>
                <tr><td><code>/current</code></td><td>Show name of the active chat</td></tr>
                <tr><td><code>/status</code></td><td>Check if the bridge is running</td></tr>
                <tr><td><code>/help</code></td><td>Show all available commands</td></tr>
              </tbody>
            </table>
            <p class="im-guide-note">Any non-command message is sent directly to the active chat. If no chat is active, one is created automatically.</p>
          </div>

        </div>

        <div class="im-guide-footer">
          <button class="im-guide-ok-btn" @click="showIMGuide = false">Got it</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    :visible="showDeleteConfirm"
    :title="t('common.confirmDelete', 'Confirm Delete')"
    :message="t('config.deleteProviderConfirm', `Are you sure you want to delete ${deleteConfirmName}? This action cannot be undone.`)"
    :confirm-text="t('common.delete', 'Delete')"
    :cancel-text="t('common.cancel', 'Cancel')"
    confirm-class="danger"
    :loading-text="t('common.deleting', 'Deleting...')"
    @confirm="confirmDeleteProvider"
    @close="showDeleteConfirm = false"
  />
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch, nextTick, defineComponent, h } from 'vue'
defineOptions({ inheritAttrs: false })
import { useRoute } from 'vue-router'
import { useConfigStore } from '../stores/config'
import { useModelsStore } from '../stores/models'
import AppButton from '../components/common/AppButton.vue'
import ProviderModelPicker from '../components/common/ProviderModelPicker.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import { useI18n } from '../i18n/useI18n'
import { DEFAULT_PRICES } from '../utils/pricing.js'

const configStore = useConfigStore()
const modelsStore = useModelsStore()
const route = useRoute()
const { t } = useI18n()

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
const IconLanguage = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ])
})
const IconPricing = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('line', { x1: '12', y1: '1', x2: '12', y2: '23' }),
    h('path', { d: 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6' })
  ])
})
// Top-level tabs (2 primary)
const topTabs = computed(() => [
  { value: 'general', label: t('config.general'), icon: IconGeneral },
  { value: 'ai',      label: t('config.ai'),      icon: IconModels  },
])

// Sub-tab arrays
const subTabsGeneral = computed(() => [
  { value: 'language', label: 'Language / 语言', icon: IconLanguage },
  { value: 'paths',    label: t('config.paths'),    icon: IconPaths    },
  { value: 'security', label: t('config.security'), icon: IconSecurity },
  { value: 'email',    label: t('config.email'),    icon: IconEmail    },
  { value: 'im',       label: t('config.im'),       icon: IconIM       },
])
const subTabsAI = computed(() => [
  { value: 'models',    label: t('config.models'),    icon: IconModels    },
  { value: 'voice',     label: t('config.voice'),     icon: IconVoice     },
  { value: 'knowledge', label: t('config.knowledge'), icon: IconKnowledge },
  { value: 'pricing',   label: t('config.pricing'),   icon: IconPricing   },
])

const activeSubTab = ref('language')

const currentSubTabs = computed(() =>
  activeTopTab.value === 'general' ? subTabsGeneral.value : subTabsAI.value
)

function switchTopTab(tab) {
  activeTopTab.value = tab
  activeSubTab.value = tab === 'general' ? 'language' : 'models'
}

function getSubTabStatus(subTab) {
  switch (subTab) {
    case 'language':  return form.language ? 'configured' : 'empty'
    case 'paths':     return (form.dataPath || form.artifactPath || form.skillsPath) ? 'configured' : 'empty'
    case 'security':  return 'configured'
    case 'email':     return form.smtp?.host ? 'configured' : 'empty'
    case 'im':        return (form.im?.telegram?.botToken || form.im?.whatsapp?.enabled || form.im?.feishu?.appId) ? 'configured' : 'empty'
    case 'models':    return Object.values(form).some(v => v?.apiKey) ? 'configured' : 'empty'
    case 'voice':     return form.voiceCall?.whisperApiKey ? 'configured' : 'empty'
    case 'knowledge': return form.pineconeApiKey ? 'configured' : 'empty'
    case 'pricing':   return 'configured'
    default:          return 'empty'
  }
}

// ── IM Bridge state & handlers ────────────────────────────────────────────────
const showTgToken       = ref(false)
const showWaSecret      = ref(false)
const showIMGuide       = ref(false)
const savingIM          = ref(false)
const startingBridge    = ref(false)
const savedIMMsg        = ref(null)
const imStatus          = ref({ running: false, sessions: [] })
const whatsappQr        = ref(null)   // data URI — shown until connected
const whatsappConnected = ref(false)
const activeIMTab       = ref('telegram')  // 'telegram' | 'whatsapp' | 'feishu' | 'bridge'

// Per-platform "properly enabled" indicators
const telegramReady = computed(() =>
  !!(form.im.telegram?.enabled && form.im.telegram?.botToken?.trim())
)
const whatsappReady = computed(() =>
  !!(form.im.whatsapp?.enabled && whatsappConnected.value)
)
const feishuReady = computed(() =>
  !!(form.im.feishu?.enabled && form.im.feishu?.appId?.trim() && form.im.feishu?.appSecret?.trim())
)
const imAnyReady = computed(() => telegramReady.value || whatsappReady.value || feishuReady.value)

// Reset IM inner tab to first platform when navigating back to the IM sub-section
watch(activeSubTab, (val) => { if (val === 'im') activeIMTab.value = 'telegram' })

// WhatsApp QR flow state
const waLinking = ref(false)  // true while requestQR is in-flight

async function requestWhatsAppLink() {
  waLinking.value = true
  whatsappQr.value = null
  whatsappConnected.value = false

  // Auto-reset spinner after 10s in case QR never arrives
  const timeout = setTimeout(() => { waLinking.value = false }, 10000)

  try {
    if (window.electronAPI?.im?.requestWhatsAppQr) {
      await window.electronAPI.im.requestWhatsAppQr()
    } else if (window.electronAPI?.im?.start) {
      imStatus.value = await window.electronAPI.im.start()
    }
  } catch (err) {
    console.error('[im] requestWhatsAppLink error:', err.message)
  } finally {
    clearTimeout(timeout)
    waLinking.value = false
  }
}

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
    savedIMMsg.value = { ok: true, text: 'Saved successfully' }
  } catch (err) {
    savedIMMsg.value = { ok: false, text: err.message || 'Save failed' }
  } finally {
    savingIM.value = false
    setTimeout(() => { savedIMMsg.value = null }, 3000)
  }
}

async function togglePlatform(platform, enable) {
  if (!window.electronAPI?.im) return
  if (enable) {
    imStatus.value = await window.electronAPI.im.startPlatform(platform)
  } else {
    imStatus.value = await window.electronAPI.im.stopPlatform(platform)
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
    telegram: { enabled: false, botToken: '', allowedUsers: [] },
    whatsapp: { enabled: false, allowedUsers: [] },
    feishu:   { enabled: false, appId: '', appSecret: '', allowedUsers: [] },
  },
  language: 'en',
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

// ── Models Page: New left sidebar logic ────────────────────────────────
const modelsLeftNav = ref('empty')  // 'empty' | providerId | 'global' | 'utility'
const showAddProviderModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteConfirmId = ref(null)
const deleteConfirmName = ref('')
const addProviderPreset = ref('anthropic')
const addProviderName = ref('')
const testModelTemp = ref('')
const selectedTestModel = ref('')
const testingProviderNew = ref(false)
const testResultNew = ref(null)
const showProviderKey = ref(false)

// Selected provider model fetching state
const providerModelsFetching = ref(false)
const providerModelsFetchError = ref('')
const providerModelFilter = ref('')

const providerPresetOptions = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'google', label: 'Google' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'custom', label: 'Custom' },
]

const selectedProvider = computed(() => {
  if (modelsLeftNav.value === 'empty' || modelsLeftNav.value === 'global' || modelsLeftNav.value === 'utility') return null
  return configStore.config.providers.find(p => p.id === modelsLeftNav.value)
})

const canTestNew = computed(() => {
  if (!selectedProvider.value) return false
  if (selectedProvider.value.type === 'anthropic') {
    return !!(selectedProvider.value.apiKey && selectedProvider.value.baseURL && selectedTestModel.value)
  }
  return !!(selectedProvider.value.apiKey && selectedProvider.value.baseURL && selectedProvider.value.model)
})

const selectedProviderModels = computed(() => {
  if (!selectedProvider.value) return []
  const type = selectedProvider.value.type
  if (type === 'openrouter') return modelsStore.openrouterModels
  if (type === 'openai') return modelsStore.openaiModels
  if (type === 'deepseek') return modelsStore.deepseekModels
  return []
})

const filteredProviderModels = computed(() => {
  const models = selectedProviderModels.value
  if (!providerModelFilter.value) return models
  const q = providerModelFilter.value.toLowerCase()
  return models.filter(m => m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
})

const testableModels = computed(() => {
  if (!selectedProvider.value) return []
  const p = selectedProvider.value
  if (p.type === 'anthropic') {
    return [
      { id: p.model, label: p.model },
      { id: p.settings?.opusModel, label: p.settings?.opusModel },
      { id: p.settings?.haikuModel, label: p.settings?.haikuModel },
    ].filter(m => m.id)
  }
  if (p.model) return [{ id: p.model, label: p.model }]
  return filteredProviderModels.value.slice(0, 10).map(m => ({ id: m.id, label: m.id }))
})

function openAddProvider(preset) {
  addProviderPreset.value = preset
  addProviderName.value = ''
  showAddProviderModal.value = true
}

function confirmAddProvider() {
  const name = addProviderPreset.value === 'custom' ? (addProviderName.value || 'Custom') : null
  const newProvider = configStore.addProvider(addProviderPreset.value, name)
  modelsLeftNav.value = newProvider.id
  showAddProviderModal.value = false
}

function deleteProvider(id) {
  const provider = configStore.config.providers.find(p => p.id === id)
  deleteConfirmId.value = id
  deleteConfirmName.value = provider?.name || 'this provider'
  showDeleteConfirm.value = true
}

function confirmDeleteProvider() {
  if (deleteConfirmId.value) {
    configStore.removeProvider(deleteConfirmId.value)
    if (modelsLeftNav.value === deleteConfirmId.value) {
      modelsLeftNav.value = configStore.config.providers.length > 0 ? configStore.config.providers[0].id : 'empty'
    }
  }
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
  deleteConfirmName.value = ''
}

async function testProviderNew() {
  if (!selectedProvider.value || testingProviderNew.value) return
  testingProviderNew.value = true
  testResultNew.value = null
  try {
    const model = selectedProvider.value.type === 'anthropic' ? selectedTestModel.value : selectedProvider.value.model
    const res = await window.electronAPI.testProvider({
      provider: selectedProvider.value.type,
      apiKey: selectedProvider.value.apiKey,
      baseURL: selectedProvider.value.baseURL,
      utilityModel: model,
    })
    if (res.success) {
      selectedProvider.value.isActive = true
      selectedProvider.value.testedAt = Date.now()
      testResultNew.value = { ok: true, message: `Connected · ${res.ms}ms` }
    } else {
      selectedProvider.value.isActive = false
      testResultNew.value = { ok: false, message: res.error }
    }
    await configStore.saveConfig({ providers: configStore.config.providers })
  } catch (err) {
    testResultNew.value = { ok: false, message: err.message || 'Test failed' }
  } finally {
    testingProviderNew.value = false
  }
}

async function fetchProviderModels() {
  if (!selectedProvider.value || !selectedProvider.value.apiKey || !selectedProvider.value.baseURL) {
    providerModelsFetchError.value = 'Enter API key and Base URL first.'
    return
  }
  providerModelsFetching.value = true
  providerModelsFetchError.value = ''
  try {
    const type = selectedProvider.value.type
    if (type === 'openrouter') {
      const result = await window.electronAPI.fetchOpenRouterModels({ apiKey: selectedProvider.value.apiKey, baseURL: selectedProvider.value.baseURL })
      if (result.success) { modelsStore.openrouterModels = result.models; modelsStore.openrouterCached = true }
      else { providerModelsFetchError.value = result.error || 'Unknown error' }
    } else if (type === 'openai') {
      const result = await window.electronAPI.fetchOpenAIModels({ apiKey: selectedProvider.value.apiKey, baseURL: selectedProvider.value.baseURL })
      if (result.success) { modelsStore.openaiModels = result.models; modelsStore.openaiCached = true }
      else { providerModelsFetchError.value = result.error || 'Unknown error' }
    } else if (type === 'deepseek') {
      configStore.config.deepseek = configStore.config.deepseek || {}
      configStore.config.deepseek.apiKey = selectedProvider.value.apiKey
      configStore.config.deepseek.baseURL = selectedProvider.value.baseURL
      await modelsStore.fetchDeepSeekModels()
      if (!modelsStore.deepseekCached) { providerModelsFetchError.value = 'Fetch failed — check API key and Base URL.' }
    } else {
      providerModelsFetchError.value = 'Model fetching not supported for this provider type.'
    }
  } catch (err) { providerModelsFetchError.value = err.message }
  finally { providerModelsFetching.value = false }
}

function getHardLimit(provider, key) {
  const { PROVIDER_PRESETS } = configStore
  const preset = PROVIDER_PRESETS[provider.type]
  return preset?.hardLimits?.[key]
}

onMounted(async () => {
  const c = JSON.parse(JSON.stringify(configStore.config))
  delete c.defaultProvider
  
  // Legacy provider objects (for backward compat during transition)
  if (c.anthropic)    Object.assign(form.anthropic, c.anthropic)
  if (c.openrouter)   Object.assign(form.openrouter, c.openrouter)
  if (c.openai)       Object.assign(form.openai, c.openai)
  if (c.deepseek)     Object.assign(form.deepseek, c.deepseek)
  
  if (c.voiceCall)    Object.assign(form.voiceCall, c.voiceCall)
  if (c.smtp)         Object.assign(form.smtp, c.smtp)
  if (c.utilityModel) Object.assign(form.utilityModel, c.utilityModel)
  
  // Initialize left nav if providers exist
  if (c.providers && c.providers.length > 0) {
    modelsLeftNav.value = c.providers[0].id
  } else if (c.anthropic?.apiKey || c.openrouter?.apiKey || c.openai?.apiKey || c.deepseek?.apiKey) {
    // Legacy config exists, migrate
    modelsLeftNav.value = 'global'
  } else {
    modelsLeftNav.value = 'empty'
  }
  
  form.im = {
    telegram: {
      enabled:      c.im?.telegram?.enabled      ?? false,
      botToken:     c.im?.telegram?.botToken      ?? '',
      allowedUsers: c.im?.telegram?.allowedUsers  ?? [],
    },
    whatsapp: {
      enabled:      c.im?.whatsapp?.enabled      ?? false,
      allowedUsers: c.im?.whatsapp?.allowedUsers ?? [],
    },
    feishu: {
      enabled:      c.im?.feishu?.enabled      ?? false,
      appId:        c.im?.feishu?.appId        ?? '',
      appSecret:    c.im?.feishu?.appSecret    ?? '',
      allowedUsers: c.im?.feishu?.allowedUsers ?? [],
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
  // Seed connection state from current bridge status (handles case where
  // bridge was already running before ConfigView was opened)
  if (imStatus.value?.platforms?.whatsapp) {
    whatsappConnected.value = true
  }
  // Subscribe to WhatsApp QR / Ready events from main process
  if (window.electronAPI?.im?.onWhatsAppQr) {
    window.electronAPI.im.onWhatsAppQr((d) => {
      whatsappQr.value = d.qr
      whatsappConnected.value = false
    })
    window.electronAPI.im.onWhatsAppReady(async () => {
      whatsappConnected.value = true
      whatsappQr.value = null
      // Socket is now live — attach the real message handler and refresh status
      await window.electronAPI.im.startPlatform?.('whatsapp')
      await loadIMStatus()
    })
  }
  if (window.electronAPI?.im?.onPlatformStopped) {
    window.electronAPI.im.onPlatformStopped(async ({ platform }) => {
      if (platform === 'whatsapp') {
        whatsappConnected.value = false
        whatsappQr.value = null
      }
      // Refresh bridge status so toggle switches reflect reality
      await loadIMStatus()
    })
  }
  // Enable watcher-based isActive reset now that initial population is done
  nextTick(() => { formReady.value = true })
})

async function handleLanguageChange() {
  await configStore.saveConfig({ language: form.language })
}

onUnmounted(() => {
  window.electronAPI?.im?.onWhatsAppQr?.(() => {})
  window.electronAPI?.im?.onWhatsAppReady?.(() => {})
  window.electronAPI?.im?.onPlatformStopped?.(() => {})
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
    // Include providers from configStore
    modelFields.providers = JSON.parse(JSON.stringify(configStore.config.providers))
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
   CONFIG PAGE — Matches Sidebar / ChatsView / AgentsView design language
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
.config-content { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem 2rem 5rem; scrollbar-width: thin; }
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
.form-section-header:has(.header-actions) { justify-content: space-between; }
.header-actions { display: flex; align-items: center; gap: 0.5rem; }
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
.prov-dot.pending  { background: #F59E0B; box-shadow: 0 0 4px rgba(245,158,11,0.5); }
.cfg-required { color: #EF4444; margin-left: 2px; }
.cfg-hint { display: block; font-size: var(--fs-caption); color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }

/* ── Save row ───────────────────────────────────────────────────────────── */
.save-row { display: flex; align-items: center; gap: 12px; margin-top: 1rem; }
.save-row.fixed-bottom {
  position: fixed;
  bottom: 1.5rem;
  left: 280px;
  z-index: 10;
  background: var(--bg-page, #F2F2F7);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
}
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

/* IM Guide button */
.im-guide-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.im-guide-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--text-primary);
}

/* ── IM enable toggle row ───────────────────────────────────────────────── */
.im-enable-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.125rem 0;
}
.im-enable-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.im-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.im-toggle input { display: none; }
.im-toggle-track {
  position: relative;
  width: 2.5rem;
  height: 1.375rem;
  border-radius: 0.6875rem;
  background: #D1D5DB;
  border: 1px solid #E5E7EB;
  transition: background 0.2s, border-color 0.2s;
}
.im-toggle input:checked + .im-toggle-track {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #1A1A1A;
}
.im-toggle-thumb {
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s, background 0.2s;
}
.im-toggle input:checked + .im-toggle-track .im-toggle-thumb {
  transform: translateX(1.125rem);
}

/* ── IM reveal (eye) button inside inputs ──────────────────────────────── */
.im-reveal-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
}
.im-reveal-btn:hover { color: var(--text-primary); }

/* ── Platform status label (in card header) ────────────────────────────── */
.im-platform-status {
  margin-left: auto;
  font-size: var(--fs-caption);
  font-weight: 600;
  transition: color 0.15s;
  flex-shrink: 0;
}
.im-platform-status.ready   { color: #10B981; }
.im-platform-status.pending { color: #F59E0B; }
.im-platform-status.idle    { color: #9CA3AF; }

/* ── Inline collapsible setup guide ────────────────────────────────────── */
.im-inline-guide { border: none; outline: none; }
.im-inline-guide-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-secondary);
  list-style: none;
  padding: 0.25rem 0;
  transition: color 0.15s;
  user-select: none;
}
.im-inline-guide-summary:hover { color: var(--text-primary); }
.im-inline-guide-summary::-webkit-details-marker { display: none; }
.im-inline-steps {
  margin: 0.625rem 0 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.6;
}
.im-inline-steps li { padding-left: 0.25rem; }
.im-inline-steps code {
  background: var(--accent-light);
  color: var(--accent);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
.im-inline-note {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.75rem;
  background: rgba(0,122,255,0.05);
  border-left: 2px solid rgba(0,122,255,0.3);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.5;
}

/* ── Collapsible setup guide ────────────────────────────────────────────── */
.im-setup-guide {
  background: #FAFAFA;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.im-setup-guide-summary {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  list-style: none;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.01em;
  user-select: none;
  transition: background 0.12s;
}
.im-setup-guide-summary::-webkit-details-marker { display: none; }
.im-setup-guide-summary:hover { background: #F5F5F5; }
.im-setup-chevron {
  width: 12px;
  height: 12px;
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.15s ease;
}
.im-setup-guide[open] .im-setup-chevron { transform: rotate(180deg); }
.im-setup-guide[open] .im-setup-summary { border-bottom: 1px solid var(--border-light); }
.im-setup-steps {
  margin: 0;
  padding: 0.75rem 1rem 0.75rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.6;
  border-top: 1px solid var(--border-light);
}
.im-setup-steps li { padding-left: 0.2rem; }
.im-setup-steps code {
  background: var(--accent-light);
  color: var(--accent);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
.im-setup-note {
  margin: 0;
  padding: 0.5rem 1rem;
  background: rgba(0,122,255,0.04);
  border-top: 1px solid rgba(0,122,255,0.12);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.5;
}

/* ── WhatsApp device linking ────────────────────────────────────────────── */
.im-wa-link-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.875rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}
.im-wa-link-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.im-wa-connected {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #059669;
}

/* ── QR code block ──────────────────────────────────────────────────────── */
.im-qr-block {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.im-qr-instructions {
  flex: 1;
  min-width: 10rem;
}
.im-qr-img {
  width: 10rem;
  height: 10rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

/* ── Save tab summary rows ──────────────────────────────────────────────── */
.im-save-summary {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.im-save-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
}
.im-save-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.im-save-dot.ready   { background: #10B981; box-shadow: 0 0 4px rgba(16,185,129,0.4); }
.im-save-dot.pending { background: #F59E0B; }
.im-save-dot.idle    { background: #D1D5DB; }
.im-save-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  width: 7rem;
  flex-shrink: 0;
}
.im-save-state {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}

/* ── Manage tab platform rows ───────────────────────────────────────────── */
/* ── Bridge per-platform toggle rows ────────────────────────────────────── */
.im-bridge-rows {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.im-bridge-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}
.im-bridge-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}
.im-bridge-name {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.im-bridge-sub {
  font-size: var(--fs-caption);
  font-weight: 500;
}
.im-bridge-sub.running { color: #10B981; }
.im-bridge-sub.ready   { color: #6B7280; }
.im-bridge-sub.idle    { color: #9CA3AF; }
.im-toggle.disabled { opacity: 0.4; pointer-events: none; }

.im-manage-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.im-manage-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
}
.im-manage-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  width: 5.5rem;
  flex-shrink: 0;
}
.im-manage-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.im-manage-dot.ready   { background: #10B981; box-shadow: 0 0 4px rgba(16,185,129,0.4); }
.im-manage-dot.pending { background: #F59E0B; }
.im-manage-dot.idle    { background: #D1D5DB; }
.im-manage-state {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  flex: 1;
}
.im-manage-badge {
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.im-manage-badge.running {
  background: rgba(16,185,129,0.1);
  color: #059669;
}

/* ── Active sessions list ───────────────────────────────────────────────── */
.im-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 10rem;
  overflow-y: auto;
}
.im-session-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.im-session-badge {
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  background: rgba(0,122,255,0.08);
  color: var(--accent);
  flex-shrink: 0;
}
</style>

<style>
/* IM Setup Guide modal — unscoped (Teleport escapes component DOM) */
.im-guide-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: imGuideIn 0.2s ease-out;
}
@keyframes imGuideIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.im-guide-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: min(540px, 92vw);
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  animation: imGuideSlide 0.2s ease-out;
}
@keyframes imGuideSlide {
  from { transform: scale(0.95) translateY(8px); opacity: 0; }
  to   { transform: scale(1) translateY(0); opacity: 1; }
}
.im-guide-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid #1E1E1E;
}
.im-guide-header-icon {
  width: 2rem; height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.im-guide-title {
  font-size: 1rem;
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.im-guide-close {
  background: transparent;
  border: none;
  color: #6B7280;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.375rem;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.im-guide-close:hover { background: #1E1E1E; color: #fff; }
.im-guide-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.im-guide-section { display: flex; flex-direction: column; gap: 0.75rem; }
.im-guide-section-title {
  display: flex; align-items: center; gap: 0.4rem;
  color: #FFFFFF; font-size: 0.875rem; font-weight: 700;
}
.im-guide-steps {
  margin: 0; padding-left: 1.25rem;
  display: flex; flex-direction: column; gap: 0.5rem;
  color: #9CA3AF; font-size: 0.875rem; line-height: 1.6;
}
.im-guide-steps li { padding-left: 0.25rem; }
.im-guide-steps code {
  background: #1A1A1A; color: #E5E7EB;
  padding: 0.1rem 0.35rem; border-radius: 4px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
}
.im-guide-note {
  margin: 0; padding: 0.625rem 0.875rem;
  background: rgba(0,122,255,0.08); border-left: 3px solid #007AFF;
  border-radius: 0 6px 6px 0;
  color: #9CA3AF; font-size: 0.8125rem; line-height: 1.5;
}
.im-guide-divider { border: none; border-top: 1px solid #1E1E1E; margin: 0; }
.im-guide-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.875rem;
}
.im-guide-table td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #1A1A1A;
  color: #9CA3AF; vertical-align: top;
}
.im-guide-table tr:last-child td { border-bottom: none; }
.im-guide-table td:first-child { width: 38%; }
.im-guide-table code {
  background: #1A1A1A; color: #E5E7EB;
  padding: 0.1rem 0.35rem; border-radius: 4px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
  white-space: nowrap;
}
.im-guide-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #1A1A1A;
  display: flex; justify-content: flex-end;
  background: #0A0A0A;
  border-radius: 0 0 1rem 1rem;
}
.im-guide-ok-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 0.5rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-weight: 600; font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.im-guide-ok-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ══════════════════════════════════════════════════════════════════════════
   MODELS PAGE — New left sidebar layout
   ══════════════════════════════════════════════════════════════════════════ */
.models-page-layout {
  display: flex;
  gap: 1.5rem;
  height: 100%;
}

.models-left-nav {
  width: 240px;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.models-add-btn {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: none;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
}
.models-add-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.models-add-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.models-nav-divider {
  height: 1px;
  background: var(--border-light);
  margin: 0.25rem 0;
}

.models-nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.models-nav-section-label {
  font-size: var(--fs-small);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
}

.models-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  transition: all 0.15s;
  text-align: left;
}

.models-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.models-nav-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}

.models-nav-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.models-nav-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.models-nav-dot.active {
  background: #10B981;
}

.models-nav-dot.inactive {
  background: #D1D5DB;
}

.models-nav-empty {
  padding: 0.5rem;
  font-size: var(--fs-small);
  color: var(--text-muted);
  text-align: center;
}

.models-right-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.form-section-subheader {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  padding-top: 0.5rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--text-muted);
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1.25rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
</style>
