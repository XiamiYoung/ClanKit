/**
 * Completion notifier — emits Windows native notifications when chat rounds
 * and scheduled task runs finish, suppressed when the user is actively
 * looking at the relevant chat.
 *
 * Pure helpers (shouldNotify, hardTruncate, buildSummary) are exported for
 * unit testing. Electron-dependent pieces lazy-require 'electron' so the
 * module stays test-friendly under vitest/happy-dom.
 */
const path = require('path')
const { logger } = require('../logger')

// ── Minimal i18n for notifier copy ──────────────────────────────────────
// The notifier runs in the Electron main process (Node) and cannot reach the
// renderer's useI18n. Translations are intentionally kept here, co-located
// with the strings that use them, rather than cross-imported from src/i18n.
const I18N = {
  en: {
    agentFinished:     '{name} finished',
    agentFallback:     'Agent',
    scheduledTask:     'Scheduled task: {name}',
    taskFallback:      'task',
    permissionTitle:   'Permission needed',
    permissionBody:    '{agent} is waiting for your approval to run {tool}.',
    summaryFallback:   'New reply · tap to view',
  },
  zh: {
    agentFinished:     '{name} 已完成',
    agentFallback:     '智能体',
    scheduledTask:     '计划任务：{name}',
    taskFallback:      '任务',
    permissionTitle:   '需要授权',
    permissionBody:    '{agent} 正在等待你批准执行 {tool}。',
    summaryFallback:   '有新回复 · 点击查看',
  },
}

const DEFAULT_SUMMARY_TIMEOUT_MS = 30000

function _resolveSummaryTimeout(config) {
  const v = Number(config?.notifications?.summaryTimeoutMs)
  if (Number.isFinite(v) && v >= 5000 && v <= 120000) return v
  return DEFAULT_SUMMARY_TIMEOUT_MS
}

