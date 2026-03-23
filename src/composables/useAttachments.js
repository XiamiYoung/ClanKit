import { ref } from 'vue'

/**
 * Attachment state and drag-and-drop handling for the chat input area.
 *
 * @param {object} opts
 * @param {import('vue').Ref<string>} opts.inputText - chat input text ref
 * @param {import('vue').Ref<any>} opts.mentionInputRef - ChatMentionInput component ref
 * @param {Function} opts.dbg - debug logger
 */
export function useAttachments({ inputText, mentionInputRef, dbg }) {
  const attachments = ref([])
  const isDragOver = ref(false)

  function onDragEnter(e) {
    isDragOver.value = true
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    const dt = e.dataTransfer
    if (dt) {
      dbg(`DragEnter: types=[${Array.from(dt.types || []).join(', ')}] files=${dt.files?.length ?? 0}`, 'info')
    }
  }

  function onDragOver(e) {
    isDragOver.value = true
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
      isDragOver.value = false
    }
  }

  /**
   * Extract file paths from a drop event using multiple strategies.
   * WSLg doesn't reliably bridge Windows Explorer DnD, so we try:
   * 1. dataTransfer.files[].path (Electron native — works for Linux files)
   * 2. text/uri-list (may contain file:///C:/... URIs from Windows)
   * 3. text/plain (may contain raw Windows paths)
   */
  function extractDropPaths(e) {
    const paths = []
    const dt = e.dataTransfer

    if (dt?.files) {
      for (const file of dt.files) {
        if (file.path) paths.push(file.path)
      }
    }

    if (paths.length === 0) {
      try {
        const uriList = dt?.getData('text/uri-list') || ''
        for (const line of uriList.split(/[\r\n]+/)) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          if (trimmed.startsWith('file://')) {
            paths.push(trimmed)
          }
        }
      } catch {}
    }

    if (paths.length === 0) {
      try {
        const plain = dt?.getData('text/plain') || dt?.getData('text') || ''
        for (const line of plain.split(/[\r\n]+/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (/^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith('/')) {
            paths.push(trimmed)
          }
        }
      } catch {}
    }

    return paths
  }

  /**
   * Route resolved attachment results: images get chips + path in textarea;
   * all other types get only path text in textarea.
   */
  function handleAttachResults(results) {
    const imageAtts = []
    const pathTexts = []
    for (const att of results) {
      if (att.type === 'image') {
        const placeholder = att.path || att.name
        imageAtts.push({ ...att, placeholderText: placeholder })
        pathTexts.push(placeholder)
      } else {
        if (att.path) pathTexts.push(att.path)
      }
    }
    if (imageAtts.length > 0) attachments.value.push(...imageAtts)
    if (pathTexts.length > 0) {
      const pathStr = pathTexts.join('\n')
      if (mentionInputRef.value?.insertTextAtCursor) {
        mentionInputRef.value.insertTextAtCursor(pathStr)
      } else {
        const prefix = inputText.value.trimEnd()
        inputText.value = prefix ? `${prefix}\n${pathStr}` : pathStr
      }
    }
  }

  async function onDrop(e) {
    isDragOver.value = false
    if (!window.electronAPI?.resolveDropPaths) return

    const dt = e.dataTransfer
    const types = dt ? Array.from(dt.types || []) : []
    const fileCount = dt?.files?.length ?? 0
    const filePaths = dt?.files ? Array.from(dt.files).map(f => f.path || '(empty)') : []
    dbg(`Drop event: types=[${types.join(', ')}] files=${fileCount} paths=[${filePaths.join(', ')}]`)
    for (const t of types) {
      try {
        const val = dt.getData(t)
        if (val) dbg(`  dataTransfer["${t}"] = ${val.slice(0, 120)}`, 'chunk')
      } catch {}
    }

    const rawPaths = extractDropPaths(e)
    dbg(`Drop: ${rawPaths.length} path(s) extracted: ${rawPaths.map(p => p.slice(0, 60)).join(', ')}`)

    if (rawPaths.length === 0) {
      dbg('Drop: no file paths found in dataTransfer. On WSL2, drag-and-drop from Windows Explorer is not supported by WSLg. Use the attach button (paperclip) or paste file paths instead.', 'warn')
      return
    }

    try {
      const results = await window.electronAPI.resolveDropPaths(rawPaths)
      if (results && results.length > 0) handleAttachResults(results)
    } catch (err) {
      dbg(`Drop resolve error: ${err.message}`, 'error')
    }
  }

  async function pickFiles() {
    if (!window.electronAPI?.pickFiles) return
    try {
      const results = await window.electronAPI.pickFiles()
      if (results && results.length > 0) handleAttachResults(results)
    } catch (err) {
      dbg(`pickFiles error: ${err.message}`, 'error')
    }
  }

  function removeAttachment(id) {
    const att = attachments.value.find(a => a.id === id)
    if (att?.placeholderText) {
      const placeholder = att.placeholderText
      inputText.value = inputText.value
        .split('\n')
        .filter(line => line !== placeholder)
        .join('\n')
    }
    attachments.value = attachments.value.filter(a => a.id !== id)
  }

  return {
    attachments,
    isDragOver,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    pickFiles,
    removeAttachment,
    handleAttachResults,
  }
}
