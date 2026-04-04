/**
 * IPC handlers for local Knowledge Base / RAG.
 * Channels: knowledge:*
 * Exports queryRAG() for use by ipc/agent.js.
 *
 * Replaces the former Pinecone-based implementation with fully local
 * vector storage (vectra), local embeddings (transformers.js), and
 * hybrid search (vector + BM25 via minisearch with CJK bigram tokenizer).
 */
const path = require('path')
const fs = require('fs')
const { ipcMain, dialog } = require('electron')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const winRef = require('../lib/windowRef')
const fh = require('../lib/fileHelpers')
const localEmbedding = require('../lib/localEmbedding')
const localVectorStore = require('../lib/localVectorStore')
const hybridSearch = require('../lib/hybridSearch')

// Cache of MiniSearch fulltext indexes keyed by kbId
const _fulltextCache = new Map()

/**
 * Get or load the fulltext index for a knowledge base.
 */
function _getFulltextIndex(kbId) {
  if (_fulltextCache.has(kbId)) return _fulltextCache.get(kbId)
  const kbDir = path.join(ds.paths().KNOWLEDGE_DIR, kbId)
  const index = hybridSearch.loadIndexFromDisk(kbDir)
  _fulltextCache.set(kbId, index)
  return index
}

/**
 * Save fulltext index to disk and update cache.
 */
function _saveFulltextIndex(kbId, index) {
  _fulltextCache.set(kbId, index)
  const kbDir = path.join(ds.paths().KNOWLEDGE_DIR, kbId)
  hybridSearch.saveIndexToDisk(kbDir, index)
}

// ── RAG query (exported for agent.js) ────────────────────────────────────────

/**
 * Query a local knowledge base with hybrid search.
 * @param {{ query: string, knowledgeBaseId: string, topK?: number }} params
 * @returns {{ success: boolean, matches: Array<{ id, score, text, documentName }>, error?: string }}
 */
async function queryRAG({ query, knowledgeBaseId, topK = 5 }) {
  if (!query || !knowledgeBaseId) {
    return { success: false, error: 'Missing required parameters', matches: [] }
  }

  const modelCheck = localEmbedding.isModelReady()
  if (!modelCheck.ready) {
    return { success: false, error: 'Embedding model not downloaded', matches: [] }
  }

  try {
    const queryVector = await localEmbedding.embed(query)
    const vecResults = await localVectorStore.queryVectors(knowledgeBaseId, queryVector, topK * 2)
    const ftIndex = _getFulltextIndex(knowledgeBaseId)
    const txtResults = hybridSearch.searchIndex(ftIndex, query, topK * 2)
    const merged = hybridSearch.hybridRank(vecResults, txtResults)
    return { success: true, matches: merged.slice(0, topK) }
  } catch (err) {
    logger.error(`queryRAG error for kb=${knowledgeBaseId}:`, err.message)
    return { success: false, error: err.message, matches: [] }
  }
}

// ── Document parsing & chunking (preserved from original) ────────────────────

function _parseFileContent(filePath) {
  const name = path.basename(filePath)
  const ext = path.extname(name).toLowerCase().replace('.', '')
  const stat = fs.statSync(filePath)
  if (stat.size > 100 * 1024 * 1024) throw new Error('File too large (max 100MB)')

  let content = ''
  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath)
    // pdf-parse returns a promise but we call this in an async context
    return { name, ext, size: stat.size, contentPromise: pdfParse(buffer).then(d => d.text || '') }
  } else if (ext === 'docx') {
    const buffer = fs.readFileSync(filePath)
    return { name, ext, size: stat.size, contentPromise: mammoth.extractRawText({ buffer }).then(d => d.value || '') }
  } else if (ext === 'doc') {
    throw new Error('Legacy .doc format is not supported. Please save the file as .docx first.')
  } else {
    content = fs.readFileSync(filePath, 'utf8')
    return { name, ext, size: stat.size, contentPromise: Promise.resolve(content) }
  }
}

function _chunkText(content) {
  const MAX_CHUNK = 1000
  const HARD_CHUNK_CAP = 3000
  const OVERLAP = 100
  const chunks = []
  const paragraphs = content.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    const pieces = []
    for (let pi = 0; pi < para.length; pi += HARD_CHUNK_CAP) {
      pieces.push(para.slice(pi, pi + HARD_CHUNK_CAP))
    }
    for (const piece of pieces) {
      if ((currentChunk + piece).length > MAX_CHUNK) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim())
        // Overlap: carry last N chars into next chunk
        const overlap = currentChunk.length > OVERLAP ? currentChunk.slice(-OVERLAP) : ''
        currentChunk = overlap + piece
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + piece
      }
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim())
  return chunks
}

// ── IPC Handler Registration ─────────────────────────────────────────────────

