import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'

// ── Built-in agents (non-deletable) ─────────────────────────────────────
export const BUILTIN_SYSTEM_AGENT_ID = '__default_system__'
export const BUILTIN_USER_AGENT_ID   = '__default_user__'
export const BUILTIN_DOC_EDITOR_ID   = '__doc_editor__'

const BUILTIN_SYSTEM_AGENT = {
  id: BUILTIN_SYSTEM_AGENT_ID,
  type: 'system',
  name: 'ClankAI Assistant',
  avatar: 'a1',
  description: 'A helpful, knowledgeable AI assistant for general tasks.',
  prompt: `You are ClankAI Assistant, a helpful and knowledgeable AI.
Communication style: professional, clear, and concise.
You provide accurate answers, write clean code, and explain your reasoning.
When unsure, you say so honestly rather than guessing.`,
  isDefault: true,
  isBuiltin: true,
  createdAt: 0,
  updatedAt: 0,
}

const BUILTIN_DOC_EDITOR_AGENT = {
  id: BUILTIN_DOC_EDITOR_ID,
  type: 'system',
  name: 'Doc Editor',
  avatar: 'a3',
  description: 'Expert document editing AI for writing, formatting, and content optimization.',
  prompt: `You are Doc Editor, a world-class document editing AI assistant embedded in a professional document editor.

Core expertise:
- Writing excellence: grammar, spelling, style, tone, clarity, conciseness
- Structural editing: reorganize content, improve flow, add transitions
- Format mastery: Markdown, HTML, code, technical docs, creative writing, business docs
- Content enhancement: expand ideas, simplify complex topics, summarize
- Code documentation: comments, docstrings, README, API docs
- Multilingual: edit and translate while preserving intent

When asked to modify text, output the replacement wrapped in <replacement>...</replacement> tags.
When asked questions about the text, answer directly without tags.

Rules:
- Preserve original formatting style unless asked to change it
- Maintain the author's voice — enhance, don't replace
- Be precise — only change what's needed
- For code, preserve functionality while improving readability
- For partial selections, only modify the selected section`,
  isDefault: false,
  isBuiltin: true,
  createdAt: 0,
  updatedAt: 0,
}

const BUILTIN_USER_AGENT = {
  id: BUILTIN_USER_AGENT_ID,
  type: 'user',
  name: 'Default User',
  avatar: 'a8',
  description: 'A general user profile with no specific preferences.',
  prompt: `The user is a general user with no specific role or preference set.
Respond in a clear, helpful manner suitable for a broad audience.`,
  isDefault: true,
  isBuiltin: true,
  createdAt: 0,
  updatedAt: 0,
}

export const useAgentsStore = defineStore('agents', () => {
  const agents     = ref([])
  const categories = ref([])

  const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)

  const systemAgents = computed(() => agents.value.filter(p => p.type === 'system').sort(byCreatedDesc))
  const userAgents   = computed(() => agents.value.filter(p => p.type === 'user').sort(byCreatedDesc))

  const systemCategories = computed(() => categories.value.filter(c => c.type === 'system'))
  const userCategories   = computed(() => categories.value.filter(c => c.type === 'user'))

  const defaultSystemAgent = computed(() => agents.value.find(p => p.type === 'system' && p.isDefault) || null)
  const defaultUserAgent   = computed(() => agents.value.find(p => p.type === 'user'   && p.isDefault) || null)

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
      list[sysIdx] = { ...list[sysIdx], isBuiltin: true }
    } else {
      list.unshift({ ...BUILTIN_SYSTEM_AGENT })
    }

    // Ensure built-in doc editor agent exists
    const docIdx = list.findIndex(p => p.id === BUILTIN_DOC_EDITOR_ID)
    if (docIdx >= 0) {
      list[docIdx] = { ...list[docIdx], isBuiltin: true }
    } else {
      list.push({ ...BUILTIN_DOC_EDITOR_AGENT })
    }

    // Ensure built-in user agent exists
    const usrIdx = list.findIndex(p => p.id === BUILTIN_USER_AGENT_ID)
    if (usrIdx >= 0) {
      list[usrIdx] = { ...list[usrIdx], isBuiltin: true }
    } else {
      const lastSysIdx = list.reduce((acc, p, i) => p.type === 'system' ? i : acc, -1)
      list.splice(lastSysIdx + 1, 0, { ...BUILTIN_USER_AGENT })
    }

    // Backfill optional agent fields
    for (const p of list) {
      if (p.providerId === undefined) p.providerId = null
      if (p.modelId === undefined) p.modelId = null
      if (p.enabledSkillIds === undefined) p.enabledSkillIds = null
      if (p.mcpServerIds === undefined) p.mcpServerIds = null
      if (p.voiceId === undefined) p.voiceId = null
      if (!Array.isArray(p.categoryIds)) p.categoryIds = []
    }

    // Ensure at least one default per type
    if (!list.some(p => p.type === 'system' && p.isDefault)) {
      const sys = list.find(p => p.id === BUILTIN_SYSTEM_AGENT_ID)
      if (sys) sys.isDefault = true
    }
    if (!list.some(p => p.type === 'user' && p.isDefault)) {
      const usr = list.find(p => p.id === BUILTIN_USER_AGENT_ID)
      if (usr) usr.isDefault = true
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
      agents.value.push({
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
      })
    }
    await persist()
  }

  async function deleteAgent(id) {
    const agent = agents.value.find(p => p.id === id)
    if (agent?.isBuiltin) return
    agents.value = agents.value.filter(p => p.id !== id)
    await persist()
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
    // Plan usage protection
    isAgentUsedInPlans, agentPlanUsageCount,
  }
})
