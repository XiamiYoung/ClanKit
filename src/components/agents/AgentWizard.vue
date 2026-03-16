<template>
  <!-- Backdrop -->
  <div class="wiz-backdrop">
    <div class="wiz-modal">
      <!-- Header -->
      <div class="wiz-header">
        <div class="wiz-header-left">
          <div class="wiz-header-icon" :style="{ background: 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)' }">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="type === 'system'" d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0" />
              <path v-else d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </svg>
          </div>
          <h2 class="wiz-title">{{ editAgent ? t('agents.editAgent') : t('agents.newAgent') }} {{ type === 'system' ? t('agents.systemAgent') : t('agents.userAgent') }}</h2>
        </div>
        <button class="wiz-close-btn" @click="$emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Mode picker (new agent only, before any flow starts) -->
      <div v-if="!editAgent && !creationMode && !generating && !showPreview" class="wiz-mode-picker">
        <p class="wiz-mode-hint">How do you want to create this agent?</p>
        <div class="wiz-mode-cards">
          <button class="wiz-mode-card" @click="selectMode('guided')">
            <div class="wiz-mode-icon">
              <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
            </div>
            <span class="wiz-mode-label">{{ t('agents.stepMeThrough') }}</span>
            <span class="wiz-mode-desc">{{ t('agents.stepMeThroughDesc') }}</span>
          </button>
          <button class="wiz-mode-card" @click="selectMode('describe')">
            <div class="wiz-mode-icon">
              <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <span class="wiz-mode-label">{{ t('agents.describeIt') }}</span>
            <span class="wiz-mode-desc">{{ t('agents.describeItDesc') }}</span>
          </button>
          <button class="wiz-mode-card" @click="selectMode('random')">
            <div class="wiz-mode-icon">
              <svg style="width:22px;height:22px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.5 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.7l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>
            </div>
            <span class="wiz-mode-label">{{ t('agents.surpriseMe') }}</span>
            <span class="wiz-mode-desc">AI picks something interesting</span>
          </button>
        </div>
      </div>

      <!-- Generating spinner -->
      <div v-if="generating && !showPreview" class="wiz-generating">
        <div class="wiz-gen-dots"><span></span><span></span><span></span></div>
        <p class="wiz-gen-label">{{ t('agents.generating') }}</p>
      </div>

      <!-- Chat area (hidden in edit mode when no messages) -->
      <div v-if="chatMessages.length > 0" class="wiz-chat" ref="chatEl">
        <div v-for="(msg, i) in chatMessages" :key="i" class="wiz-msg" :class="msg.from">
          <!-- AI message -->
          <template v-if="msg.from === 'ai'">
            <div class="wiz-msg-avatar ai" :style="{ background: 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }">
              <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
            </div>
            <div class="wiz-msg-bubble ai">
              <p v-html="msg.text"></p>
              <!-- Options if present -->
              <div v-if="msg.options && msg.active" class="wiz-options">
                <button
                  v-for="opt in msg.options"
                  :key="opt.value"
                  class="wiz-option-btn"
                  :class="{ selected: isOptionSelected(opt.value) }"
                  @click="selectOption(msg, opt)"
                >{{ opt.label }}</button>
                <button class="wiz-option-done" @click="confirmOptions">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Done
                </button>
              </div>
              <!-- Avatar picker trigger -->
              <div v-if="msg.avatarPicker && msg.active" class="wiz-avatar-trigger">
                <button class="wiz-pick-avatar-btn" @click="showAvatarPicker = true">
                  <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {{ t('agents.browseAvatars', 'Browse Avatars') }}
                </button>
                <span v-if="form.avatar" class="wiz-avatar-preview-inline">
                  <img :src="selectedAvatarDataUri" alt="" style="width:44px;height:44px;border-radius:50%;" />
                  <span class="wiz-avatar-selected-label">{{ t('common.selected') }}</span>
                </span>
              </div>
              <!-- Provider combo (system agents only) -->
              <div v-if="msg.providerPicker && msg.active" class="wiz-model-provider">
                <ProviderModelPicker
                  :provider="form.providerId"
                  :model="form.modelId"
                  @update:provider="val => { form.providerId = val; form.modelId = null }"
                  @update:model="val => form.modelId = val"
                />
                <span v-if="showValidation && !form.providerId" class="wiz-error">Provider is required</span>
                <span v-if="showValidation && form.providerId && !form.modelId" class="wiz-error">Model is required</span>
                <button class="wiz-option-done" @click="confirmProviderModel" style="margin-top:0.5rem;">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Continue
                </button>
              </div>
            </div>
          </template>

          <!-- User message -->
          <template v-if="msg.from === 'user'">
            <div class="wiz-msg-bubble user">
              <p>{{ msg.text }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- Input area (when waiting for text input) -->
      <div v-if="awaitingTextInput" class="wiz-input-bar">
        <textarea
          ref="inputEl"
          v-model="inputText"
          class="wiz-input"
          :placeholder="inputPlaceholder"
          @keydown.enter.exact="submitInput"
          rows="2"
          autofocus
        ></textarea>
        <button
          class="wiz-send-btn"
          :disabled="!inputText.trim()"
          @click="submitInput"
          aria-label="Send"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>

      <!-- Preview & Save area (final step) -->
      <div v-if="showPreview" class="wiz-preview-body">
        <!-- Avatar display + change button -->
        <div class="wiz-preview-avatar-row">
          <div class="wiz-preview-avatar">
            <img v-if="form.avatar" :src="selectedAvatarDataUri" alt="" style="width:56px;height:56px;border-radius:50%;" />
            <div v-else class="wiz-preview-avatar-placeholder">?</div>
          </div>
          <div class="wiz-preview-avatar-meta">
            <input
              v-model="form.name"
              class="wiz-name-input"
              :placeholder="type === 'system' ? 'Agent name...' : 'Your name or alias...'"
            />
            <button class="wiz-change-avatar-btn" @click="showAvatarPicker = true">Change Avatar</button>
          </div>
        </div>
        <!-- Provider / Model config (system agents) — above prompt -->
        <div v-if="type === 'system'" class="wiz-preview-config">
          <div class="wpc-section">
            <div class="wpc-label">Provider & Model <span style="color:#EF4444">*</span></div>
            <ProviderModelPicker
              :provider="form.providerId"
              :model="form.modelId"
              @update:provider="val => { form.providerId = val; form.modelId = null }"
              @update:model="val => form.modelId = val"
            />
            <span v-if="showValidation && !form.providerId" class="wiz-error">Provider is required</span>
            <span v-if="showValidation && form.providerId && !form.modelId" class="wiz-error">Model is required</span>
          </div>
        </div>
        <!-- Voice selector (system agents) -->
        <div v-if="type === 'system'" class="wiz-preview-config" style="margin-bottom:0.75rem;">
          <div class="wpc-section" style="margin-bottom:0;">
            <div class="wpc-label">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              TTS Voice
            </div>
            <div class="wpc-btn-row" style="flex-wrap:wrap;">
              <button
                v-for="v in voiceOptions"
                :key="v.value"
                class="wpc-btn"
                :class="{ active: form.voiceId === v.value }"
                :title="v.desc"
                @click="form.voiceId = v.value"
              >{{ v.label }}</button>
            </div>
          </div>
        </div>
        <!-- Plaza Style (system agents) -->
        <div v-if="type === 'system'" class="wiz-preview-config" style="margin-bottom:0.75rem;">
          <div class="wpc-section" style="margin-bottom:0;">
            <div class="wpc-label" @click="plazaExpanded = !plazaExpanded" style="cursor:pointer;user-select:none;">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/></svg>
              Plaza Style
              <svg style="width:10px;height:10px;margin-left:auto;transition:transform 0.15s;" :style="{ transform: plazaExpanded ? 'rotate(180deg)' : '' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div v-if="plazaExpanded" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.5rem;">
              <div class="wpc-btn-row" style="flex-wrap:wrap;">
                <button
                  v-for="p in PLAZA_PERSONALITIES"
                  :key="p.value"
                  class="wpc-btn"
                  :class="{ active: form.plazaPersonality === p.value }"
                  @click="form.plazaPersonality = form.plazaPersonality === p.value ? '' : p.value"
                >{{ p.label }}</button>
              </div>
              <textarea
                v-model="form.plazaDebatePrompt"
                class="wiz-preview-textarea"
                rows="2"
                placeholder="Optional debate prompt addendum (e.g. 'You tend to question assumptions...')"
                style="min-height:3rem;"
              ></textarea>
            </div>
          </div>
        </div>
        <!-- Capabilities: Tools, Skills, MCP, Knowledge -->
        <div v-if="type === 'system'" class="wiz-preview-config" style="margin-bottom:0.75rem;">
          <div class="wpc-section" style="margin-bottom:0;">
            <div class="wpc-label">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              Capabilities
            </div>
            <!-- Tab buttons -->
            <div class="cap-tab-buttons">
              <button
                v-for="tab in capTabOptions"
                :key="tab.key"
                class="cap-tab-btn"
                :class="{ active: activeCapTab === tab.key }"
                @click="activeCapTab = tab.key"
              >
                {{ tab.label }}
                <span v-if="getCapCount(tab.key) > 0" class="cap-badge">{{ getCapCount(tab.key) }}</span>
              </button>
            </div>
            <!-- Tab content -->
            <div class="cap-tab-content">
              <!-- Tools -->
              <div v-if="activeCapTab === 'tools'" class="cap-items">
                <div v-if="availableTools.length === 0" class="cap-empty">No tools available</div>
                <label v-for="t in availableTools" :key="t.id" class="cap-item">
                  <input type="checkbox" :value="t.id" v-model="form.requiredToolIds" />
                  <span class="cap-item-name">{{ t.name }}</span>
                  <span class="cap-item-desc">{{ t.description || t.category || '' }}</span>
                </label>
              </div>
              <!-- Skills -->
              <div v-if="activeCapTab === 'skills'" class="cap-items">
                <div v-if="availableSkills.length === 0" class="cap-empty">No skills available</div>
                <label v-for="s in availableSkills" :key="s.id" class="cap-item">
                  <input type="checkbox" :value="s.id" v-model="form.requiredSkillIds" />
                  <span class="cap-item-name">{{ s.name }}</span>
                  <span class="cap-item-desc">{{ s.summary || '' }}</span>
                </label>
              </div>
              <!-- MCP Servers -->
              <div v-if="activeCapTab === 'mcp'" class="cap-items">
                <div v-if="availableMcpServers.length === 0" class="cap-empty">No MCP servers configured</div>
                <label v-for="m in availableMcpServers" :key="m.id" class="cap-item">
                  <input type="checkbox" :value="m.id" v-model="form.requiredMcpServerIds" />
                  <span class="cap-item-name">{{ m.name }}</span>
                  <span class="cap-item-desc">{{ m.description || '' }}</span>
                </label>
              </div>
              <!-- Knowledge -->
              <div v-if="activeCapTab === 'knowledge'" class="cap-items">
                <div v-if="availableKnowledgeBases.length === 0" class="cap-empty">No knowledge bases configured</div>
                <label v-for="k in availableKnowledgeBases" :key="k.id" class="cap-item">
                  <input type="checkbox" :value="k.id" v-model="form.requiredKnowledgeBaseIds" />
                  <span class="cap-item-name">{{ k.name }}</span>
                  <span class="cap-item-desc">{{ k.description || '' }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <!-- Generated prompt -->
        <div class="wiz-preview-prompt">
          <label class="wiz-preview-label">Generated prompt (editable)</label>
          <textarea
            v-model="form.generatedPrompt"
            class="wiz-preview-textarea"
          ></textarea>
        </div>
        <!-- AI Enhance + Rewrite row -->
        <div class="wiz-enhance-row">
          <AppButton
            size="compact"
            :disabled="enhancing || generating || !form.generatedPrompt.trim()"
            :loading="enhancing"
            @click="enhancePrompt"
          >
            <svg v-if="!enhancing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
            {{ enhancing ? 'Enhancing...' : 'AI Enhance' }}
          </AppButton>
          <AppButton
            size="compact"
            variant="secondary"
            :disabled="enhancing || generating"
            @click="showRewriteInput = !showRewriteInput; rewriteText = ''"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Rewrite from description
          </AppButton>
          <AppButton
            v-if="preEnhancePrompt"
            variant="secondary"
            size="compact"
            @click="revertEnhance"
          >Revert</AppButton>
        </div>

        <!-- Rewrite input (inline, toggled) -->
        <div v-if="showRewriteInput" class="wiz-rewrite-wrap">
          <textarea
            v-model="rewriteText"
            class="wiz-rewrite-textarea"
            placeholder='Describe the new agent... e.g. "a grumpy doctor like House MD", "Gordon Ramsay for code reviews", "Yoda but as a DevOps engineer"'
            rows="3"
            autofocus
          ></textarea>
          <div class="wiz-rewrite-actions">
            <AppButton
              size="compact"
              :loading="generating"
              :disabled="!rewriteText.trim() || generating"
              @click="generateAgentFromAI(rewriteText, true)"
            >
              <svg v-if="!generating" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8"/></svg>
              {{ generating ? t('agents.generating') : t('common.create') }}
            </AppButton>
            <AppButton
              size="compact"
              variant="secondary"
              :disabled="generating"
              @click="showRewriteInput = false; rewriteText = ''"
            >Cancel</AppButton>
          </div>
        </div>

        <span v-if="aiError" class="wiz-ai-error">{{ aiError }}</span>
      </div>

      <!-- Footer with actions (matches ccm-footer) -->
      <div v-if="showPreview" class="wiz-footer">
        <button class="wiz-cancel-btn" @click="$emit('close')">Cancel</button>
        <button
          class="wiz-done-btn"
          :disabled="!form.generatedPrompt.trim() || saving"
          @click="save"
        >{{ saving ? 'Saving...' : editAgent ? 'Save Changes' : 'Create Agent' }}</button>
      </div>
    </div>

    <!-- Avatar picker dialog -->
    <AvatarPicker
      v-if="showAvatarPicker"
      :currentAvatarId="form.avatar"
      @select="onAvatarPicked"
      @close="showAvatarPicker = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, computed, onMounted } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { useModelsStore } from '../../stores/models'
import { useToolsStore } from '../../stores/tools'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { getAvatarDataUri } from './agentAvatars'
import AvatarPicker from './AvatarPicker.vue'
import AppButton from '../common/AppButton.vue'
import ProviderModelPicker from '../common/ProviderModelPicker.vue'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  type: { type: String, required: true },
  editAgent: { type: Object, default: null },
})

