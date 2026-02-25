<template>
  <div class="h-full flex flex-col overflow-hidden" style="background:#F2F2F7;">
    <!-- Header -->
    <div class="shrink-0 px-6 py-4" style="background:#FFFFFF; border-bottom:1px solid #E5E5EA;">
      <div class="flex items-center justify-between">
        <div>
          <h1 style="font-family:'Inter',sans-serif; font-size:var(--fs-page-title); color:#1A1A1A; font-weight:700; margin:0;">Configuration</h1>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#6B7280; margin:4px 0 0;">LLM backend endpoint and model settings</p>
        </div>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto px-6 py-6" style="background:#F2F2F7;">
      <div class="max-w-xl space-y-6">

        <!-- ── Section: Default Provider ──────────────────────────────────── -->
        <section>
          <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:700; color:#1A1A1A; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">Default Provider</h2>
          <div style="background:#ffffff; border:1px solid #E5E5EA; border-radius:16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <div class="flex gap-2">
              <button
                v-for="p in providerOptions"
                :key="p.value"
                @click="form.defaultProvider = p.value"
                :style="form.defaultProvider === p.value
                  ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); border:1px solid #1A1A1A; color:#FFFFFF;'
                  : 'background:#ffffff; border:1px solid #E5E5EA; color:#6B7280;'"
                class="flex-1 py-2 rounded-lg font-medium transition-all duration-150 cursor-pointer model-btn"
                style="font-size:var(--fs-body); font-family:'Inter',sans-serif;"
              >
                {{ p.label }}
              </button>
            </div>
            <p class="hint">Used for new chats when no per-chat provider is selected</p>
          </div>
        </section>

        <!-- ── Provider Tabs ─────────────────────────────────────────────── -->
        <section>
          <div class="flex gap-0" style="margin-bottom:-1px; position:relative; z-index:1;">
            <button
              v-for="tab in providerOptions"
              :key="tab.value"
              @click="activeProviderTab = tab.value"
              :style="activeProviderTab === tab.value
                ? 'background:#FFFFFF; border:1px solid #E5E5EA; border-bottom:1px solid #FFFFFF; color:#1A1A1A; font-weight:600;'
                : 'background:#F5F5F5; border:1px solid transparent; border-bottom:1px solid #E5E5EA; color:#9CA3AF; font-weight:500;'"
              class="px-5 py-2.5 rounded-t-lg transition-all duration-150 cursor-pointer"
              style="font-size:var(--fs-body); font-family:'Inter',sans-serif;"
            >
              {{ tab.label }}
            </button>
            <div class="flex-1" style="border-bottom:1px solid #E5E5EA;"></div>
          </div>

          <!-- ── Anthropic Tab ─────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'anthropic'" class="space-y-4" style="background:#ffffff; border:1px solid #E5E5EA; border-top:none; border-radius:0 0 16px 16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">

            <!-- API Key -->
            <div>
              <label for="apiKey" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                API Key
                <span style="color:#9CA3AF; font-weight:400; margin-left:4px;">ANTHROPIC_API_KEY</span>
              </label>
              <div class="relative">
                <input
                  id="apiKey"
                  v-model="form.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  placeholder="sk-ant-…"
                  class="field pr-10 font-mono"
                />
                <button
                  @click="showKey = !showKey"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                  style="color:#9CA3AF;"
                  :aria-label="showKey ? 'Hide key' : 'Show key'"
                  @mouseenter="$event.currentTarget.style.color='#007AFF'"
                  @mouseleave="$event.currentTarget.style.color='#9CA3AF'"
                >
                  <svg v-if="!showKey" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">Stored locally in ~/.sparkai/config.json — never sent elsewhere</p>
            </div>

            <!-- Base URL -->
            <div>
              <label for="baseURL" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                Base URL
                <span style="color:#9CA3AF; font-weight:400; margin-left:4px;">ANTHROPIC_BASE_URL</span>
              </label>
              <input
                id="baseURL"
                v-model="form.baseURL"
                type="url"
                placeholder="https://api.anthropic.com"
                class="field"
              />
              <p class="hint">Change for custom backends: LiteLLM, Ollama, corporate proxy, etc.</p>
            </div>

            <!-- Models -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <h3 style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin-bottom:12px;">Models</h3>

              <div class="space-y-3">
                <div>
                  <label for="sonnetModel" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">Sonnet Model</label>
                  <input id="sonnetModel" v-model="form.sonnetModel" type="text" placeholder="anthropic/claude-sonnet-latest" class="field font-mono" />
                </div>
                <div>
                  <label for="opusModel" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">Opus Model</label>
                  <input id="opusModel" v-model="form.opusModel" type="text" placeholder="anthropic/claude-opus-latest" class="field font-mono" />
                </div>
                <div>
                  <label for="haikuModel" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">Haiku Model</label>
                  <input id="haikuModel" v-model="form.haikuModel" type="text" placeholder="anthropic/claude-3-5-haiku-20241022" class="field font-mono" />
                </div>
              </div>

              <!-- Active model selector -->
              <div class="pt-3" style="border-top:1px solid #E5E5EA; margin-top:12px;">
                <p class="mb-2" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">Active model for chat</p>
                <div class="flex gap-2">
                  <button
                    v-for="opt in modelOptions"
                    :key="opt.value"
                    @click="form.activeModel = opt.value"
                    :style="form.activeModel === opt.value
                      ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); border:1px solid #1A1A1A; color:#FFFFFF;'
                      : 'background:#ffffff; border:1px solid #E5E5EA; color:#6B7280;'"
                    class="flex-1 py-1.5 rounded-lg font-medium transition-all duration-150 cursor-pointer model-btn"
                    style="font-size:var(--fs-body); font-family:'Inter',sans-serif;"
                  >
                    {{ opt.label }}
                    <span class="block font-normal truncate px-1" :style="form.activeModel === opt.value ? 'color:rgba(255,255,255,0.6); font-size:var(--fs-small);' : 'color:#9CA3AF; font-size:var(--fs-small);'">
                      {{ modelIdPreview(opt.value) }}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Anthropic Test Connection -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); color:#1A1A1A; font-weight:600; margin:0;">Test Connection</p>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#6B7280; margin:4px 0 0;">Verify Anthropic endpoint and key</p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="testingAnthropic"
                    @click="stopTest('anthropic')"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="$event.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="$event.currentTarget.style.background='rgba(255,59,48,0.08)'"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    Stop
                  </button>
                  <button
                    @click="testConnection('anthropic')"
                    :disabled="testingAnthropic"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="!testingAnthropic && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
                    @mouseleave="!testingAnthropic && ($event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)')"
                  >
                    <svg v-if="!testingAnthropic" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    {{ testingAnthropic ? 'Testing…' : 'Test' }}
                  </button>
                </div>
              </div>
              <div
                v-if="testResultAnthropic"
                :style="testResultAnthropic.ok
                  ? 'background:rgba(0,122,255,0.06); border:1px solid rgba(0,122,255,0.3); color:#1A1A1A;'
                  : 'background:rgba(255,59,48,0.05); border:1px solid rgba(255,59,48,0.3); color:#FF3B30;'"
                class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
                style="font-family:'Inter',sans-serif;"
              >
                <svg v-if="testResultAnthropic.ok" class="w-5 h-5 shrink-0 mt-0.5" style="color:#007AFF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="w-5 h-5 shrink-0 mt-0.5" style="color:#FF3B30;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResultAnthropic.message }}</span>
              </div>
            </div>
          </div>

          <!-- ── OpenRouter Tab ────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'openrouter'" class="space-y-4" style="background:#ffffff; border:1px solid #E5E5EA; border-top:none; border-radius:0 0 16px 16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">

            <!-- API Key -->
            <div>
              <label for="openrouterApiKey" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                API Key
                <span style="color:#9CA3AF; font-weight:400; margin-left:4px;">OPENROUTER_API_KEY</span>
              </label>
              <div class="relative">
                <input
                  id="openrouterApiKey"
                  v-model="form.openrouterApiKey"
                  :type="showOpenRouterKey ? 'text' : 'password'"
                  placeholder="sk-or-…"
                  class="field pr-10 font-mono"
                />
                <button
                  @click="showOpenRouterKey = !showOpenRouterKey"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                  style="color:#9CA3AF;"
                  :aria-label="showOpenRouterKey ? 'Hide key' : 'Show key'"
                  @mouseenter="$event.currentTarget.style.color='#007AFF'"
                  @mouseleave="$event.currentTarget.style.color='#9CA3AF'"
                >
                  <svg v-if="!showOpenRouterKey" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">Your OpenRouter API key — stored locally</p>
            </div>

            <!-- Base URL -->
            <div>
              <label for="openrouterBaseURL" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                Base URL
              </label>
              <input
                id="openrouterBaseURL"
                v-model="form.openrouterBaseURL"
                type="url"
                placeholder="https://openrouter.ai/api"
                class="field"
              />
              <p class="hint">OpenRouter base URL (without /v1 — the SDK adds it). Change only for custom proxies.</p>
            </div>

            <!-- Available Models -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <div class="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0;">Available Models</p>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:2px 0 0;">
                    {{ orModels.length > 0 ? `${orModels.length} models loaded` : 'Enter API key and fetch models' }}
                  </p>
                </div>
                <button
                  @click="fetchOrModels"
                  :disabled="orModelsFetching || !form.openrouterApiKey"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body); border-radius:10px;"
                  @mouseenter="!orModelsFetching && form.openrouterApiKey && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
                  @mouseleave="$event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'"
                >
                  <svg v-if="!orModelsFetching" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                  <svg v-else class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {{ orModelsFetching ? 'Fetching…' : 'Fetch Models' }}
                </button>
              </div>

              <!-- Model filter + dropdown -->
              <div v-if="orModels.length > 0" class="space-y-2">
                <input
                  v-model="orModelFilter"
                  type="text"
                  placeholder="Filter models…"
                  class="field font-mono"
                  style="font-size:var(--fs-small);"
                />
                <select
                  v-model="orSelectedTestModel"
                  class="field font-mono"
                  style="font-size:var(--fs-small); height:auto; padding:6px 8px;"
                  :size="Math.min(filteredOrModels.length, 8)"
                >
                  <option
                    v-for="m in filteredOrModels"
                    :key="m.id"
                    :value="m.id"
                  >{{ m.id }} — {{ m.name }}</option>
                </select>
                <p v-if="orSelectedTestModel" class="hint" style="color:#007AFF;">
                  Selected: <span class="font-mono">{{ orSelectedTestModel }}</span>
                </p>
              </div>

              <!-- Fetch error -->
              <div
                v-if="orModelsFetchError"
                class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
                style="background:rgba(255,59,48,0.05); border:1px solid rgba(255,59,48,0.3); color:#FF3B30; font-family:'Inter',sans-serif;"
              >
                <svg class="w-5 h-5 shrink-0 mt-0.5" style="color:#FF3B30;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ orModelsFetchError }}</span>
              </div>
            </div>

            <!-- OpenRouter Test Connection -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); color:#1A1A1A; font-weight:600; margin:0;">Test Connection</p>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#6B7280; margin:4px 0 0;">
                    {{ orSelectedTestModel ? `Test with ${orSelectedTestModel}` : 'Select a model above first' }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="testingOpenRouter"
                    @click="stopTest('openrouter')"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="$event.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="$event.currentTarget.style.background='rgba(255,59,48,0.08)'"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    Stop
                  </button>
                  <button
                    @click="testConnection('openrouter')"
                    :disabled="testingOpenRouter || !orSelectedTestModel"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="!testingOpenRouter && orSelectedTestModel && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
                    @mouseleave="!testingOpenRouter && ($event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)')"
                  >
                    <svg v-if="!testingOpenRouter" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    {{ testingOpenRouter ? 'Testing…' : 'Test' }}
                  </button>
                </div>
              </div>
              <div
                v-if="testResultOpenRouter"
                :style="testResultOpenRouter.ok
                  ? 'background:rgba(0,122,255,0.06); border:1px solid rgba(0,122,255,0.3); color:#1A1A1A;'
                  : 'background:rgba(255,59,48,0.05); border:1px solid rgba(255,59,48,0.3); color:#FF3B30;'"
                class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
                style="font-family:'Inter',sans-serif;"
              >
                <svg v-if="testResultOpenRouter.ok" class="w-5 h-5 shrink-0 mt-0.5" style="color:#007AFF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="w-5 h-5 shrink-0 mt-0.5" style="color:#FF3B30;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResultOpenRouter.message }}</span>
              </div>
            </div>
          </div>

          <!-- ── OpenAI Tab ──────────────────────────────────────────── -->
          <div v-if="activeProviderTab === 'openai'" class="space-y-4" style="background:#ffffff; border:1px solid #E5E5EA; border-top:none; border-radius:0 0 16px 16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">

            <!-- API Key -->
            <div>
              <label for="openaiApiKey" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                API Key
                <span style="color:#9CA3AF; font-weight:400; margin-left:4px;">x-api-key</span>
              </label>
              <div class="relative">
                <input
                  id="openaiApiKey"
                  v-model="form.openaiApiKey"
                  :type="showOpenAIKey ? 'text' : 'password'"
                  placeholder="your-openai-api-key"
                  class="field pr-10 font-mono"
                />
                <button
                  @click="showOpenAIKey = !showOpenAIKey"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors cursor-pointer"
                  style="color:#9CA3AF;"
                  :aria-label="showOpenAIKey ? 'Hide key' : 'Show key'"
                  @mouseenter="$event.currentTarget.style.color='#007AFF'"
                  @mouseleave="$event.currentTarget.style.color='#9CA3AF'"
                >
                  <svg v-if="!showOpenAIKey" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">OpenAI x-api-key — stored locally</p>
            </div>

            <!-- Base URL -->
            <div>
              <label for="openaiBaseURL" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                Base URL
              </label>
              <input
                id="openaiBaseURL"
                v-model="form.openaiBaseURL"
                type="url"
                placeholder="https://mlaas.virtuosgames.com"
                class="field"
              />
              <p class="hint">OpenAI base URL (without /proxy/openai/v1 — added automatically)</p>
            </div>

            <!-- Available Models -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <div class="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0;">Available Models</p>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:2px 0 0;">
                    {{ openaiModels.length > 0 ? `${openaiModels.length} models loaded` : 'Enter API key and fetch models' }}
                  </p>
                </div>
                <button
                  @click="fetchOpenAIModels"
                  :disabled="openaiModelsFetching || !form.openaiApiKey"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body); border-radius:10px;"
                  @mouseenter="!openaiModelsFetching && form.openaiApiKey && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
                  @mouseleave="$event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'"
                >
                  <svg v-if="!openaiModelsFetching" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                  </svg>
                  <svg v-else class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  {{ openaiModelsFetching ? 'Fetching…' : 'Fetch Models' }}
                </button>
              </div>

              <!-- Model filter + dropdown -->
              <div v-if="openaiModels.length > 0" class="space-y-2">
                <input
                  v-model="openaiModelFilter"
                  type="text"
                  placeholder="Filter models…"
                  class="field font-mono"
                  style="font-size:var(--fs-small);"
                />
                <select
                  v-model="openaiSelectedTestModel"
                  class="field font-mono"
                  style="font-size:var(--fs-small); height:auto; padding:6px 8px;"
                  :size="Math.min(filteredOpenAIModels.length, 8)"
                >
                  <option
                    v-for="m in filteredOpenAIModels"
                    :key="m.id"
                    :value="m.id"
                  >{{ m.id }} — {{ m.name }}</option>
                </select>
                <p v-if="openaiSelectedTestModel" class="hint" style="color:#007AFF;">
                  Selected: <span class="font-mono">{{ openaiSelectedTestModel }}</span>
                </p>
              </div>

              <!-- Fetch error -->
              <div
                v-if="openaiModelsFetchError"
                class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
                style="background:rgba(255,59,48,0.05); border:1px solid rgba(255,59,48,0.3); color:#FF3B30; font-family:'Inter',sans-serif;"
              >
                <svg class="w-5 h-5 shrink-0 mt-0.5" style="color:#FF3B30;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ openaiModelsFetchError }}</span>
              </div>
            </div>

            <!-- OpenAI Test Connection -->
            <div style="border-top:1px solid #E5E5EA; padding-top:12px;">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); color:#1A1A1A; font-weight:600; margin:0;">Test Connection</p>
                  <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#6B7280; margin:4px 0 0;">
                    {{ openaiSelectedTestModel ? `Test with ${openaiSelectedTestModel}` : 'Select a model above first' }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="testingOpenAI"
                    @click="stopTest('openai')"
                    class="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="$event.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="$event.currentTarget.style.background='rgba(255,59,48,0.08)'"
                  >
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                    Stop
                  </button>
                  <button
                    @click="testConnection('openai')"
                    :disabled="testingOpenAI || !openaiSelectedTestModel"
                    class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; font-size:var(--fs-body);"
                    @mouseenter="!testingOpenAI && openaiSelectedTestModel && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
                    @mouseleave="!testingOpenAI && ($event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)')"
                  >
                    <svg v-if="!testingOpenAI" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    {{ testingOpenAI ? 'Testing…' : 'Test' }}
                  </button>
                </div>
              </div>
              <div
                v-if="testResultOpenAI"
                :style="testResultOpenAI.ok
                  ? 'background:rgba(0,122,255,0.06); border:1px solid rgba(0,122,255,0.3); color:#1A1A1A;'
                  : 'background:rgba(255,59,48,0.05); border:1px solid rgba(255,59,48,0.3); color:#FF3B30;'"
                class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
                style="font-family:'Inter',sans-serif;"
              >
                <svg v-if="testResultOpenAI.ok" class="w-5 h-5 shrink-0 mt-0.5" style="color:#007AFF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="w-5 h-5 shrink-0 mt-0.5" style="color:#FF3B30;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResultOpenAI.message }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Section: Skills ──────────────────────────────────────────── -->
        <section>
          <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); font-weight:700; color:#1A1A1A; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">Skills</h2>
          <div class="space-y-4" style="background:#ffffff; border:1px solid #E5E5EA; border-radius:16px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
            <div>
              <label for="skillsPath" class="block mb-1.5" style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:500; color:#6B7280;">
                Skills Path
              </label>
              <input
                id="skillsPath"
                v-model="form.skillsPath"
                type="text"
                placeholder="~/.claude/skills"
                class="field font-mono"
              />
              <p class="hint">Directory containing skill folders. Leave empty for default: ~/.claude/skills</p>
            </div>
          </div>
        </section>

        <!-- ── Save ──────────────────────────────────────────────────────── -->
        <div class="flex items-center gap-3">
          <button
            @click="save"
            :disabled="saving"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color:#ffffff; font-family:'Inter',sans-serif; border:none; border-radius:12px; font-size:var(--fs-body);"
            @mouseenter="!saving && ($event.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)')"
            @mouseleave="!saving && ($event.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)')"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
          <span v-if="savedMsg" class="text-sm animate-fade-in" style="color:#007AFF; font-family:'Inter',sans-serif;">{{ savedMsg }}</span>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()

