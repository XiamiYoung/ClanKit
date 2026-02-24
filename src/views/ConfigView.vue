<template>
  <div class="h-full flex flex-col overflow-hidden" style="background:#F8FAFC;">
    <!-- Header -->
    <div class="shrink-0 px-6 py-4" style="background:#ffffff; border-bottom:1px solid #E2E8F0;">
      <div class="flex items-center justify-between">
        <div>
          <h1 style="font-family:'Figtree',serif; font-size:var(--fs-page-title); color:#1E293B; font-weight:600; margin:0;">Configuration</h1>
          <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); color:#475569; margin:4px 0 0;">LLM backend endpoint and model settings</p>
        </div>
        <!-- Electron / Browser mode indicator -->
        <div
          :style="isElectron
            ? 'background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.3); color:#3B82F6;'
            : 'background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.4); color:#92400e;'"
          style="display:flex; align-items:center; gap:6px; font-size:var(--fs-body); padding:4px 10px; border-radius:9999px; font-family:'Noto Sans',sans-serif;"
        >
          <div
            :style="isElectron ? 'background:#3B82F6;' : 'background:#d97706;'"
            style="width:6px; height:6px; border-radius:50%;"
          ></div>
          {{ isElectron ? 'Electron' : 'Browser only — agent loop disabled' }}
        </div>
      </div>
    </div>

    <!-- Scrollable content -->
    <div class="flex-1 overflow-y-auto px-6 py-6" style="background:#F8FAFC;">
      <div class="max-w-xl space-y-6">

        <!-- ── Section: Endpoint ─────────────────────────────────────────── -->
        <section>
          <h2 style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); font-weight:600; color:#64748B; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">Endpoint</h2>
          <div class="space-y-4" style="background:#ffffff; border:1px solid #E2E8F0; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(15,23,42,0.06);">

            <!-- Field 1: API Key -->
            <div>
              <label for="apiKey" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
                API Key
                <span style="color:#64748B; font-weight:400; margin-left:4px;">ANTHROPIC_API_KEY</span>
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
                  style="color:#64748B;"
                  :aria-label="showKey ? 'Hide key' : 'Show key'"
                  @mouseenter="$event.currentTarget.style.color='#3B82F6'"
                  @mouseleave="$event.currentTarget.style.color='#64748B'"
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

            <!-- Field 2: Base URL -->
            <div>
              <label for="baseURL" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
                Base URL
                <span style="color:#64748B; font-weight:400; margin-left:4px;">ANTHROPIC_BASE_URL</span>
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
          </div>
        </section>

        <!-- ── Section: Models ──────────────────────────────────────────── -->
        <section>
          <h2 style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); font-weight:600; color:#64748B; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">Models</h2>
          <div class="space-y-4" style="background:#ffffff; border:1px solid #E2E8F0; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(15,23,42,0.06);">

            <!-- Field 3: Sonnet -->
            <div>
              <label for="sonnetModel" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
                Sonnet Model
                <span style="color:#64748B; font-weight:400; margin-left:4px;">ANTHROPIC_DEFAULT_SONNET_MODEL</span>
              </label>
              <input
                id="sonnetModel"
                v-model="form.sonnetModel"
                type="text"
                placeholder="anthropic/claude-sonnet-latest"
                class="field font-mono"
              />
            </div>

            <!-- Field 4: Opus -->
            <div>
              <label for="opusModel" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
                Opus Model
                <span style="color:#64748B; font-weight:400; margin-left:4px;">ANTHROPIC_DEFAULT_OPUS_MODEL</span>
              </label>
              <input
                id="opusModel"
                v-model="form.opusModel"
                type="text"
                placeholder="anthropic/claude-opus-latest"
                class="field font-mono"
              />
            </div>

            <!-- Field 5: Haiku -->
            <div>
              <label for="haikuModel" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
                Haiku Model
                <span style="color:#64748B; font-weight:400; margin-left:4px;">ANTHROPIC_DEFAULT_HAIKU_MODEL</span>
              </label>
              <input
                id="haikuModel"
                v-model="form.haikuModel"
                type="text"
                placeholder="anthropic/claude-3-5-haiku-20241022"
                class="field font-mono"
              />
            </div>

            <!-- Active model selector -->
            <div class="pt-1" style="border-top:1px solid #E2E8F0;">
              <p class="mb-2" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">Active model for chat</p>
              <div class="flex gap-2">
                <button
                  v-for="opt in modelOptions"
                  :key="opt.value"
                  @click="form.activeModel = opt.value"
                  :style="form.activeModel === opt.value
                    ? 'background:rgba(59,130,246,0.1); border:1px solid #3B82F6; color:#3B82F6;'
                    : 'background:#ffffff; border:1px solid #E2E8F0; color:#475569;'"
                  class="flex-1 py-1.5 rounded-lg font-medium transition-all duration-150 cursor-pointer model-btn"
                  style="font-size:var(--fs-body); font-family:'Noto Sans',sans-serif;"
                >
                  {{ opt.label }}
                  <span class="block font-normal truncate px-1" style="color:#64748B; font-size:var(--fs-small);">
                    {{ modelIdPreview(opt.value) }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Section: Skills ──────────────────────────────────────────── -->
        <section>
          <h2 style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); font-weight:600; color:#64748B; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:12px;">Skills</h2>
          <div class="space-y-4" style="background:#ffffff; border:1px solid #E2E8F0; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(15,23,42,0.06);">
            <div>
              <label for="skillsPath" class="block mb-1.5" style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-body); font-weight:500; color:#475569;">
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

        <!-- ── Test Connection ───────────────────────────────────────────── -->
        <section>
          <div style="background:#ffffff; border:1px solid #E2E8F0; border-radius:12px; padding:16px; box-shadow:0 2px 8px rgba(15,23,42,0.06);" class="flex items-center justify-between gap-4">
            <div>
              <p style="font-family:'Figtree',serif; font-size:var(--fs-subtitle); color:#1E293B; font-weight:600; margin:0;">Test Connection</p>
              <p style="font-family:'Noto Sans',sans-serif; font-size:var(--fs-secondary); color:#475569; margin:4px 0 0;">Verify endpoint and key are working</p>
            </div>
            <button
              @click="testConnection"
              :disabled="testing"
              class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style="background:#3B82F6; color:#ffffff; font-family:'Noto Sans',sans-serif; border:none; font-size:var(--fs-body);"
              @mouseenter="!testing && ($event.currentTarget.style.background='#1D4ED8')"
              @mouseleave="!testing && ($event.currentTarget.style.background='#3B82F6')"
            >
              <svg v-if="!testing" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
              <svg v-else class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              {{ testing ? 'Testing…' : 'Test' }}
            </button>
          </div>
          <div
            v-if="testResult"
            :style="testResult.ok
              ? 'background:rgba(59,130,246,0.06); border:1px solid rgba(59,130,246,0.3); color:#1E293B;'
              : 'background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.3); color:#dc2626;'"
            class="mt-2 px-4 py-2.5 rounded-lg text-sm flex items-start gap-2"
            style="font-family:'Noto Sans',sans-serif;"
          >
            <svg v-if="testResult.ok" class="w-5 h-5 shrink-0 mt-0.5" style="color:#3B82F6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <svg v-else class="w-5 h-5 shrink-0 mt-0.5" style="color:#dc2626;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{{ testResult.message }}</span>
          </div>
        </section>

        <!-- ── Save ──────────────────────────────────────────────────────── -->
        <div class="flex items-center gap-3">
          <button
            @click="save"
            :disabled="saving"
            class="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style="background:#3B82F6; color:#ffffff; font-family:'Noto Sans',sans-serif; border:none; box-shadow:0 2px 8px rgba(15,23,42,0.18); font-size:var(--fs-body);"
            @mouseenter="!saving && ($event.currentTarget.style.background='#1D4ED8')"
            @mouseleave="!saving && ($event.currentTarget.style.background='#3B82F6')"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            {{ saving ? 'Saving…' : 'Save Changes' }}
          </button>
          <span v-if="savedMsg" class="text-sm animate-fade-in" style="color:#3B82F6; font-family:'Noto Sans',sans-serif;">{{ savedMsg }}</span>
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
const saving   = ref(false)
const testing  = ref(false)
const savedMsg = ref('')
const testResult = ref(null)

