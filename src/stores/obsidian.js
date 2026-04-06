import { defineStore } from 'pinia'
import { ref } from 'vue'

function normalizePath(p) {
  return p || ''
}

export const useObsidianStore = defineStore('obsidian', () => {
  const vaultPath = ref('')
  const fileTree = ref([])
  const activeFile = ref(null)     // { path, name, content, dirty } or { path, name, base64, binary: true, dirty }
  const expandedFolders = ref({})  // { [path]: true }
  const fileLoading = ref(false)
  const fileError = ref('')        // non-empty string when open fails
  const highlightNav = ref(false)  // one-time pulse on sidebar AI Docs item

  async function loadConfig() {
    const config = await window.electronAPI.obsidian.getConfig()
    if (config.vaultPath) {
      vaultPath.value = normalizePath(config.vaultPath)
      await loadTree()
      if (config.lastOpenedDoc) {
        const { path: filePath, name: fileName } = config.lastOpenedDoc
        _expandParentsOf(filePath)
        await openFile(filePath, fileName)
      }
    }
  }

  // Expand all ancestor folders of a file path so it's visible in the tree
  function _expandParentsOf(filePath) {
    if (!vaultPath.value) return
    const sep = filePath.includes('/') ? '/' : '\\'
    // Build list of all ancestor folder paths between vaultPath and the file
    let dir = filePath
    const ancestors = []
    while (true) {
      const lastSep = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
      if (lastSep <= 0) break
      dir = dir.slice(0, lastSep)
      if (dir === vaultPath.value || dir.length <= vaultPath.value.length) break
      ancestors.push(dir)
    }
    for (const ancestor of ancestors) {
      expandedFolders.value[ancestor] = true
    }
  }

  async function pickVault() {
    const folder = await window.electronAPI.obsidian.pickFolder()
    if (!folder) return
    await setVault(normalizePath(folder))
  }

  async function setVaultManually(folder) {
    if (!folder || !folder.trim()) return
    await setVault(normalizePath(folder.trim()))
  }

  async function setVault(folder) {
    vaultPath.value = folder
    await window.electronAPI.obsidian.saveConfig({ vaultPath: folder, lastOpenedDoc: null })
    // Sync DoCPath to configStore so ConfigView picks it up
    const { useConfigStore } = await import('./config')
    const configStore = useConfigStore()
    configStore.config.DoCPath = folder
    activeFile.value = null
    expandedFolders.value = {}
    await loadTree()
  }

  async function loadTree() {
    if (!vaultPath.value) { fileTree.value = []; return }
    fileTree.value = await window.electronAPI.obsidian.readTree(vaultPath.value)
  }

  const BINARY_EXTS = new Set(['pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'svg'])
  const OPEN_TIMEOUT = 10000 // 10 seconds

  function _getExt(name) {
    return (name || '').split('.').pop().toLowerCase()
  }

  function _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('File open timed out after ' + (ms / 1000) + 's')), ms)),
    ])
  }

  async function openFile(filePath, fileName) {
    // Save current file if dirty before switching
    if (activeFile.value && activeFile.value.dirty) {
      await saveFile()
    }
    fileLoading.value = true
    fileError.value = ''
    activeFile.value = null
    try {
      const ext = _getExt(fileName)
      if (BINARY_EXTS.has(ext)) {
        await _openBinary(filePath, fileName)
      } else {
        await _openText(filePath, fileName)
      }
    } catch (err) {
      console.error('Failed to open file:', err)
      fileError.value = err.message || 'Failed to open file'
      activeFile.value = null
    } finally {
      fileLoading.value = false
    }
  }

  async function _openText(filePath, fileName) {
    const result = await _withTimeout(window.electronAPI.obsidian.readFile(filePath), OPEN_TIMEOUT)
    if (result.error) throw new Error(result.error)
    activeFile.value = { path: filePath, name: fileName, content: result.content, dirty: false }
    window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: { path: filePath, name: fileName } })
  }

  async function _openBinary(filePath, fileName) {
    const result = await _withTimeout(window.electronAPI.obsidian.readFileBinary(filePath), OPEN_TIMEOUT)
    if (result.error) throw new Error(result.error)
    activeFile.value = { path: filePath, name: fileName, base64: result.base64, binary: true, dirty: false }
    window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: { path: filePath, name: fileName } })
  }

  async function openBinaryFile(filePath, fileName) {
    fileLoading.value = true
    fileError.value = ''
    activeFile.value = null
    try {
      await _openBinary(filePath, fileName)
    } catch (err) {
      console.error('Failed to open binary file:', err)
      fileError.value = err.message || 'Failed to open file'
      activeFile.value = null
    } finally {
      fileLoading.value = false
    }
  }

  async function saveFile() {
    if (!activeFile.value) return
    if (activeFile.value.binary) {
      return saveBinaryFile(activeFile.value.base64)
    }
    const result = await window.electronAPI.obsidian.writeFile(activeFile.value.path, activeFile.value.content)
    if (result.error) { console.error('Failed to save file:', result.error); return }
    activeFile.value.dirty = false
  }

  async function saveBinaryFile(base64) {
    if (!activeFile.value) return
    const result = await window.electronAPI.obsidian.writeFileBinary(activeFile.value.path, base64)
    if (result.error) { console.error('Failed to save binary file:', result.error); return }
    activeFile.value.base64 = base64
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

  async function createDrawio(dir, name) {
    const result = await window.electronAPI.obsidian.createDrawio(dir, name)
    if (result.error) { console.error('Failed to create drawio:', result.error); return result }
    await loadTree()
    return result
  }

  async function createDocx(dir, name) {
    const result = await window.electronAPI.obsidian.createDocx(dir, name)
    if (result.error) { console.error('Failed to create docx:', result.error); return result }
    await loadTree()
    return result
  }

  async function createXlsx(dir, name) {
    const result = await window.electronAPI.obsidian.createXlsx(dir, name)
    if (result.error) { console.error('Failed to create xlsx:', result.error); return result }
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
    vaultPath, fileTree, activeFile, expandedFolders, fileLoading, fileError, highlightNav,
    loadConfig, pickVault, setVaultManually, loadTree, openFile, openBinaryFile, saveFile, saveBinaryFile, updateContent,
    createFile, createDrawio, createDocx, createXlsx, createFolder, deleteItem, renameItem, toggleFolder
  }
})