const isElectron = !!(typeof window !== 'undefined' && window.electronAPI)
const showKey  = ref(false)
const showOpenRouterKey = ref(false)
const saving   = ref(false)
const savedMsg = ref('')
const activeProviderTab = ref('anthropic')

// Per-provider test state
const testingAnthropic = ref(false)
const testingOpenRouter = ref(false)
const testResultAnthropic = ref(null)
const testResultOpenRouter = ref(null)

// OpenRouter model list
const orModels = ref([])
const orModelsFetching = ref(false)
const orModelsFetchError = ref('')
const orModelFilter = ref('')
const orSelectedTestModel = ref('')

// OpenAI state
const showOpenAIKey = ref(false)
const testingOpenAI = ref(false)
const testResultOpenAI = ref(null)
const openaiModels = ref([])
const openaiModelsFetching = ref(false)
const openaiModelsFetchError = ref('')
const openaiModelFilter = ref('')
const openaiSelectedTestModel = ref('')

const filteredOrModels = computed(() => {
  if (!orModelFilter.value) return orModels.value
  const q = orModelFilter.value.toLowerCase()
  return orModels.value.filter(m =>
    m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  )
})

const filteredOpenAIModels = computed(() => {
  if (!openaiModelFilter.value) return openaiModels.value
  const q = openaiModelFilter.value.toLowerCase()
  return openaiModels.value.filter(m =>
    m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
  )
})