const form = reactive({
  apiKey:      '',
  baseURL:     '',
  sonnetModel: '',
  opusModel:   '',
  haikuModel:  '',
  activeModel: 'sonnet',
  skillsPath:  ''
})

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

async function testConnection() {
  if (!window.electronAPI?.runAgent) {
    testResult.value = { ok: false, message: 'Not running inside Electron. Open the app with npm run dev from WSL — do not use the browser tab at localhost:5173.' }
    return
  }
  testing.value  = true
  testResult.value = null
  try {
    const res = await window.electronAPI.runAgent({
      chatId: 'test',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      config: { ...form },
      enabledAgents: [],
      enabledSkills: []
    })
    testResult.value = res.success
      ? { ok: true,  message: `Connected · ${modelIdPreview(form.activeModel)} · "${res.result?.substring(0, 60)}"` }
      : { ok: false, message: res.error }
  } catch (err) {
    testResult.value = { ok: false, message: err.message }
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.field {
  @apply w-full rounded-lg px-3 py-2 text-sm transition-colors;
  background: #ffffff;
  border: 1px solid #E2E8F0;
  color: #1E293B;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  outline: none;
  width: 100%;
  display: block;
}
.field::placeholder {
  color: #64748B;
}
.field:focus {
  border-color: #3B82F6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
  outline: none;
}
.hint {
  @apply mt-1;
  color: #64748B;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
}
.model-btn:not([style*="rgba(59,130,246"]):hover {
  border-color: #3B82F6 !important;
}
</style>
