const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { normalizeAgents } = require('../agent/dataNormalizers')

function detectModelProviderType(modelId) {
  if (!modelId) return null
  const model = String(modelId).toLowerCase()
  if (model.includes('deepseek')) return 'deepseek'
  if (model.includes('claude') || model.startsWith('anthropic/')) return 'anthropic'
  if (model.includes('gemini') || model.startsWith('google/')) return 'google'
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4') || model.startsWith('openai/')) return 'openai'
  return null
}

function resolveProviderCreds(cfg, providerType) {
  if (cfg.providers && Array.isArray(cfg.providers)) {
    const provider = cfg.providers.find(item => item.type === providerType || item.id === providerType)
    if (provider) return { apiKey: provider.apiKey || '', baseURL: provider.baseURL || '', model: provider.model || '', type: provider.type || providerType, maxOutputTokens: provider.settings?.maxOutputTokens || null }
  }
  const legacy = cfg[providerType]
  if (legacy) return { apiKey: legacy.apiKey || '', baseURL: legacy.baseURL || '', model: legacy.model || '', type: providerType }
  return { apiKey: '', baseURL: '', model: '', type: providerType }
}

function isProviderActive(cfg, providerType) {
  if (cfg.providers && Array.isArray(cfg.providers)) {
    return cfg.providers.some(item => (item.type === providerType || item.id === providerType) && item.isActive)
  }
  return !!(cfg[providerType]?.isActive)
}

function applyProviderCredsToConfig(cfg, providerType) {
  const { apiKey, baseURL, type: resolvedType, maxOutputTokens: providerMaxTokens } = resolveProviderCreds(cfg, providerType)
  providerType = resolvedType || providerType

  // Always set cfg.provider so AgentLoop constructor can detect provider type
  cfg.provider = { type: providerType, apiKey, baseURL, model: cfg.customModel }

  // Propagate per-provider maxOutputTokens as a hard ceiling
  if (providerMaxTokens && providerMaxTokens > 0) cfg.providerMaxOutputTokens = providerMaxTokens

  if (providerType === 'anthropic') {
    cfg.apiKey = apiKey
    cfg.baseURL = baseURL
    delete cfg._directAuth
    delete cfg.openaiApiKey
    delete cfg.openaiBaseURL
    cfg._resolvedProvider = undefined
    cfg.defaultProvider = undefined
  } else if (providerType === 'openrouter') {
    cfg.openaiApiKey = apiKey
    cfg.openaiBaseURL = baseURL
    cfg._resolvedProvider = 'openai'
    cfg._directAuth = true
    cfg.defaultProvider = 'openai'
    delete cfg.apiKey
    delete cfg.baseURL
  } else if (providerType === 'openai') {
    cfg.openaiApiKey = apiKey
    cfg.openaiBaseURL = baseURL
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider = 'openai'
    delete cfg._directAuth
    delete cfg.apiKey
    delete cfg.baseURL
  } else if (providerType === 'openai_official') {
    cfg.openaiApiKey = apiKey
    cfg.openaiBaseURL = baseURL.replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth = true
    cfg.defaultProvider = 'openai'
    delete cfg.apiKey
    delete cfg.baseURL
  } else if (providerType === 'deepseek') {
    cfg.openaiApiKey = apiKey
    cfg.openaiBaseURL = baseURL.replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth = true
    cfg.defaultProvider = 'openai'
    delete cfg.apiKey
    delete cfg.baseURL
  } else if (providerType === 'google') {
    cfg.apiKey = apiKey
    cfg.baseURL = baseURL
    delete cfg._directAuth
    delete cfg.openaiApiKey
    delete cfg.openaiBaseURL
    cfg._resolvedProvider = undefined
    cfg.defaultProvider = undefined
  } else {
    cfg.openaiApiKey = apiKey
    cfg.openaiBaseURL = baseURL
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider = 'openai'
    delete cfg._directAuth
    delete cfg.apiKey
    delete cfg.baseURL
  }
}

function normalizeLoopConfig(cfg, systemAgentId = null) {
  const normalized = { ...(cfg || {}) }
  let resolvedProvider = normalized.provider?.id || normalized.provider?.type || null
  let resolvedModel = normalized.customModel || normalized.provider?.model || null

  if (systemAgentId) {
    try {
      const agentRecords = normalizeAgents(ds.readJSON(ds.paths().AGENTS_FILE, []))
      const agent = agentRecords.find(item => item.id === systemAgentId)
      if (agent?.providerId) resolvedProvider = agent.providerId
      if (agent?.modelId) resolvedModel = agent.modelId
    } catch (err) {
      logger.warn('normalizeLoopConfig: failed to load agent metadata', err.message)
    }
  }

  if (!resolvedProvider && resolvedModel) {
    resolvedProvider = detectModelProviderType(resolvedModel)
  }

  if (resolvedProvider) {
    applyProviderCredsToConfig(normalized, resolvedProvider)
  }
  if (resolvedModel) {
    normalized.customModel = resolvedModel
  }

  return normalized
}