async function fetchOpenAIModels() {
  if (!window.electronAPI?.fetchOpenAIModels) {
    openaiModelsFetchError.value = 'Not running inside Electron.'
    return
  }
  if (!form.openaiApiKey) {
    openaiModelsFetchError.value = 'Enter an API key first.'
    return
  }
  openaiModelsFetching.value = true
  openaiModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenAIModels({
      apiKey: form.openaiApiKey,
      baseURL: form.openaiBaseURL
    })
    if (result.success) {
      openaiModels.value = result.models
      openaiSelectedTestModel.value = ''
    } else {
      openaiModelsFetchError.value = result.error || 'Unknown error'
    }
  } catch (err) {
    openaiModelsFetchError.value = err.message
  } finally {
    openaiModelsFetching.value = false
  }
}

async function fetchOrModels() {
  if (!window.electronAPI?.fetchOpenRouterModels) {
    orModelsFetchError.value = 'Not running inside Electron.'
    return
  }
  if (!form.openrouterApiKey) {
    orModelsFetchError.value = 'Enter an API key first.'
    return
  }
  orModelsFetching.value = true
  orModelsFetchError.value = ''
  try {
    const result = await window.electronAPI.fetchOpenRouterModels({
      apiKey: form.openrouterApiKey,
      baseURL: form.openrouterBaseURL
    })
    if (result.success) {
      orModels.value = result.models
      orSelectedTestModel.value = ''
    } else {
      orModelsFetchError.value = result.error || 'Unknown error'
    }
  } catch (err) {
    orModelsFetchError.value = err.message
  } finally {
    orModelsFetching.value = false
  }
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
  openaiApiKey:      '',
  openaiBaseURL:     'https://mlaas.virtuosgames.com',
  openaiModel:       '',
  defaultProvider:   'anthropic'
})

