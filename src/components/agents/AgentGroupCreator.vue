<template>
  <Teleport to="body">
    <div class="agc-backdrop">
      <div class="agc-modal">
        <div class="agc-header">
          <div class="agc-header-left">
            <div class="agc-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h2 class="agc-title">{{ t('agents.groupCreator.title', 'Add Multiple Agents') }}</h2>
              <span class="agc-meta">{{ t('agents.groupCreator.subtitle', 'Quickly add a team of agents') }}</span>
            </div>
          </div>
          <button class="agc-close-btn" @click="$emit('close')" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="agc-tabs">
          <button class="agc-tab" :class="{ active: activeTab === 'templates' }" @click="activeTab = 'templates'">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            {{ t('agents.groupCreator.templates', 'Templates') }}
          </button>
          <button class="agc-tab" :class="{ active: activeTab === 'custom' }" @click="activeTab = 'custom'">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            {{ t('agents.groupCreator.custom', 'AI Generate') }}
          </button>
        </div>

        <div class="agc-body">
          <!-- Templates Tab -->
          <div v-if="activeTab === 'templates'" class="agc-templates">
            <div class="agc-templates-grid">
              <div
                v-for="template in templates"
                :key="template.id"
                class="agc-template-card"
                :class="{ selected: selectedTemplate?.id === template.id }"
                @click="selectedTemplate = template"
              >
                <div class="agc-template-icon">{{ template.emoji }}</div>
                <div class="agc-template-info">
                  <h3 class="agc-template-name">{{ template.name }}</h3>
                  <p class="agc-template-desc">{{ template.description }}</p>
                  <div class="agc-template-meta">
                    <span class="agc-template-cat">{{ template.category.emoji }} {{ template.category.name }}</span>
                    <span class="agc-template-count">{{ template.agents.length }} {{ t('agents.groupCreator.agents', 'agents') }}</span>
                  </div>
                </div>
                <div v-if="selectedTemplate?.id === template.id" class="agc-template-check">
                  <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Tab -->
          <div v-if="activeTab === 'custom'" class="agc-custom">
            <div class="agc-custom-input-wrap">
              <textarea
                v-model="customDescription"
                class="agc-custom-textarea"
                :placeholder="placeholderText"
                rows="4"
                autofocus
              ></textarea>
              <div class="agc-custom-actions">
                <button
                  class="agc-generate-btn"
                  :disabled="!customDescription.trim() || generating"
                  @click="generateFromAI"
                >
                  <svg v-if="!generating" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  <span v-if="generating" class="agc-spinner"></span>
                  {{ generating ? t('agents.groupCreator.generating', 'Generating...') : t('agents.groupCreator.generate', 'Generate Proposal') }}
                </button>
              </div>
            </div>

            <!-- Generated Preview -->
            <div v-if="generatedProposal" class="agc-proposal">
              <div class="agc-proposal-header">
                <h3 class="agc-proposal-title">{{ t('agents.groupCreator.proposal', 'Proposed Setup') }}</h3>
                <button class="agc-proposal-regen" :disabled="generating" @click="generateFromAI">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  {{ t('agents.groupCreator.regenerate', 'Regenerate') }}
                </button>
              </div>
              
              <div class="agc-proposal-category">
                <span class="agc-proposal-cat-emoji">{{ generatedProposal.category.emoji }}</span>
                <span class="agc-proposal-cat-name">{{ generatedProposal.category.name }}</span>
              </div>

              <div class="agc-proposal-agents">
                <div v-for="(agent, idx) in generatedProposal.agents" :key="idx" class="agc-proposal-agent">
                  <span class="agc-proposal-agent-icon">👤</span>
                  <div class="agc-proposal-agent-info">
                    <span class="agc-proposal-agent-name">{{ agent.name }}</span>
                    <span class="agc-proposal-agent-role">{{ agent.role }}</span>
                  </div>
                </div>
              </div>

              <div v-if="aiError" class="agc-ai-error">{{ aiError }}</div>
            </div>

            <div v-if="!generatedProposal && !generating && customTabAttempted" class="agc-custom-hint">
              {{ t('agents.groupCreator.hint', 'Describe your needs above and click Generate to create a proposal') }}
            </div>
          </div>
        </div>

        <div v-if="dupSkipped.length > 0" class="agc-dup-warning">
          <svg style="width:14px;height:14px;flex-shrink:0;margin-top:1px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <div class="agc-dup-title">{{ t('agents.groupCreator.dupTitle', 'Already exists — skipped') }}</div>
            <div class="agc-dup-names">{{ dupSkipped.join(', ') }}</div>
          </div>
          <button class="agc-dup-close" @click="emit('created', lastCreatedIds); emit('close')">
            {{ t('common.confirm', 'OK') }}
          </button>
        </div>

        <div class="agc-footer">
          <button class="agc-btn agc-btn-cancel" @click="$emit('close')">
            {{ t('common.cancel', 'Cancel') }}
          </button>
          <button
            class="agc-btn agc-btn-create"
            :disabled="!canCreate || creating"
            @click="createAgents"
          >
            <span v-if="creating" class="agc-spinner"></span>
            {{ creating ? t('agents.groupCreator.creating', 'Creating...') : t('agents.groupCreator.create', 'Create {count} Agents', { count: createCount }) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import { getAgentTemplates } from '../../data/agentTemplates'

const emit = defineEmits(['close', 'created'])

const { t, locale } = useI18n()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()

const templates = computed(() => getAgentTemplates(locale.value))

const activeTab = ref('templates')
const selectedTemplate = ref(null)
const customDescription = ref('')
const generating = ref(false)
const creating = ref(false)
const customTabAttempted = ref(false)
const generatedProposal = ref(null)
const aiError = ref('')

const agentType = ref('system')
const dupSkipped = ref([])
const lastCreatedIds = ref([])

const placeholderText = computed(() => {
  return t('agents.groupCreator.placeholder', 'Describe what you need... e.g. I want to create an engineering department with frontend team (5 people), backend team (8 people), and QA team (3 people)')
})

const canCreate = computed(() => {
  if (activeTab.value === 'templates') {
    return selectedTemplate.value !== null
  }
  return generatedProposal.value !== null
})

const createCount = computed(() => {
  if (activeTab.value === 'templates' && selectedTemplate.value) {
    return selectedTemplate.value.agents.length
  }
  if (generatedProposal.value) {
    return generatedProposal.value.agents.length
  }
  return 0
})

watch(activeTab, (newVal) => {
  if (newVal === 'custom') {
    customTabAttempted.value = true
  }
})

function detectLanguage() {
  const appLang = configStore.config.language || 'en'
  return appLang.startsWith('zh') ? 'Chinese (中文)' : 'English'
}

async function generateFromAI() {
  const desc = customDescription.value.trim()
  if (!desc) return

  generating.value = true
  aiError.value = ''
  customTabAttempted.value = true

  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage()
    const langInstruction = lang ? `\n\nIMPORTANT: Respond entirely in ${lang}.` : ''

    const res = await window.electronAPI.enhancePrompt({
      prompt: `You are an AI agent that helps create team structures and agent configurations.
Based on the user's description, generate a proposal for a team of AI agents.

User description: "${desc}"

Return ONLY valid JSON (no markdown, no code blocks, no explanation) with this structure:
{
  "category": { "name": "Category Name", "emoji": "emoji" },
  "agents": [
    { "name": "Agent Name", "role": "brief role (3-8 words)", "description": "one sentence description" }
  ]

Rules:
- Group related roles under one category
- Include team leads and individual contributors
- Use realistic team compositions
- Pick appropriate emoji for the category
- Include 3-15 agents total
- Each agent should have a distinct name and role${langInstruction}`,
      config,
    })

    if (res.success && res.text) {
      let data
      try {
        const jsonMatch = res.text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          data = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('No JSON found')
        }
      } catch (e) {
        aiError.value = 'AI returned invalid response. Try again.'
        generating.value = false
        return
      }

      if (data.category && Array.isArray(data.agents)) {
        generatedProposal.value = {
          category: {
            name: data.category.name || 'Team',
            emoji: data.category.emoji || '📂'
          },
          agents: data.agents.map(a => ({
            name: a.name || 'Agent',
            role: a.role || 'Team Member',
            description: a.description || 'Team member agent'
          }))
        }
      } else {
        aiError.value = 'Invalid response format. Try again.'
      }
    } else {
      aiError.value = res.error || t('agents.groupCreator.error', 'Generation failed. Make sure your utility model is configured in Config → AI → Models.')
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }

  generating.value = false
}

async function createAgents() {
  creating.value = true
  dupSkipped.value = []

  try {
    let categoryId
    let agentsData

    if (activeTab.value === 'templates' && selectedTemplate.value) {
      const tmpl = selectedTemplate.value
      categoryId = await agentsStore.addCategory(tmpl.category.name, tmpl.category.emoji, agentType.value)
      agentsData = tmpl.agents.map(a => ({
        name: a.name,
        description: a.description,
        prompt: a.prompt,
        avatar: a.avatar || `a${Math.floor(Math.random() * 36) + 1}`
      }))
    } else if (generatedProposal.value) {
      const prop = generatedProposal.value
      categoryId = await agentsStore.addCategory(prop.category.name, prop.category.emoji, agentType.value)
      agentsData = prop.agents.map(a => ({
        name: a.name,
        description: a.description,
        prompt: `You are **${a.name}**, ${a.role}.\n\n## Your Role\n${a.description}\n\n## How You Work\n- Stay in character as ${a.name} — bring your expertise and personality to every response\n- Be specific and actionable, not generic\n- Ask clarifying questions when requirements are ambiguous\n- Collaborate with other team members when tasks overlap your domain`,
        avatar: `a${Math.floor(Math.random() * 36) + 1}`
      }))
    }

    const utilityProviderId = configStore.config?.utilityModel?.provider || null
    const utilityModelId = configStore.config?.utilityModel?.model || null

    const createdIds = []

    if (categoryId && agentsData) {
      const existingNames = new Set(agentsStore.agents.map(a => a.name?.toLowerCase()))
      const toCreate = []
      for (const agent of agentsData) {
        if (existingNames.has(agent.name?.toLowerCase())) {
          dupSkipped.value.push(agent.name)
        } else {
          toCreate.push(agent)
        }
      }

      if (toCreate.length > 0) {
        const existingCount = agentsStore.agents.length
        for (const agent of toCreate) {
          await agentsStore.saveAgent({
            ...agent,
            type: agentType.value,
            providerId: utilityProviderId,
            modelId: utilityModelId,
            voiceId: null,
            requiredToolIds: [],
            requiredSkillIds: [],
            requiredMcpServerIds: [],
            requiredKnowledgeBaseIds: []
          })
        }

        const newAgents = agentsStore.agents.slice(existingCount)
        for (const agent of newAgents) {
          await agentsStore.assignToCategory(agent.id, categoryId)
          createdIds.push(agent.id)
        }
      }
    }

    if (dupSkipped.value.length === 0) {
      emit('created', createdIds)
      emit('close')
    }
    // If there were skips, stay open and show the message
    // Store createdIds so the dup-warning OK button can pass them too
    lastCreatedIds.value = createdIds
  } catch (err) {
    console.error('Failed to create agents:', err)
  }

  creating.value = false
}
</script>

<style scoped>
.agc-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: agcFadeIn 0.2s ease-out;
}

