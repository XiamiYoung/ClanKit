/**
 * IPC handlers for Knowledge Base / Pinecone RAG.
 * Channels: knowledge:*
 * Also exports queryRAG() for use by ipc/agent.js.
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

// -- Pinecone index info resolver (cached) ------------------------------------
const indexInfoCache = new Map()

async function getPineconeIndexInfo(apiKey, indexName) {
  const cacheKey = `${apiKey.slice(0, 8)}:${indexName}`
  if (indexInfoCache.has(cacheKey)) return indexInfoCache.get(cacheKey)

  const https = require('https')
  const data = await new Promise((resolve, reject) => {
    const req = https.request(`https://api.pinecone.io/indexes/${indexName}`, {
      method: 'GET',
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 15000
    }, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone describe ${res.statusCode}: ${body.slice(0, 300)}`))
        else { try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON from Pinecone')) } }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone describe timed out')) })
    req.end()
  })

  const host = data.host
  if (!host) throw new Error('No host returned for Pinecone index')
  const info = { host, dimension: data.dimension || null }
  indexInfoCache.set(cacheKey, info)
  return info
}

// -- Pinecone upsert helper ---------------------------------------------------
async function pineconeUpsert(apiKey, indexHost, vectors) {
  const https = require('https')
  const body = JSON.stringify({ vectors })
  return new Promise((resolve, reject) => {
    const req = https.request(`https://${indexHost}/vectors/upsert`, {
      method: 'POST',
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 60000
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone upsert ${res.statusCode}: ${data.slice(0, 300)}`))
        else { try { resolve(JSON.parse(data)) } catch { resolve({ success: true }) } }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone upsert timed out')) })
    req.write(body)
    req.end()
  })
}

// -- Pinecone query helper ----------------------------------------------------
async function pineconeQuery(apiKey, indexHost, vector, topK = 5) {
  const https = require('https')
  const body = JSON.stringify({ vector, topK, includeMetadata: true })
  return new Promise((resolve, reject) => {
    const req = https.request(`https://${indexHost}/query`, {
      method: 'POST',
      headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 30000
    }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Pinecone query ${res.statusCode}: ${data.slice(0, 300)}`))
        else { try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON from Pinecone query')) } }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone query timed out')) })
    req.write(body)
    req.end()
  })
}

// -- Embedding generation helper ----------------------------------------------
async function generateEmbedding({ text, provider, model, apiKey, baseURL, dimensions }) {
  const https = require('https')
  const http = require('http')
  let url, headers, body

  if (provider === 'openrouter') {
    if (!baseURL) throw new Error('OpenRouter baseURL not configured')
    const base = baseURL.replace(/\/+$/, '')
    url = base + '/v1/embeddings'
    headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    const payload = { model, input: text }
    if (dimensions) payload.dimensions = dimensions
    body = JSON.stringify(payload)
  } else {
    const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
    const resolvedBase = baseURL || cfg.openai?.baseURL
    if (!resolvedBase) throw new Error('OpenAI baseURL not configured')
    const base = resolvedBase.replace(/\/+$/, '')
    const isStandardOpenAI = base.includes('api.openai.com')
    url = isStandardOpenAI ? base + '/v1/embeddings' : base + '/proxy/openai/v1/embeddings'
    const key = apiKey || cfg.openai?.apiKey || ''
    headers = { 'Content-Type': 'application/json' }
    if (isStandardOpenAI) headers['Authorization'] = `Bearer ${key}`
    else headers['x-api-key'] = key
    const payload = { model: model || 'text-embedding-3-small', input: text }
    if (dimensions) payload.dimensions = dimensions
    body = JSON.stringify(payload)
  }

  const { URL } = require('url')
  const parsed = new URL(url)
  const fetcher = parsed.protocol === 'https:' ? https : http

  const data = await new Promise((resolve, reject) => {
    const req = fetcher.request({
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers,
      timeout: 30000
    }, (res) => {
      let respBody = ''
      res.on('data', chunk => { respBody += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Embedding API ${res.statusCode}: ${respBody.slice(0, 300)}`))
        else { try { resolve(JSON.parse(respBody)) } catch (e) { reject(new Error('Invalid JSON from embedding API')) } }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Embedding request timed out')) })
    req.write(body)
    req.end()
  })

  const embedding = data?.data?.[0]?.embedding
  if (!embedding || !Array.isArray(embedding)) throw new Error('No embedding returned from API')
  return embedding
}

// -- RAG query logic (shared between IPC and agent:run) -----------------------
async function queryRAG({ query, pineconeApiKey, pineconeIndexName, topK, embeddingProvider, embeddingModel }) {
  if (!pineconeApiKey || !pineconeIndexName || !query) {
    return { success: false, error: 'Missing required parameters', matches: [] }
  }
  const cfg = ds.readJSON(ds.paths().CONFIG_FILE, {})
  const embeddingApiKey = embeddingProvider === 'openrouter' ? cfg.openrouter?.apiKey : cfg.openai?.apiKey
  const embeddingBaseURL = embeddingProvider === 'openrouter' ? cfg.openrouter?.baseURL : cfg.openai?.baseURL

  const { host: indexHost, dimension: indexDimension } = await getPineconeIndexInfo(pineconeApiKey, pineconeIndexName)
  const queryVector = await generateEmbedding({
    text: query, provider: embeddingProvider || 'openai', model: embeddingModel || 'text-embedding-3-small',
    apiKey: embeddingApiKey, baseURL: embeddingBaseURL, dimensions: indexDimension || undefined
  })

  const result = await pineconeQuery(pineconeApiKey, indexHost, queryVector, topK || 5)
  const matches = (result.matches || []).map(m => ({
    id: m.id, score: m.score, text: m.metadata?.text || '', documentName: m.metadata?.documentName || ''
  }))
  return { success: true, matches }
}

function register() {
  const p = () => ds.paths()

  ipcMain.handle('knowledge:get-config', async () => {
    const [cfg, saved] = await Promise.all([ds.readJSONAsync(p().CONFIG_FILE, {}), ds.readJSONAsync(p().KNOWLEDGE_FILE, {})])
    return {
      pineconeApiKey: cfg.pineconeApiKey || '', pineconeIndexName: saved.pineconeIndexName || '',
      ragEnabled: saved.ragEnabled !== undefined ? saved.ragEnabled : true, indexConfigs: saved.indexConfigs || {}
    }
  })

  ipcMain.handle('knowledge:save-config', async (_, config) => {
    try {
      if (config.pineconeApiKey !== undefined) {
        const cfg = ds.readJSON(p().CONFIG_FILE, {})
        cfg.pineconeApiKey = config.pineconeApiKey
        await ds.writeJSONAtomic(p().CONFIG_FILE, cfg)
      }
      const saved = ds.readJSON(p().KNOWLEDGE_FILE, {})
      if (config.pineconeIndexName !== undefined) saved.pineconeIndexName = config.pineconeIndexName
      if (config.ragEnabled !== undefined) saved.ragEnabled = config.ragEnabled
      if (config.indexConfigs !== undefined) saved.indexConfigs = config.indexConfigs
      ds.writeJSON(p().KNOWLEDGE_FILE, saved)
      return { success: true }
    } catch (err) {
      logger.error('knowledge:save-config error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:verify-connection', async (_, { apiKey }) => {
    if (!apiKey) return { success: false, error: 'API key is required' }
    try {
      const https = require('https')
      const data = await new Promise((resolve, reject) => {
        const req = https.request('https://api.pinecone.io/indexes', {
          method: 'GET', headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 15000
        }, (res) => {
          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => { if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`)); else { try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) } } })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
        req.end()
      })
      const count = (data.indexes || []).length
      logger.info('knowledge:verify-connection success', { indexCount: count })
      return { success: true, message: `Connected -- ${count} index${count !== 1 ? 'es' : ''} found` }
    } catch (err) {
      logger.error('knowledge:verify-connection error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:list-indexes', async (_, { apiKey }) => {
    if (!apiKey) return { success: false, error: 'API key is required', indexes: [] }
    try {
      const https = require('https')
      const data = await new Promise((resolve, reject) => {
        const req = https.request('https://api.pinecone.io/indexes', {
          method: 'GET', headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 15000
        }, (res) => {
          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => { if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`)); else { try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) } } })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
        req.end()
      })
      const indexes = (data.indexes || []).map(idx => ({
        name: idx.name, dimension: idx.dimension, metric: idx.metric, host: idx.host,
        status: idx.status?.ready ? 'ready' : (idx.status?.state || 'unknown'),
        vectorCount: idx.status?.ready ? (idx.total_vector_count || 0) : 0
      }))
      logger.info('knowledge:list-indexes', { count: indexes.length })
      return { success: true, indexes }
    } catch (err) {
      logger.error('knowledge:list-indexes error', err.message)
      return { success: false, error: err.message, indexes: [] }
    }
  })

  ipcMain.handle('knowledge:describe-index', async (_, { apiKey, indexName }) => {
    if (!apiKey || !indexName) return { success: false, error: 'API key and index name are required' }
    try {
      const https = require('https')
      const data = await new Promise((resolve, reject) => {
        const req = https.request(`https://api.pinecone.io/indexes/${indexName}`, {
          method: 'GET', headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' }, timeout: 15000
        }, (res) => {
          let body = ''
          res.on('data', chunk => { body += chunk })
          res.on('end', () => { if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`)); else { try { resolve(JSON.parse(body)) } catch (e) { reject(new Error('Invalid JSON response')) } } })
        })
        req.on('error', reject)
        req.on('timeout', () => { req.destroy(); reject(new Error('Pinecone describe timed out')) })
        req.end()
      })
      const spec = data.spec || {}
      const serverless = spec.serverless || {}
      return {
        success: true,
        stats: {
          name: data.name, dimension: data.dimension, metric: data.metric, host: data.host,
          vectorCount: data.status?.ready ? (data.total_vector_count || 0) : 0, ready: !!data.status?.ready,
          cloud: serverless.cloud || '', region: serverless.region || '',
          indexType: spec.serverless ? 'Serverless' : spec.pod ? 'Pod' : 'Unknown',
          vectorType: data.metric ? 'Dense' : 'Unknown'
        }
      }
    } catch (err) {
      logger.error('knowledge:describe-index error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:list-documents', async () => {
    try {
      const docsFile = path.join(p().DATA_DIR, 'knowledge-docs.json')
      const docs = ds.readJSON(docsFile, [])
      return { success: true, documents: docs }
    } catch (err) {
      logger.error('knowledge:list-documents error', err.message)
      return { success: false, error: err.message, documents: [] }
    }
  })

  ipcMain.handle('knowledge:list-sources', async (_, { apiKey, indexName }) => {
    if (!apiKey || !indexName) return { success: false, error: 'API key and index name are required', sources: [] }
    try {
      const info = await getPineconeIndexInfo(apiKey, indexName)
      const https = require('https')
      function httpsRequest(url, options, body) {
        return new Promise((resolve, reject) => {
          const req = https.request(url, { ...options, timeout: 15000 }, (res) => {
            let data = ''
            res.on('data', chunk => { data += chunk })
            res.on('end', () => { if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`)); else { try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON response')) } } })
          })
          req.on('error', reject)
          req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
          if (body) req.write(body)
          req.end()
        })
      }

      let metadataEntries = []
      try {
        const listData = await httpsRequest(`https://${info.host}/vectors/list?limit=100`, { method: 'GET', headers: { 'Api-Key': apiKey } })
        const vectorIds = (listData.vectors || []).map(v => v.id)
        if (vectorIds.length > 0) {
          const BATCH = 30
          for (let i = 0; i < Math.min(vectorIds.length, 90); i += BATCH) {
            const batch = vectorIds.slice(i, i + BATCH)
            const idsQuery = batch.map(id => `ids=${encodeURIComponent(id)}`).join('&')
            const fetchData = await httpsRequest(`https://${info.host}/vectors/fetch?${idsQuery}`, { method: 'GET', headers: { 'Api-Key': apiKey } })
            const vectors = fetchData.vectors || {}
            for (const [, vec] of Object.entries(vectors)) { if (vec.metadata) metadataEntries.push(vec.metadata) }
          }
        }
      } catch (listErr) {
        logger.warn('knowledge:list-sources list fallback, using query:', listErr.message)
        try {
          const dim = info.dimension || 512
          const zeroVec = new Array(dim).fill(0)
          const queryBody = JSON.stringify({ vector: zeroVec, topK: 100, includeMetadata: true })
          const queryData = await httpsRequest(`https://${info.host}/query`, {
            method: 'POST', headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(queryBody) }
          }, queryBody)
          for (const m of (queryData.matches || [])) { if (m.metadata) metadataEntries.push(m.metadata) }
        } catch (queryErr) { logger.error('knowledge:list-sources query fallback failed:', queryErr.message) }
      }

      const sourceMap = new Map()
      for (const meta of metadataEntries) {
        const fileName = meta.documentName || meta.file || meta.source || 'Unknown'
        if (!sourceMap.has(fileName)) sourceMap.set(fileName, { name: fileName, chunks: 0, documentId: meta.documentId || null })
        sourceMap.get(fileName).chunks++
      }
      const sources = Array.from(sourceMap.values())
      logger.info('knowledge:list-sources', { indexName, sources: sources.length })
      return { success: true, sources }
    } catch (err) {
      logger.error('knowledge:list-sources error', err.message)
      return { success: false, error: err.message, sources: [] }
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

  ipcMain.handle('knowledge:upload-files', async (_, { apiKey, indexName, filePaths }) => {
    try {
      const docsFile = path.join(p().DATA_DIR, 'knowledge-docs.json')
      const docs = ds.readJSON(docsFile, [])
      const knowledgeCfg = ds.readJSON(p().KNOWLEDGE_FILE, {})
      const cfg = ds.readJSON(p().CONFIG_FILE, {})
      const results = []

      const idxCfg = (knowledgeCfg.indexConfigs || {})[indexName] || {}
      const embProvider = idxCfg.embeddingProvider || knowledgeCfg.embeddingProvider || 'openai'
      const embModel = idxCfg.embeddingModel || knowledgeCfg.embeddingModel || 'text-embedding-3-small'
      const embApiKey = embProvider === 'openrouter' ? cfg.openrouter?.apiKey : cfg.openai?.apiKey
      const embBaseURL = embProvider === 'openrouter' ? cfg.openrouter?.baseURL : cfg.openai?.baseURL

      let indexHost = null, indexDimension = null
      try {
        const info = await getPineconeIndexInfo(apiKey, indexName)
        indexHost = info.host; indexDimension = info.dimension
      } catch (err) {
        logger.error('Failed to get Pinecone index info:', err.message)
        return { success: false, error: `Failed to get index info: ${err.message}` }
      }

      for (const filePath of filePaths) {
        const resolvedPath = filePath
        const name = path.basename(resolvedPath)
        const ext = path.extname(name).toLowerCase().replace('.', '')
        let content = '', size = 0

        try {
          const stat = fs.statSync(resolvedPath)
          size = stat.size
          if (size > 100 * 1024 * 1024) { results.push({ name, error: 'File too large (max 100MB)' }); continue }
          if (ext === 'pdf') { const buffer = fs.readFileSync(resolvedPath); const pdfData = await pdfParse(buffer); content = pdfData.text || '' }
          else if (ext === 'docx') { const buffer = fs.readFileSync(resolvedPath); const docResult = await mammoth.extractRawText({ buffer }); content = docResult.value || '' }
          else if (ext === 'doc') { results.push({ name, error: 'Legacy .doc format is not supported. Please save the file as .docx first.' }); continue }
          else { content = fs.readFileSync(resolvedPath, 'utf8') }
        } catch (err) { results.push({ name, error: err.message }); continue }

        if (!content.trim()) { results.push({ name, error: 'No text content could be extracted from this file' }); continue }

        const MAX_CHUNK = 1000, HARD_CHUNK_CAP = 3000
        const chunks = []
        const paragraphs = content.split(/\n\n+/)
        let currentChunk = ''
        for (const para of paragraphs) {
          const pieces = []
          for (let pi = 0; pi < para.length; pi += HARD_CHUNK_CAP) pieces.push(para.slice(pi, pi + HARD_CHUNK_CAP))
          for (const piece of pieces) {
            if ((currentChunk + piece).length > MAX_CHUNK) { if (currentChunk.trim()) chunks.push(currentChunk.trim()); currentChunk = piece }
            else currentChunk += (currentChunk ? '\n\n' : '') + piece
          }
        }
        if (currentChunk.trim()) chunks.push(currentChunk.trim())

        const docId = `doc_${Date.now()}_${name.replace(/[^a-z0-9]/gi, '_')}`
        let upsertedCount = 0
        try {
          const BATCH_SIZE = 10
          for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE)
            const vectors = []
            for (let j = 0; j < batch.length; j++) {
              const chunkIdx = i + j
              const embedding = await generateEmbedding({ text: batch[j], provider: embProvider, model: embModel, apiKey: embApiKey, baseURL: embBaseURL, dimensions: indexDimension || undefined })
              vectors.push({ id: `${docId}_chunk_${chunkIdx}`, values: embedding, metadata: { text: batch[j], documentId: docId, documentName: name, chunkIndex: chunkIdx } })
            }
            await pineconeUpsert(apiKey, indexHost, vectors)
            upsertedCount += vectors.length
            logger.info('knowledge:upload-files upserted batch', { name, batch: Math.floor(i / BATCH_SIZE) + 1, vectors: vectors.length })
          }
        } catch (err) { logger.error('knowledge:upload-files embedding/upsert error', { name, error: err.message }); results.push({ name, error: `Embedding/upsert failed: ${err.message}` }); continue }

        docs.push({ id: docId, name, type: ext.toUpperCase() || 'TXT', size, chunkCount: chunks.length, uploadedAt: Date.now(), filePath: resolvedPath })
        results.push({ name, success: true, chunkCount: chunks.length, upsertedCount })
        logger.info('knowledge:upload-files processed', { name, chunks: chunks.length, upserted: upsertedCount })
      }

      ds.writeJSON(docsFile, docs)
      return { success: true, results }
    } catch (err) {
      logger.error('knowledge:upload-files error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:delete-document', async (_, { documentId }) => {
    try {
      const docsFile = path.join(p().DATA_DIR, 'knowledge-docs.json')
      let docs = ds.readJSON(docsFile, [])
      docs = docs.filter(d => d.id !== documentId)
      ds.writeJSON(docsFile, docs)
      logger.info('knowledge:delete-document', { documentId })
      return { success: true }
    } catch (err) {
      logger.error('knowledge:delete-document error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:delete-source', async (_, { apiKey, indexName, sourceName }) => {
    if (!apiKey || !indexName || !sourceName) return { success: false, error: 'API key, index name, and source name are required' }
    try {
      const info = await getPineconeIndexInfo(apiKey, indexName)
      const https = require('https')
      function httpsReq(url, options, body) {
        return new Promise((resolve, reject) => {
          const req = https.request(url, { ...options, timeout: 30000 }, (res) => {
            let data = ''
            res.on('data', chunk => { data += chunk })
            res.on('end', () => { if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`)); else { try { resolve(JSON.parse(data)) } catch { resolve({}) } } })
          })
          req.on('error', reject)
          req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')) })
          if (body) req.write(body)
          req.end()
        })
      }
      const filterFields = ['documentName', 'file', 'source']
      let deleted = false
      for (const field of filterFields) {
        try {
          const delBody = JSON.stringify({ filter: { [field]: { '$eq': sourceName } } })
          await httpsReq(`https://${info.host}/vectors/delete`, {
            method: 'POST', headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(delBody) }
          }, delBody)
          deleted = true
          logger.info('knowledge:delete-source', { indexName, sourceName, field })
        } catch (err) { logger.warn(`knowledge:delete-source filter on ${field} failed:`, err.message) }
      }
      if (!deleted) return { success: false, error: 'Failed to delete vectors -- metadata filter not supported on this index type' }
      const docsFile = path.join(p().DATA_DIR, 'knowledge-docs.json')
      let docs = ds.readJSON(docsFile, [])
      docs = docs.filter(d => d.name !== sourceName)
      ds.writeJSON(docsFile, docs)
      return { success: true }
    } catch (err) {
      logger.error('knowledge:delete-source error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:get-document-summary', async (_, { documentId }) => {
    try {
      const docsFile = path.join(p().DATA_DIR, 'knowledge-docs.json')
      const docs = ds.readJSON(docsFile, [])
      const doc = docs.find(d => d.id === documentId)
      if (!doc) return { success: false, error: 'Document not found' }
      let summary = '', sampleChunks = []
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        const content = fs.readFileSync(doc.filePath, 'utf8')
        summary = content.substring(0, 500) + (content.length > 500 ? '...' : '')
        const paragraphs = content.split(/\n\n+/).filter(pp => pp.trim())
        sampleChunks = paragraphs.slice(0, 3).map(pp => pp.substring(0, 200) + (pp.length > 200 ? '...' : ''))
      } else { summary = 'Original file not accessible. Document metadata is stored locally.' }
      return { success: true, summary, sampleChunks }
    } catch (err) {
      logger.error('knowledge:get-document-summary error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:generate-embeddings', async (_, { text, provider, model, apiKey, baseURL }) => {
    try {
      const embedding = await generateEmbedding({ text, provider, model, apiKey, baseURL })
      return { success: true, embedding }
    } catch (err) {
      logger.error('knowledge:generate-embeddings error', err.message)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('knowledge:query', async (_, params) => {
    try { return await queryRAG(params) } catch (err) {
      logger.error('knowledge:query error', err.message)
      return { success: false, error: err.message, matches: [] }
    }
  })
}

module.exports = { register, queryRAG, generateEmbedding, getPineconeIndexInfo }