const providerOptions = [
  { value: 'anthropic',   label: 'Anthropic'   },
  { value: 'openrouter',  label: 'OpenRouter'  },
  { value: 'openai',      label: 'OpenAI'      }
]

const modelOptions = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus',   label: 'Opus'   },
  { value: 'haiku',  label: 'Haiku'  }
]

function modelIdPreview(which) {
  if (which === 'opus')  return form.opusModel  || '—'
  if (which === 'haiku') return form.haikuModel || '—'
  return form.sonnetModel || '—'
}

onMounted(() => {
  Object.assign(form, configStore.config)
})

async function save() {
  saving.value = true
  try {
    await configStore.saveConfig({ ...form })
    savedMsg.value = 'Saved'
    setTimeout(() => { savedMsg.value = '' }, 2000)
  } finally {
    saving.value = false
  }
}

const TEST_TIMEOUT_MS = 20000
let testAbortAnthropic = false
let testAbortOpenRouter = false
let testAbortOpenAI = false

function stopTest(provider) {
  const chatIdMap = { anthropic: 'test', openrouter: 'test-openrouter', openai: 'test-openai' }
  const chatId = chatIdMap[provider] || 'test'
  if (provider === 'anthropic') testAbortAnthropic = true
  else if (provider === 'openai') testAbortOpenAI = true
  else testAbortOpenRouter = true
  if (window.electronAPI?.stopAgent) window.electronAPI.stopAgent(chatId)
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
    testingAnthropic.value = true
    testResultAnthropic.value = null
    testAbortAnthropic = false
    const timer = setTimeout(() => stopTest('anthropic'), TEST_TIMEOUT_MS)
    try {
      const res = await window.electronAPI.runAgent({
        chatId: 'test',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        config: { ...form },
        enabledAgents: [],
        enabledSkills: []
      })
      clearTimeout(timer)
      if (testAbortAnthropic) {
        testResultAnthropic.value = { ok: false, message: 'Test stopped.' }
      } else {
        testResultAnthropic.value = res.success
          ? { ok: true, message: `Connected · ${modelIdPreview(form.activeModel)} · "${res.result?.substring(0, 60)}"` }
          : { ok: false, message: res.error }
      }
    } catch (err) {
      clearTimeout(timer)
      testResultAnthropic.value = testAbortAnthropic
        ? { ok: false, message: 'Test stopped.' }
        : { ok: false, message: err.message }
    } finally {
      testingAnthropic.value = false
    }
  } else if (provider === 'openai') {
    testingOpenAI.value = true
    testResultOpenAI.value = null
    testAbortOpenAI = false
    const testModel = openaiSelectedTestModel.value
    if (!testModel) {
      testResultOpenAI.value = { ok: false, message: 'Select a model from the list above first.' }
      testingOpenAI.value = false
      return
    }
    const timer = setTimeout(() => stopTest('openai'), TEST_TIMEOUT_MS)
    try {
      const openaiConfig = {
        ...form,
        openaiApiKey: form.openaiApiKey,
        openaiBaseURL: form.openaiBaseURL,
        customModel: testModel,
        _resolvedProvider: 'openai',
        defaultProvider: 'openai',
      }
      const res = await window.electronAPI.runAgent({
        chatId: 'test-openai',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        config: openaiConfig,
        enabledAgents: [],
        enabledSkills: []
      })
      clearTimeout(timer)
      if (testAbortOpenAI) {
        testResultOpenAI.value = { ok: false, message: 'Test stopped.' }
      } else {
        testResultOpenAI.value = res.success
          ? { ok: true, message: `Connected · ${testModel} · "${res.result?.substring(0, 60)}"` }
          : { ok: false, message: res.error }
      }
    } catch (err) {
      clearTimeout(timer)
      testResultOpenAI.value = testAbortOpenAI
        ? { ok: false, message: 'Test stopped.' }
        : { ok: false, message: err.message }
    } finally {
      testingOpenAI.value = false
    }
  } else {
    testingOpenRouter.value = true
    testResultOpenRouter.value = null
    testAbortOpenRouter = false
    const testModel = orSelectedTestModel.value
    if (!testModel) {
      testResultOpenRouter.value = { ok: false, message: 'Select a model from the list above first.' }
      testingOpenRouter.value = false
      return
    }
    const timer = setTimeout(() => stopTest('openrouter'), TEST_TIMEOUT_MS)
    try {
      const orConfig = {
        ...form,
        apiKey: form.openrouterApiKey,
        baseURL: form.openrouterBaseURL,
        customModel: testModel,
      }
      const res = await window.electronAPI.runAgent({
        chatId: 'test-openrouter',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        config: orConfig,
        enabledAgents: [],
        enabledSkills: []
      })
      clearTimeout(timer)
      if (testAbortOpenRouter) {
        testResultOpenRouter.value = { ok: false, message: 'Test stopped.' }
      } else {
        testResultOpenRouter.value = res.success
          ? { ok: true, message: `Connected · ${testModel} · "${res.result?.substring(0, 60)}"` }
          : { ok: false, message: res.error }
      }
    } catch (err) {
      clearTimeout(timer)
      testResultOpenRouter.value = testAbortOpenRouter
        ? { ok: false, message: 'Test stopped.' }
        : { ok: false, message: err.message }
    } finally {
      testingOpenRouter.value = false
    }
  }
}
</script>

<style scoped>
.field {
  @apply w-full rounded-lg px-3 py-2 text-sm transition-colors;
  background: #ffffff;
  border: 1px solid #E5E5EA;
  color: #1A1A1A;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  outline: none;
  width: 100%;
  display: block;
}
.field::placeholder {
  color: #9CA3AF;
}
.field:focus {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
  outline: none;
}
.hint {
  @apply mt-1;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
}
.model-btn:not([style*="#0F0F0F"]):hover {
  border-color: #D1D1D6 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