const emit = defineEmits(['close', 'saved'])
const agentsStore = useAgentsStore()
const configStore = useConfigStore()
const modelsStore = useModelsStore()
const toolsStore = useToolsStore()
const skillsStore = useSkillsStore()
const mcpStore = useMcpStore()
const knowledgeStore = useKnowledgeStore()


const chatEl = ref(null)
const inputEl = ref(null)
const inputText = ref('')
const showAvatarPicker = ref(false)

const selectedAvatarDataUri = computed(() => getAvatarDataUri(form.avatar))

const form = reactive({
  name: '',
  avatar: '',
  role: '',
  tone: [],
  customInstructions: '',
  description: '',
  generatedPrompt: '',
  providerId: 'anthropic',
  modelId: '',
  voiceId: 'alloy',
  plazaPersonality: '',
  plazaDebatePrompt: '',
  // Capability selections
  requiredToolIds: [],
  requiredSkillIds: [],
  requiredMcpServerIds: [],
  requiredKnowledgeBaseIds: [],
})

const plazaExpanded = ref(false)

// Capability tabs
const activeCapTab = ref('tools')

const capTabOptions = [
  { key: 'tools', label: 'Tools', icon: 'wrench' },
  { key: 'skills', label: 'Skills', icon: 'book' },
  { key: 'mcp', label: 'MCP Servers', icon: 'server' },
  { key: 'knowledge', label: 'Knowledge', icon: 'database' },
]