@keyframes agcFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.agc-modal {
  width: 90%;
  max-width: 640px;
  max-height: 90vh;
  background: #0F0F0F;
  border-radius: 20px;
  border: 1px solid #2A2A2A;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: agcSlideIn 0.2s ease-out;
}

@keyframes agcSlideIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.agc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #2A2A2A;
  flex-shrink: 0;
}

.agc-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.agc-header-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agc-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.agc-meta {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.agc-close-btn {
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.agc-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
}

.agc-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #2A2A2A;
  flex-shrink: 0;
}

.agc-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.agc-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

.agc-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  min-height: 300px;
}

.agc-templates-grid {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.agc-template-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.agc-template-card:hover {
  border-color: #4B5563;
  background: #222222;
}

.agc-template-card.selected {
  border-color: #007AFF;
  background: rgba(0, 122, 255, 0.08);
}

.agc-template-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}

.agc-template-info {
  flex: 1;
  min-width: 0;
}

.agc-template-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.25rem;
}

.agc-template-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 0.375rem;
}

.agc-template-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.agc-template-cat,
.agc-template-count {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255, 255, 255, 0.4);
}

.agc-template-check {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agc-custom-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.agc-custom-textarea {
  width: 100%;
  padding: 0.875rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.15s;
}

.agc-custom-textarea:focus {
  outline: none;
  border-color: #4B5563;
}

.agc-custom-textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.agc-custom-actions {
  display: flex;
  justify-content: flex-end;
}

.agc-generate-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.agc-generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.1);
}

