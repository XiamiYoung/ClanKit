import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'
import { en, zh } from '../i18n'
import { useConfigStore } from './config'
import { useToolsStore } from './tools'
import { useMcpStore } from './mcp'
import { useSkillsStore } from './skills'
import { useKnowledgeStore } from './knowledge'
import { getDefaultVoiceForLocale } from '../utils/edgeVoices'
import { isLimitEnforced, PREVIEW_LIMITS } from '../utils/guestLimits'
import { triggerPreviewLimit } from '../composables/usePreviewLimit'

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
    requiredToolIds: ['file_operation'],
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

  const wizardHighlightAgentId = ref(null)

  const configStore = useConfigStore()
  const toolsStore = useToolsStore()
  const mcpStore = useMcpStore()
  const skillsStore = useSkillsStore()
  const knowledgeStore = useKnowledgeStore()
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

  function createBuiltinDocEditorAgent() {
    return buildBuiltinDocEditorCopy(
      configStore.language || 'en',
      configStore.config.utilityModel || {}
    )
  }

  function createBuiltinAnalystAgent() {
    return buildBuiltinAnalystCopy(
      configStore.language || 'en',
      configStore.config.utilityModel || {}
    )
  }

  function getAgentById(id) {
    return _systemAgents.value.find(p => p.id === id)
        || _userAgents.value.find(p => p.id === id)
        || null
  }

  /**
   * Distinguish "deleted" (id is set but agent no longer exists) from
   * "unassigned" (id is empty/null). Returns true ONLY for the deleted case.
   * Use at chat-display sites to show a tombstone instead of silently
   * substituting the default agent — per user policy 2026-05-03 a deleted
   * agent must NOT be replaced by the default; the chat surfaces a clear
   * "deleted" indicator and the send-message flow refuses the chat.
   */
  function isAgentDeleted(id) {
    if (!id) return false
    return getAgentById(id) === null
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

    // SSOT: only seed builtins when MISSING. Once a row exists, the DB is the
    // source of truth — user edits to prompt/name/skills persist forever.
    if (!sysList.some(p => p.id === BUILTIN_SYSTEM_AGENT_ID)) {
      sysList.unshift(createBuiltinSystemAgent())
    }
    if (!sysList.some(p => p.id === BUILTIN_DOC_EDITOR_ID)) {
      sysList.push(createBuiltinDocEditorAgent())
    }
    if (!sysList.some(p => p.id === BUILTIN_ANALYST_ID)) {
      sysList.push(createBuiltinAnalystAgent())
    }

    // Remove legacy built-in default user agent — it's implicit, never persisted
    const usrIdx = userList.findIndex(p => p.id === BUILTIN_USER_AGENT_ID)
    if (usrIdx >= 0) userList.splice(usrIdx, 1)

    // Backfill optional agent fields on both lists
    const backfillFields = (p) => {
      if (p.providerId === undefined) p.providerId = null
      if (p.modelId === undefined) p.modelId = null
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
    // Guest cap — enforced once at the chokepoint so every saveAgent caller
    // (template install, import wizard, group creator, setup wizard) is covered.
    if (isLimitEnforced()) {
      const cap = type === 'user' ? PREVIEW_LIMITS.maxUserPersonas : PREVIEW_LIMITS.maxAgents
      const limitKey = type === 'user' ? 'maxUserPersonas' : 'maxAgents'
      if (targetRef.value.length >= cap) {
        triggerPreviewLimit(limitKey)
        throw new Error(`preview_limit:${limitKey}`)
      }
    }
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
    // Clean up memory + per-agent memory directory for deleted agent
    try {
      const type = agent?.type === 'user' ? 'users' : 'system'
      await window.electronAPI?.memory?.deleteAgentData?.(id, type)
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

  // One-shot wizard hook. On first launch loadAgents() seeds builtins BEFORE
  // tools/skills/mcp/knowledge stores have finished loading AND BEFORE the
  // user picks a language in step 1, so Clank ends up with: English
  // name/description/prompt (default config.language='en'), null provider /
  // model, empty capability arrays, English voice. The SSOT rule forbids
  // re-merging on subsequent startups, so the wizard explicitly rebuilds the
  // builtins from current i18n + utility model + capabilities right before
  // opening the first chat. After this point, SSOT applies — user edits
  // persist forever.
  async function applyWizardCapabilitiesToBuiltins({ providerId, modelId } = {}) {
    const caps = collectBuiltinCapabilities()
    const locale = configStore.language || 'en'
    const utility = (providerId && modelId)
      ? { provider: providerId, model: modelId }
      : (configStore.config.utilityModel || {})

    const sysFresh     = buildBuiltinSystemCopy(locale, utility, caps)
    const docFresh     = buildBuiltinDocEditorCopy(locale, utility)
    const analystFresh = buildBuiltinAnalystCopy(locale, utility)

    let changed = false
    const patch = (id, fresh, withCaps) => {
      const idx = _systemAgents.value.findIndex(p => p.id === id)
      if (idx === -1) return
      const existing = _systemAgents.value[idx]
      const next = {
        ...existing,
        // Refresh i18n-derived fields to match the user's wizard-selected
        // language. Only safe to do here because this is first-run and the
        // user hasn't customized anything yet.
        name:        fresh.name,
        description: fresh.description,
        prompt:      fresh.prompt,
        voiceId:     fresh.voiceId,
        providerId:  fresh.providerId || existing.providerId || null,
        modelId:     fresh.modelId    || existing.modelId    || null,
        updatedAt:   Date.now(),
      }
      if (withCaps) {
        next.requiredToolIds          = caps.requiredToolIds
        next.requiredSkillIds         = caps.requiredSkillIds
        next.requiredMcpServerIds     = caps.requiredMcpServerIds
        next.requiredKnowledgeBaseIds = caps.requiredKnowledgeBaseIds
      }
      _systemAgents.value[idx] = next
      changed = true
    }
    patch(BUILTIN_SYSTEM_AGENT_ID, sysFresh,     true)
    patch(BUILTIN_DOC_EDITOR_ID,   docFresh,     false)
    patch(BUILTIN_ANALYST_ID,      analystFresh, false)
    if (changed) await persist()
  }

  return {
    agents, categories,
    systemAgents, userAgents,
    systemCategories, userCategories,
    defaultSystemAgent, defaultUserAgent,
    getAgentById, isAgentDeleted, getCategoryById,
    agentsInCategory, uncategorizedAgents,
    loadAgents, saveAgent, deleteAgent, setDefault,
    addCategory, renameCategory, deleteCategory, reorderCategory,
    assignToCategory, unassignFromCategory,
    applyWizardCapabilitiesToBuiltins,
    // Plan usage protection
    isAgentUsedInPlans, agentPlanUsageCount,
    // Wizard tour highlight (drives BodyViewer auto-open + section glow)
    wizardHighlightAgentId,
  }
})