const availableTools = computed(() => toolsStore.tools || [])
const availableSkills = computed(() => skillsStore.skills || [])
const availableMcpServers = computed(() => mcpStore.servers || [])
const availableKnowledgeBases = computed(() => {
  // Use indexConfigs as knowledge bases
  const configs = knowledgeStore.indexConfigs || {}
  return Object.entries(configs).map(([name, cfg]) => ({
    id: name,
    name: name,
    description: cfg.description || (cfg.enabled ? 'Enabled' : 'Disabled')
  }))
})

const PLAZA_PERSONALITIES = [
  { value: 'analytical', label: 'Analytical' },
  { value: 'contrarian', label: 'Contrarian' },
  { value: 'pragmatic',  label: 'Pragmatic'  },
  { value: 'idealist',   label: 'Idealist'   },
  { value: 'devil-advocate', label: "Devil's Advocate" },
]

const voiceOptions = [
  { value: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced' },
  { value: 'echo',    label: 'Echo',     desc: 'Warm, rounded' },
  { value: 'fable',   label: 'Fable',    desc: 'Expressive, British' },
  { value: 'onyx',    label: 'Onyx',     desc: 'Deep, authoritative' },
  { value: 'nova',    label: 'Nova',     desc: 'Friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer',  desc: 'Clear, gentle' },
]

// Chat conversation state
const chatMessages = ref([])
const conversationStep = ref(0)
const awaitingTextInput = ref(false)
const showPreview = ref(false)
const inputPlaceholder = ref('')

// AI Enhance state
const enhancing = ref(false)
const preEnhancePrompt = ref(null)

// AI Generation state
const creationMode = ref(null) // null | 'guided' | 'describe' | 'random'
const generating = ref(false)
const showRewriteInput = ref(false)
const rewriteText = ref('')


// Tone options for system agents
const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual',       label: 'Casual' },
  { value: 'concise',      label: 'Concise' },
  { value: 'detailed',     label: 'Detailed' },
  { value: 'friendly',     label: 'Friendly' },
  { value: 'technical',    label: 'Technical' },
  { value: 'creative',     label: 'Creative' },
  { value: 'patient',      label: 'Patient' },
]