.agc-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agc-proposal {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
}

.agc-proposal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.agc-proposal-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
}

.agc-proposal-regen {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-proposal-regen:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.agc-proposal-regen:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.agc-proposal-category {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  width: fit-content;
}

.agc-proposal-cat-emoji {
  font-size: 1rem;
}

.agc-proposal-cat-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
}

.agc-proposal-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.agc-proposal-agent {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #2A2A2A;
  border-radius: 0.5rem;
}

.agc-proposal-agent-icon {
  font-size: 0.875rem;
}

.agc-proposal-agent-info {
  display: flex;
  flex-direction: column;
}

.agc-proposal-agent-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 500;
  color: #FFFFFF;
}

.agc-proposal-agent-role {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
}

.agc-ai-error {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: #EF4444;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
}

.agc-custom-hint {
  margin-top: 1.25rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
}

.agc-dup-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  margin: 0 1.5rem 0;
  padding: 0.75rem 1rem;
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 0.625rem;
  color: #FCD34D;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
}

.agc-dup-title {
  font-weight: 600;
  margin-bottom: 0.1875rem;
}

.agc-dup-names {
  color: rgba(252, 211, 77, 0.75);
  word-break: break-word;
}

.agc-dup-close {
  margin-left: auto;
  flex-shrink: 0;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 0.375rem;
  color: #FCD34D;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.25rem 0.625rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.agc-dup-close:hover {
  background: rgba(251, 191, 36, 0.25);
}

.agc-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #2A2A2A;
  background: #0A0A0A;
  flex-shrink: 0;
}

.agc-btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-btn-cancel {
  background: #2A2A2A;
  color: rgba(255, 255, 255, 0.7);
}

.agc-btn-cancel:hover {
  background: #374151;
  color: #FFFFFF;
}

.agc-btn-create {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.agc-btn-create:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.1);
}

.agc-btn-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agc-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: agcSpin 0.8s linear infinite;
}

@keyframes agcSpin {
  to { transform: rotate(360deg); }
}
</style>
