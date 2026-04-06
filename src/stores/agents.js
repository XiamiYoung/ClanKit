import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'
import { en, zh } from '../i18n'
import { useConfigStore } from './config'
import { useToolsStore } from './tools'
import { useMcpStore } from './mcp'
import { useSkillsStore } from './skills'
import { useKnowledgeStore } from './knowledge'
import { getDefaultVoiceForLocale } from '../utils/edgeVoices'

// ── Built-in agents (non-deletable) ─────────────────────────────────────
export const BUILTIN_SYSTEM_AGENT_ID = '__default_system__'
export const BUILTIN_USER_AGENT_ID   = '__default_user__'
export const BUILTIN_DOC_EDITOR_ID   = '__doc_editor__'
export const BUILTIN_SYSTEM_ICON_ID  = '__system_icon__'

function buildBuiltinSystemCopy(locale, utilityModel, capabilities) {
  const isChinese = String(locale || 'en').startsWith('zh')
  const messages = isChinese ? zh : en
  const builtinName = messages.agents.builtinClankName || 'Clank'
  const description = messages.agents.builtinClankDescription || ''
  const prompt = messages.agents.builtinClankPrompt || ''

  return {
    id: BUILTIN_SYSTEM_AGENT_ID,
    type: 'system',
    name: builtinName,
    avatar: BUILTIN_SYSTEM_ICON_ID,
    description,
    prompt,
    providerId: utilityModel?.provider || null,
    modelId: utilityModel?.model || null,
    requiredToolIds: capabilities.requiredToolIds,
    requiredSkillIds: capabilities.requiredSkillIds,
    requiredMcpServerIds: capabilities.requiredMcpServerIds,
    requiredKnowledgeBaseIds: capabilities.requiredKnowledgeBaseIds,
    voiceId: getDefaultVoiceForLocale(locale),
    isDefault: true,
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
  }
}

function buildBuiltinDocEditorCopy(locale, utilityModel) {
  const isChinese = String(locale || 'en').startsWith('zh')
  const messages = isChinese ? zh : en
  const builtinName = messages.agents.builtinDocEditorName || 'DocMaster'
  const description = messages.agents.builtinDocEditorDescription || ''
  const prompt = messages.agents.builtinDocEditorPrompt || ''

  return {
    id: BUILTIN_DOC_EDITOR_ID,
    type: 'system',
    name: builtinName,
    avatar: 'a3',
    description,
    prompt,
    providerId: utilityModel?.provider || null,
    modelId: utilityModel?.model || null,
    voiceId: getDefaultVoiceForLocale(locale),
    isDefault: false,
    isBuiltin: true,
    createdAt: 0,
    updatedAt: 0,
    requiredToolIds: [],
    requiredSkillIds: [],
    requiredMcpServerIds: [],
    requiredKnowledgeBaseIds: [],
  }
}

function arrayEquals(a, b) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// BUILTIN_DOC_EDITOR_AGENT is now built dynamically via buildBuiltinDocEditorCopy()

// BUILTIN_USER_AGENT removed — user must create their own via onboarding

