import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

export const useSkillsStore = defineStore('skills', () => {
  const skills = ref([])        // [{ id, name, summary, path, systemPrompt? }]
  const remoteSkills = ref({})  // { sourceId: [skills...] }
  const loading = ref(false)
  const remoteFetching = ref({}) // { sourceId: boolean }
  const remoteError = ref({})    // { sourceId: errorMessage }
  const error = ref(null)
  const installingSkills = ref({}) // { skillId: { sourceId, progress, status, error } }

  // All skills are always "enabled" — return all as skill objects for agent loop.
  // `description` is the SKILL.md frontmatter description — this is what the
  // system prompt's ACTIVE SKILLS block surfaces to the LLM as the trigger
  // description. Dropping it would force a fallback to `summary` (the first
  // body paragraph), which is usually less precise about WHEN to load.
  const allSkillObjects = computed(() =>
    skills.value
      .filter(s => s.systemPrompt)
      .map(s => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName || '',
        description: s.description || '',
        summary: s.summary || '',
        systemPrompt: s.systemPrompt,
      }))
  )

  // Combined remote skills (flatten by sourceId)
  const allRemoteSkills = computed(() => {
    const all = []
    for (const [sourceId, skillList] of Object.entries(remoteSkills.value)) {
      all.push(...(skillList || []))
    }
    return all
  })

  // Check if a skill is installed locally
  function isSkillInstalled(skillId) {
    return skills.value.some(s => s.id === skillId)
  }

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

  async function fetchRemoteSkills(sourceId, options = {}) {
    if (!isElectron()) return
    
    remoteFetching.value[sourceId] = true
    remoteError.value[sourceId] = null
    try {
      const result = await window.electronAPI.skills.fetchRemote(sourceId, options)
      if (result.error) {
        throw new Error(result.error)
      }
      
      // Mark installed skills
      const skillList = result.map(s => ({
        ...s,
        installed: isSkillInstalled(s.id)
      }))
      
      remoteSkills.value[sourceId] = skillList
    } catch (err) {
      remoteError.value[sourceId] = `Failed to fetch from ${sourceId}: ${err.message}`
      remoteSkills.value[sourceId] = []
    } finally {
      remoteFetching.value[sourceId] = false
    }
  }

  async function installRemoteSkill(sourceId, skillId, skillUrl, skillsPath = '') {
    if (!isElectron()) return
    
    installingSkills.value[skillId] = {
      sourceId,
      progress: 0,
      status: 'installing',
      error: null
    }
    
    try {
      const result = await window.electronAPI.skills.installRemote(sourceId, skillId, skillUrl, skillsPath)
      
      if (result.success) {
        // Mark as installed in remote list
        if (remoteSkills.value[sourceId]) {
          const remote = remoteSkills.value[sourceId].find(s => s.id === skillId)
          if (remote) remote.installed = true
        }
        
        // Reload local skills using the same skillsPath
        await loadSkills(skillsPath)
        await loadSkillPrompts(skillsPath)
        
        installingSkills.value[skillId].status = 'completed'
        installingSkills.value[skillId].progress = 100
      } else {
        throw new Error(result.error || 'Installation failed')
      }
    } catch (err) {
      installingSkills.value[skillId].status = 'error'
      installingSkills.value[skillId].error = err.message
    }
  }

  async function uninstallRemoteSkill(skillId) {
    if (!isElectron()) return
    const localSkill = skills.value.find(s => s.id === skillId)
    if (localSkill?.path) {
      try {
        await window.electronAPI.skills.deleteSkill(localSkill.path)
      } catch (err) {
        console.error('[Skills] delete failed:', err)
      }
    }
    // Remove from local list
    skills.value = skills.value.filter(s => s.id !== skillId)
    // Mark not installed in all remote source lists
    for (const skillList of Object.values(remoteSkills.value)) {
      const remote = skillList?.find(s => s.id === skillId)
      if (remote) remote.installed = false
    }
    // Clean up installing state
    delete installingSkills.value[skillId]
    // Main-process IPC prunes agent references in SQLite; refresh renderer.
    try {
      const { useAgentsStore } = await import('./agents')
      await useAgentsStore().loadAgents()
    } catch (err) {
      console.error('[skills] post-uninstall agents refresh failed:', err)
    }
  }

  return { 
    skills, 
    remoteSkills,
    allRemoteSkills,
    loading, 
    remoteFetching,
    remoteError,
    installingSkills,
    error,
    isSkillInstalled,
    allSkillObjects, 
    loadSkills, 
    loadSkillPrompts,
    fetchRemoteSkills,
    installRemoteSkill,
    uninstallRemoteSkill
  }
})