function isOptionSelected(value) {
  return form.tone.includes(value)
}

// ── Conversation flows ──────────────────────────────────────────────────

const systemFlow = [
  {
    ai: "Let's create a new AI agentlity. <strong>What should this AI be called?</strong>",
    field: 'name',
    placeholder: 'e.g. CodeMentor, Aria, DevBot...',
    type: 'text',
  },
  {
    ai: "Now pick an <strong>avatar</strong> for this agent.",
    field: 'avatar',
    type: 'avatar',
  },
  {
    ai: "Looking good! <strong>What is this AI's role or area of expertise?</strong>",
    field: 'role',
    placeholder: 'e.g. Senior Python developer, Creative writing coach...',
    type: 'text',
  },
  {
    ai: "<strong>How should it communicate?</strong> Pick one or more styles, then click Done.",
    field: 'tone',
    type: 'options',
    options: toneOptions,
  },
  {
    ai: "Any <strong>specific instructions or constraints</strong>? Type them below, or type <strong>skip</strong> to continue.",
    field: 'customInstructions',
    placeholder: 'e.g. Always use TypeScript. Respond in bullet points...',
    type: 'text',
  },
  {
    ai: "Select the <strong>AI provider and model</strong> for this agent.",
    field: 'providerModel',
    type: 'provider_picker',
  },
]

const userFlow = [
  {
    ai: "Let's set up your profile. <strong>What's your name or alias?</strong>",
    field: 'name',
    placeholder: 'e.g. John, Team Lead, @jdoe...',
    type: 'text',
  },
  {
    ai: "Now pick an <strong>avatar</strong> for your profile.",
    field: 'avatar',
    type: 'avatar',
  },
  {
    ai: "Nice! <strong>What's your role or background?</strong>",
    field: 'role',
    placeholder: 'e.g. Full-stack developer, Data scientist...',
    type: 'text',
  },
  {
    ai: "<strong>How should AI communicate with you?</strong> Pick one or more styles, then click Done.",
    field: 'tone',
    type: 'options',
    options: toneOptions,
  },
  {
    ai: "What <strong>preferences</strong> should the AI know about? Type them below, or type <strong>skip</strong>.",
    field: 'customInstructions',
    placeholder: 'e.g. I prefer TypeScript. Explain things simply...',
    type: 'text',
  },
]

const flow = computed(() => props.type === 'system' ? systemFlow : userFlow)

function scrollChat() {
  nextTick(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
    if (inputEl.value) inputEl.value.focus()
  })
}

function pushAI(text, opts = {}) {
  chatMessages.value.push({ from: 'ai', text, active: true, ...opts })
  scrollChat()
}

function pushUser(text) {
  chatMessages.value.push({ from: 'user', text })
  scrollChat()
}

function deactivateLastAI() {
  for (let i = chatMessages.value.length - 1; i >= 0; i--) {
    if (chatMessages.value[i].from === 'ai') {
      chatMessages.value[i].active = false
      break
    }
  }
}

function advanceConversation() {
  const step = conversationStep.value
  if (step >= flow.value.length) {
    finishConversation()
    return
  }

  const q = flow.value[step]
  const aiOpts = {}

  if (q.type === 'options') {
    aiOpts.options = q.options
  } else if (q.type === 'avatar') {
    aiOpts.avatarPicker = true
  } else if (q.type === 'provider_picker') {
    aiOpts.providerPicker = true
  }

  pushAI(q.ai, aiOpts)

  if (q.type === 'text') {
    awaitingTextInput.value = true
    inputPlaceholder.value = q.placeholder || 'Type your answer...'
  } else {
    awaitingTextInput.value = false
  }
}