export const useAgentsStore = defineStore('agents', () => {
  const agents     = ref([])
  const categories = ref([])
  const configStore = useConfigStore()
  const toolsStore = useToolsStore()
  const mcpStore = useMcpStore()
  const skillsStore = useSkillsStore()
  const knowledgeStore = useKnowledgeStore()
  let builtinSyncInFlight = false

  const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)

  const systemAgents = computed(() => agents.value.filter(p => p.type === 'system').sort(byCreatedDesc))
  const userAgents   = computed(() => agents.value.filter(p => p.type === 'user').sort(byCreatedDesc))

  const systemCategories = computed(() => categories.value.filter(c => c.type === 'system'))
  const userCategories   = computed(() => categories.value.filter(c => c.type === 'user'))

  const defaultSystemAgent = computed(() => agents.value.find(p => p.type === 'system' && p.isDefault) || null)
  const defaultUserAgent   = computed(() => agents.value.find(p => p.type === 'user'   && p.isDefault) || null)

  function collectBuiltinCapabilities() {
    return {
      requiredToolIds: (toolsStore.tools || []).map(tool => tool.id),
      requiredSkillIds: (skillsStore.allSkillObjects || []).map(skill => skill.id),
      requiredMcpServerIds: (mcpStore.servers || []).map(server => server.id),
      requiredKnowledgeBaseIds: (knowledgeStore.knowledgeBases || []).map(kb => kb.id),
    }
  }

  function createBuiltinSystemAgent() {
    return buildBuiltinSystemCopy(
      configStore.language || 'en',
      configStore.config.utilityModel || {},
      collectBuiltinCapabilities()
    )
  }

  function mergeBuiltinSystemAgent(existing) {
    const builtin = createBuiltinSystemAgent()
    const previous = existing || {}
    return {
      ...previous,
      ...builtin,
      providerId: previous.providerId ?? builtin.providerId,
      modelId: previous.modelId ?? builtin.modelId,
      isDefault: previous.isDefault ?? builtin.isDefault,
      isBuiltin: true,
      categoryIds: Array.isArray(previous.categoryIds) ? previous.categoryIds : [],
      createdAt: previous.createdAt ?? builtin.createdAt,
      updatedAt: previous.updatedAt ?? builtin.updatedAt,
    }
  }

  function createBuiltinDocEditorAgent() {
    return buildBuiltinDocEditorCopy(
      configStore.language || 'en',
      configStore.config.utilityModel || {}
    )
  }

  function mergeBuiltinDocEditorAgent(existing) {
    const builtin = createBuiltinDocEditorAgent()
    const previous = existing || {}
    return {
      ...previous,
      ...builtin,
      providerId: previous.providerId ?? builtin.providerId,
      modelId: previous.modelId ?? builtin.modelId,
      isBuiltin: true,
      categoryIds: Array.isArray(previous.categoryIds) ? previous.categoryIds : [],
      createdAt: previous.createdAt ?? builtin.createdAt,
      updatedAt: previous.updatedAt ?? builtin.updatedAt,
    }
  }

  function builtinDocEditorAgentNeedsSync(current, next) {
    if (!current) return true
    return current.name !== next.name ||
      current.avatar !== next.avatar ||
      current.description !== next.description ||
      current.voiceId !== next.voiceId
  }

  async function syncBuiltinDocEditorAgent(persistChanges = true) {
    const docIdx = agents.value.findIndex(p => p.id === BUILTIN_DOC_EDITOR_ID)
    if (docIdx === -1 || builtinSyncInFlight) return
    const current = agents.value[docIdx]
    const next = mergeBuiltinDocEditorAgent(current)
    if (!builtinDocEditorAgentNeedsSync(current, next)) return

    builtinSyncInFlight = true
    agents.value[docIdx] = {
      ...next,
      updatedAt: Date.now(),
    }
    try {
      if (persistChanges) await persist()
    } finally {
      builtinSyncInFlight = false
    }
  }

  function builtinSystemAgentNeedsSync(current, next) {
    if (!current) return true
    return current.name !== next.name ||
      current.avatar !== next.avatar ||
      current.description !== next.description ||
      current.prompt !== next.prompt ||
      current.voiceId !== next.voiceId ||
      !arrayEquals(current.requiredToolIds || [], next.requiredToolIds || []) ||
      !arrayEquals(current.requiredSkillIds || [], next.requiredSkillIds || []) ||
      !arrayEquals(current.requiredMcpServerIds || [], next.requiredMcpServerIds || []) ||
      !arrayEquals(current.requiredKnowledgeBaseIds || [], next.requiredKnowledgeBaseIds || [])
  }

  async function syncBuiltinSystemAgent(persistChanges = true) {
    const sysIdx = agents.value.findIndex(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
    if (sysIdx === -1 || builtinSyncInFlight) return
    const current = agents.value[sysIdx]
    const next = mergeBuiltinSystemAgent(current)
    if (!builtinSystemAgentNeedsSync(current, next)) return

    builtinSyncInFlight = true
    agents.value[sysIdx] = {
      ...next,
      updatedAt: Date.now(),
    }
    try {
      if (persistChanges) await persist()
    } finally {
      builtinSyncInFlight = false
    }
  }

  function getAgentById(id) {
    return agents.value.find(p => p.id === id) || null
  }

  function getCategoryById(id) {
    return categories.value.find(c => c.id === id) || null
  }

  function agentsInCategory(categoryId) {
    return agents.value.filter(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(categoryId)).sort(byCreatedDesc)
  }

  function uncategorizedAgents(type) {
    return agents.value.filter(p => p.type === type && (!Array.isArray(p.categoryIds) || p.categoryIds.length === 0)).sort(byCreatedDesc)
  }

  async function loadAgents() {
    const stored = await storage.getAgents()

    // Handle both old (plain array) and new ({ categories, agents }) formats
    let list, cats
    if (Array.isArray(stored)) {
      list = stored || []
      cats = []
    } else {
      list = stored?.agents || []
      cats = stored?.categories || []
    }

    // Ensure built-in system agent exists
    const sysIdx = list.findIndex(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
    if (sysIdx >= 0) {
      list[sysIdx] = mergeBuiltinSystemAgent(list[sysIdx])
    } else {
      list.unshift(createBuiltinSystemAgent())
    }

    // Ensure built-in doc editor agent exists
    const docIdx = list.findIndex(p => p.id === BUILTIN_DOC_EDITOR_ID)
    if (docIdx >= 0) {
      list[docIdx] = mergeBuiltinDocEditorAgent(list[docIdx])
    } else {
      list.push(createBuiltinDocEditorAgent())
    }

    // Remove legacy built-in default user agent from disk data
    const usrIdx = list.findIndex(p => p.id === BUILTIN_USER_AGENT_ID)
    if (usrIdx >= 0) list.splice(usrIdx, 1)

    // Backfill optional agent fields
    for (const p of list) {
      if (p.providerId === undefined) p.providerId = null
      if (p.modelId === undefined) p.modelId = null
      if (p.enabledSkillIds === undefined) p.enabledSkillIds = null
      if (p.mcpServerIds === undefined) p.mcpServerIds = null
      if (!p.voiceId) p.voiceId = getDefaultVoiceForLocale(configStore.language)
      if (!Array.isArray(p.requiredToolIds)) p.requiredToolIds = []
      if (!Array.isArray(p.requiredSkillIds)) p.requiredSkillIds = []
      if (!Array.isArray(p.requiredMcpServerIds)) p.requiredMcpServerIds = []
      if (!Array.isArray(p.requiredKnowledgeBaseIds)) p.requiredKnowledgeBaseIds = []
      if (!Array.isArray(p.categoryIds)) p.categoryIds = []
    }

    // Ensure at least one default per type
    if (!list.some(p => p.type === 'system' && p.isDefault)) {
      const sys = list.find(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
      if (sys) sys.isDefault = true
    }
    if (!list.some(p => p.type === 'user' && p.isDefault)) {
      const firstUser = list.find(p => p.type === 'user')
      if (firstUser) firstUser.isDefault = true
    }

    agents.value     = list
    categories.value = cats
    await persist()
  }

  async function saveAgent(agent) {
    const idx = agents.value.findIndex(p => p.id === agent.id)
    if (idx >= 0) {
      const existing = agents.value[idx]
      agents.value[idx] = {
        ...agent,
        isBuiltin: existing.isBuiltin || false,
        categoryIds: existing.categoryIds || [],
        requiredToolIds: agent.requiredToolIds ?? existing.requiredToolIds ?? [],
        requiredSkillIds: agent.requiredSkillIds ?? existing.requiredSkillIds ?? [],
        requiredMcpServerIds: agent.requiredMcpServerIds ?? existing.requiredMcpServerIds ?? [],
        requiredKnowledgeBaseIds: agent.requiredKnowledgeBaseIds ?? existing.requiredKnowledgeBaseIds ?? [],
        updatedAt: Date.now(),
      }
    } else {
      const newAgent = {
        id: uuidv4(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isBuiltin: false,
        categoryIds: [],
        requiredToolIds: [],
        requiredSkillIds: [],
        requiredMcpServerIds: [],
        requiredKnowledgeBaseIds: [],
        ...agent,
      }
      if (!newAgent.voiceId) newAgent.voiceId = getDefaultVoiceForLocale(configStore.language)
      // Auto-set as default when it's the first user agent
      if (newAgent.type === 'user' && !agents.value.some(p => p.type === 'user' && p.isDefault)) {
        newAgent.isDefault = true
      }
      agents.value.push(newAgent)
    }
    await persist()
  }

  async function deleteAgent(id) {
    const agent = agents.value.find(p => p.id === id)
    if (agent?.isBuiltin) return
    agents.value = agents.value.filter(p => p.id !== id)
    await persist()
    // Clean up soul file + memory directory for deleted agent
    try {
      const type = agent?.type === 'user' ? 'users' : 'system'
      await window.electronAPI?.souls?.deleteAgentData?.(id, type)
    } catch { /* best-effort cleanup */ }
  }

  async function setDefault(id) {
    const target = agents.value.find(p => p.id === id)
    if (!target) return
    for (const p of agents.value) {
      if (p.type === target.type) p.isDefault = false
    }
    target.isDefault = true
    target.updatedAt = Date.now()
    await persist()
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────

  async function addCategory(name, emoji, type) {
    const id = uuidv4()
    categories.value.push({ id, name, emoji, type })
    await persist()
    return id
  }

  async function renameCategory(id, name, emoji) {
    const cat = categories.value.find(c => c.id === id)
    if (!cat) return
    cat.name  = name
    cat.emoji = emoji
    await persist()
  }

  async function deleteCategory(id) {
    // Only allowed when no agents are assigned
    const assigned = agents.value.some(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(id))
    if (assigned) return false
    categories.value = categories.value.filter(c => c.id !== id)
    await persist()
    return true
  }

  async function reorderCategory(draggedId, targetId) {
    const list = categories.value
    const from = list.findIndex(c => c.id === draggedId)
    const to   = list.findIndex(c => c.id === targetId)
    if (from === -1 || to === -1 || from === to) return
    const moved = list.splice(from, 1)[0]
    list.splice(to, 0, moved)
    await persist()
  }

  // ── Assignment ────────────────────────────────────────────────────────────

  async function assignToCategory(agentId, categoryId) {
    const agent    = agents.value.find(p => p.id === agentId)
    const category = categories.value.find(c => c.id === categoryId)
    if (!agent || !category) return
    if (agent.type !== category.type) return
    if (!Array.isArray(agent.categoryIds)) agent.categoryIds = []
    if (!agent.categoryIds.includes(categoryId)) {
      agent.categoryIds.push(categoryId)
      await persist()
    }
  }

  async function unassignFromCategory(agentId, categoryId) {
    const agent = agents.value.find(p => p.id === agentId)
    if (!agent || !Array.isArray(agent.categoryIds)) return
    agent.categoryIds = agent.categoryIds.filter(id => id !== categoryId)
    await persist()
  }

  async function persist() {
    await storage.saveAgents({
      categories: JSON.parse(JSON.stringify(categories.value)),
      agents:     JSON.parse(JSON.stringify(agents.value)),
    })
  }

  // ── Agent usage in plans (deletion protection) ────────────────────────────

  function isAgentUsedInPlans(agentId) {
    try {
      const { useTasksStore } = require('./tasks')
      const tasksStore = useTasksStore()
      return tasksStore.plans.some(p => (p.steps || []).some(s => (s.defaultAgentIds || []).includes(agentId)))
    } catch {
      return false
    }
  }

  function agentPlanUsageCount(agentId) {
    try {
      const { useTasksStore } = require('./tasks')
      const tasksStore = useTasksStore()
      return tasksStore.plans.reduce((acc, p) => acc + (p.steps || []).filter(s => (s.defaultAgentIds || []).includes(agentId)).length, 0)
    } catch {
      return 0
    }
  }

  watch(
    () => ({
      language: configStore.language,
      toolIds: (toolsStore.tools || []).map(tool => tool.id).join('|'),
      skillIds: (skillsStore.allSkillObjects || []).map(skill => skill.id).join('|'),
      mcpIds: (mcpStore.servers || []).map(server => server.id).join('|'),
      knowledgeIds: (knowledgeStore.knowledgeBases || []).map(kb => kb.id).join('|'),
    }),
    () => {
      syncBuiltinSystemAgent(true)
      syncBuiltinDocEditorAgent(true)
    }
  )

  async function cleanStaleKnowledgeRefs(validIndexIds) {
    const validSet = new Set(validIndexIds)
    let changed = false
    for (const agent of agents.value) {
      if (!agent.requiredKnowledgeBaseIds?.length) continue
      const cleaned = agent.requiredKnowledgeBaseIds.filter(id => validSet.has(id))
      if (cleaned.length !== agent.requiredKnowledgeBaseIds.length) {
        agent.requiredKnowledgeBaseIds = cleaned
        changed = true
      }
    }
    if (changed) await persist()
  }

  return {
    agents, categories,
    systemAgents, userAgents,
    systemCategories, userCategories,
    defaultSystemAgent, defaultUserAgent,
    getAgentById, getCategoryById,
    agentsInCategory, uncategorizedAgents,
    loadAgents, saveAgent, deleteAgent, setDefault,
    addCategory, renameCategory, deleteCategory, reorderCategory,
    assignToCategory, unassignFromCategory,
    cleanStaleKnowledgeRefs,
    // Plan usage protection
    isAgentUsedInPlans, agentPlanUsageCount,
  }
})
