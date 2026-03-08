import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { storage } from '../services/storage'

// ── Built-in personas (non-deletable) ─────────────────────────────────────
export const BUILTIN_SYSTEM_PERSONA_ID = '__default_system__'
export const BUILTIN_USER_PERSONA_ID   = '__default_user__'

const BUILTIN_SYSTEM_PERSONA = {
  id: BUILTIN_SYSTEM_PERSONA_ID,
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

const BUILTIN_USER_PERSONA = {
  id: BUILTIN_USER_PERSONA_ID,
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

export const usePersonasStore = defineStore('personas', () => {
  const personas   = ref([])
  const categories = ref([])

  const byCreatedDesc = (a, b) => (b.createdAt || 0) - (a.createdAt || 0)

  const systemPersonas = computed(() => personas.value.filter(p => p.type === 'system').sort(byCreatedDesc))
  const userPersonas   = computed(() => personas.value.filter(p => p.type === 'user').sort(byCreatedDesc))

  const systemCategories = computed(() => categories.value.filter(c => c.type === 'system'))
  const userCategories   = computed(() => categories.value.filter(c => c.type === 'user'))

  const defaultSystemPersona = computed(() => personas.value.find(p => p.type === 'system' && p.isDefault) || null)
  const defaultUserPersona   = computed(() => personas.value.find(p => p.type === 'user'   && p.isDefault) || null)

  function getPersonaById(id) {
    return personas.value.find(p => p.id === id) || null
  }

  function getCategoryById(id) {
    return categories.value.find(c => c.id === id) || null
  }

  function personasInCategory(categoryId) {
    return personas.value.filter(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(categoryId)).sort(byCreatedDesc)
  }

  function uncategorizedPersonas(type) {
    return personas.value.filter(p => p.type === type && (!Array.isArray(p.categoryIds) || p.categoryIds.length === 0)).sort(byCreatedDesc)
  }

  async function loadPersonas() {
    const stored = await storage.getPersonas()

    // Handle both old (plain array) and new ({ categories, personas }) formats
    let list, cats
    if (Array.isArray(stored)) {
      list = stored || []
      cats = []
    } else {
      list = stored?.personas || []
      cats = stored?.categories || []
    }

    // Ensure built-in system persona exists
    const sysIdx = list.findIndex(p => p.id === BUILTIN_SYSTEM_PERSONA_ID)
    if (sysIdx >= 0) {
      list[sysIdx] = { ...list[sysIdx], isBuiltin: true }
    } else {
      list.unshift({ ...BUILTIN_SYSTEM_PERSONA })
    }

    // Ensure built-in user persona exists
    const usrIdx = list.findIndex(p => p.id === BUILTIN_USER_PERSONA_ID)
    if (usrIdx >= 0) {
      list[usrIdx] = { ...list[usrIdx], isBuiltin: true }
    } else {
      const lastSysIdx = list.reduce((acc, p, i) => p.type === 'system' ? i : acc, -1)
      list.splice(lastSysIdx + 1, 0, { ...BUILTIN_USER_PERSONA })
    }

    // Backfill optional persona fields
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
      const sys = list.find(p => p.id === BUILTIN_SYSTEM_PERSONA_ID)
      if (sys) sys.isDefault = true
    }
    if (!list.some(p => p.type === 'user' && p.isDefault)) {
      const usr = list.find(p => p.id === BUILTIN_USER_PERSONA_ID)
      if (usr) usr.isDefault = true
    }

    personas.value   = list
    categories.value = cats
    await persist()
  }

  async function savePersona(persona) {
    const idx = personas.value.findIndex(p => p.id === persona.id)
    if (idx >= 0) {
      const existing = personas.value[idx]
      personas.value[idx] = {
        ...persona,
        isBuiltin: existing.isBuiltin || false,
        categoryIds: existing.categoryIds || [],
        updatedAt: Date.now(),
      }
    } else {
      personas.value.push({
        id: uuidv4(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isBuiltin: false,
        categoryIds: [],
        ...persona,
      })
    }
    await persist()
  }

  async function deletePersona(id) {
    const persona = personas.value.find(p => p.id === id)
    if (persona?.isBuiltin) return
    personas.value = personas.value.filter(p => p.id !== id)
    await persist()
  }

  async function setDefault(id) {
    const target = personas.value.find(p => p.id === id)
    if (!target) return
    for (const p of personas.value) {
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
    // Only allowed when no personas are assigned
    const assigned = personas.value.some(p => Array.isArray(p.categoryIds) && p.categoryIds.includes(id))
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

  async function assignToCategory(personaId, categoryId) {
    const persona  = personas.value.find(p => p.id === personaId)
    const category = categories.value.find(c => c.id === categoryId)
    if (!persona || !category) return
    if (persona.type !== category.type) return
    if (!Array.isArray(persona.categoryIds)) persona.categoryIds = []
    if (!persona.categoryIds.includes(categoryId)) {
      persona.categoryIds.push(categoryId)
      await persist()
    }
  }

  async function unassignFromCategory(personaId, categoryId) {
    const persona = personas.value.find(p => p.id === personaId)
    if (!persona || !Array.isArray(persona.categoryIds)) return
    persona.categoryIds = persona.categoryIds.filter(id => id !== categoryId)
    await persist()
  }

  async function persist() {
    await storage.savePersonas({
      categories: JSON.parse(JSON.stringify(categories.value)),
      personas:   JSON.parse(JSON.stringify(personas.value)),
    })
  }

  return {
    personas, categories,
    systemPersonas, userPersonas,
    systemCategories, userCategories,
    defaultSystemPersona, defaultUserPersona,
    getPersonaById, getCategoryById,
    personasInCategory, uncategorizedPersonas,
    loadPersonas, savePersona, deletePersona, setDefault,
    addCategory, renameCategory, deleteCategory, reorderCategory,
    assignToCategory, unassignFromCategory,
  }
})
