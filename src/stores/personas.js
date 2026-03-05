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
  name: 'SparkAI Assistant',
  avatar: 'a1',
  description: 'A helpful, knowledgeable AI assistant for general tasks.',
  prompt: `You are SparkAI Assistant, a helpful and knowledgeable AI.
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
  const personas = ref([])

  const systemPersonas = computed(() => personas.value.filter(p => p.type === 'system'))
  const userPersonas   = computed(() => personas.value.filter(p => p.type === 'user'))

  const defaultSystemPersona = computed(() => personas.value.find(p => p.type === 'system' && p.isDefault) || null)
  const defaultUserPersona   = computed(() => personas.value.find(p => p.type === 'user'   && p.isDefault) || null)

  function getPersonaById(id) {
    return personas.value.find(p => p.id === id) || null
  }

  async function loadPersonas() {
    const stored = await storage.getPersonas()
    const list = stored || []

    // Ensure built-in system persona exists
    const sysIdx = list.findIndex(p => p.id === BUILTIN_SYSTEM_PERSONA_ID)
    if (sysIdx >= 0) {
      // Preserve user edits but keep isBuiltin flag
      list[sysIdx] = { ...list[sysIdx], isBuiltin: true }
    } else {
      list.unshift({ ...BUILTIN_SYSTEM_PERSONA })
    }

    // Ensure built-in user persona exists
    const usrIdx = list.findIndex(p => p.id === BUILTIN_USER_PERSONA_ID)
    if (usrIdx >= 0) {
      list[usrIdx] = { ...list[usrIdx], isBuiltin: true }
    } else {
      // Insert after all system personas
      const lastSysIdx = list.reduce((acc, p, i) => p.type === 'system' ? i : acc, -1)
      list.splice(lastSysIdx + 1, 0, { ...BUILTIN_USER_PERSONA })
    }

    // Backfill optional persona fields for group chat support
    for (const p of list) {
      if (p.providerId === undefined) p.providerId = null
      if (p.modelId === undefined) p.modelId = null
      if (p.enabledSkillIds === undefined) p.enabledSkillIds = null
      if (p.mcpServerIds === undefined) p.mcpServerIds = null
      if (p.voiceId === undefined) p.voiceId = null
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

    personas.value = list
    await persist()
  }

  async function savePersona(persona) {
    const idx = personas.value.findIndex(p => p.id === persona.id)
    if (idx >= 0) {
      // Preserve isBuiltin flag on edits
      const existing = personas.value[idx]
      personas.value[idx] = { ...persona, isBuiltin: existing.isBuiltin || false, updatedAt: Date.now() }
    } else {
      personas.value.push({
        id: uuidv4(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isBuiltin: false,
        ...persona,
      })
    }
    await persist()
  }

  async function deletePersona(id) {
    const persona = personas.value.find(p => p.id === id)
    if (persona?.isBuiltin) return // Cannot delete built-in personas
    personas.value = personas.value.filter(p => p.id !== id)
    await persist()
  }

  async function setDefault(id) {
    const target = personas.value.find(p => p.id === id)
    if (!target) return
    // Clear previous default of the same type
    for (const p of personas.value) {
      if (p.type === target.type) p.isDefault = false
    }
    target.isDefault = true
    target.updatedAt = Date.now()
    await persist()
  }

  async function persist() {
    await storage.savePersonas(JSON.parse(JSON.stringify(personas.value)))
  }

  return {
    personas, systemPersonas, userPersonas,
    defaultSystemPersona, defaultUserPersona,
    getPersonaById, loadPersonas, savePersona, deletePersona, setDefault,
  }
})