function register() {
  const p = () => ds.paths()

  // -- Config ------------------------------------------------------------------

  ipcMain.handle('knowledge:get-config', async () => {
    const saved = ds.readJSON(p().KNOWLEDGE_FILE, {})
    return {
      ragEnabled: saved.ragEnabled !== undefined ? saved.ragEnabled : true,
      knowledgeBases: saved.knowledgeBases || {},
    }
  })

  ipcMain.handle('knowledge:save-config', async (_, config) => {
    try {
      const saved = ds.readJSON(p().KNOWLEDGE_FILE, {})
      if (config.ragEnabled !== undefined) saved.ragEnabled = config.ragEnabled
      if (config.knowledgeBases !== undefined) saved.knowledgeBases = config.knowledgeBases
      ds.writeJSON(p().KNOWLEDGE_FILE, saved)
      return { success: true }
    } catch (err) {
      logger.error('knowledge:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })

  // -- Knowledge Base CRUD -----------------------------------------------------

  ipcMain.handle('knowledge:list-knowledge-bases', async () => {
    try {
      const kbs = localVectorStore.listKnowledgeBases()
      return { success: true, knowledgeBases: kbs }
    } catch (err) {
      logger.error('knowledge:list-knowledge-bases error', err.message)
      return { success: false, error: err.message, knowledgeBases: [] }
    }
  })

  ipcMain.handle('knowledge:get-knowledge-base', async (_, { kbId }) => {
    try {
      const kb = localVectorStore.getKnowledgeBase(kbId)
      if (!kb) return { success: false, error: 'Knowledge base not found' }
      return { success: true, knowledgeBase: kb }
    } catch (err) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:create-knowledge-base', async (_, { name, description }) => {
    try {
      if (!name || !name.trim()) return { success: false, error: 'Name is required' }
      const { v4: uuidv4 } = require('uuid')
      const id = uuidv4()
      const kb = await localVectorStore.createKnowledgeBase({ id, name: name.trim(), description: description || '' })

      // Register in knowledge.json config
      const saved = ds.readJSON(p().KNOWLEDGE_FILE, {})
      if (!saved.knowledgeBases) saved.knowledgeBases = {}
      saved.knowledgeBases[id] = { enabled: true }
      ds.writeJSON(p().KNOWLEDGE_FILE, saved)

      return { success: true, knowledgeBase: kb }
    } catch (err) {
      logger.error('knowledge:create-knowledge-base error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:delete-knowledge-base', async (_, { kbId }) => {
    try {
      await localVectorStore.deleteKnowledgeBase(kbId)
      _fulltextCache.delete(kbId)

      // Remove from knowledge.json config
      const saved = ds.readJSON(p().KNOWLEDGE_FILE, {})
      if (saved.knowledgeBases) {
        delete saved.knowledgeBases[kbId]
        ds.writeJSON(p().KNOWLEDGE_FILE, saved)
      }

      return { success: true }
    } catch (err) {
      logger.error('knowledge:delete-knowledge-base error', err.message)
      return { success: false, error: err.message }
    }
  })

  // -- Documents ---------------------------------------------------------------

  ipcMain.handle('knowledge:list-documents', async (_, { kbId }) => {
    try {
      const docs = localVectorStore.listDocuments(kbId)
      return { success: true, documents: docs }
    } catch (err) {
      logger.error('knowledge:list-documents error', err.message)
      return { success: false, error: err.message, documents: [] }
    }
  })

  ipcMain.handle('knowledge:pick-files', async () => {
    if (fh.isFilePickerOpen()) return []
    fh.setFilePickerOpen(true)
    try {
      const result = await dialog.showOpenDialog(winRef.get(), {
        properties: ['openFile', 'multiSelections'],
        title: 'Select files to upload to Knowledge Base',
        filters: [
          { name: 'Documents', extensions: ['txt', 'md', 'pdf', 'docx', 'json', 'csv', 'html', 'xml', 'yaml', 'yml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths
    } finally { fh.setFilePickerOpen(false) }
  })

  ipcMain.handle('knowledge:upload-files', async (event, { kbId, filePaths }) => {
    if (!kbId || !filePaths?.length) return { success: false, error: 'Knowledge base ID and file paths required' }

    const modelCheck = localEmbedding.isModelReady()
    if (!modelCheck.ready) return { success: false, error: 'Embedding model not downloaded' }

    const results = []

    const sendProgress = (data) => {
      try { event.sender.send('knowledge:upload-progress', data) } catch {}
    }

    for (const filePath of filePaths) {
      const name = path.basename(filePath)
      try {
        // Parse file
        sendProgress({ stage: 'parsing', current: 0, total: 0, documentName: name })
        const parsed = _parseFileContent(filePath)
        const content = await parsed.contentPromise

        if (!content.trim()) {
          results.push({ name, error: 'No text content could be extracted from this file' })
          continue
        }

        // Chunk text
        const chunks = _chunkText(content)
        const docId = `doc_${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_')}`

        // Embed all chunks locally
        const vectors = []
        const ftChunks = []
        for (let i = 0; i < chunks.length; i++) {
          sendProgress({ stage: 'embedding', current: i + 1, total: chunks.length, documentName: name })
          const vector = await localEmbedding.embed(chunks[i])
          const chunkId = `${docId}_chunk_${i}`
          vectors.push({
            id: chunkId,
            vector,
            metadata: { text: chunks[i], documentId: docId, documentName: name, chunkIndex: i },
          })
          ftChunks.push({
            id: chunkId,
            text: chunks[i],
            documentName: name,
            documentId: docId,
            chunkIndex: i,
          })
        }

        // Store vectors
        sendProgress({ stage: 'indexing', current: chunks.length, total: chunks.length, documentName: name })
        await localVectorStore.addVectors(kbId, vectors)

        // Update fulltext index
        const ftIndex = _getFulltextIndex(kbId)
        hybridSearch.addToIndex(ftIndex, ftChunks)
        _saveFulltextIndex(kbId, ftIndex)

        // Save document metadata
        localVectorStore.addDocument(kbId, {
          id: docId,
          name,
          type: (parsed.ext || 'txt').toUpperCase(),
          size: parsed.size,
          chunkCount: chunks.length,
          uploadedAt: Date.now(),
          filePath,
        })

        results.push({ name, success: true, chunkCount: chunks.length })
        logger.info('knowledge:upload-files processed', { name, chunks: chunks.length })
      } catch (err) {
        logger.error('knowledge:upload-files error for file', { name, error: err.message })
        results.push({ name, error: err.message })
      }
    }

    sendProgress({ stage: 'done', current: 0, total: 0, documentName: '' })
    return { success: true, results }
  })

  ipcMain.handle('knowledge:delete-document', async (_, { kbId, documentId }) => {
    try {
      // Delete vectors
      await localVectorStore.deleteVectorsByDocumentId(kbId, documentId)

      // Rebuild fulltext index (remove document chunks)
      const ftIndex = _getFulltextIndex(kbId)
      hybridSearch.removeFromIndex(ftIndex, documentId)
      _saveFulltextIndex(kbId, ftIndex)

      // Remove document metadata
      localVectorStore.removeDocument(kbId, documentId)

      logger.info('knowledge:delete-document', { kbId, documentId })
      return { success: true }
    } catch (err) {
      logger.error('knowledge:delete-document error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:get-document-summary', async (_, { kbId, documentId }) => {
    try {
      const docs = localVectorStore.listDocuments(kbId)
      const doc = docs.find(d => d.id === documentId)
      if (!doc) return { success: false, error: 'Document not found' }

      let summary = '', sampleChunks = []
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        const ext = path.extname(doc.filePath).toLowerCase().replace('.', '')
        let content = ''
        if (ext === 'pdf') {
          const buffer = fs.readFileSync(doc.filePath)
          const pdfData = await pdfParse(buffer)
          content = pdfData.text || ''
        } else if (ext === 'docx') {
          const buffer = fs.readFileSync(doc.filePath)
          const docResult = await mammoth.extractRawText({ buffer })
          content = docResult.value || ''
        } else {
          content = fs.readFileSync(doc.filePath, 'utf8')
        }
        summary = content.substring(0, 500) + (content.length > 500 ? '...' : '')
        const paragraphs = content.split(/\n\n+/).filter(pp => pp.trim())
        sampleChunks = paragraphs.slice(0, 3).map(pp => pp.substring(0, 200) + (pp.length > 200 ? '...' : ''))
      } else {
        summary = 'Original file not accessible. Document metadata is stored locally.'
      }
      return { success: true, summary, sampleChunks }
    } catch (err) {
      logger.error('knowledge:get-document-summary error', err.message)
      return { success: false, error: err.message }
    }
  })

  // -- Query -------------------------------------------------------------------

  ipcMain.handle('knowledge:query', async (_, params) => {
    try {
      return await queryRAG(params)
    } catch (err) {
      logger.error('knowledge:query error', err.message)
      return { success: false, error: err.message, matches: [] }
    }
  })

  // -- Embedding Model Management (mirrors voice:local-* pattern) ─────────────

  ipcMain.handle('knowledge:check-model', async () => {
    try {
      return localEmbedding.getModelInfo()
    } catch (err) {
      return { ready: false, status: 'error', reason: err.message }
    }
  })

  ipcMain.handle('knowledge:setup-model', async (event, { source } = {}) => {
    const sendProgress = (data) => {
      try { event.sender.send('knowledge:setup-progress', data) } catch {}
    }
    try {
      const result = await localEmbedding.downloadModel(sendProgress, source || 'huggingface')
      return result
    } catch (err) {
      sendProgress({ step: 'error', progress: -1, message: err.message })
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:remove-model', async () => {
    try {
      return localEmbedding.removeModel()
    } catch (err) {
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register, queryRAG }