function _t(lang, key, vars = {}) {
  const dict = I18N[lang] || I18N.en
  const template = dict[key] || I18N.en[key] || key
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

// ── State ────────────────────────────────────────────────────────────────
const _state = {
  isFocused: true,
  currentRoute: '/',
  activeChatId: null,
}

function setFocus(v)        { _state.isFocused    = !!v }
function setRoute(v)        { _state.currentRoute = typeof v === 'string' ? v : '/' }
function setActiveChat(v)   { _state.activeChatId = v || null }
function getState()         { return { ..._state } }

/**
 * Pure decision function. Notify when:
 *   - enabled flag is true AND
 *   - (window blurred) OR (route is not /chats) OR (different chat) OR (no chat context)
 */
function shouldNotify(state, { chatId = null, enabled = true } = {}) {
  if (!enabled) return false
  if (!state.isFocused) return true
  if (state.currentRoute !== '/chats') return true
  if (chatId == null) return true
  if (state.activeChatId !== chatId) return true
  return false
}

/** Collapse whitespace, hard-truncate to maxChars with ellipsis. */
function hardTruncate(text, maxChars = 50) {
  if (text == null) return ''
  const t = String(text).replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  if (maxChars <= 1) return t.slice(0, maxChars)
  return t.slice(0, maxChars - 1) + '…'
}

/**
 * Call the utility model to summarize. Returns null on any failure / missing config.
 * Never throws.
 */
async function aiSummarize(text, config, { timeoutMs = 10000, maxChars = 50 } = {}) {
  try {
    const um = config?.utilityModel
    if (!um?.provider || !um?.model) return null
    const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
    if (!providerCfg?.apiKey || !providerCfg?.baseURL) return null

    const input = String(text).slice(0, 1500)
    const systemPrompt = `You write ultra-short notification summaries.
Rules:
- Output ONLY the summary text. No quotes, no prefix, no explanation.
- Maximum ${maxChars} characters (count every character including spaces).
- Write in the SAME language as the input.
- Prefer a concrete completed statement over fragments.`

    const callPromise = (async () => {
      const isOpenAIStyle = um.provider !== 'anthropic' && um.provider !== 'openrouter' && um.provider !== 'google'
      if (isOpenAIStyle) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = {
          openaiApiKey:      providerCfg.apiKey,
          openaiBaseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
          customModel:       um.model,
          _resolvedProvider: 'openai',
          defaultProvider:   'openai',
          _scenario:         'notification-summary',
          ...(um.provider !== 'openai' ? { _directAuth: true } : {}),
          provider: { type: um.provider },
        }
        const client = new OpenAIClient(cfg).getClient()
        const resp = await client.chat.completions.create({
          model: um.model,
          max_tokens: 80,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: `Summarize: ${input}` },
          ],
        })
        return resp.choices?.[0]?.message?.content || ''
      }
      const { AnthropicClient } = require('../agent/core/AnthropicClient')
      const cfg = {
        apiKey:      providerCfg.apiKey,
        baseURL:     providerCfg.baseURL.replace(/\/+$/, ''),
        customModel: um.model,
        _scenario:   'notification-summary',
      }
      const resp = await new AnthropicClient(cfg).getClient().messages.create({
        model: um.model,
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Summarize: ${input}` }],
      })
      return resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
    })()

    let timeoutHandle
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('summary timeout')), timeoutMs)
    })
    try {
      const raw = await Promise.race([callPromise, timeoutPromise])
      clearTimeout(timeoutHandle)
      if (!raw) return null
      return String(raw).trim()
    } catch (err) {
      clearTimeout(timeoutHandle)
      logger.warn('[notifier] AI summary failed:', err.message)
      return null
    }
  } catch (err) {
    logger.warn('[notifier] AI summary error:', err.message)
    return null
  }
}

/**
 * Produce a notification body <= maxChars. Uses AI when text is over limit;
 * falls back to hard-truncation if AI is unavailable / fails / returns garbage.
 * options._aiSummarize lets tests inject a stub.
 */
async function buildSummary(text, config, options = {}) {
  const maxChars  = options.maxChars  ?? 50
  const timeoutMs = options.timeoutMs ?? 10000
  if (text == null) return ''
  const cleaned = String(text).replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  if (cleaned.length <= maxChars) return cleaned
  const impl = options._aiSummarize || aiSummarize
  let ai = null
  try {
    ai = await impl(cleaned, config, { maxChars, timeoutMs })
  } catch (err) {
    logger.warn('[notifier] buildSummary AI impl threw:', err.message)
  }
  if (ai && String(ai).trim()) return hardTruncate(ai, maxChars)
  return hardTruncate(cleaned, maxChars)
}

function _getIconPath() {
  try {
    const { app } = require('electron')
    return app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, '..', '..', 'public', 'icon.png')
  } catch {
    return null
  }
}

function sendNotification({ title, body, chatId, silent }) {
  try {
    const { Notification } = require('electron')
    if (!Notification) {
      logger.warn('[notifier] Notification API unavailable')
      return
    }
    if (!Notification.isSupported()) {
      logger.warn('[notifier] Notification.isSupported() = false — OS rejected notifications')
      return
    }
    const opts = {
      title:  String(title || '').slice(0, 120),
      body:   String(body  || ''),
      silent: !!silent,
    }
    const icon = _getIconPath()
    if (icon) opts.icon = icon
    const n = new Notification(opts)
    n.on('failed', (_e, err) => logger.warn('[notifier] OS failed to deliver:', err))
    n.on('click', () => {
      logger.info(`[notifier] click chatId=${chatId || '-'}`)
      try {
        const winRef = require('./windowRef')
        const win = winRef.get()
        if (!win || win.isDestroyed()) {
          logger.warn('[notifier] click: window unavailable')
          return
        }
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        if (chatId) win.webContents.send('notifier:open-chat', { chatId })
      } catch (err) {
        logger.warn('[notifier] click handler error:', err.message)
      }
    })
    n.show()
  } catch (err) {
    logger.warn('[notifier] show error:', err.message)
  }
}

async function notifyChatComplete({ chatId, agentName, finalText, config }) {
  try {
    const enabled = config?.notifications?.enabled !== false
    const decision = shouldNotify(_state, { chatId, enabled })
    logger.info(`[notifier] chat complete: chatId=${chatId} agent=${agentName || '-'} enabled=${enabled} state=${JSON.stringify(_state)} decision=${decision}`)
    if (!decision) return
    const lang      = config?.language || 'en'
    const timeoutMs = _resolveSummaryTimeout(config)
    const aiSummary = await aiSummarize(finalText || '', config, { timeoutMs, maxChars: 50 })
    const name      = (agentName || '').trim() || _t(lang, 'agentFallback')
    const title     = _t(lang, 'agentFinished', { name })
    let body
    if (aiSummary && String(aiSummary).trim()) {
      body = hardTruncate(aiSummary, 50)
    } else {
      body = _t(lang, 'summaryFallback')
      logger.info(`[notifier] using fallback body (AI summary unavailable, timeoutMs=${timeoutMs}): chatId=${chatId}`)
    }
    sendNotification({
      title,
      body,
      chatId,
      silent: !!config?.notifications?.silent,
    })
  } catch (err) {
    logger.warn('[notifier] notifyChatComplete error:', err.message)
  }
}

function notifyPermissionRequest({ chatId, agentName, toolName, config }) {
  try {
    const enabled = config?.notifications?.enabled !== false
    const decision = shouldNotify(_state, { chatId, enabled })
    logger.info(`[notifier] permission request: chatId=${chatId} agent=${agentName || '-'} tool=${toolName || '-'} enabled=${enabled} decision=${decision}`)
    if (!decision) return
    const lang  = config?.language || 'en'
    const agent = (agentName || '').trim() || _t(lang, 'agentFallback')
    const tool  = toolName || '-'
    sendNotification({
      title:  _t(lang, 'permissionTitle'),
      body:   hardTruncate(_t(lang, 'permissionBody', { agent, tool }), 80),
      chatId,
      silent: !!config?.notifications?.silent,
    })
  } catch (err) {
    logger.warn('[notifier] notifyPermissionRequest error:', err.message)
  }
}

async function notifyTaskComplete({ planName, status, durationMs, config }) {
  try {
    const enabled = config?.notifications?.enabled !== false
    const decision = shouldNotify(_state, { chatId: null, enabled })
    logger.info(`[notifier] task complete: plan=${planName || '-'} status=${status} enabled=${enabled} decision=${decision}`)
    // Task engine has no chat context — shouldNotify returns true when enabled.
    if (!decision) return
    const lang      = config?.language || 'en'
    const timeoutMs = _resolveSummaryTimeout(config)
    const seconds   = Math.max(0, Math.round((durationMs || 0) / 1000))
    const rawBody   = `${planName || _t(lang, 'taskFallback')} · ${status || 'done'} · ${seconds}s`
    const summary   = await buildSummary(rawBody, config, { maxChars: 50, timeoutMs })
    const name      = planName || _t(lang, 'taskFallback')
    const title     = _t(lang, 'scheduledTask', { name })
    sendNotification({
      title,
      body: summary || hardTruncate(rawBody, 50),
      silent: !!config?.notifications?.silent,
    })
  } catch (err) {
    logger.warn('[notifier] notifyTaskComplete error:', err.message)
  }
}

module.exports = {
  // Pure helpers (tested)
  shouldNotify,
  hardTruncate,
  buildSummary,
  _t,
  // AI call (covered indirectly)
  aiSummarize,
  // Side-effectful
  sendNotification,
  notifyChatComplete,
  notifyTaskComplete,
  notifyPermissionRequest,
  // State
  setFocus,
  setRoute,
  setActiveChat,
  getState,
}