function submitInput(e) {
  if (e) e.preventDefault()
  const text = inputText.value.trim()
  if (!text) return

  // Describe mode — generate full agent from the user's description
  if (creationMode.value === 'describe') {
    pushUser(text)
    inputText.value = ''
    awaitingTextInput.value = false
    generateAgentFromAI(text, false)
    return
  }

  const step = conversationStep.value
  const q = flow.value[step]

  pushUser(text)
  deactivateLastAI()

  if (text.toLowerCase() === 'skip') {
    form[q.field] = ''
  } else {
    form[q.field] = text
  }

  inputText.value = ''
  awaitingTextInput.value = false
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

function selectOption(msg, opt) {
  const idx = form.tone.indexOf(opt.value)
  if (idx >= 0) {
    form.tone.splice(idx, 1)
  } else {
    form.tone.push(opt.value)
  }
}

function confirmOptions() {
  const labels = form.tone.map(v => {
    const o = toneOptions.find(t => t.value === v)
    return o ? o.label : v
  })
  pushUser(labels.length > 0 ? labels.join(', ') : 'No preference')
  deactivateLastAI()
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

// ── Provider / Model picker ──────────────────────────────────────────────

function confirmProviderModel() {
  if (!form.providerId || !form.modelId) {
    showValidation.value = true
    return
  }
  const parts = [form.providerId]
  if (form.modelId) parts.push(form.modelId)
  pushUser(parts.join(' / '))
  deactivateLastAI()
  conversationStep.value++
  setTimeout(() => advanceConversation(), 350)
}

// ── Avatar ────────────────────────────────────────────────────────────────

function onAvatarPicked(avatarId) {
  form.avatar = avatarId
  showAvatarPicker.value = false

  // If we're still in the avatar step of the flow, advance
  const step = conversationStep.value
  if (step < flow.value.length && flow.value[step].type === 'avatar') {
    pushUser('Avatar selected')
    deactivateLastAI()
    conversationStep.value++
    setTimeout(() => advanceConversation(), 350)
  }
  scrollChat()
}

// ── Finish / Preview ──────────────────────────────────────────────────────

function finishConversation() {
  // AI-generated paths set form.generatedPrompt directly — don't overwrite
  if (!form.generatedPrompt) {
    form.generatedPrompt = generatePrompt()
  }
  if (!form.description) {
    form.description = form.role || form.name
  }
  awaitingTextInput.value = false
  showPreview.value = true
}

function generatePrompt() {
  if (props.type === 'system') {
    let p = `You are ${form.name}`
    if (form.role) p += `, a ${form.role}`
    p += '.'
    if (form.tone.length > 0) {
      const labels = form.tone.map(v => toneOptions.find(t => t.value === v)?.label.toLowerCase() || v)
      p += `\nCommunication style: ${labels.join(', ')}.`
    }
    if (form.customInstructions) p += `\n\n${form.customInstructions}`
    return p
  } else {
    let p = `The user you are talking to is ${form.name}`
    if (form.role) p += `, a ${form.role}`
    p += '.'
    if (form.tone.length > 0) {
      const labels = form.tone.map(v => toneOptions.find(t => t.value === v)?.label.toLowerCase() || v)
      p += `\nPreferred communication style: ${labels.join(', ')}.`
    }
    if (form.customInstructions) p += `\nTheir preferences: ${form.customInstructions}`
    return p
  }
}

// ── AI Enhance ────────────────────────────────────────────────────────────

const aiError = ref('')

async function enhancePrompt() {
  if (enhancing.value || !form.generatedPrompt.trim()) return
  preEnhancePrompt.value = form.generatedPrompt
  enhancing.value = true
  aiError.value = ''

  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({
      prompt: `Enhance this ${props.type === 'system' ? 'AI system' : 'user'} agent prompt. Make it more specific, effective, and well-structured while keeping the same intent. Return ONLY the enhanced prompt text, nothing else.\n\nOriginal prompt:\n${form.generatedPrompt}`,
      config,
    })
    if (res.success && res.text) {
      form.generatedPrompt = res.text.trim()
    } else if (!res.success) {
      aiError.value = res.error || 'Enhancement failed.'
    }
  } catch (err) {
    aiError.value = err.message || 'Enhancement failed.'
  }
  enhancing.value = false
}

function revertEnhance() {
  if (preEnhancePrompt.value) {
    form.generatedPrompt = preEnhancePrompt.value
    preEnhancePrompt.value = null
  }
}

// ── Mode picker ───────────────────────────────────────────────────────────

function selectMode(mode) {
  creationMode.value = mode
  if (mode === 'guided') {
    advanceConversation()
  } else if (mode === 'describe') {
    pushAI("What kind of agent do you want? Describe freely — a character, a role, a vibe, a real or fictional person. <strong>The more specific, the better.</strong>")
    awaitingTextInput.value = true
    inputPlaceholder.value = 'e.g. "a grumpy doctor like House MD", "Gordon Ramsay for code reviews", "a wise wizard who is secretly terrible at magic"...'
  } else if (mode === 'random') {
    generateAgentFromAI(null, false)
  }
}

// ── AI Generation (Describe + Random + Rewrite) ───────────────────────────

function extractJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

async function generateAgentFromAI(description, isRewrite) {
  generating.value = true
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const appLang = configStore.config.language || 'en'
    const isZh = appLang.startsWith('zh')
    const langInstruction = isZh
      ? '请用中文回复。'
      : 'Reply in the same language as the user.'

    const descLine = description
      ? `The user wants a agent described as: "${description}"\n\n`
      : 'Generate a completely random, creative, and surprising agent. Be imaginative — pick something unexpected.\n\n'

    const res = await window.electronAPI.enhancePrompt({
      prompt: `${langInstruction}\n\n${descLine}Create a detailed AI agent character. Be specific and creative. It can be a fictional character, historical figure, professional archetype, mythological being, movie/TV character, or anything interesting.\n\nReturn ONLY valid JSON (no markdown, no code blocks, no explanation):\n{"name":"a real personal name — first name and/or last name (e.g. 'Marcus Chen', 'Elena Vasquez', 'Dr. Yuki Tanaka') — NEVER a generic job title alone","role":"their role or identity in 5-10 words (e.g. 'Senior Backend Engineer with a dark sense of humor')","description":"one sentence describing who they are (max 15 words)","prompt":"300-500 word character prompt — start with 'You are [name]...', include: who they are, how they speak day-to-day, their personality quirks, what they genuinely care about, what annoys them, their background. Make them feel like a real person or character — NOT an AI assistant. No \\"Certainly!\\", no formal helper voice."}\n\nIMPORTANT: the name field MUST be a personal name (can combine name + role like "Maya Chen · Data Alchemist"), never just a job title. The prompt field must make the character feel authentic and human.`,
      config,
    })

    if (res.success && res.text) {
      let data
      try {
        data = JSON.parse(extractJSON(res.text))
      } catch {
        aiError.value = 'AI returned invalid JSON. Try again or use AI Enhance instead.'
        generating.value = false
        return
      }
      form.name = data.name || form.name || 'Unnamed'
      form.role = data.role || ''
      form.description = data.description || ''
      form.generatedPrompt = data.prompt || ''
      if (!isRewrite) {
        form.avatar = `a${Math.floor(Math.random() * 36) + 1}`
        finishConversation()
      }
      showRewriteInput.value = false
      rewriteText.value = ''
    } else {
      aiError.value = res.error || 'Generation failed. Make sure your utility model is configured in Config → AI → Models.'
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }
  generating.value = false
}

// ── AI Description ────────────────────────────────────────────────────────

const saving = ref(false)
const showValidation = ref(false)

async function generateDescription(prompt) {
  if (!prompt.trim()) return form.name || 'Untitled'
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const res = await window.electronAPI.enhancePrompt({
      prompt: `Read this agent prompt and write a SHORT description (max 10 words) that tells the user who this agent is. Focus on: role, expertise, key character traits. Use clean, simple words. No punctuation at the end. Return ONLY the description, nothing else.\n\nPrompt:\n${prompt}`,
      config,
    })
    if (res.success && res.text) {
      return res.text.trim().replace(/\.+$/, '')
    }
  } catch (err) {
    aiError.value = err.message || 'Description generation failed.'
  }
  // Fallback: use name or role
  return form.role || form.name || 'Untitled'
}

