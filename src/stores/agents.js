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
export const BUILTIN_ANALYST_ID      = '__analyst__'
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
    requiredSkillIds: ['pdf', 'docx', 'pptx', 'xlsx'],
    requiredMcpServerIds: [],
    requiredKnowledgeBaseIds: [],
  }
}

function buildBuiltinAnalystCopy(locale, utilityModel) {
  const isChinese = String(locale || 'en').startsWith('zh')
  const messages = isChinese ? zh : en
  const builtinName = messages.agents.builtinAnalystName || 'Analyst'
  const description = messages.agents.builtinAnalystDescription || ''
  const prompt = messages.agents.builtinAnalystPrompt || ''

  return {
    id: BUILTIN_ANALYST_ID,
    type: 'system',
    name: builtinName,
    avatar: 'agents:s8012',
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
    requiredSkillIds: ['persona-evaluation', 'analysis-report-template', 'ui-ux-pro-max'],
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
  // ── Internal split storage ───────────────────────────────────────────────
  // Disk schema:
  //   {
  //     "agents":   { "categories": [...], "items": [...] },   // type=system
  //     "personas": { "categories": [...], "items": [...] }    // type=user
  //   }
  // Splitting in memory + on disk means a bug in any system-agent flow
  // (template install, surprise-me, batch generate) can never accidentally
  // wipe user personas — saveAgent routes by `agent.type` and persist writes
  // each section from its own ref.
  const _systemAgents     = ref([])
  const _userAgents       = ref([])
  const _systemCategories = ref([])
  const _userCategories   = ref([])

  const configStore = useConfigStore()
  const toolsStore = useToolsStore()
  const mcpStore = useMcpStore()
  const skillsStore = useSkillsStore()
  const knowledgeStore = useKnowledgeStore()
  let builtinSyncInFlight = false

  const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)

  // Public merged read-only views — preserve the legacy `agents` / `categories`
  // surface so external consumers don't need to know the split exists.
  const agents     = computed(() => [..._systemAgents.value, ..._userAgents.value])
  const categories = computed(() => [..._systemCategories.value, ..._userCategories.value])

  const systemAgents = computed(() => _systemAgents.value.slice().sort(byCreatedDesc))
  const userAgents   = computed(() => _userAgents.value.slice().sort(byCreatedDesc))

  const systemCategories = computed(() => _systemCategories.value.slice())
  const userCategories   = computed(() => _userCategories.value.slice())

  const defaultSystemAgent = computed(() => _systemAgents.value.find(p => p.isDefault) || null)
  const defaultUserAgent   = computed(() => _userAgents.value.find(p => p.isDefault) || null)

  // Internal: pick the right ref for an agent by id (search system first, then user)
  function _refForAgentId(id) {
    if (_systemAgents.value.some(a => a.id === id)) return _systemAgents
    if (_userAgents.value.some(a => a.id === id))   return _userAgents
    return null
  }
  function _refForAgentType(type) {
    return type === 'user' ? _userAgents : _systemAgents
  }
  function _catRefForType(type) {
    return type === 'user' ? _userCategories : _systemCategories
  }

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
      current.voiceId !== next.voiceId ||
      current.prompt !== next.prompt ||
      !arrayEquals(current.requiredSkillIds || [], next.requiredSkillIds || [])
  }

  async function syncBuiltinDocEditorAgent(persistChanges = true) {
    const docIdx = _systemAgents.value.findIndex(p => p.id === BUILTIN_DOC_EDITOR_ID)
    if (docIdx === -1 || builtinSyncInFlight) return
    const current = _systemAgents.value[docIdx]
    const next = mergeBuiltinDocEditorAgent(current)
    if (!builtinDocEditorAgentNeedsSync(current, next)) return

    builtinSyncInFlight = true
    _systemAgents.value[docIdx] = {
      ...next,
      updatedAt: Date.now(),
    }
    try {
      if (persistChanges) await persist()
    } finally {
      builtinSyncInFlight = false
    }
  }

  function createBuiltinAnalystAgent() {
    return buildBuiltinAnalystCopy(
      configStore.language || 'en',
      configStore.config.utilityModel || {}
    )
  }

  function mergeBuiltinAnalystAgent(existing) {
    const builtin = createBuiltinAnalystAgent()
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

  function builtinAnalystAgentNeedsSync(current, next) {
    if (!current) return true
    return current.name !== next.name ||
      current.avatar !== next.avatar ||
      current.description !== next.description ||
      current.voiceId !== next.voiceId ||
      current.prompt !== next.prompt ||
      !arrayEquals(current.requiredSkillIds || [], next.requiredSkillIds || [])
  }

  async function syncBuiltinAnalystAgent(persistChanges = true) {
    const analystIdx = _systemAgents.value.findIndex(p => p.id === BUILTIN_ANALYST_ID)
    if (analystIdx === -1 || builtinSyncInFlight) return
    const current = _systemAgents.value[analystIdx]
    const next = mergeBuiltinAnalystAgent(current)
    if (!builtinAnalystAgentNeedsSync(current, next)) return

    builtinSyncInFlight = true
    _systemAgents.value[analystIdx] = {
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
    const sysIdx = _systemAgents.value.findIndex(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
    if (sysIdx === -1 || builtinSyncInFlight) return
    const current = _systemAgents.value[sysIdx]
    const next = mergeBuiltinSystemAgent(current)
    if (!builtinSystemAgentNeedsSync(current, next)) return

    builtinSyncInFlight = true
    _systemAgents.value[sysIdx] = {
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
    return _systemAgents.value.find(p => p.id === id)
        || _userAgents.value.find(p => p.id === id)
        || null
  }

  function getCategoryById(id) {
    return _systemCategories.value.find(c => c.id === id)
        || _userCategories.value.find(c => c.id === id)
        || null
  }

  function agentsInCategory(categoryId) {
    // Categories are type-scoped, so an agent only matches a category of its own type.
    const cat = getCategoryById(categoryId)
    if (!cat) return []
    const pool = _refForAgentType(cat.type).value
    return pool.filter(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(categoryId)).sort(byCreatedDesc)
  }

  function uncategorizedAgents(type) {
    const pool = _refForAgentType(type).value
    return pool.filter(p => !Array.isArray(p.categoryIds) || p.categoryIds.length === 0).sort(byCreatedDesc)
  }

  async function loadAgents() {
    const stored = await storage.getAgents()

    // Schema: { agents: { categories, items }, personas: { categories, items } }
    // (No legacy migration — production data was direct-edited to new shape;
    // tests use the same schema.)
    const sysList  = stored?.agents?.items        || []
    const sysCats  = stored?.agents?.categories   || []
    const userList = stored?.personas?.items      || []
    const userCats = stored?.personas?.categories || []

    // Ensure built-in system agent exists (lives in system list)
    const sysIdx = sysList.findIndex(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
    if (sysIdx >= 0) {
      sysList[sysIdx] = mergeBuiltinSystemAgent(sysList[sysIdx])
    } else {
      sysList.unshift(createBuiltinSystemAgent())
    }
    // Ensure built-in doc editor agent exists
    const docIdx = sysList.findIndex(p => p.id === BUILTIN_DOC_EDITOR_ID)
    if (docIdx >= 0) {
      sysList[docIdx] = mergeBuiltinDocEditorAgent(sysList[docIdx])
    } else {
      sysList.push(createBuiltinDocEditorAgent())
    }
    // Ensure built-in analyst agent exists
    const analystIdx = sysList.findIndex(p => p.id === BUILTIN_ANALYST_ID)
    if (analystIdx >= 0) {
      sysList[analystIdx] = mergeBuiltinAnalystAgent(sysList[analystIdx])
    } else {
      sysList.push(createBuiltinAnalystAgent())
    }

    // Remove legacy built-in default user agent — it's implicit, never persisted
    const usrIdx = userList.findIndex(p => p.id === BUILTIN_USER_AGENT_ID)
    if (usrIdx >= 0) userList.splice(usrIdx, 1)

    // Backfill optional agent fields on both lists
    const backfillFields = (p) => {
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
    sysList.forEach(backfillFields)
    userList.forEach(backfillFields)

    // Force the type field to match the section the entry lives in. Catches
    // any drift introduced during legacy migration or hand-edits.
    sysList.forEach(p => { if (p.type !== 'system') p.type = 'system' })
    userList.forEach(p => { if (p.type !== 'user')   p.type = 'user' })
    sysCats.forEach(c => { if (c.type !== 'system') c.type = 'system' })
    userCats.forEach(c => { if (c.type !== 'user')  c.type = 'user' })

    // Ensure at least one default per type
    if (!sysList.some(p => p.isDefault)) {
      const sys = sysList.find(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
      if (sys) sys.isDefault = true
    }
    if (!userList.some(p => p.isDefault) && userList.length > 0) {
      userList[0].isDefault = true
    }

    _systemAgents.value     = sysList
    _userAgents.value       = userList
    _systemCategories.value = sysCats
    _userCategories.value   = userCats
    await persist()
  }

  async function saveAgent(agent) {
    // Update path: locate the agent in either ref by id (the type field on a
    // freshly-edited agent might have been reassigned by mistake — trust the
    // ref the agent already lives in over the incoming type field).
    const existingRef = agent.id ? _refForAgentId(agent.id) : null
    if (existingRef) {
      const list = existingRef.value
      const idx = list.findIndex(p => p.id === agent.id)
      const existing = list[idx]
      list[idx] = {
        ...agent,
        type: existing.type, // never re-type an existing agent through saveAgent
        isBuiltin: existing.isBuiltin || false,
        categoryIds: existing.categoryIds || [],
        requiredToolIds: agent.requiredToolIds ?? existing.requiredToolIds ?? [],
        requiredSkillIds: agent.requiredSkillIds ?? existing.requiredSkillIds ?? [],
        requiredMcpServerIds: agent.requiredMcpServerIds ?? existing.requiredMcpServerIds ?? [],
        requiredKnowledgeBaseIds: agent.requiredKnowledgeBaseIds ?? existing.requiredKnowledgeBaseIds ?? [],
        updatedAt: Date.now(),
      }
      await persist()
      return list[idx]
    }
    // Create path: route by incoming type (default 'system')
    const type = agent.type === 'user' ? 'user' : 'system'
    const targetRef = _refForAgentType(type)
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
      type,
    }
    if (!newAgent.voiceId) newAgent.voiceId = getDefaultVoiceForLocale(configStore.language)
    // Auto-set as default when it's the first agent of its type
    if (type === 'user' && !_userAgents.value.some(p => p.isDefault)) {
      newAgent.isDefault = true
    }
    targetRef.value.push(newAgent)
    await persist()
    return newAgent
  }

  async function deleteAgent(id) {
    const targetRef = _refForAgentId(id)
    if (!targetRef) return
    const agent = targetRef.value.find(p => p.id === id)
    if (agent?.isBuiltin) return
    targetRef.value = targetRef.value.filter(p => p.id !== id)
    await persist()
    // Clean up soul file + memory directory for deleted agent
    try {
      const type = agent?.type === 'user' ? 'users' : 'system'
      await window.electronAPI?.souls?.deleteAgentData?.(id, type)
    } catch { /* best-effort cleanup */ }
  }

  async function setDefault(id) {
    const targetRef = _refForAgentId(id)
    if (!targetRef) return
    const target = targetRef.value.find(p => p.id === id)
    if (!target) return
    // Reset isDefault only within the same type's ref
    for (const p of targetRef.value) p.isDefault = false
    target.isDefault = true
    target.updatedAt = Date.now()
    await persist()
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────

  async function addCategory(name, emoji, type) {
    const id = uuidv4()
    const targetRef = _catRefForType(type)
    targetRef.value.push({ id, name, emoji, type: type === 'user' ? 'user' : 'system' })
    await persist()
    return id
  }

  async function renameCategory(id, name, emoji) {
    const cat = getCategoryById(id)
    if (!cat) return
    cat.name  = name
    cat.emoji = emoji
    await persist()
  }

  async function deleteCategory(id) {
    // Only allowed when no agents are assigned (search both refs to be safe)
    const assigned = _systemAgents.value.some(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(id))
                  || _userAgents.value.some(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(id))
    if (assigned) return false
    _systemCategories.value = _systemCategories.value.filter(c => c.id !== id)
    _userCategories.value   = _userCategories.value.filter(c => c.id !== id)
    await persist()
    return true
  }

  async function reorderCategory(draggedId, targetId) {
    // Categories only reorder within their own type pool. Identify the dragged
    // category's type, then reorder against a target of the same type.
    const dragged = getCategoryById(draggedId)
    if (!dragged) return
    const list = _catRefForType(dragged.type).value
    const from = list.findIndex(c => c.id === draggedId)
    const to   = list.findIndex(c => c.id === targetId)
    if (from === -1 || to === -1 || from === to) return
    const moved = list.splice(from, 1)[0]
    list.splice(to, 0, moved)
    await persist()
  }

  // ── Assignment ────────────────────────────────────────────────────────────

  async function assignToCategory(agentId, categoryId) {
    const agentRef = _refForAgentId(agentId)
    if (!agentRef) return
    const agent = agentRef.value.find(p => p.id === agentId)
    const category = getCategoryById(categoryId)
    if (!agent || !category) return
    if (agent.type !== category.type) return
    if (!Array.isArray(agent.categoryIds)) agent.categoryIds = []
    if (!agent.categoryIds.includes(categoryId)) {
      agent.categoryIds.push(categoryId)
      await persist()
    }
  }

  async function unassignFromCategory(agentId, categoryId) {
    const agentRef = _refForAgentId(agentId)
    if (!agentRef) return
    const agent = agentRef.value.find(p => p.id === agentId)
    if (!agent || !Array.isArray(agent.categoryIds)) return
    agent.categoryIds = agent.categoryIds.filter(id => id !== categoryId)
    await persist()
  }

  async function persist() {
    await storage.saveAgents({
      agents: {
        categories: JSON.parse(JSON.stringify(_systemCategories.value)),
        items:      JSON.parse(JSON.stringify(_systemAgents.value)),
      },
      personas: {
        categories: JSON.parse(JSON.stringify(_userCategories.value)),
        items:      JSON.parse(JSON.stringify(_userAgents.value)),
      },
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
      syncBuiltinAnalystAgent(true)
    }
  )

  async function cleanStaleKnowledgeRefs(validIndexIds) {
    const validSet = new Set(validIndexIds)
    let changed = false
    const sweep = (list) => {
      for (const agent of list) {
        if (!agent.requiredKnowledgeBaseIds?.length) continue
        const cleaned = agent.requiredKnowledgeBaseIds.filter(id => validSet.has(id))
        if (cleaned.length !== agent.requiredKnowledgeBaseIds.length) {
          agent.requiredKnowledgeBaseIds = cleaned
          changed = true
        }
      }
    }
    sweep(_systemAgents.value)
    sweep(_userAgents.value)
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
