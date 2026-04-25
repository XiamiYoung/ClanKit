import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'

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

  // Session-only caches. Not persisted — every app start gets a clean slate
  // so a transient IO problem doesn't become sticky across sessions.
  //
  //   probeCache: path → true (openable) | false (not openable, reason in probeReasons)
  //   failedPaths: path → true. Populated when an actual open attempt fails.
  //                Entries in here are refused immediately without IPC until
  //                the user hits the tree refresh (resetFailureCache).
  //
  // Both are `reactive` maps so Vue templates / computed in MessageRenderer
  // re-render when probe results come in.
  const probeCache = reactive({})
  const probeReasons = reactive({})
  const failedPaths = reactive({})
  const _inflightProbes = new Map() // path → Promise, de-dup concurrent probes

  async function loadConfig() {
    const config = await window.electronAPI.obsidian.getConfig()
    if (config.vaultPath) {
      vaultPath.value = normalizePath(config.vaultPath)
      // Sync DoCPath to configStore so MessageRenderer can detect aidoc files
      const { useConfigStore } = await import('./config')
      const configStore = useConfigStore()
      configStore.config.DoCPath = vaultPath.value
      await loadTree()
      // NOTE: We intentionally do NOT auto-openFile the last opened doc here.
      // Auto-reading on app launch is how a single broken/huge file could
      // freeze the app on every start. DocsView.onMounted handles restoration
      // after the user enters the AI Doc page.
    }
  }

  // Called by DocsView on view enter to optionally restore the last opened doc.
  // Only restores if the file probes as openable — a silently-broken file
  // should NOT be auto-opened again.
  async function restoreLastOpenedDoc() {
    const config = await window.electronAPI.obsidian.getConfig()
    if (!config.lastOpenedDoc) return
    const { path: filePath, name: fileName } = config.lastOpenedDoc
    const ok = await probeFile(filePath)
    if (!ok) {
      // Stale / corrupt / too large — forget it so next launch doesn't retry.
      window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: null })
      return
    }
    _expandParentsOf(filePath)
    await openFile(filePath, fileName)
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
    resetFailureCache()
    await loadTree()
  }

  async function loadTree() {
    if (!vaultPath.value) { fileTree.value = []; return }
    const tree = await window.electronAPI.obsidian.readTree(vaultPath.value)
    fileTree.value = tree
    // Kick off a background batch probe so the tree can filter itself as
    // results come in. We don't await — the UI shows all files initially and
    // the filter tightens as the probe completes.
    _batchProbeTree(tree)
  }

  // Walk the tree collecting file paths, then fire one batch probe IPC.
  async function _batchProbeTree(tree) {
    const paths = []
    function collect(nodes) {
      for (const n of nodes) {
        if (n.type === 'dir') { if (n.children) collect(n.children) }
        else if (!(n.path in probeCache)) { paths.push(n.path) }
      }
    }
    collect(tree || [])
    if (paths.length === 0) return
    try {
      const result = await window.electronAPI.obsidian.probeFiles(paths)
      for (const p of paths) {
        const r = result[p]
        if (!r) continue
        probeCache[p] = !!r.openable
        if (!r.openable && r.reason) probeReasons[p] = r.reason
      }
    } catch (err) {
      console.error('batch probe failed:', err)
    }
  }

  // Probe a single file. Uses cache; de-dupes concurrent probes on the same
  // path. Returns boolean.
  async function probeFile(filePath) {
    if (!filePath) return false
    if (filePath in probeCache) return probeCache[filePath]
    if (_inflightProbes.has(filePath)) return _inflightProbes.get(filePath)
    const p = (async () => {
      try {
        const r = await window.electronAPI.obsidian.probeFile(filePath)
        const openable = !!r?.openable
        const reason = r?.reason
        // Transient failures — file may appear later in the same session
        // (e.g. a later tool call writes it). Don't cache, let next render re-probe.
        if (!openable && (reason === 'stat_error' || reason === 'probe_timeout_or_io')) {
          probeReasons[filePath] = reason
          return false
        }
        probeCache[filePath] = openable
        if (!openable && reason) probeReasons[filePath] = reason
        return probeCache[filePath]
      } catch {
        probeReasons[filePath] = 'probe_exception'
        return false
      } finally {
        _inflightProbes.delete(filePath)
      }
    })()
    _inflightProbes.set(filePath, p)
    return p
  }

  // Clears both the probe cache AND the failure-open set. Hooked up to the
  // top-right refresh button in DocsView — that's the sole user-visible
  // "reset" action. A fresh load is then triggered by the caller.
  function resetFailureCache() {
    for (const k of Object.keys(probeCache)) delete probeCache[k]
    for (const k of Object.keys(probeReasons)) delete probeReasons[k]
    for (const k of Object.keys(failedPaths)) delete failedPaths[k]
    _inflightProbes.clear()
  }

  // 5s timeout. This is the renderer-side cap; the main process has its own
  // 20MB stat precheck + async reads so a main-process freeze can't bypass it.
  const OPEN_TIMEOUT = 5000

  const BINARY_EXTS = new Set(['pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'svg'])

  function _getExt(name) {
    return (name || '').split('.').pop().toLowerCase()
  }

  function _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('File open timed out after ' + (ms / 1000) + 's')), ms)),
    ])
  }

  function _humanSize(bytes) {
    if (!bytes && bytes !== 0) return ''
    const mb = bytes / (1024 * 1024)
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
  }

  function _formatOpenError(code, res) {
    if (code === 'too_large') return `File exceeds 20 MB limit (${_humanSize(res?.size)}) and was not opened.`
    if (code === 'probe_timeout_or_io') return 'File did not respond within the timeout and was marked unopenable.'
    if (code === 'binary_content') return 'File contains binary data and cannot be opened as text.'
    return res?.error || 'Failed to open file'
  }

  async function openFile(filePath, fileName) {
    // Refuse immediately if this file has already failed this session. Prevents
    // the "retry until kill app" loop users hit with broken cloud-stub files.
    if (failedPaths[filePath]) {
      fileError.value = 'This file failed to open earlier in this session. Use the refresh button to retry.'
      activeFile.value = null
      return
    }
    // Refuse if a prior probe says this file is not openable.
    if (probeCache[filePath] === false) {
      fileError.value = _formatOpenError(probeReasons[filePath])
      failedPaths[filePath] = true
      activeFile.value = null
      return
    }

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
      // Quarantine: don't retry this path in this session. Also forget it as
      // lastOpenedDoc so the next launch starts clean.
      failedPaths[filePath] = true
      probeCache[filePath] = false
      window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: null })
      activeFile.value = null
    } finally {
      fileLoading.value = false
    }
  }

  async function _openText(filePath, fileName) {
    const result = await _withTimeout(window.electronAPI.obsidian.readFile(filePath), OPEN_TIMEOUT)
    if (result.error) throw new Error(_formatOpenError(result.code, result))
    activeFile.value = { path: filePath, name: fileName, content: result.content, dirty: false }
    window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: { path: filePath, name: fileName } })
  }

  async function _openBinary(filePath, fileName) {
    const result = await _withTimeout(window.electronAPI.obsidian.readFileBinary(filePath), OPEN_TIMEOUT)
    if (result.error) throw new Error(_formatOpenError(result.code, result))
    activeFile.value = { path: filePath, name: fileName, base64: result.base64, binary: true, dirty: false }
    window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: { path: filePath, name: fileName } })
  }

  async function openBinaryFile(filePath, fileName) {
    if (failedPaths[filePath]) {
      fileError.value = 'This file failed to open earlier in this session. Use the refresh button to retry.'
      activeFile.value = null
      return
    }
    fileLoading.value = true
    fileError.value = ''
    activeFile.value = null
    try {
      await _openBinary(filePath, fileName)
    } catch (err) {
      console.error('Failed to open binary file:', err)
      fileError.value = err.message || 'Failed to open file'
      failedPaths[filePath] = true
      probeCache[filePath] = false
      window.electronAPI.obsidian.saveConfig({ lastOpenedDoc: null })
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
    // Drop stale probe/failure entries for the deleted path
    delete probeCache[targetPath]
    delete probeReasons[targetPath]
    delete failedPaths[targetPath]
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
    delete probeCache[oldPath]
    delete probeReasons[oldPath]
    delete failedPaths[oldPath]
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
    probeCache, probeReasons, failedPaths,
    loadConfig, restoreLastOpenedDoc, pickVault, setVaultManually, loadTree, openFile, openBinaryFile,
    probeFile, resetFailureCache,
    saveFile, saveBinaryFile, updateContent,
    createFile, createDrawio, createDocx, createXlsx, createFolder, deleteItem, renameItem, toggleFolder
  }
})