// ── Save ──────────────────────────────────────────────────────────────────

async function save() {
  // System agents require provider + model
  if (props.type === 'system' && (!form.providerId || !form.modelId)) {
    showValidation.value = true
    return
  }
  saving.value = true
  try {
    const description = await generateDescription(form.generatedPrompt)
    const agent = {
      ...(props.editAgent || {}),
      type: props.type,
      name: form.name || 'Untitled',
      avatar: form.avatar || 'a1',
      description,
      prompt: form.generatedPrompt.trim(),
      providerId: form.providerId || null,
      modelId: form.modelId || null,
      voiceId: form.voiceId || null,
      plazaStyle: (form.plazaPersonality || form.plazaDebatePrompt)
        ? { personality: form.plazaPersonality, debatePrompt: form.plazaDebatePrompt }
        : undefined,
      // Capabilities
      requiredToolIds: form.requiredToolIds || [],
      requiredSkillIds: form.requiredSkillIds || [],
      requiredMcpServerIds: form.requiredMcpServerIds || [],
      requiredKnowledgeBaseIds: form.requiredKnowledgeBaseIds || [],
    }
    await agentsStore.saveAgent(agent)
    emit('saved')
    emit('close')
  } finally {
    saving.value = false
  }
}

// ── Init / Edit mode ──────────────────────────────────────────────────────

onMounted(() => {
  if (props.editAgent) {
    form.name = props.editAgent.name || ''
    form.avatar = props.editAgent.avatar || ''
    form.role = props.editAgent.role || ''
    form.description = props.editAgent.description || ''
    form.generatedPrompt = props.editAgent.prompt || ''
    form.providerId = props.editAgent.providerId || 'anthropic'
    form.modelId = props.editAgent.modelId || ''
    form.voiceId = props.editAgent.voiceId || 'alloy'
    form.plazaPersonality = props.editAgent?.plazaStyle?.personality || ''
    form.plazaDebatePrompt = props.editAgent?.plazaStyle?.debatePrompt || ''
    // Load capabilities
    form.requiredToolIds = props.editAgent.requiredToolIds || []
    form.requiredSkillIds = props.editAgent.requiredSkillIds || []
    form.requiredMcpServerIds = props.editAgent.requiredMcpServerIds || []
    form.requiredKnowledgeBaseIds = props.editAgent.requiredKnowledgeBaseIds || []
    showPreview.value = true
  }
  // New agent: show mode picker — advanceConversation() called by selectMode('guided')
})

// Helper to get count for each capability tab
function getCapCount(tabKey) {
  switch (tabKey) {
    case 'tools': return form.requiredToolIds.length
    case 'skills': return form.requiredSkillIds.length
    case 'mcp': return form.requiredMcpServerIds.length
    case 'knowledge': return form.requiredKnowledgeBaseIds.length
    default: return 0
  }
}
</script>

<style scoped>
.wiz-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: wiz-fade 0.15s ease-out;
}
@keyframes wiz-fade { from { opacity: 0; } to { opacity: 1; } }

