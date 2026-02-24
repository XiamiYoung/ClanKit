import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref([])        // [{ id, name, summary, path, systemPrompt? }]
  const loading = ref(false)
  const error = ref(null)

  // All skills are always "enabled" — return all as skill objects for agent loop
  const allSkillObjects = computed(() =>
    skills.value
      .filter(s => s.systemPrompt)
      .map(s => ({ id: s.id, name: s.name, summary: s.summary || '', systemPrompt: s.systemPrompt }))
  )

  async function loadSkills(skillsPath) {
    if (!isElectron()) return
    loading.value = true
    error.value = null
    try {
      const scanned = await window.electronAPI.skills.scanDir(skillsPath || '')
      skills.value = scanned || []
    } catch (err) {
      error.value = err.message
      skills.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadSkillPrompts(skillsPath) {
    if (!isElectron()) return
    try {
      const prompts = await window.electronAPI.skills.loadAllPrompts(skillsPath || '')
      // Merge systemPrompt into existing skills array
      for (const p of prompts) {
        const existing = skills.value.find(s => s.id === p.id)
        if (existing) {
          existing.systemPrompt = p.systemPrompt
        }
      }
    } catch (err) {
      error.value = err.message
    }
  }

  return { skills, loading, error, allSkillObjects, loadSkills, loadSkillPrompts }
})
