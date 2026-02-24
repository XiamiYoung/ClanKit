import { defineStore } from 'pinia'
import { ref } from 'vue'

// Convert Windows drive paths to WSL2 mount paths (D:\notes → /mnt/d/notes)
function toWslPath(p) {
  if (!p) return p
  const m = p.match(/^([A-Za-z]):[/\\](.*)$/)
  if (m) {
    const drive = m[1].toLowerCase()
    const rest = m[2].replace(/\\/g, '/')
    return `/mnt/${drive}/${rest}`.replace(/\/+$/, '') || `/mnt/${drive}`
  }
  return p
}

export const useObsidianStore = defineStore('obsidian', () => {
  const vaultPath = ref('')
  const fileTree = ref([])
  const activeFile = ref(null)     // { path, name, content, dirty }
  const expandedFolders = ref({})  // { [path]: true }

  async function loadConfig() {
    const config = await window.electronAPI.obsidian.getConfig()
    if (config.vaultPath) {
      vaultPath.value = toWslPath(config.vaultPath)
      await loadTree()
    }
  }

  async function pickVault() {
    const folder = await window.electronAPI.obsidian.pickFolder()
    if (!folder) return
    await setVault(toWslPath(folder))
  }

  async function setVaultManually(folder) {
    if (!folder || !folder.trim()) return
    await setVault(toWslPath(folder.trim()))
  }

  async function setVault(folder) {
    vaultPath.value = folder
    await window.electronAPI.obsidian.saveConfig({ vaultPath: folder })
    activeFile.value = null
    expandedFolders.value = {}
    await loadTree()
  }

  async function loadTree() {
    if (!vaultPath.value) { fileTree.value = []; return }
    fileTree.value = await window.electronAPI.obsidian.readTree(vaultPath.value)
  }

  async function openFile(filePath, fileName) {
    // Save current file if dirty before switching
    if (activeFile.value && activeFile.value.dirty) {
      await saveFile()
    }
    const result = await window.electronAPI.obsidian.readFile(filePath)
    if (result.error) { console.error('Failed to read file:', result.error); return }
    activeFile.value = { path: filePath, name: fileName, content: result.content, dirty: false }
  }

  async function saveFile() {
    if (!activeFile.value) return
    const result = await window.electronAPI.obsidian.writeFile(activeFile.value.path, activeFile.value.content)
    if (result.error) { console.error('Failed to save file:', result.error); return }
    activeFile.value.dirty = false
  }

  function updateContent(newContent) {
    if (!activeFile.value) return
    activeFile.value.content = newContent
    activeFile.value.dirty = true
  }

  async function createFile(dir, name) {
    const result = await window.electronAPI.obsidian.createFile(dir, name)
    if (result.error) { console.error('Failed to create file:', result.error); return result }
    await loadTree()
    return result
  }

  async function createFolder(dir, name) {
    const result = await window.electronAPI.obsidian.createFolder(dir, name)
    if (result.error) { console.error('Failed to create folder:', result.error); return result }
    await loadTree()
    return result
  }

  async function deleteItem(targetPath) {
    const result = await window.electronAPI.obsidian.deleteFile(targetPath)
    if (result.error) { console.error('Failed to delete:', result.error); return result }
    // Clear active file if it was the deleted one
    if (activeFile.value && activeFile.value.path === targetPath) {
      activeFile.value = null
    }
    await loadTree()
    return result
  }

  async function renameItem(oldPath, newPath) {
    const result = await window.electronAPI.obsidian.rename(oldPath, newPath)
    if (result.error) { console.error('Failed to rename:', result.error); return result }
    // Update active file path if it was renamed
    if (activeFile.value && activeFile.value.path === oldPath) {
      activeFile.value.path = newPath
      const parts = newPath.split(/[/\\]/)
      activeFile.value.name = parts[parts.length - 1]
    }
    await loadTree()
    return result
  }

  function toggleFolder(folderPath) {
    if (expandedFolders.value[folderPath]) {
      delete expandedFolders.value[folderPath]
    } else {
      expandedFolders.value[folderPath] = true
    }
  }

  return {
    vaultPath, fileTree, activeFile, expandedFolders,
    loadConfig, pickVault, setVaultManually, loadTree, openFile, saveFile, updateContent,
    createFile, createFolder, deleteItem, renameItem, toggleFolder
  }
})