.wiz-modal {
  width: 56.25rem;
  max-width: 95vw;
  height: 85vh;
  max-height: 85vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1.25rem;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: wiz-enter 0.2s ease-out;
}
@keyframes wiz-enter {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* -- Header ---------------------------------------------------------------- */
.wiz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.125rem 1.5rem;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.wiz-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.wiz-header-icon {
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 0.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.wiz-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}
.wiz-close-btn {
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
}
.wiz-close-btn:hover { background: #1F1F1F; color: #FFFFFF; }

/* -- Chat area ------------------------------------------------------------- */
.wiz-chat {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  scrollbar-width: thin;
  scrollbar-color: #374151 transparent;
}
.wiz-chat::-webkit-scrollbar { width: 6px; }
.wiz-chat::-webkit-scrollbar-track { background: transparent; }
.wiz-chat::-webkit-scrollbar-thumb { background: #374151; border-radius: 9999px; }
.wiz-chat::-webkit-scrollbar-thumb:hover { background: #4B5563; }
.wiz-msg { display: flex; gap: 0.625rem; max-width: 92%; }
.wiz-msg.ai { align-self: flex-start; }
.wiz-msg.user { align-self: flex-end; }
.wiz-msg-avatar {
  width: 1.75rem; height: 1.75rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: 0.125rem;
}
.wiz-msg-bubble {
  border-radius: 0.75rem; padding: 0.625rem 0.875rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); line-height: 1.55;
}
.wiz-msg-bubble.ai { background: #1A1A1A; color: #D1D5DB; border-bottom-left-radius: 0.25rem; }
.wiz-msg-bubble.user { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #fff; border-bottom-right-radius: 0.25rem; }
.wiz-msg-bubble p { margin: 0; }

/* -- Option pills ---------------------------------------------------------- */
.wiz-options { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.625rem; }
.wiz-option-btn {
  padding: 0.3125rem 0.75rem; border-radius: 9999px; border: 1px solid #2A2A2A;
  background: #1A1A1A; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 500; color: #9CA3AF; cursor: pointer; transition: all 0.15s;
}
.wiz-option-btn:hover { border-color: #4B5563; color: #FFFFFF; background: #222222; }
.wiz-option-btn.selected { border-color: #1A1A1A; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); color: #fff; }
.wiz-option-done {
  padding: 0.3125rem 0.875rem; border-radius: 9999px; border: 1.5px solid #374151;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #fff; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 0.25rem;
}
.wiz-option-done:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); border-color: #4B5563; }

/* -- Avatar picker trigger ------------------------------------------------- */
.wiz-avatar-trigger {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-top: 0.75rem;
}
.wiz-pick-avatar-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border-radius: 0.625rem;
  border: 1.5px solid #374151;
  background: rgba(255, 255, 255, 0.05);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
}
.wiz-pick-avatar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.wiz-avatar-preview-inline {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.wiz-avatar-selected-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
}

/* -- Provider / Model combo ------------------------------------------------ */
.wiz-model-provider {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-top: 0.625rem;
  padding: 0.625rem 0.75rem;
  background: #1A1A1A;
  border-radius: 0.625rem;
  border: 1px solid #2A2A2A;
}
.wiz-error {
  font-size: var(--fs-caption);
  color: #EF4444;
  font-weight: 600;
}
.wiz-mp-field {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
}
.wiz-mp-field label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6B7280;
}
.wiz-mp-select {
  padding: 0.375rem 0.625rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-size: 0.85rem;
  background: #111111;
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s;
}
.wiz-mp-select:focus {
  border-color: #4B5563;
}

/* -- Input bar ------------------------------------------------------------- */
.wiz-input-bar {
  display: flex; align-items: flex-end; gap: 0.5rem;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
  flex-shrink: 0;
}
.wiz-input {
  flex: 1; padding: 0.625rem 0.875rem; border: 1px solid #2A2A2A; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #FFFFFF;
  background: #1A1A1A; outline: none; transition: border-color 0.15s; box-sizing: border-box;
  resize: none; line-height: 1.5; min-height: 2.75rem; max-height: 7.5rem;
}
.wiz-input:focus { border-color: #4B5563; }
.wiz-input::placeholder { color: #4B5563; }
.wiz-send-btn {
  width: 2.375rem; height: 2.375rem; border-radius: 0.625rem; border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 0.15s; flex-shrink: 0;
}
.wiz-send-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.wiz-send-btn:disabled { background: #2A2A2A; color: #4B5563; cursor: not-allowed; }

/* -- Preview body (scrollable content area) -------------------------------- */
.wiz-preview-body {
  border-top: 1px solid #1F1F1F; padding: 1.25rem 1.5rem; background: #0A0A0A;
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.wiz-preview-avatar-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-shrink: 0;
}
.wiz-preview-avatar-placeholder {
  width: 3.5rem; height: 3.5rem; border-radius: 50%; background: #1F1F1F;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.25rem; font-weight: 700; color: #4B5563;
}
.wiz-preview-avatar-meta {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}
.wiz-name-input {
  width: 100%;
  padding: 0.4375rem 0.75rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  background: #1A1A1A;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.wiz-name-input:focus { border-color: #4B5563; }
.wiz-name-input::placeholder { color: #4B5563; font-weight: 400; }
.wiz-change-avatar-btn {
  padding: 0.375rem 0.875rem; border-radius: 0.5rem; border: 1px solid #2A2A2A;
  background: #1A1A1A; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #FFFFFF; cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.wiz-change-avatar-btn:hover { background: #222222; border-color: #374151; }
.wiz-preview-prompt {
  flex: 1; min-height: 7.5rem; display: flex; flex-direction: column;
}
.wiz-preview-label {
  display: block; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #6B7280; margin-bottom: 0.375rem; flex-shrink: 0;
}
.wiz-preview-textarea {
  width: 100%; flex: 1; min-height: 5rem; padding: 0.625rem 0.75rem; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: var(--fs-secondary);
  color: #FFFFFF; background: #1A1A1A; outline: none; resize: none; line-height: 1.6;
  box-sizing: border-box; transition: border-color 0.15s;
}
.wiz-preview-textarea:focus { border-color: #4B5563; }

/* -- Mode picker ----------------------------------------------------------- */
.wiz-mode-picker {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
  gap: 1.25rem;
}
.wiz-mode-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #9CA3AF;
  margin: 0;
  text-align: center;
}
.wiz-mode-cards {
  display: flex;
  gap: 0.875rem;
  width: 100%;
  max-width: 36rem;
}
.wiz-mode-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 0.875rem;
  border-radius: 0.875rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}
.wiz-mode-card:hover {
  border-color: #4B5563;
  background: #222222;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.3);
}
.wiz-mode-icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.wiz-mode-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #FFFFFF;
}
.wiz-mode-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #6B7280;
  line-height: 1.4;
}

/* -- Generating spinner ---------------------------------------------------- */
.wiz-generating {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.wiz-gen-dots {
  display: flex;
  gap: 0.375rem;
}
.wiz-gen-dots span {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #4B5563;
  animation: wiz-bounce 1s ease-in-out infinite;
}
.wiz-gen-dots span:nth-child(2) { animation-delay: 0.15s; }
.wiz-gen-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes wiz-bounce {
  0%, 80%, 100% { transform: translateY(0); background: #4B5563; }
  40% { transform: translateY(-6px); background: #9CA3AF; }
}
.wiz-gen-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  margin: 0;
}

/* -- Rewrite input --------------------------------------------------------- */
.wiz-rewrite-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  flex-shrink: 0;
}
.wiz-rewrite-textarea {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #FFFFFF;
  background: #1A1A1A;
  outline: none;
  resize: none;
  line-height: 1.5;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.wiz-rewrite-textarea:focus { border-color: #4B5563; }
.wiz-rewrite-textarea::placeholder { color: #4B5563; }
.wiz-rewrite-actions {
  display: flex;
  gap: 0.5rem;
}

/* -- Enhance row ----------------------------------------------------------- */
.wiz-ai-error {
  display: block; font-family: 'Inter', sans-serif; font-size: 0.6875rem; font-weight: 500;
  color: #EF4444; margin-top: 0.25rem; line-height: 1.4;
}
.wiz-enhance-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}

/* -- Preview config (provider/model) ---------------------------------------- */
.wiz-preview-config {
  margin-bottom: 1rem;
  padding: 0.75rem 0.875rem;
  background: #1A1A1A;
  border-radius: 0.625rem;
  border: 1px solid #2A2A2A;
  flex-shrink: 0;
}
.wpc-section {
  margin-bottom: 0.625rem;
}
.wpc-section:last-child {
  margin-bottom: 0;
}
.wpc-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6B7280;
  padding: 0 0.125rem 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.wpc-btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.wpc-btn {
  flex: 1;
  min-width: 4.375rem;
  padding: 0.3125rem 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #2A2A2A;
  background: #111111;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
  text-align: center;
}
.wpc-btn:hover {
  border-color: #4B5563;
  background: #1A1A1A;
  color: #D1D5DB;
}
.wpc-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
/* -- Footer (matches ccm-footer) ------------------------------------------- */
.wiz-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 0.875rem 1.5rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
  flex-shrink: 0;
}
.wiz-cancel-btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.625rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: transparent;
  color: #6B7280;
  border: 1px solid #2A2A2A;
  cursor: pointer;
  transition: all 0.15s;
}
.wiz-cancel-btn:hover {
  border-color: #4B5563;
  color: #9CA3AF;
  background: #1A1A1A;
}
.wiz-done-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 0.625rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
  border: 1px solid #374151;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.wiz-done-btn:hover {
  background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%);
  border-color: #4B5563;
}
.wiz-done-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* -- ComboBox dark overrides (inside wizard) ------------------------------- */
.wiz-preview-body :deep(.combo-box),
.wiz-chat :deep(.combo-box) {
  background: #111111;
  border-color: #2A2A2A;
}
.wiz-preview-body :deep(.combo-box:focus-within),
.wiz-chat :deep(.combo-box:focus-within) {
  border-color: #4B5563;
  box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.2);
}
.wiz-preview-body :deep(.combo-input),
.wiz-preview-body :deep(.combo-multi-input),
.wiz-chat :deep(.combo-input),
.wiz-chat :deep(.combo-multi-input) {
  color: #FFFFFF;
}
.wiz-preview-body :deep(.combo-input::placeholder),
.wiz-preview-body :deep(.combo-multi-input::placeholder),
.wiz-chat :deep(.combo-input::placeholder),
.wiz-chat :deep(.combo-multi-input::placeholder) {
  color: #4B5563;
}
.wiz-preview-body :deep(.combo-dropdown),
.wiz-chat :deep(.combo-dropdown) {
  background: #1A1A1A;
  border-color: #2A2A2A;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2);
}
.wiz-preview-body :deep(.combo-option-name),
.wiz-chat :deep(.combo-option-name) {
  color: #9CA3AF;
}
.wiz-preview-body :deep(.combo-option:hover),
.wiz-chat :deep(.combo-option:hover) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
}
.wiz-preview-body :deep(.combo-option:hover .combo-option-name),
.wiz-chat :deep(.combo-option:hover .combo-option-name) {
  color: #FFFFFF;
}

/* -- Capability tabs ---------------------------------------------------------- */
.cap-tab-buttons {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
}
.cap-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #FFFFFF;
  background: transparent;
  border: 1px solid #374151;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}
.cap-tab-btn:hover {
  background: #1F2937;
  color: #FFFFFF;
}
.cap-tab-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  border-color: transparent;
}
.cap-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  background: #374151;
  color: #FFFFFF;
  border-radius: 0.5625rem;
}
.cap-tab-btn.active .cap-badge {
  background: rgba(255, 255, 255, 0.2);
}
.cap-tab-content {
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid #374151;
  border-radius: 0.625rem;
  background: #111827;
}
.cap-items {
  display: flex;
  flex-direction: column;
}
.cap-empty {
  padding: 1rem;
  text-align: center;
  color: #6B7280;
  font-size: var(--fs-secondary);
}
.cap-item {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #1F2937;
}
.cap-item:last-child {
  border-bottom: none;
}
.cap-item:hover {
  background: #1F2937;
}
.cap-item input[type="checkbox"] {
  margin-top: 0.25rem;
  width: 1rem;
  height: 1rem;
  accent-color: #3B82F6;
}
.cap-item-name {
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #FFFFFF;
}
.cap-item-desc {
  font-size: var(--fs-caption);
  color: #9CA3AF;
  line-height: 1.4;
}

@media (prefers-reduced-motion: reduce) {
  .wiz-backdrop, .wiz-modal, .wiz-option-btn, .wiz-pick-avatar-btn, .wiz-send-btn { transition: none; animation: none; }
}
</style>
