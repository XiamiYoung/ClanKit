/**
 * KnowledgeTool — agent tool for managing local knowledge bases (RAG).
 *
 * Operations: list_knowledge_bases, list_documents, create_knowledge_base,
 * upload_file, add_text, delete_document, query, check_model.
 *
 * Embedding-dependent operations check localEmbedding.isModelReady() first
 * and return a guidance message if the model is not downloaded.
 */
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')

// Lazy-loaded — these live in the main process and are always available
let _knowledge = null
let _localEmbedding = null
let _localVectorStore = null
let _ds = null

function _load() {
  if (!_knowledge) {
    _knowledge = require('../../ipc/knowledge')
    _localEmbedding = require('../../lib/localEmbedding')
    _localVectorStore = require('../../lib/localVectorStore')
    _ds = require('../../lib/dataStore')
  }
}

const MODEL_NOT_READY_MSG =
  'The local embedding model is not downloaded yet. ' +
  'Please guide the user to go to Settings > Knowledge to download the embedding model before using knowledge base features. ' +
  'The model (~449MB) runs entirely on the user\'s machine and supports 50+ languages.'

class KnowledgeTool extends BaseTool {
  constructor() {
    super(
      'knowledge_manage',
      'Manage local knowledge bases for RAG (Retrieval-Augmented Generation). ' +
      'Create knowledge bases, upload files or text for embedding, query knowledge, and list contents. ' +
      'All embeddings and vector storage run locally on the user\'s machine.',
      'knowledge_manage'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'check_model',
            'list_knowledge_bases',
            'list_documents',
            'create_knowledge_base',
            'upload_file',
            'add_text',
            'delete_document',
            'query',
          ],
          description:
            'Operation to perform. ' +
            'check_model: check if the local embedding model is downloaded. ' +
            'list_knowledge_bases: list all knowledge bases. ' +
            'list_documents: list documents in a knowledge base (requires kb_id). ' +
            'create_knowledge_base: create a new knowledge base (requires name). ' +
            'upload_file: upload and embed a file (requires kb_id, file_path). ' +
            'add_text: embed raw text content (requires kb_id, text). ' +
            'delete_document: remove a document from a knowledge base (requires kb_id, document_id). ' +
            'query: search a knowledge base (requires kb_id, query).',
        },
        kb_id: {
          type: 'string',
          description: 'Knowledge base ID (required for list_documents, upload_file, add_text, delete_document, query)',
        },
        name: {
          type: 'string',
          description: 'Name for the new knowledge base (required for create_knowledge_base)',
        },
        description: {
          type: 'string',
          description: 'Description for the new knowledge base (optional, for create_knowledge_base)',
        },
        file_path: {
          type: 'string',
          description: 'Absolute path to the file to upload (required for upload_file). Supports: txt, md, pdf, docx, json, csv, html, xml, yaml',
        },
        text: {
          type: 'string',
          description: 'Raw text content to embed (required for add_text)',
        },
        title: {
          type: 'string',
          description: 'Title for the text document (optional, for add_text)',
        },
        document_id: {
          type: 'string',
          description: 'Document ID to delete (required for delete_document)',
        },
        query: {
          type: 'string',
          description: 'Search query text (required for query operation)',
        },
        top_k: {
          type: 'number',
          description: 'Number of results to return (optional, default 5, for query)',
        },
      },
      required: ['operation'],
    }
  }

  async execute(toolCallId, params) {
    _load()
    const { operation } = params

    try {
      switch (operation) {
        case 'check_model':
          return this._checkModel()

        case 'list_knowledge_bases':
          return this._listKnowledgeBases()

        case 'list_documents':
          return this._listDocuments(params.kb_id)

        case 'create_knowledge_base':
          return await this._createKnowledgeBase(params.name, params.description)

        case 'upload_file':
          return await this._uploadFile(params.kb_id, params.file_path)

        case 'add_text':
          return await this._addText(params.kb_id, params.text, params.title)

        case 'delete_document':
          return await this._deleteDocument(params.kb_id, params.document_id)

        case 'query':
          return await this._query(params.kb_id, params.query, params.top_k)

        default:
          return this._err(`Unknown operation: ${operation}`)
      }
    } catch (err) {
      logger.error('KnowledgeTool error', { operation, error: err.message })
      return this._err(err.message)
    }
  }

  // ── Operations ──────────────────────────────────────────────────────────────

  _checkModel() {
    const info = _localEmbedding.isModelReady()
    if (info.ready) {
      return this._ok(JSON.stringify({ ready: true, message: 'Embedding model is ready.' }))
    }
    return this._ok(JSON.stringify({ ready: false, message: MODEL_NOT_READY_MSG, reason: info.reason }))
  }

  _listKnowledgeBases() {
    const kbs = _localVectorStore.listKnowledgeBases()
    if (!kbs.length) {
      return this._ok(JSON.stringify({ knowledgeBases: [], message: 'No knowledge bases found.' }))
    }
    return this._ok(JSON.stringify({ knowledgeBases: kbs }))
  }

  _listDocuments(kbId) {
    if (!kbId) return this._err('kb_id is required for list_documents')
    const docs = _localVectorStore.listDocuments(kbId)
    return this._ok(JSON.stringify({ documents: docs }))
  }

  async _createKnowledgeBase(name, description) {
    if (!name || !name.trim()) return this._err('name is required for create_knowledge_base')

    const modelCheck = _localEmbedding.isModelReady()
    if (!modelCheck.ready) return this._ok(JSON.stringify({ success: false, message: MODEL_NOT_READY_MSG }))

    const { v4: uuidv4 } = require('uuid')
    const id = uuidv4()
    const kb = await _localVectorStore.createKnowledgeBase({ id, name: name.trim(), description: description || '' })

    // Register in knowledge.json
    const p = _ds.paths()
    const saved = _ds.readJSON(p.KNOWLEDGE_FILE, {})
    if (!saved.knowledgeBases) saved.knowledgeBases = {}
    saved.knowledgeBases[id] = { enabled: true }
    _ds.writeJSON(p.KNOWLEDGE_FILE, saved)

    return this._ok(JSON.stringify({
      success: true,
      message: `Knowledge base "${name.trim()}" created.`,
      knowledgeBase: kb,
    }))
  }

  async _uploadFile(kbId, filePath) {
    if (!kbId) return this._err('kb_id is required for upload_file')
    if (!filePath) return this._err('file_path is required for upload_file')

    const modelCheck = _localEmbedding.isModelReady()
    if (!modelCheck.ready) return this._ok(JSON.stringify({ success: false, message: MODEL_NOT_READY_MSG }))

    const fs = require('fs')
    if (!fs.existsSync(filePath)) return this._err(`File not found: ${filePath}`)

    const result = await _knowledge.uploadFileToKB(kbId, filePath)
    if (!result.success) return this._err(result.error || 'Upload failed')

    return this._ok(JSON.stringify({
      success: true,
      message: `File "${result.name}" uploaded and embedded. ${result.chunkCount} chunks created.`,
      name: result.name,
      chunkCount: result.chunkCount,
    }))
  }

  async _addText(kbId, text, title) {
    if (!kbId) return this._err('kb_id is required for add_text')
    if (!text) return this._err('text is required for add_text')

    const modelCheck = _localEmbedding.isModelReady()
    if (!modelCheck.ready) return this._ok(JSON.stringify({ success: false, message: MODEL_NOT_READY_MSG }))

    const result = await _knowledge.addTextToKB(kbId, text, title)
    if (!result.success) return this._err(result.error || 'Add text failed')

    return this._ok(JSON.stringify({
      success: true,
      message: `Text "${result.name}" embedded. ${result.chunkCount} chunks created.`,
      name: result.name,
      chunkCount: result.chunkCount,
    }))
  }

  async _deleteDocument(kbId, documentId) {
    if (!kbId) return this._err('kb_id is required for delete_document')
    if (!documentId) return this._err('document_id is required for delete_document')

    await _localVectorStore.deleteVectorsByDocumentId(kbId, documentId)

    const hybridSearch = require('../../lib/hybridSearch')
    const path = require('path')
    const kbDir = path.join(_ds.paths().KNOWLEDGE_DIR, kbId)
    const ftIndex = hybridSearch.loadIndexFromDisk(kbDir)
    hybridSearch.removeFromIndex(ftIndex, documentId)
    hybridSearch.saveIndexToDisk(kbDir, ftIndex)

    _localVectorStore.removeDocument(kbId, documentId)

    return this._ok(JSON.stringify({
      success: true,
      message: `Document ${documentId} deleted from knowledge base.`,
    }))
  }

  async _query(kbId, query, topK) {
    if (!kbId) return this._err('kb_id is required for query')
    if (!query) return this._err('query is required for query operation')

    const modelCheck = _localEmbedding.isModelReady()
    if (!modelCheck.ready) return this._ok(JSON.stringify({ success: false, message: MODEL_NOT_READY_MSG }))

    const result = await _knowledge.queryRAG({
      query,
      knowledgeBaseId: kbId,
      topK: topK || 5,
    })

    if (!result.success) return this._err(result.error || 'Query failed')

    return this._ok(JSON.stringify({
      success: true,
      matchCount: result.matches.length,
      matches: result.matches.map(m => ({
        score: Math.round((m.score || 0) * 1000) / 1000,
        text: m.text,
        documentName: m.documentName,
      })),
    }))
  }
}

module.exports = { KnowledgeTool }
