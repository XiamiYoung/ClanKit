// electron/im-bridge/agent-model-flow.js
// Manages the multi-step inline keyboard flow for changing an agent's model/provider.
'use strict'
const fs   = require('fs')
const path = require('path')
const ds   = require('../lib/dataStore')

// In-memory flow state per session key (`${platform}:${channelId}`)
const pendingFlows = new Map()

const PROVIDERS = [
  { id: 'anthropic',  label: 'Anthropic'  },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai',     label: 'OpenAI'     },
  { id: 'deepseek',   label: 'DeepSeek'   },
]

const DEFAULT_MODELS = {
  anthropic:  ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openrouter: [
    'anthropic/claude-opus-4-6',
    'anthropic/claude-sonnet-4-6',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-001',
    'meta-llama/llama-3.3-70b-instruct',
  ],
  openai:   ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
}

const { normalizeAgents } = require('../agent/dataNormalizers')

function readAgents() {
  // Schema-agnostic flat list — for browse / find-by-id only.
  try {
    return normalizeAgents(JSON.parse(fs.readFileSync(ds.paths().AGENTS_FILE, 'utf8')))
  } catch { return [] }
}

function readAgentsRaw() {
  // Returns the full file structure so a subsequent write preserves the schema.
  try {
    return JSON.parse(fs.readFileSync(ds.paths().AGENTS_FILE, 'utf8'))
  } catch { return null }
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

function buildProviderRows() {
  const rows = []
  for (let i = 0; i < PROVIDERS.length; i += 2) {
    const row = [{ text: PROVIDERS[i].label, callback_data: `pm:p:${PROVIDERS[i].id}` }]
    if (PROVIDERS[i + 1]) row.push({ text: PROVIDERS[i + 1].label, callback_data: `pm:p:${PROVIDERS[i + 1].id}` })
    rows.push(row)
  }
  rows.push([{ text: '❌ Cancel', callback_data: 'pm:cancel' }])
  return rows
}

/**
 * Start a model-selection flow for an agent.
 * @param {string} key - `${platform}:${channelId}`
 * @param {object} agent
 * @param {(text: string, rows: Array|null) => void} sendButtons
 */
function start(key, agent, sendButtons) {
  pendingFlows.set(key, {
    agentId:          agent.id,
    agentName:        agent.name,
    step:             'provider',
    selectedProvider: null,
    modelList:        [],
  })

  const current = (agent.providerId || agent.modelId)
    ? ` (current: ${agent.modelId || 'default'} / ${agent.providerId || 'anthropic'})`
    : ''

  sendButtons(`🤖 *${agent.name}* — Select provider${current}:`, buildProviderRows())
}

/**
 * Handle a callback_query from the inline keyboard.
 * @param {string} key
 * @param {string} cbQueryId - must be answered within 10s
 * @param {string} data - callback_data value
 * @param {(text: string, rows: Array|null) => void} sendButtons
 * @param {(id: string) => void} answerCallback - acknowledges the tap (removes loading spinner)
 */
function handleCallback(key, cbQueryId, data, sendButtons, answerCallback) {
  answerCallback(cbQueryId)

  if (data === 'pm:cancel') {
    pendingFlows.delete(key)
    sendButtons('❌ Cancelled.', null)
    return
  }

  const flow = pendingFlows.get(key)
  if (!flow) {
    sendButtons('⚠️ No active selection. Use /agent model <name> to start.', null)
    return
  }

  // ── Provider selected ──────────────────────────────────────────────────────
  if (data.startsWith('pm:p:')) {
    const provider = data.slice(5)
    const providerLabel = PROVIDERS.find(p => p.id === provider)?.label || provider
    const modelList = DEFAULT_MODELS[provider] || []

    if (modelList.length === 0) {
      sendButtons(`⚠️ No models available for ${providerLabel}.`, null)
      pendingFlows.delete(key)
      return
    }

    flow.selectedProvider = provider
    flow.modelList        = modelList
    flow.step             = 'model'
    pendingFlows.set(key, flow)

    const rows = modelList.map((m, i) => [{ text: m, callback_data: `pm:m:${i}` }])
    rows.push([
      { text: '← Back',    callback_data: 'pm:back'   },
      { text: '❌ Cancel', callback_data: 'pm:cancel' },
    ])

    sendButtons(`🤖 *${flow.agentName}* — Select model (${providerLabel}):`, rows)
    return
  }

  // ── Back to provider step ──────────────────────────────────────────────────
  if (data === 'pm:back') {
    flow.step             = 'provider'
    flow.selectedProvider = null
    flow.modelList        = []
    pendingFlows.set(key, flow)
    sendButtons(`🤖 *${flow.agentName}* — Select provider:`, buildProviderRows())
    return
  }

  // ── Model selected ─────────────────────────────────────────────────────────
  if (data.startsWith('pm:m:')) {
    const idx   = parseInt(data.slice(5), 10)
    const model = flow.modelList[idx]
    if (!model) {
      sendButtons('⚠️ Invalid selection.', null)
      return
    }

    // Read the full file structure so the write preserves the on-disk schema
    // (legacy flat array, legacy {categories,agents}, or new {agents,personas}).
    // Mutating just the flat list returned by readAgents() and writing it back
    // would corrupt the new nested schema and wipe the personas section.
    const fullData = readAgentsRaw()
    const agent = fullData ? ds.findAgentInFile(fullData, flow.agentId) : null
    if (!agent) {
      sendButtons('⚠️ Agent not found — it may have been deleted.', null)
      pendingFlows.delete(key)
      return
    }

    agent.providerId = flow.selectedProvider
    agent.modelId    = model
    writeAtomic(ds.paths().AGENTS_FILE, fullData)
    pendingFlows.delete(key)

    sendButtons(
      `✅ *${flow.agentName}* updated\nModel: \`${model}\`\nProvider: ${flow.selectedProvider}`,
      null
    )
    return
  }
}

function hasPending(key) {
  return pendingFlows.has(key)
}

module.exports = { start, handleCallback, hasPending }