function validateLoopConfig(cfg) {
  const providerType = cfg.provider?.type
    || (cfg._directAuth && cfg.defaultProvider === 'openai' ? 'deepseek' : null)
    || cfg._resolvedProvider
    || cfg.defaultProvider
    || detectModelProviderType(cfg.customModel)
    || 'anthropic'

  if (providerType === 'google') return null

  const isOpenAICompat = providerType === 'openai' || providerType === 'openai_official' || providerType === 'deepseek' || providerType === 'minimax' || providerType === 'openrouter'
  if (isOpenAICompat) {
    const baseURL = cfg.openaiBaseURL || cfg.openai?.baseURL || cfg.baseURL || ''
    const apiKey = cfg.openaiApiKey || cfg.openai?.apiKey || cfg.apiKey || ''
    if (!baseURL) return `Provider "${providerType}" is missing baseURL`
    if (!apiKey) return `Provider "${providerType}" is missing apiKey`
    return null
  }

  const apiKey = cfg.apiKey || ''
  const baseURL = cfg.baseURL || ''
  if (!baseURL) return `Provider "${providerType}" is missing baseURL`
  if (!apiKey) return `Provider "${providerType}" is missing apiKey`
  return null
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractNamedParticipantsInOrder(message, agents) {
  const text = String(message || '')
  return agents
    .map(agent => {
      const escapedName = escapeRegExp(agent.name)
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapedName})(?=[^\\p{L}\\p{N}_]|$)`, 'iu')
      const match = regex.exec(text)
      if (!match) return null
      return { ...agent, index: match.index + (match[1]?.length || 0) }
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
}

function hasSequentialOrderingLanguage(message) {
  const text = String(message || '')
  return [
    /先[\s\S]{0,80}(再|然后|之后|接着|补充)/u,
    /等[\s\S]{0,80}(说完|回答完|讲完|完成|结束)[\s\S]{0,40}(再|然后|补充|继续)/u,
    /(回答|说)[\s\S]{0,40}(完|后)[\s\S]{0,40}(补充|继续|再说)/u,
    /\bfirst\b[\s\S]{0,80}\bthen\b/i,
    /\b(after|once)\b[\s\S]{0,80}\b(finish|finishes|finished|answer|answers|answered|respond|responds|responded)\b[\s\S]{0,40}\b(reply|respond|supplement|follow up|review|add)\b/i,
    /\b(reply|respond|supplement|follow up) after\b/i,
  ].some(pattern => pattern.test(text))
}

function buildHeuristicSequentialDispatch(message, agents) {
  const orderedParticipants = extractNamedParticipantsInOrder(message, agents)
  if (orderedParticipants.length < 2) return null
  if (!hasSequentialOrderingLanguage(message)) return null

  return {
    executionMode: 'sequential',
    dispatched: orderedParticipants.map((agent, index) => {
      const previous = orderedParticipants[index - 1]
      const next = orderedParticipants[index + 1]
      let assignedTask

      if (index === 0) {
        assignedTask = next
          ? `Answer the user's request first. After finishing your own reply, hand off directly to @${next.name} only if they still need to add their assigned follow-up.`
          : 'Answer the user\'s request directly.'
      } else if (next) {
        assignedTask = `Wait for ${previous.name} to finish, then provide your own follow-up based on what they said. After your addition, hand off directly to @${next.name} only if their follow-up is still needed.`
      } else {
        assignedTask = `Wait for ${previous.name} to finish, then provide your own follow-up or supplement based on what they said. End without any @mention unless another participant is still explicitly needed.`
      }

      return {
        agentId: agent.id,
        agentName: agent.name,
        assignedTask,
        dependsOn: previous ? [previous.id] : [],
      }
    }),
  }
}

module.exports = {
  detectModelProviderType,
  resolveProviderCreds,
  isProviderActive,
  applyProviderCredsToConfig,
  normalizeLoopConfig,
  validateLoopConfig,
  escapeRegExp,
  extractNamedParticipantsInOrder,
  hasSequentialOrderingLanguage,
  buildHeuristicSequentialDispatch,
}