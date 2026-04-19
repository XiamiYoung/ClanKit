/**
 * AnalyzeAgentTool — dedicated deep-analysis tool for analysis chats.
 *
 * Only registered when a chat has type='analysis' and an analysisTargetAgentId.
 * Provides three actions:
 *   - 'stats': returns aggregate statistics + monthly heat map for the whole dataset
 *   - 'messages': returns paginated messages (150/page, chronological) for reading all history
 *   - 'analyze_all': performs full parallel chunked analysis and returns partial analyses
 *
 * This bypasses the topK/group-cap limits in the regular search tool, allowing the
 * LLM to read the entire imported chat history to produce comprehensive analysis.
 *
 * Typical LLM workflow:
 *   1. Call analyze_agent_history(action="stats") → understand scope + heat map
 *   2. Call analyze_agent_history(action="analyze_all") → get parallel chunked analysis
 *   3. Call render_persona_report tool to generate the HTML report
 */
const path = require('path')
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')

class AnalyzeAgentTool extends BaseTool {
  /**
   * @param {string} memoryDir          Root memory directory (DATA_DIR/memory)
   * @param {string} targetAgentId      Agent being analyzed
   * @param {string} targetAgentName    Display name
   * @param {string} targetAgentPrompt  Agent's system prompt (persona definition)
   * @param {string} dataPath           DATA_DIR for building output file paths
   * @param {string} [docPath]          DoCPath override (user-configured aidoc folder)
   * @param {string} [targetAgentType]  'user' or 'system'
   */
  constructor(memoryDir, targetAgentId, targetAgentName, targetAgentPrompt, dataPath, docPath, targetAgentType) {
    const isSelf = targetAgentType === 'user'
    super(
      'analyze_agent_history',
      isSelf
        ? `Load the complete imported chat history to perform deep self-analysis of "Me" (the user). ` +
          'Step 1: call with action="stats" to get total message count, date range, monthly activity heat map, and sender breakdown. ' +
          'Step 2 (optional): call with action="read_import_artifacts" to load pre-computed Speech DNA, Nuwa persona sections, evidence index, and Reply Bank stats from the import pipeline. ' +
          'Step 3: call with action="analyze_all" to run parallel chunked analysis of all messages. ' +
          'Step 4: call with action="extract_sections" to produce structured JSON for the report. ' +
          'Step 5: call render_persona_report tool passing sections and stats objects — the tool auto-generates all D scalars and HTML fragments. Do NOT use file_operation to write HTML — always use render_persona_report.'
        : `Load the complete imported chat history for "${targetAgentName}" to perform deep analysis. ` +
          'Step 1: call with action="stats" to get total message count, date range, monthly activity heat map, and sender breakdown. ' +
          'Step 2 (optional): call with action="read_import_artifacts" to load pre-computed Speech DNA, Nuwa persona sections, evidence index, and Reply Bank stats from the import pipeline. ' +
          'Step 3: call with action="analyze_all" to run parallel chunked analysis of all messages. ' +
          'Step 4: call with action="extract_sections" to produce structured JSON for the report. ' +
          'Step 5: call render_persona_report tool passing sections and stats objects — the tool auto-generates all D scalars and HTML fragments. Do NOT use file_operation to write HTML — always use render_persona_report.',
      'analyze_agent_history'
    )
    this.memoryDir = memoryDir
    this.targetAgentId = targetAgentId
    this.targetAgentName = targetAgentName
    this.targetAgentPrompt = targetAgentPrompt
    this.targetAgentType = targetAgentType || 'system'
    this.dataPath = dataPath
    // Resolve aidoc dir: user-configured DoCPath takes priority over default
    this.aidocPath = docPath || path.join(dataPath || '', 'clank_aidoc')
    this.llmConfig = null
    // Populated by agentLoop after skill manifests are loaded.
    // Shape: { [action]: { strategy: 'chat'|'reasoner'|{provider,model}, ... } }
    this.modelHints = {}
    // Used to log fallback warnings at most once per action per session.
    this._loggedHintFallbacks = new Set()
  }

  /**
   * Inject LLM config for parallel analysis. Called by ToolRegistry.setAnalysisConfig().
   */
  setLLMConfig(config) {
    this.llmConfig = config
  }

  /**
   * Inject per-action model preferences collected from loaded skill manifests.
   * Each hint describes which model is best for a given internal sub-task
   * (e.g. extract_sections is schema transformation, best done by a chat model,
   * not a reasoner). If a hint cannot be resolved at runtime (utilityModel not
   * configured, provider missing, etc.) we log once and fall back to llmConfig.
   */
  setModelHints(hints) {
    if (hints && typeof hints === 'object') this.modelHints = hints
  }

  /**
   * Resolve the actual LLM config to use for a given sub-action. Returns the
   * main llmConfig unchanged when there is no hint or when the hint cannot be
   * satisfied — the tool always works, it just runs at the caller's main model.
   */
  _resolveLlmConfigForAction(action) {
    if (!this.llmConfig) return null
    const hint = this.modelHints?.[action]
    if (!hint) return this.llmConfig

    // Explicit {provider, model} wins — user or skill author has decided.
    if (hint.provider && hint.model) {
      const built = this._buildLlmConfigFromProviderModel(hint.provider, hint.model)
      if (built) return built
      this._warnOnce(`${action}:explicit`, `skill hint {${hint.provider}/${hint.model}} for ${action} cannot be resolved (provider missing or no API key) — using main model`)
      return this.llmConfig
    }

    const strategy = hint.strategy
    if (strategy === 'reasoner') return this.llmConfig

    if (strategy === 'chat') {
      // The agent's OWN model is already injected into utilityModel by agentLoop
      // for analyze_all; we want the ORIGINAL config.utilityModel here.
      const um = this.llmConfig._configUtilityModel
      if (!um?.provider || !um?.model) {
        this._warnOnce(`${action}:no-utility`, `skill hint "chat" for ${action} but config.utilityModel is not configured — using main model. Tip: set utilityModel in Settings to enable the fast path.`)
        return this.llmConfig
      }
      if (this._sameModel(this.llmConfig.utilityModel, um)) {
        // Main model happens to equal the utility model — nothing to swap.
        return this.llmConfig
      }
      const built = this._buildLlmConfigFromProviderModel(um.provider, um.model)
      if (!built) {
        this._warnOnce(`${action}:unresolvable-utility`, `config.utilityModel ${um.provider}/${um.model} cannot be resolved (provider not found or no API key) — using main model`)
        return this.llmConfig
      }
      return built
    }

    return this.llmConfig
  }

  /**
   * Build a fresh llmConfig cloned from the base, with utilityModel overridden
   * to the given (provider, model). Returns null if the provider is missing or
   * has no API key. Preserves providers[] array so _callLLM can find credentials.
   */
  _buildLlmConfigFromProviderModel(providerType, model) {
    if (!this.llmConfig) return null
    const providers = this.llmConfig.providers || []
    const provider = providers.find(p => p.type === providerType && p.isActive)
    if (!provider || !provider.apiKey) return null
    return {
      ...this.llmConfig,
      utilityModel: { provider: providerType, model },
    }
  }

  _sameModel(a, b) {
    return !!(a && b && a.provider === b.provider && a.model === b.model)
  }

  _warnOnce(key, message) {
    if (this._loggedHintFallbacks.has(key)) return
    this._loggedHintFallbacks.add(key)
    logger.warn(`[AnalyzeAgentTool] ${message}`)
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['stats', 'messages', 'analyze_all', 'extract_sections', 'read_import_artifacts'],
          description: '"stats": get dataset overview (count, date range, monthly heat map, senders). ' +
            '"messages": load messages by page (150 per page, chronological). ' +
            '"analyze_all": perform full parallel chunked analysis of all messages (recommended for comprehensive analysis). Cached automatically — if the same agent was analyzed before and no new messages have been added since, returns the cached result instantly. Use force_refresh=true to invalidate cache. ' +
            '"extract_sections": REQUIRED STEP after analyze_all before generating the HTML report. Takes the cached narrative analysis + message samples and produces structured JSON with 19 sections of data (intimacy score, constellation, dialogue theatre, subtext decoder, interaction tips, signals, compatibility, etc). Fast (~1-2 min). Re-runnable without re-analyzing. Pass the returned sections + stats objects directly to render_persona_report — the tool auto-generates all D scalars and 27 HTML fragments internally. ' +
            '"read_import_artifacts": load pre-computed artifacts from the Nuwa import pipeline — Speech DNA, persona sections, evidence index, Reply Bank stats. Returns whatever exists; gracefully handles missing files (e.g. for agents created without chat import).',
        },
        page: {
          type: 'integer',
          description: 'For action="messages": which page to load (1-based). Check total_pages from the stats call to know how many pages exist.',
        },
        force_refresh: {
          type: 'boolean',
          description: 'For action="analyze_all": set to true to ignore cached analysis and re-run from scratch. Default false — if an identical cached analysis exists (same message count, same last timestamp), return it instantly instead of redoing 20+ minutes of LLM calls.',
        },
      },
      required: ['action'],
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { action, page = 1, force_refresh = false } = params
    const isSelf = this.targetAgentType === 'user'

    if (!this.targetAgentId) {
      return this._err('No target agent configured for analysis.')
    }

    try {
      const { HistoryIndex } = require('../../memory/HistoryIndex')
      const agentMemoryDir = path.join(this.memoryDir, 'agents')
      const idx = new HistoryIndex(agentMemoryDir)

      if (action === 'stats') {
        const stats = idx.getStats(this.targetAgentId)
        if (!stats) {
          return this._err(`No imported chat history found for "${this.targetAgentName}". The agent needs to have chat history imported first.`)
        }

        // Include agent prompt snippet so LLM can reference the persona definition
        const promptSnippet = this.targetAgentPrompt
          ? this.targetAgentPrompt.slice(0, 500) + (this.targetAgentPrompt.length > 500 ? '...' : '')
          : null

        const nameSlug = this.targetAgentName.replace(/\s+/g, '_')
        const result = {
          agent_name: this.targetAgentName,
          analysis_mode: isSelf ? 'self' : 'other',
          agent_prompt_snippet: promptSnippet,
          ...stats,
          instructions: isSelf
            ? `This is a SELF-ANALYSIS of "Me". Total pages: ${stats.total_pages}. ` +
              'Call analyze_agent_history(action="analyze_all") to run parallel chunked analysis of all "Me" messages. ' +
              'Then call analyze_agent_history(action="extract_sections") to get structured data. ' +
              'Finally call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and HTML. Do NOT use file_operation.'
            : `Total pages: ${stats.total_pages}. ` +
              'Call analyze_agent_history(action="analyze_all") to run parallel chunked analysis of all messages. ' +
              'Then call analyze_agent_history(action="extract_sections") to get structured data. ' +
              'Finally call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and HTML. Do NOT use file_operation.',
          suggested_output_path: path.join(this.aidocPath, `${nameSlug}_analysis.md`),
          suggested_html_path: path.join(this.aidocPath, `${nameSlug}_dashboard.html`),
        }

        logger.agent('[AnalyzeAgentTool] stats', { agentId: this.targetAgentId, total: stats.total_messages, pages: stats.total_pages, mode: isSelf ? 'self' : 'other' })
        return this._ok(JSON.stringify(result, null, 0), { total: stats.total_messages })
      }

      if (action === 'messages') {
        const result = idx.getPagedMessages(this.targetAgentId, page, 150)
        if (!result) {
          return this._err(`No imported chat history found for "${this.targetAgentName}".`)
        }

        logger.agent('[AnalyzeAgentTool] messages', { agentId: this.targetAgentId, page, total_pages: result.total_pages, count: result.messages.length })
        return this._ok(JSON.stringify(result, null, 0), { page, count: result.messages.length })
      }

      if (action === 'analyze_all') {
        return await this._analyzeAll(idx, onUpdate, force_refresh)
      }

      if (action === 'extract_sections') {
        return await this._extractSections(idx, onUpdate, force_refresh)
      }

      if (action === 'read_import_artifacts') {
        return this._readImportArtifacts()
      }

      return this._err(`Unknown action "${action}". Use "stats", "messages", "analyze_all", "extract_sections", or "read_import_artifacts".`)
    } catch (err) {
      logger.error('[AnalyzeAgentTool] execute error', { agentId: this.targetAgentId, error: err.message })
      return this._err(`Analysis failed: ${err.message}`)
    }
  }

  /**
   * Cache path for the structured 24-section extraction.
   */
  _sectionsCachePath() {
    const fs = require('fs')
    const type = this.targetAgentType === 'user' ? 'users' : 'system'
    const dir = path.join(this.dataPath, 'souls', type)
    try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
    return path.join(dir, `${this.targetAgentId}.sections.json`)
  }

  /**
   * extract_sections — turns the cached narrative analysis + raw message samples
   * into structured JSON with all 24 sections' data. Fast (~1-2 min), cacheable,
   * re-runnable without re-doing the expensive analyze_all.
   */
  async _extractSections(idx, onUpdate, forceRefresh = false) {
    if (!this.llmConfig) {
      return this._err('LLM config not available for section extraction.')
    }

    const fs = require('fs')
    const { _callLLM } = require('../chatImport/personaBuilder')
    const { lookupModelMaxOutputTokens } = require('../modelDefaults')
    // Resolve the LLM config once for this entire extraction. Skill manifests
    // can hint that extract_sections is best served by a chat model (schema
    // transformation, not reasoning). All retries within this call use it.
    const extractionConfig = this._resolveLlmConfigForAction('extract_sections')
    const extractionModel = extractionConfig?.utilityModel?.model || 'unknown'
    if (extractionConfig !== this.llmConfig) {
      logger.agent(`[AnalyzeAgentTool] extract_sections using hinted model: ${extractionModel}`)
    }
    // Clamp each group's requested maxTokens to the model's actual output cap
    // (source: LiteLLM registry — 2671+ models). DeepSeek-chat caps at 8192,
    // reasoner at 64k, claude-sonnet at 64k, etc. Registry miss returns a large
    // fallback so known-good models are unaffected; if a provider STILL rejects,
    // the inline retry below catches the error and re-sends with the cap.
    // Shared across groups so the first one to hit a cap teaches the rest.
    let discoveredOutputCap = lookupModelMaxOutputTokens(extractionModel, this.dataPath)

    // JSON mode: supported by DeepSeek-chat, OpenAI, OpenRouter (many models),
    // Gemini. Forces the model's decoder to emit strictly-valid JSON, which
    // eliminates the #1 source of extract_sections failures (unescaped inner
    // double quotes in embedded Chinese dialogue). Shared flag so if ONE call
    // reveals the provider rejects the parameter, subsequent calls skip it.
    let useJsonMode = true

    // Helper: call _callLLM with three layers of fallback:
    //   1. JSON mode on — first defense against malformed JSON
    //   2. If provider rejects JSON mode (old model / unknown endpoint) → retry plain
    //   3. If provider rejects max_tokens (valid range [1, N]) → retry with N
    // These retries count as a single outer "attempt".
    const callWithCapFallback = async (prompt, requestedTokens) => {
      const effective = Math.min(requestedTokens, discoveredOutputCap)
      const tryOnce = async (jsonMode, tokens) =>
        _callLLM(prompt, extractionConfig, tokens, { jsonMode })
      try {
        return await tryOnce(useJsonMode, effective)
      } catch (err) {
        const msg = err?.message || ''
        // Provider rejects JSON mode — downgrade globally and retry
        if (useJsonMode && /response_format|json.?object|json.?mode/i.test(msg) && /not\s*support|unsupported|invalid/i.test(msg)) {
          logger.info(`[AnalyzeAgentTool] provider rejected JSON mode (${msg.slice(0, 120)}) — disabling for this run`)
          useJsonMode = false
          try {
            return await tryOnce(false, effective)
          } catch (err2) {
            if (err2.tokenInfo?.outputCap && err2.tokenInfo.outputCap < effective) {
              discoveredOutputCap = Math.min(discoveredOutputCap, err2.tokenInfo.outputCap)
              return await tryOnce(false, err2.tokenInfo.outputCap)
            }
            throw err2
          }
        }
        // Provider rejects max_tokens value — clamp and retry
        if (err.tokenInfo?.outputCap && err.tokenInfo.outputCap < effective) {
          logger.info(`[AnalyzeAgentTool] output cap discovered via API: ${err.tokenInfo.outputCap} (was using ${effective}) — retrying`)
          discoveredOutputCap = Math.min(discoveredOutputCap, err.tokenInfo.outputCap)
          return await tryOnce(useJsonMode, err.tokenInfo.outputCap)
        }
        throw err
      }
    }

    const emit = (text) => { if (onUpdate) onUpdate({ type: 'progress', text }) }

    // ── Prerequisite: cached analysis must exist ──────────────────────
    const stats = idx.getStats(this.targetAgentId)
    if (!stats) return this._err('No imported chat history found.')

    const analysisCachePath = this._analysisCachePath()
    if (!fs.existsSync(analysisCachePath)) {
      return this._err('extract_sections requires a cached analysis. Call action="analyze_all" first.')
    }
    let cachedAnalysis
    try {
      cachedAnalysis = JSON.parse(fs.readFileSync(analysisCachePath, 'utf8'))
    } catch (err) {
      return this._err(`Failed to read cached analysis: ${err.message}`)
    }
    if (!cachedAnalysis.analysis) {
      return this._err('Cached analysis is missing the "analysis" field. Re-run analyze_all with force_refresh=true.')
    }

    // ── Check section cache ──────────────────────────────────────────
    const sectionsPath = this._sectionsCachePath()
    if (!forceRefresh && fs.existsSync(sectionsPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(sectionsPath, 'utf8'))
        const currKey = this._cacheKeyFromStats(stats)
        if (cached.cacheKey?.totalMessages === currKey.totalMessages
            && cached.cacheKey?.lastTimestamp === currKey.lastTimestamp
            && cached.analysisCachedAt === cachedAnalysis.cachedAt) {
          const sizeKB = (fs.statSync(sectionsPath).size / 1024).toFixed(1)
          emit(`Using cached sections (${sizeKB}KB)`)
          return this._ok(JSON.stringify({
            ...cached,
            cached: true,
            cache_info: { file_size_kb: parseFloat(sizeKB), cached_at: cached.cachedAt },
            instructions: cached.language === 'zh'
              ? `结构化 section 缓存命中。请直接调用 render_persona_report 工具，传入 sections 和 stats 对象。工具会自动生成所有 D 标量和 27 个 HTML 片段。不要使用 file_operation 写 HTML。`
              : `Sections cache hit. Call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and 27 HTML fragments. Do NOT use file_operation.`,
          }, null, 0), { cached: true })
        }
      } catch (_) { /* fallthrough to fresh extraction */ }
    }

    const isSelfMode = this.targetAgentType === 'user'
    // ── Load raw message samples for dialogue theatre ────────────────
    emit('Loading message samples for dialogue theatre...')
    const samples = idx.getSampledMessages(this.targetAgentId) || { long: [], conflict: [], sweet: [], recent: [], strided: [] }
    const sampleLines = []
    const fmtMsg = (m) => {
      // User-side label: "你(Me)" for self, "Me" for system.
      // Partner-side label in self mode: the partner's REAL display name (from
      // the DB's sender column — e.g. "张淑云") so the LLM produces a schema
      // output that uses real names instead of mimicking a generic "对方".
      // getSampledMessages now returns raw sender + senderKind flag.
      const kind = m.senderKind || (m.sender === 'me' || m.sender === 'Me' ? 'me' : 'them')
      const sender = kind === 'me'
        ? (isSelfMode ? '你(Me)' : 'Me')
        : (isSelfMode ? (m.sender || '对方') : this.targetAgentName)
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      return `${ts}${sender}: ${m.content}`
    }
    for (const bucket of ['long', 'conflict', 'sweet', 'recent', 'strided']) {
      for (const m of (samples[bucket] || []).slice(0, bucket === 'strided' ? 100 : 30)) {
        sampleLines.push(fmtMsg(m))
      }
    }
    const sampleBlock = sampleLines.join('\n').slice(0, 60000)  // safety cap

    // ── Self-analysis: partner stats + per-partner samples + yearly buckets ──
    // Only fetched when isSelfMode; used exclusively by self-only groups
    // (relationships, identity, perceived, growth_arc, timeline).
    let selfContextBlock = ''
    if (isSelfMode) {
      try {
        const partnerStats = idx.getPartnerStats(this.targetAgentId) || []
        const yearly = idx.getYearlyBuckets(this.targetAgentId, 60) || { counts: {}, samples: {} }

        const partnerLines = partnerStats.slice(0, 20).map(p =>
          `- ${p.partner}: ${p.count} messages, ${p.first?.slice(0,10)}~${p.last?.slice(0,10)}, avg ${p.avg_len} chars`
        ).join('\n')

        // Per-partner sample: top 8 partners, 12 msgs from each.
        // "你(Me)" = the user (analysis subject), partner name = that partner.
        const perPartnerSections = []
        for (const p of partnerStats.slice(0, 8)) {
          const msgs = idx.getMessagesWithPartner(this.targetAgentId, p.partner, 24, 'both') || []
          if (msgs.length === 0) continue
          const lines = msgs.slice(-12).map(m => {
            const who = m.sender === 'Me' ? '你(Me)' : p.partner
            const ts = m.timestamp ? `[${m.timestamp.slice(0,10)}] ` : ''
            return `  ${ts}${who}: ${String(m.content || '').slice(0, 140)}`
          }).join('\n')
          perPartnerSections.push(`### 和 ${p.partner} 的对话片段 (${p.count} 条消息)\n${lines}`)
        }

        // Yearly summary: counts + a handful of sample messages per year
        const yearLines = []
        for (const year of Object.keys(yearly.counts).sort()) {
          yearLines.push(`- ${year}: ${yearly.counts[year]} messages`)
        }
        const yearSamples = []
        for (const year of Object.keys(yearly.samples).sort()) {
          const picks = (yearly.samples[year] || []).slice(0, 10)
          if (picks.length === 0) continue
          const lines = picks.map(m => {
            const who = m.sender === 'Me' ? '你(Me)' : m.sender
            return `  ${who}: ${String(m.content || '').slice(0, 140)}`
          }).join('\n')
          yearSamples.push(`### ${year}\n${lines}`)
        }

        selfContextBlock = [
          '\n\n## 🧑‍🤝‍🧑 社交圈概览（供 self-analysis 使用）\n' + (partnerLines || '(no partner data)'),
          '\n\n## 💬 每位对话者样本\n' + (perPartnerSections.join('\n\n') || '(no samples)'),
          '\n\n## 📅 年度消息量\n' + (yearLines.join('\n') || '(no yearly data)'),
          '\n\n## 📚 年度样本（用于 growth_arc）\n' + (yearSamples.join('\n\n') || '(no yearly samples)'),
        ].join('').slice(0, 40000)  // safety cap
      } catch (err) {
        logger.warn('[AnalyzeAgentTool] self context load failed:', err.message)
      }
    }

    // ── Load import artifacts for extra data ────────────────────────
    let artifactBlock = ''
    try {
      const soulsDir = path.join(this.dataPath, 'souls')
      for (const t of ['system', 'users']) {
        const sp = path.join(soulsDir, t, `${this.targetAgentId}.speech.json`)
        if (fs.existsSync(sp)) {
          const sd = JSON.parse(fs.readFileSync(sp, 'utf8'))
          artifactBlock = `\n\n## 导入时 Speech DNA\n- catchphrases: ${(sd.catchphrases||[]).map(c=>c.phrase||c).join(', ')}\n- emoji: ${(sd.emoji||[]).map(e=>`${e.char}(${e.frequency})`).join(', ')}\n- avg_len: ${sd.sentenceStyle?.avgLength}  median: ${sd.sentenceStyle?.median}\n- short_pct: ${sd.sentenceStyle?.shortPct}  punctuation: ${sd.sentenceStyle?.punctuation}\n- reply_latency_sec: ${sd.replyTiming?.medianLatencySec}`
          if (sd.conventions?.callsYou?.length) artifactBlock += `\n- calls_you: ${sd.conventions.callsYou.join(', ')}`
          break
        }
      }
    } catch (_) {}

    const isSelf = this.targetAgentType === 'user'
    const name = this.targetAgentName
    const lang = cachedAnalysis.language || 'zh'
    const zh = lang === 'zh'

    // ── Grouped extraction ─────────────────────────────────────────────
    // Structured extraction is split into small focused groups that run in
    // parallel via Promise.allSettled. Each group owns a 2-attempt retry +
    // salvage loop internally (see runOneGroup below).
    //
    // Flavor branching (system-agent vs user-agent / self-analysis):
    // - SYSTEM (isSelf=false): analyzing a relationship partner. Original 6
    //   groups below. Unchanged — preserves backward compat with existing
    //   system-agent reports.
    // - SELF   (isSelf=true) : analyzing the user themselves via multi-partner
    //   chat imports. Shared groups (core, dialogue, interaction, portrait,
    //   suggestions) reused — their prompts detect isSelf and address the
    //   user in 2nd-person ("你"). Relationship-centric sections are removed
    //   (compatibility, gifts, interaction tips with a partner). Five new
    //   self-only groups extract relationships_map, identity_modes,
    //   perceived_views, growth_arc, life_timeline.
    const SECTION_GROUPS_OTHER = [
      { id: 'core',        label: zh ? '核心性格'   : 'Core personality',
        keys: ['persona_card', 'mbti', 'ocean', 'attachment'], maxTokens: 6144 },
      { id: 'dialogue',    label: zh ? '对话与语录' : 'Dialogue & quotes',
        keys: ['dialogue_theatre', 'key_quotes', 'subtext_decoder'], maxTokens: 10000 },
      { id: 'interaction', label: zh ? '互动模式'   : 'Interaction patterns',
        keys: ['interaction_tips', 'topic_preferences', 'signals', 'best_communication_times', 'expected_next'], maxTokens: 5000 },
      { id: 'portrait',    label: zh ? '人物叙事'   : 'Character narrative',
        keys: ['character_portrait', 'surprising_contradiction', 'trajectory'], maxTokens: 12288 },
      { id: 'wellbeing',   label: zh ? '健康与兼容' : 'Health & compatibility',
        keys: ['health_index', 'compatibility'], maxTokens: 8192 },
      { id: 'suggestions', label: zh ? '建议'       : 'Suggestions',
        keys: ['growth_suggestions', 'gift_suggestions'], maxTokens: 4096 },
      { id: 'memories',    label: zh ? '独特回忆'   : 'Unique memories',
        keys: ['unique_memories'], maxTokens: 10000 },
    ]

    const SECTION_GROUPS_SELF = [
      // Shared groups reused — relationship-centric keys pruned out
      { id: 'core',        label: zh ? '核心性格'   : 'Core personality',
        keys: ['persona_card', 'mbti', 'ocean', 'attachment'], maxTokens: 6144 },
      { id: 'dialogue',    label: zh ? '对话与语录' : 'Dialogue & quotes',
        keys: ['dialogue_theatre', 'key_quotes', 'subtext_decoder'], maxTokens: 10000 },
      { id: 'interaction', label: zh ? '话题与信号' : 'Topics & signals',
        keys: ['topic_preferences', 'signals', 'best_communication_times', 'expected_next'], maxTokens: 5000 },
      { id: 'portrait',    label: zh ? '自我叙事'   : 'Self narrative',
        keys: ['character_portrait', 'surprising_contradiction', 'trajectory'], maxTokens: 12288 },
      { id: 'wellbeing',   label: zh ? '身心状态'   : 'Wellbeing',
        keys: ['health_index'], maxTokens: 4096 },
      { id: 'suggestions', label: zh ? '成长建议'   : 'Growth suggestions',
        keys: ['growth_suggestions'], maxTokens: 3072 },
      { id: 'memories',    label: zh ? '独特回忆'   : 'Unique memories',
        keys: ['unique_memories'], maxTokens: 10000 },
      // Self-only groups — only meaningful when user imported multi-partner chats
      { id: 'relationships',  label: zh ? '社交圈谱'   : 'Relationships map',
        keys: ['relationships_map'], maxTokens: 4096, selfOnly: true },
      { id: 'identity',       label: zh ? '身份切换'   : 'Identity modes',
        keys: ['identity_modes'], maxTokens: 8192, selfOnly: true },
      { id: 'perceived',      label: zh ? '他人眼中'   : 'Perceived views',
        keys: ['perceived_views'], maxTokens: 8192, selfOnly: true },
      { id: 'growth_arc',     label: zh ? '成长轨迹'   : 'Growth arc',
        keys: ['growth_arc'], maxTokens: 6144, selfOnly: true },
      { id: 'timeline',       label: zh ? '生活事件'   : 'Life timeline',
        keys: ['life_timeline'], maxTokens: 6144, selfOnly: true },
    ]

    const SECTION_GROUPS = isSelf ? SECTION_GROUPS_SELF : SECTION_GROUPS_OTHER

    emit(zh ? `正在分 ${SECTION_GROUPS.length} 组提取结构化数据...` : `Extracting structured data in ${SECTION_GROUPS.length} groups...`)

    const _startMs = Date.now()
    const allSections = {}
    const groupErrors = []

    // Groups are independent (they all read the same narrative analysis, and
    // write to disjoint keys in allSections). Dispatch them in parallel with
    // Promise.allSettled so one group's failure cannot cancel the others.
    // Each group still owns its 2-attempt retry + salvage loop internally.
    const runOneGroup = async (group) => {
      emit(zh ? `[${group.label}] 提取 ${group.keys.length} 个 section...`
             : `[${group.label}] Extracting ${group.keys.length} sections...`)

      // In self mode EVERY group receives selfContextBlock — not just self-only
      // groups. Shared groups (dialogue_theatre, key_quotes, unique_memories)
      // need the partner-name list too so they can attribute speakers by
      // specific names (张淑云, 洋, etc.) instead of the generic "对方".
      // Without this, the LLM has no way to know what partners exist.
      const extraBlock = isSelf
        ? (artifactBlock + selfContextBlock)
        : artifactBlock
      const groupPrompt = this._buildGroupPrompt(
        group, name, isSelf, lang, stats, cachedAnalysis.analysis, sampleBlock, extraBlock
      )

      let groupSections = null
      let lastRawJson = ''
      let lastParseError = null
      let fatalError = null

      for (let attempt = 1; attempt <= 2; attempt++) {
        let rawJson = ''
        try {
          const attemptPrompt = attempt === 1
            ? groupPrompt
            : groupPrompt + (zh
              ? `\n\n---\n\n## 🚨 重试:上次 JSON 解析失败\n\n错误:${lastParseError}\n前 500 字符:\n${lastRawJson.slice(0, 500)}\n\n**必须使用 ASCII 引号和标点**。重新输出合法 JSON。`
              : `\n\n---\n\n## 🚨 RETRY: Previous JSON parse failed\n\nError: ${lastParseError}\nFirst 500 chars:\n${lastRawJson.slice(0, 500)}\n\n**Use ASCII quotes and punctuation only.** Output valid JSON again.`)

          if (attempt > 1) {
            emit(zh ? `[${group.label}] 第 ${attempt} 次尝试...` : `[${group.label}] Attempt ${attempt}...`)
          }

          rawJson = await callWithCapFallback(attemptPrompt, group.maxTokens)
          lastRawJson = rawJson
        } catch (err) {
          logger.error(`[AnalyzeAgentTool] group ${group.id} LLM call ${attempt} failed:`, err.message)
          fatalError = err.message
          continue
        }

        try {
          groupSections = this._parseSectionsJson(rawJson)
          logger.agent(`[AnalyzeAgentTool] group ${group.id} parsed OK`, { attempt, keys: Object.keys(groupSections) })
          fatalError = null
          break
        } catch (err) {
          lastParseError = err.message
          logger.warn(`[AnalyzeAgentTool] group ${group.id} parse attempt ${attempt} failed:`, err.message)

          try {
            const debugPath = path.join(this.dataPath, 'souls',
              this.targetAgentType === 'user' ? 'users' : 'system',
              `${this.targetAgentId}.sections.${group.id}-${attempt}.debug.txt`)
            fs.writeFileSync(debugPath, rawJson, 'utf8')
          } catch (_) {}

          if (attempt === 2) {
            const partial = this._salvagePartialSections(rawJson)
            if (partial && Object.keys(partial).length > 0) {
              groupSections = partial
              logger.warn(`[AnalyzeAgentTool] group ${group.id} partial recovery`, { keys: Object.keys(partial) })
              fatalError = null
            } else {
              fatalError = lastParseError
            }
          }
        }
      }

      emit(groupSections
        ? (zh ? `[${group.label}] ✓ 完成` : `[${group.label}] ✓ Done`)
        : (zh ? `[${group.label}] ✗ 提取失败` : `[${group.label}] ✗ Failed`))

      return { group, groupSections, error: fatalError }
    }

    const settled = await Promise.allSettled(SECTION_GROUPS.map(runOneGroup))
    for (const r of settled) {
      if (r.status === 'rejected') {
        // Should never happen — runOneGroup catches its own errors — but guard anyway.
        groupErrors.push({ group: 'unknown', error: String(r.reason) })
        continue
      }
      const { group, groupSections, error } = r.value
      if (groupSections) {
        for (const key of group.keys) {
          if (groupSections[key] !== undefined) allSections[key] = groupSections[key]
        }
      }
      if (error) groupErrors.push({ group: group.id, error })
    }

    const sections = allSections
    if (Object.keys(sections).length < 5) {
      return this._err(`Section extraction failed: only ${Object.keys(sections).length}/19 sections recovered. Group errors: ${groupErrors.map(e => `${e.group}: ${e.error}`).join('; ')}`)
    }
    // Critical sections drive the HTML report's key sections and dim-rows.
    // If any are missing, the report renders with generic fallback text —
    // fail loud so the caller retries instead of silently shipping a broken
    // report. The set is flavor-aware: relationship-centric keys are
    // required for system agents (they underpin the other-only sections);
    // self-only keys are required for user agents (relationships_map etc.).
    // Critical keys: hard requirements that block report generation.
    // Self-only sections (relationships_map, identity_modes, perceived_views,
    // growth_arc, life_timeline) are NOT in this list — they degrade
    // gracefully to "need more data" placeholders when empty, which is the
    // right UX for single-partner imports or data-sparse cases.
    const CRITICAL_KEYS = isSelf
      ? [
          'persona_card', 'mbti', 'ocean',
          'character_portrait', 'surprising_contradiction',
          'dialogue_theatre',
        ]
      : [
          'persona_card', 'mbti', 'ocean',
          'character_portrait', 'surprising_contradiction', 'trajectory',
          'health_index', 'compatibility', 'dialogue_theatre',
        ]
    const missingCritical = CRITICAL_KEYS.filter(k => !sections[k])
    if (missingCritical.length > 0) {
      const errDetail = groupErrors.map(e => `${e.group}: ${e.error}`).join('; ') || '(no LLM errors; sections simply absent)'
      return this._err(`extract_sections incomplete — missing critical sections: [${missingCritical.join(', ')}]. Group errors: ${errDetail}. DO NOT re-run analyze_all (that rebuilds the narrative cache, which is already fine — the issue is JSON parsing in one of the extraction groups). Instead, just retry: analyze_agent_history(action="extract_sections", force_refresh=true). If the same group fails 3 times in a row, report to the user instead of retrying further.`)
    }
    if (groupErrors.length > 0) {
      sections._group_errors = groupErrors
      logger.warn('[AnalyzeAgentTool] some groups had errors:', groupErrors)
    }

    // ── Anti-hallucination sweep for self-analysis sections ──
    // LLMs occasionally fabricate entries even with explicit "no fabrication"
    // rules. Drop entries that fail structural sanity checks. Cheap and
    // uniformly applied regardless of model.
    if (isSelf) {
      // life_timeline: every event must have non-empty evidence and a
      // plausible YYYY-MM date; otherwise it's a phantom.
      if (Array.isArray(sections.life_timeline)) {
        const before = sections.life_timeline.length
        sections.life_timeline = sections.life_timeline.filter(ev => {
          if (!ev || typeof ev !== 'object') return false
          const ev2 = String(ev.evidence || '').trim()
          const dt = String(ev.date || '').trim()
          const hasDate = /^\d{4}(-\d{2})?/.test(dt)
          return ev2.length >= 4 && hasDate
        })
        const dropped = before - sections.life_timeline.length
        if (dropped > 0) logger.warn(`[AnalyzeAgentTool] life_timeline: dropped ${dropped} evidence-less entries`)
      }
      // identity_modes: need at least a partner AND a mode_label.
      if (Array.isArray(sections.identity_modes)) {
        const before = sections.identity_modes.length
        sections.identity_modes = sections.identity_modes.filter(m =>
          m && typeof m === 'object' && String(m.partner || '').trim() && String(m.mode_label || '').trim()
        )
        const dropped = before - sections.identity_modes.length
        if (dropped > 0) logger.warn(`[AnalyzeAgentTool] identity_modes: dropped ${dropped} incomplete entries`)
      }
      // perceived_views: need partner + perception_label + at least 1 evidence item.
      if (Array.isArray(sections.perceived_views)) {
        const before = sections.perceived_views.length
        sections.perceived_views = sections.perceived_views.filter(v =>
          v && typeof v === 'object' &&
          String(v.partner || '').trim() &&
          String(v.perception_label || '').trim() &&
          Array.isArray(v.evidence) && v.evidence.length > 0
        )
        const dropped = before - sections.perceived_views.length
        if (dropped > 0) logger.warn(`[AnalyzeAgentTool] perceived_views: dropped ${dropped} incomplete entries`)
      }
      // growth_arc.phases: ordered, each with year_range + summary.
      if (sections.growth_arc && Array.isArray(sections.growth_arc.phases)) {
        const before = sections.growth_arc.phases.length
        sections.growth_arc.phases = sections.growth_arc.phases.filter(p =>
          p && String(p.year_range || '').trim() && String(p.summary || '').trim()
        )
        const dropped = before - sections.growth_arc.phases.length
        if (dropped > 0) logger.warn(`[AnalyzeAgentTool] growth_arc: dropped ${dropped} incomplete phases`)
      }
      // relationships_map.partners: need name + positive count.
      if (sections.relationships_map && Array.isArray(sections.relationships_map.partners)) {
        const before = sections.relationships_map.partners.length
        sections.relationships_map.partners = sections.relationships_map.partners.filter(p =>
          p && String(p.name || '').trim() && (p.message_count || 0) > 0
        )
        const dropped = before - sections.relationships_map.partners.length
        if (dropped > 0) logger.warn(`[AnalyzeAgentTool] relationships_map: dropped ${dropped} empty partners`)
      }
    }
    // Post-process: drop/resolve generic "对方" labels that LLM may still
    // have produced despite the schema ban. We cannot always recover the
    // real name (the LLM had the info but chose not to use it), so the
    // policy is: if a structural field is exactly "对方"/"them", replace
    // with the user's TOP partner name when there's only one dominant
    // partner, else leave as-is (render will show it generically).
    if (isSelf) {
      try {
        const partnerStats = idx.getPartnerStats(this.targetAgentId) || []
        const topPartner = partnerStats[0]?.partner || null
        const uniquePartners = new Set(partnerStats.map(p => p.partner))
        const isGeneric = (v) => {
          const s = String(v || '').trim()
          return s === '' || s === '对方' || s === 'them' || s === 'Them' || s === 'Partner'
        }
        // Only auto-fill when there is exactly one partner — otherwise we'd
        // be guessing. Logged so the mismatch is visible.
        const canFillGeneric = (existing) => {
          if (!isGeneric(existing)) return existing
          if (uniquePartners.size === 1 && topPartner) return topPartner
          return existing
        }
        if (Array.isArray(sections.dialogue_theatre)) {
          for (const a of sections.dialogue_theatre) {
            if (!a || typeof a !== 'object') continue
            a.partner = canFillGeneric(a.partner)
            if (Array.isArray(a.messages)) {
              for (const m of a.messages) {
                if (m.sender !== 'me' && m.sender !== 'Me') {
                  m.sender = canFillGeneric(m.sender)
                }
              }
            }
          }
        }
        if (Array.isArray(sections.key_quotes)) {
          for (const q of sections.key_quotes) {
            if (!q || typeof q !== 'object') continue
            // Normalize user-side label to "我"; resolve generic partner
            if (q.speaker === '你(Me)' || q.speaker === 'Me' || q.speaker === 'me') {
              q.speaker = '我'
            } else {
              q.speaker = canFillGeneric(q.speaker)
            }
          }
        }
        if (Array.isArray(sections.unique_memories)) {
          for (const mem of sections.unique_memories) {
            if (!mem || !Array.isArray(mem.messages)) continue
            for (const m of mem.messages) {
              if (m.sender !== 'me' && m.sender !== 'Me') {
                m.sender = canFillGeneric(m.sender)
              }
            }
          }
        }
      } catch (err) {
        logger.warn('[AnalyzeAgentTool] partner-name backfill failed:', err.message)
      }
    }

    // unique_memories applies to BOTH flavors — each memory must have at
    // least one grounded message plus a non-empty analysis.
    if (Array.isArray(sections.unique_memories)) {
      const before = sections.unique_memories.length
      sections.unique_memories = sections.unique_memories.filter(m => {
        if (!m || typeof m !== 'object') return false
        const hasMsgs = Array.isArray(m.messages) && m.messages.length > 0 &&
          m.messages.some(x => String(x.text || '').trim().length > 0)
        const hasAnalysis = String(m.analysis || '').trim().length >= 4
        const hasTitle = String(m.title || '').trim().length > 0
        return hasMsgs && hasAnalysis && hasTitle
      })
      const dropped = before - sections.unique_memories.length
      if (dropped > 0) logger.warn(`[AnalyzeAgentTool] unique_memories: dropped ${dropped} empty/thin entries`)
    }

    const durationSec = Math.round((Date.now() - _startMs) / 1000)

    // ── Write cache ─────────────────────────────────────────────────
    // Also persist `stats` (monthly activity, senders, date range) so the
    // renderer can produce real year-chart / heatmap / sender-ratio visuals
    // without querying the DB again.
    const result = {
      mode: isSelf ? 'self' : 'other',
      agent_name: name,
      sections,
      stats: {
        total_messages: stats.total_messages,
        date_range: stats.date_range,
        senders: stats.senders,
        monthly_activity: stats.monthly_activity,
        avg_message_length: stats.avg_message_length,
      },
      language: lang,
      total_messages: stats.total_messages,
      analysisCachedAt: cachedAnalysis.cachedAt,
      cacheKey: this._cacheKeyFromStats(stats),
      cachedAt: new Date().toISOString(),
      durationSec,
      // Data counts for quick reference — full rendering workflow lives in the skill.
      section_counts: {
        dialogue_theatre: Array.isArray(sections?.dialogue_theatre) ? sections.dialogue_theatre.length : 0,
        key_quotes: Array.isArray(sections?.key_quotes) ? sections.key_quotes.length : 0,
        growth_suggestions: Array.isArray(sections?.growth_suggestions) ? sections.growth_suggestions.length : 0,
        compatibility: Array.isArray(sections?.compatibility) ? sections.compatibility.length : 0,
        subtext_decoder: Array.isArray(sections?.subtext_decoder) ? sections.subtext_decoder.length : 0,
        total_sections: sections ? Object.keys(sections).length : 0,
      },
      instructions: zh
        ? `结构化提取完成（${durationSec} 秒）。sections 和 stats 字段现在就在你的 context 中，包含 ${sections ? Object.keys(sections).length : 0} 个 section 的完整数据。\n\n下一步：调用 render_persona_report({sections: <sections对象>, stats: <stats对象>})。工具会自动从 sections/stats 计算所有 D 标量并生成 27 个 HTML 片段，然后渲染模板并写入文件。\n\n重要：不要使用 file_operation 写 HTML，不要自己生成 D 标量或 HTML 片段，不要 dispatch subagent。必须使用 render_persona_report 工具。`
        : `Structured extraction complete (${durationSec}s). The sections and stats fields are now in your context, with ${sections ? Object.keys(sections).length : 0} sections of structured data.\n\nNext: call render_persona_report({sections: <sections object>, stats: <stats object>}). The tool auto-computes all D scalars and generates all 27 HTML fragments from the sections/stats data, then renders the template and writes the file.\n\nIMPORTANT: Do NOT use file_operation. Do NOT generate D scalars or HTML yourself. You MUST use render_persona_report.`,
    }

    try {
      fs.writeFileSync(sectionsPath, JSON.stringify(result, null, 2), 'utf8')
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] sections cache write failed:', err.message)
    }

    emit(zh ? `结构化提取完成（${durationSec}s）` : `Extraction complete (${durationSec}s)`)
    logger.agent('[AnalyzeAgentTool] extract_sections done', {
      agentId: this.targetAgentId,
      durationSec,
      sectionCount: Object.keys(sections).length,
    })
    return this._ok(JSON.stringify(result, null, 0), { durationSec, sectionCount: Object.keys(sections).length })
  }

  /**
   * Robust JSON parse for LLM output that may contain Chinese fancy quotes,
   * full-width punctuation, trailing commas, and wrapping markdown fences.
   *
   * Strategy (each step is tried in order):
   *   1. Trim + strip markdown fences
   *   2. Extract the outermost {...} block
   *   3. Normalize fancy punctuation to ASCII
   *   4. Try JSON.parse — if fails, do more aggressive cleanup
   *   5. Throw with a descriptive error if still fails
   */
  _parseSectionsJson(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('empty or non-string LLM output')

    // Step 1: strip markdown fences
    let s = raw.trim()
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    // Step 2: extract outermost object
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('no JSON object braces found')
    s = s.slice(start, end + 1)

    // Step 3a: OPTIMISTIC PARSE — try the raw (brace-trimmed, fence-stripped)
    // output first. Many models produce perfectly valid JSON that happens to
    // contain Chinese quote characters INSIDE string values (e.g., a quoted
    // sentence within a "decoded" field). Normalizing those quotes to ASCII
    // would corrupt valid JSON. Only fall back to normalization if the raw
    // parse fails — at which point the input is already broken.
    try {
      return JSON.parse(s)
    } catch (_preNormErr) { /* fall through to normalization path */ }

    // Step 3b: normalize fancy punctuation to ASCII
    //   When a model emits JSON with Chinese quote/colon/comma chars as
    //   STRUCTURAL tokens (wrapping keys, separating pairs), this rescues
    //   otherwise-unparseable output. Applied only after the raw-parse
    //   attempt above has already failed.
    const cleaned = s
      .replace(/[\u201C\u201D\u2033]/g, '"')  // " " ″  → ASCII "
      .replace(/[\u2018\u2019\u2032]/g, "'")  // ' ' ′  → ASCII '
      .replace(/[\u00AB\u00BB]/g, '"')         // « »   → ASCII "
      .replace(/[\u3008\u3009]/g, '"')         // 〈 〉 → ASCII "
      .replace(/[\u300A\u300B]/g, '"')         // 《 》 → ASCII "
      .replace(/\uFF1A/g, ':')                 // ： → :
      .replace(/\uFF0C/g, ',')                 // ， → ,
      .replace(/\uFF08/g, '(')                 // （ → (
      .replace(/\uFF09/g, ')')                 // ） → )
      .replace(/\uFF01/g, '!')                 // ！ → !
      .replace(/\uFF1F/g, '?')                 // ？ → ?
      // Trailing commas in objects/arrays (JSON doesn't allow, JS does)
      .replace(/,(\s*[}\]])/g, '$1')
      // Raw tab/control chars inside strings
      .replace(/\t/g, '\\t')

    // Step 4: try parse after normalization
    try {
      return JSON.parse(cleaned)
    } catch (err) {
      // Step 5: last-ditch — fix common string-level defects
      //   (a) unescaped newlines / tabs / control chars inside string values
      //   (b) unescaped inner double quotes inside a string value
      //   LLMs embedding raw user messages often forget to escape " and newlines
      try {
        const fixed = cleaned.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (m, inner) =>
          '"' + inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'
        )
        return JSON.parse(fixed)
      } catch (err2) {
        // Step 6: aggressive repair — strip control chars and re-quote
        try {
          const aggressive = cleaned
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // control chars
            .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')          // lone backslashes
          return JSON.parse(aggressive)
        } catch (err3) {
          throw new Error(`JSON parse failed: ${err.message}`)
        }
      }
    }
  }

  /**
   * Last-resort partial recovery: walk through the raw output and try to
   * extract individual top-level section objects even if the whole JSON is
   * malformed. Returns a partial sections object or null.
   *
   * Example: if the output is `{ "persona_card": {...}, "dialogue_theatre": [...], BROKEN_STUFF }`
   * we still extract persona_card and dialogue_theatre.
   */
  _salvagePartialSections(raw) {
    const result = {}
    // Expected top-level keys in our schema
    const keys = [
      'persona_card', 'dialogue_theatre', 'subtext_decoder', 'interaction_tips',
      'topic_preferences', 'signals', 'best_communication_times', 'expected_next',
      'trajectory', 'character_portrait', 'surprising_contradiction',
      'compatibility', 'key_quotes', 'gift_suggestions', 'health_index',
      'growth_suggestions', 'ocean', 'mbti', 'attachment',
      // Self-analysis (user-agent) only
      'relationships_map', 'identity_modes', 'perceived_views',
      'growth_arc', 'life_timeline',
      // Shared
      'unique_memories',
    ]
    for (const key of keys) {
      // Find `"key":` and walk forward to find the matching block
      const needle = `"${key}"`
      let idx = raw.indexOf(needle)
      if (idx < 0) continue
      // Jump past the key and its colon
      let p = raw.indexOf(':', idx + needle.length)
      if (p < 0) continue
      p++
      // Skip whitespace
      while (p < raw.length && /\s/.test(raw[p])) p++
      if (p >= raw.length) continue
      const openChar = raw[p]
      const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : null
      if (!closeChar) {
        // Scalar value — grab until comma or closing bracket at top level
        continue
      }
      // Walk to matching closer, tracking depth, ignoring quoted strings
      let depth = 0
      let inStr = false
      let esc = false
      let end = -1
      for (let i = p; i < raw.length; i++) {
        const ch = raw[i]
        if (esc) { esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === openChar) depth++
        else if (ch === closeChar) {
          depth--
          if (depth === 0) { end = i + 1; break }
        }
      }
      if (end < 0) continue
      const block = raw.slice(p, end)
      // Strategy ladder:
      //   1. Raw parse
      //   2. Normalized parse (smart quotes → ASCII, trailing commas stripped)
      //   3. If key is an ARRAY, walk each top-level {...} inside it and try
      //      to parse them individually — drop the broken ones, keep the good
      //      ones. One bad memory/quote shouldn't lose the other 15.
      let parsed = null
      try {
        parsed = JSON.parse(block)
      } catch (_) {
        try {
          parsed = JSON.parse(block
            .replace(/[\u201C\u201D\u2033]/g, '"')
            .replace(/[\u2018\u2019\u2032]/g, "'")
            .replace(/,(\s*[}\]])/g, '$1'))
        } catch (_) {
          if (openChar === '[') {
            const items = this._salvageArrayItems(block)
            if (items.length > 0) parsed = items
          }
          // If still null, this key is skipped — don't poison the rest.
        }
      }
      if (parsed !== null) result[key] = parsed
    }
    return Object.keys(result).length > 0 ? result : null
  }

  /**
   * Per-item array salvage: extract every top-level {...} object from a
   * malformed JSON array string and try to parse each individually. One
   * broken object does not kill the rest.
   *
   * Used when the whole array fails to parse but we want to recover the
   * items that ARE valid. Essential for unique_memories/dialogue_theatre/
   * key_quotes when a single LLM-generated entry has an unescaped inner
   * quote that corrupts only that one entry.
   */
  _salvageArrayItems(arrayText) {
    const items = []
    let depth = 0, inStr = false, esc = false, start = -1
    for (let i = 0; i < arrayText.length; i++) {
      const ch = arrayText[i]
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') { inStr = !inStr; continue }
      if (inStr) continue
      if (ch === '{') {
        if (depth === 0) start = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && start >= 0) {
          const block = arrayText.slice(start, i + 1)
          try {
            items.push(JSON.parse(block))
          } catch (_) {
            // Try normalization fallback on this one item
            try {
              items.push(JSON.parse(block
                .replace(/[\u201C\u201D\u2033]/g, '"')
                .replace(/[\u2018\u2019\u2032]/g, "'")
                .replace(/,(\s*[}\]])/g, '$1')))
            } catch (_) { /* skip this item, keep others */ }
          }
          start = -1
        }
      }
    }
    return items
  }

  /**
   * Schema fragment map — keyed by section name.
   * Used by _buildGroupPrompt to assemble a smaller, focused schema for each
   * group of 2-5 related sections (instead of one giant 19-section schema).
   */
  _getSectionSchemas(zh, isSelf = false) {
    // In self mode, "subject" is the user (你/Me); in system mode it's the
    // target partner (TA). Used to describe whose traits each schema field
    // represents — critical for signals/topics/etc. where ambiguity about
    // whose patterns are being collected caused LLMs to attribute partner
    // behaviors to the user.
    const subj = isSelf ? (zh ? '你(用户本人)' : 'you (the user)')
                         : (zh ? 'TA'           : 'them')
    return {
      persona_card: `"persona_card": {
    "intimacy_score": {
      "total": <0-100>, "trust": <0-100>, "dependency": <0-100>,
      "interaction_density": <0-100>, "emotional_depth": <0-100>, "stability": <0-100>
    },
    "keywords": ["<3-5 ${zh ? '大字标签' : 'big-font labels'}>"],
    "constellation": { "name": "${zh ? '<星座名>' : '<sign>'}", "emoji": "<zodiac emoji>", "match_pct": <0-100>, "reason": "<1-2 sentences>" },
    "chemistry": { "type": "${zh ? '<互补型/镜像型/导师型/战友型/锚点型 之一>' : '<Complementary/Mirror/Mentor/Comrade/Anchor>'}", "emoji": "<emoji>", "desc": "<1 sentence>" }
  }`,

      mbti: `"mbti": {
    "type": "<4 letters>",
    "ei_score": <-100 to 100, negative=I positive=E>,
    "sn_score": <-100 to 100>,
    "tf_score": <-100 to 100>,
    "jp_score": <-100 to 100>,
    "per_axis_evidence": { "EI": "...", "SN": "...", "TF": "...", "JP": "..." },
    "confidence": <1-5>
  }`,

      ocean: `"ocean": {
    "openness": { "score": <1-10>, "evidence": "<1-2 quotes>" },
    "conscientiousness": { "score": <1-10>, "evidence": "..." },
    "extraversion": { "score": <1-10>, "evidence": "..." },
    "agreeableness": { "score": <1-10>, "evidence": "..." },
    "neuroticism": { "score": <1-10>, "evidence": "..." },
    "confidence": <1-5>
  }`,

      attachment: `"attachment": {
    "type": "${zh ? '<安全型/焦虑型/回避型/恐惧型>' : '<secure/anxious/avoidant/fearful>'}",
    "reason": "<1-2 sentences>",
    "confidence": <1-5>
  }`,

      dialogue_theatre: `"dialogue_theatre": [
    {
      "act_number": 1,
      "date": "<YYYY-MM-DD>",
      "category": "${zh ? '<初次互动/表达关心/冲突/脆弱/兴奋/幽默/沉默修复/日常/转折/信任升级 之一>' : '<first_interaction/showing_care/conflict/vulnerability/excitement/humor/silence_repair/daily/turning_point/trust_upgrade>'}",
      "partner": "<${zh ? '这场戏里对方的具体名字(来自 selfContext 的 partner 名);system 模式下是该对方的名字' : 'exact partner name for this scene (from selfContext partner names); in system mode it is that single partner'}>",
      "scene_title": "<${zh ? '5-10字场景标题' : '5-10 word scene title'}>",
      "messages": [
        { "sender": "<${zh ? 'me 或 具体对方名(如 张淑云);严格对应 sender 标签' : 'me or exact partner name (e.g. Mom); strictly mirror the sender label'}>", "text": "<${zh ? '消息原文 ≤120 字,超出用 … 省略。内部双引号必须用 \\\\" 转义,换行替换为空格,去掉 URL、控制字符' : 'message text ≤120 chars, elide with …. Escape inner double quotes as \\\\", replace newlines with spaces, strip URLs and control chars'}>", "time": "<HH:MM>" }
      ],
      "analysis": "<${zh ? '2-3 句解读' : '2-3 sentence analysis'}>"
    }
    // 10-20 items TOTAL, span at least 4 different years/stages
  ]`,

      key_quotes: `"key_quotes": [
    { "text": "<${zh ? '原文语录,≤100 字,内部双引号用 \\\\" 转义,去掉 URL 和控制字符' : 'quote ≤100 chars, escape inner quotes as \\\\", strip URLs and control chars'}>", "date": "<YYYY-MM-DD>", "category": "<${zh ? '场景分类' : 'scene category'}>", "speaker": "<${zh ? '<我 或 具体对方名(如 张淑云)> — 严格按样本里的 sender 标签来写;不要泛泛写"对方"' : '<Me or exact partner name (e.g. Mom)> — strictly mirror the sender label, never generic "them"'}>", "context": "<${zh ? '1-2 句背景,帮读者回忆当时的情境:之前发生了什么,这句话是在回应什么' : '1-2 sentence background: what was happening, what this quote responded to'}>" }
    // 16-20 items, span at least 4 different years
  ]`,

      subtext_decoder: `"subtext_decoder": [
    { "surface": "<${zh ? 'TA常说的原话,≤60 字,无 URL' : 'common phrase ≤60 chars, no URLs'}>", "decoded": "<${zh ? '真实含义' : 'actual meaning'}>", "evidence": "<${zh ? '一条支持证据,≤120 字' : 'one supporting quote ≤120 chars'}>" }
    // 5-8 items
  ]`,

      interaction_tips: `"interaction_tips": {
    "do": ["<${zh ? '加分做法,3-5 条' : 'do item, 3-5 items'}>"],
    "dont": ["<${zh ? '避雷做法,3-5 条' : 'dont item, 3-5 items'}>"]
  }`,

      topic_preferences: `"topic_preferences": {
    "loves":   ["<${zh ? `${subj} 爱聊的话题,基于${subj}自己发消息的主题,4-6 个` : `topics ${subj} actively engages with, from ${subj}'s own messages, 4-6`}>"],
    "neutral": ["<${zh ? `${subj} 中立的日常话题,4-6 个` : `${subj}'s neutral daily topics, 4-6`}>"],
    "avoid":   ["<${zh ? `${subj} 回避或不擅长的话题,2-4 个` : `topics ${subj} avoids, 2-4`}>"]
  }`,

      signals: `"signals": {
    "green":  ["<${zh ? `${subj} 处于健康放松状态的信号,基于${subj}自己的语言和行为模式,3-5 条` : `signals that ${subj} is healthy/engaged, based on ${subj}'s own language and behavior, 3-5`}>"],
    "yellow": ["<${zh ? `${subj} 需要留意的早期征兆,3-5 条` : `early-warning patterns in ${subj}'s own behavior, 3-5`}>"],
    "red":    ["<${zh ? `${subj} 压力/情绪临界点的警示信号,2-4 条` : `${subj}'s acute stress signals, 2-4`}>"]
  }`,

      best_communication_times: `"best_communication_times": {
    "relaxed": { "time": "<${zh ? `${subj} 放松时的时段` : `${subj}'s relaxed time`}>", "advice": "<${zh ? `在${subj}放松时适合做什么` : `what fits when ${subj} is relaxed`}>" },
    "tired":   { "time": "<time>", "advice": "<${zh ? `在${subj}疲惫时避免做什么` : `what to avoid when ${subj} is tired`}>" },
    "happy":   { "time": "<time>", "advice": "<${zh ? `在${subj}开心时适合提什么` : `what to ask when ${subj} is happy`}>" }
  }`,

      expected_next: `"expected_next": [
    { "icon": "<emoji>", "title": "<${zh ? `${subj} 接下来可能关注的话题/动作` : `${subj}'s likely next topic/action`}>", "detail": "<${zh ? '为什么这么推测,结合证据' : 'why, with evidence'}>", "signal": "strong|medium|weak" }
    // 3-5 items
  ]`,

      character_portrait: `"character_portrait": "<${zh ? '300 字以上的叙事段落,用场景而非标签开头' : '300+ word narrative, open with a scene not a label'}>"`,

      surprising_contradiction: `"surprising_contradiction": "<${zh ? '150 字以上描述最意外的内在矛盾,引用 2 段对话作为证据' : '150+ word description of most surprising contradiction, cite 2 dialogue excerpts'}>"`,

      trajectory: `"trajectory": {
    "optimistic": { "scenario": "<${zh ? '乐观场景' : 'optimistic scenario'}>", "trigger": "<${zh ? '达成条件' : 'trigger'}>" },
    "baseline": { "scenario": "<${zh ? '当前轨迹' : 'current path'}>", "trigger": "<${zh ? '当前状态' : 'current state'}>" },
    "pessimistic": { "scenario": "<${zh ? '悲观场景' : 'pessimistic'}>", "trigger": "<${zh ? '触发条件' : 'trigger'}>" }
  }`,

      health_index: `"health_index": {
    "current_score": <0-100>,
    "trend_arrow": "up|flat|down",
    "monthly_trend": [<12 numbers 0-100 representing last 12 months>],
    "alert": "<${zh ? '当前值得关注的点' : 'current alert'}>"
  }`,

      compatibility: `"compatibility": [
    { "type": "${zh ? '<星座名或 MBTI>' : '<zodiac or MBTI>'}", "score": <0-100>, "reason": "<1 sentence>" }
    // at least 8 items (zodiac or MBTI mix)
  ]`,

      growth_suggestions: `"growth_suggestions": [
    { "icon": "<emoji>", "title": "<${zh ? '建议标题' : 'title'}>", "text": "<${zh ? '建议内容' : 'content'}>", "difficulty": "${zh ? '<低/中/高>' : '<low/medium/high>'}", "impact": "${zh ? '<低/中/高>' : '<low/medium/high>'}" }
    // EXACTLY 6 items for grid-3 layout
  ]`,

      gift_suggestions: `"gift_suggestions": [
    { "icon": "<emoji>", "name": "<${zh ? '礼物名' : 'gift name'}>", "reason": "<${zh ? '基于哪个兴趣' : 'based on which interest'}>", "price_range": "${zh ? '<低/中/高>' : '<low/medium/high>'}", "scenario": "${zh ? '<生日/节日/纪念日/日常>' : '<birthday/holiday/anniversary/casual>'}" }
    // 4-6 items
  ]`,

      // ── Self-analysis (user-agent) only schemas ──────────────────────────
      relationships_map: `"relationships_map": {
    "total_partners": <${zh ? '对话者总数' : 'total partner count'}>,
    "partners": [
      {
        "name": "<${zh ? '对话者显示名(来自 partner stats)' : 'partner display name (from partner stats)'}>",
        "message_count": <number>,
        "relation_type": "<${zh ? '<家人/伴侣/挚友/朋友/同事/业务/长辈/弱联系 之一>' : '<family/romantic/close_friend/friend/colleague/business/elder/weak_tie>'}>",
        "warmth": <1-10>,
        "intimacy_level": "<${zh ? '<亲密/熟悉/一般/疏远>' : '<intimate/familiar/neutral/distant>'}>",
        "role_in_life": "<${zh ? '这个人在你生活中扮演的角色,一句话' : 'one-line: this person role in your life'}>",
        "date_range": "<YYYY-MM ~ YYYY-MM>"
      }
    ],
    "network_shape": "<${zh ? '一句话描述你的社交圈形态,如 少而深 / 广而浅 / 以家庭为中心 等' : 'one-line: shape of your social circle'}>"
  }`,

      identity_modes: `"identity_modes": [
    {
      "partner": "<${zh ? '对话者名字' : 'partner name'}>",
      "mode_label": "<${zh ? '3-6 字的身份标签,例如 可靠队友 / 耐心导师 / 倔强子女' : '3-6 word identity label'}>",
      "voice_traits": [ "<${zh ? '和这个人聊时你的说话特点,3-5 条' : 'speech traits with this person, 3-5 items'}>" ],
      "common_phrases": [ "<${zh ? '和这个人聊时你常说的 2-4 句原话,从样本中摘取,≤40 字' : '2-4 phrases you often use with this person, ≤40 chars each'}>" ],
      "analysis": "<${zh ? '面对这个人时你呈现的自我的分析,2-3 句,用 你 称呼' : '2-3 sentence analysis addressing user as you'}>"
    }
  ]`,

      perceived_views: `"perceived_views": [
    {
      "partner": "<${zh ? '对话者名字' : 'partner name'}>",
      "perception_label": "<${zh ? '在对方眼中你是什么样,3-6 字' : '3-6 word label for how they perceive you'}>",
      "evidence": [ "<${zh ? '对方消息中支持这个判断的原话,≤60 字,2-3 条' : '2-3 quotes from their messages, ≤60 chars each'}>" ],
      "analysis": "<${zh ? '2-3 句分析对方如何看待你,用 你 称呼' : '2-3 sentence analysis addressing user as you'}>"
    }
  ]`,

      growth_arc: `"growth_arc": {
    "phases": [
      {
        "label": "<${zh ? '阶段标签,3-6 字' : '3-6 word phase label'}>",
        "year_range": "<YYYY ~ YYYY>",
        "dominant_themes": [ "<${zh ? '主导话题,3-5 个' : 'dominant topics, 3-5 items'}>" ],
        "voice_shift": "<${zh ? '这个阶段你说话方式的特征,1-2 句' : '1-2 sentence voice description'}>",
        "summary": "<${zh ? '2-3 句描述这个阶段的你,用 你 称呼' : '2-3 sentence summary addressing user as you'}>"
      }
    ],
    "overall_trajectory": "<${zh ? '一句话总结你跨越这几个阶段的变化弧线' : 'one-line overall trajectory'}>"
  }`,

      life_timeline: `"life_timeline": [
    {
      "date": "<YYYY-MM>",
      "category": "<${zh ? '<职业/关系/家庭/健康/搬迁/学习/丧失/成就 之一>' : '<career/relationship/family/health/relocation/study/loss/achievement>'}>",
      "icon": "<emoji>",
      "title": "<${zh ? '事件标题,≤20 字' : 'event title ≤20 chars'}>",
      "evidence": "<${zh ? '聊天里支持这条事件的原话,≤80 字' : 'supporting quote from chat, ≤80 chars'}>",
      "significance": "<${zh ? '一句话说明为什么这是一个节点' : 'one-line why this is a node'}>"
    }
  ]`,

      // Shared — unique/memorable moments worth remembering. Different from
      // dialogue_theatre (which is REPRESENTATIVE patterns): memories are
      // SPECIAL events with emotional weight, the kind of moments the user
      // wants to relive.
      unique_memories: `"unique_memories": [
    {
      "date": "<YYYY-MM-DD>",
      "icon": "<${zh ? '能代表这个瞬间情绪的 emoji' : 'emoji matching the emotional tone'}>",
      "category": "<${zh ? '<生日/意外惊喜/共度时刻/里程碑/和解/告白/搞笑瞬间/温暖片段/共同创造 之一>' : '<birthday/surprise/shared_moment/milestone/reconciliation/confession/funny/warm/shared_creation>'}>",
      "emotion": "<${zh ? '<温暖/惊喜/心酸/自豪/松动/会心一笑/难忘 之一>' : '<warm/surprised/bittersweet/proud/thawed/knowing_smile/unforgettable>'}>",
      "title": "<${zh ? '一句话场景标题,≤15 字' : 'one-line scene title, ≤15 chars'}>",
      "scene": "<${zh ? '2-3 句背景描述,帮读者回忆当时情境:之前发生了什么,为什么这个瞬间重要' : '2-3 sentence backdrop: what was happening, why this moment mattered'}>",
      "messages": [
        { "sender": "<${zh ? 'me | 对方 | 具体 partner 名' : 'me | them | specific partner name'}>", "text": "<${zh ? '原话,≤80 字' : 'verbatim quote, ≤80 chars'}>", "time": "<HH:MM>" }
      ],
      "analysis": "<${zh ? '1-2 句点出这个瞬间的独特性:为什么值得被记住' : '1-2 sentences: what makes this moment uniquely memorable'}>"
    }
    // 10-20 items, chronological, pick only TRULY special moments — not routine daily chat
  ]`,
    }
  }

  /**
   * Group-specific hard requirements returned as a short bulleted block.
   */
  _getGroupRequirements(groupId, zh, isSelf = false) {
    const reqs = {
      core: zh
        ? `1. 亲密度评分 5 个维度各独立评分,总分是加权平均\n2. 星座推断标注"趣味推断"属性\n3. 所有 evidence 字段必须基于叙事分析或样本`
        : `1. Intimacy score: 5 independent dimensions, total is weighted average\n2. Constellation marked "entertainment inference"\n3. All evidence fields must be grounded in narrative or samples`,

      dialogue: zh
        ? `1. dialogue_theatre 必须 10-20 条,跨至少 4 个不同年份/关系阶段\n2. key_quotes 必须 16-20 条,跨至少 4 个不同年份\n3. 所有引用的对话原文必须从聊天样本中抽取,不得编造\n4. subtext_decoder 5-8 条\n5. 🚫 **"对方" 是被禁止的字符串**(严格禁令):\n   • dialogue_theatre.partner 必须是真实名字,如 "张淑云"、"洋",而不是 "对方"\n   • messages[].sender 必须是 "me" 或具体名字,不是 "对方"\n   • key_quotes.speaker 必须是 "我" 或具体名字,不是 "对方"\n   • context / analysis / scene / 所有叙事字段里提到他人时也必须用具体名字,不用"对方"\n   • partner 名字列表来自上面的 "社交圈概览" 和 "每位对话者样本" 区块(它们直接列出了 partner 的真实 sender 名)\n   • 如果某条消息的样本 sender 写的是"对方"(泛指),说明该样本暂不知道具体是谁——可以跳过不选这条进 theatre/quotes;不要虚构或写"对方"\n6. 🔍 **subtext_decoder 在 self 模式下**: 解码"你"常说的话的潜台词,不是对方说的。surface 必须从"你(Me)"的消息样本里抽取。\n7. 🚨 **所有嵌入的对话原文**必须做以下清洗才能放进 JSON:\n   - 消息文本超长时截断到 120 字以内,末尾加 … \n   - 所有内部双引号 " 必须转义成 \\\\" (或改用中文引号「」)\n   - 换行符替换为空格,删除制表符和其他 ASCII 控制字符 (\\x00-\\x1f)\n   - 去掉 URL 和淘宝/微信的特殊 emoji 装饰 (👉淘♂寳♀👈 等)\n8. analysis/context 用第二人称"你"称呼用户,分析用户对那个人的反应,不是对方的性格。`
        : `1. dialogue_theatre must have 10-20 items, spanning at least 4 different years/stages\n2. key_quotes must have 16-20 items, spanning at least 4 different years\n3. All quoted dialogue must come from chat samples, no fabrication\n4. subtext_decoder must have 5-8 items\n5. 🚫 **"them"/"对方" as a partner identifier is FORBIDDEN**:\n   • dialogue_theatre.partner must be a real name (e.g. "Mom", "Alice"), never "them"/"对方"\n   • messages[].sender must be "me" or a specific name\n   • key_quotes.speaker must be "Me" or a specific name\n   • context / analysis / scene narrative also uses specific names when referring to partners\n   • Partner names come from the "社交圈概览" / "每位对话者样本" blocks above, which list partners by their real sender names\n   • If a sample's sender is unclear, skip that message rather than attributing to a generic "them"\n6. 🔍 subtext_decoder in self mode: decode phrases YOU commonly use; surface must come from user (Me) samples.\n7. 🚨 Clean embedded quotes: ≤120 chars, escape inner " as \\\\" (or use CJK 「」), strip newlines/control/URLs.\n8. analysis/context in 2nd person "you", focused on YOUR reaction to that specific person, not their personality.`,

      interaction: zh
        ? (isSelf
          ? `1. 🎯 **self 模式硬性规则**: signals(绿/黄/红)、topic_preferences(loves/neutral/avoid)、best_communication_times、expected_next 都必须**只描述用户本人**,不是任何 partner。每一条内容都要回答"这是用户(你)的什么表现/偏好/时段"。\n2. 信号必须来自样本中 sender 是 \`你(Me):\` 的消息,不是 \`张淑云:\` 或其他 partner 的消息。例如妈妈说"收下红包不收我生气"是妈妈的行为,不能作为你的 green/yellow/red 信号。\n3. topic_preferences.loves = 用户主动开话题的主题;avoid = 用户少聊或回避的话题(从 me 消息中判断)。\n4. best_communication_times = 用户自己状态最好/疲惫/开心的时段;advice 是"在这个时段用户自己适合做什么"。\n5. expected_next = 用户接下来可能关注的话题和动作,不是 partner 的。\n6. 每条建议必须基于样本中可见证据,不得泛泛。`
          : `1. do/dont 各 3-5 条\n2. 所有信号和建议必须基于叙事分析中的证据`)
        : (isSelf
          ? `1. 🎯 **SELF-MODE STRICT RULE**: signals (green/yellow/red), topic_preferences (loves/neutral/avoid), best_communication_times, and expected_next describe **only the user**, not any partner. Each item must answer "this is a pattern/preference/state of the USER".\n2. Signals must come from messages where sender is \`you(Me):\` — NOT from partner messages. If Mom says "take the red packet or I'll be upset", that is Mom's behavior, NOT a user signal.\n3. topic_preferences.loves = topics the user proactively initiates; avoid = topics the user rarely engages with (inferred from me-messages).\n4. best_communication_times = when the user themselves is at their best/tired/happy; advice = what fits the user in that state.\n5. expected_next = the user's likely next topics and actions, not a partner's.\n6. Every conclusion must be grounded in visible sample evidence.`
          : `1. do/dont each 3-5 items\n2. All signals and tips must be grounded in narrative evidence`),

      portrait: zh
        ? (isSelf
          ? `1. character_portrait 至少 300 字,**描述用户(你)本人**的性格画像,不是任何 partner\n2. surprising_contradiction 至少 150 字,描述用户自己的内在矛盾,引用的 2 段对话证据必须从 sender 是 \`你(Me):\` 的消息里选(或对方说的话作为外部反馈证据,但结论必须是关于用户的)\n3. trajectory 必须包含 optimistic/baseline/pessimistic 三个场景,描述**用户自己的人生/成长轨迹**,每个都要有 scenario 和 trigger`
          : `1. character_portrait 至少 300 字\n2. surprising_contradiction 至少 150 字,引用 2 段对话作为证据\n3. trajectory 必须包含 optimistic/baseline/pessimistic 三个场景,每个都要有 scenario 和 trigger`)
        : (isSelf
          ? `1. character_portrait 300+ words about the USER, not any partner. 2. surprising_contradiction 150+ words about user's inner tension, citing 2 dialogue excerpts (from user's own messages preferred; partner quotes allowed as external feedback but conclusions are about the user). 3. trajectory describes the user's own life arc.`
          : `1. character_portrait must be 300+ words\n2. surprising_contradiction must be 150+ words, cite 2 dialogue excerpts\n3. trajectory must contain optimistic/baseline/pessimistic, each with scenario + trigger`),

      wellbeing: zh
        ? (isSelf
          ? `1. health_index 的 monthly_trend 必须恰好 12 个数字 (0-100),反映**用户自己的身心健康/精力状态**随时间变化\n2. health_index.alert 描述用户(你)自己当前状态的提示,不是 partner 的\n3. health_index 必须包含 current_score, alert, monthly_trend 三个字段\n4. 不要输出 compatibility 字段 (self 模式不适用)`
          : `1. compatibility 至少 8 个 MBTI 类型\n2. health_index 的 monthly_trend 必须恰好 12 个数字 (0-100)\n3. health_index 必须包含 current_score, alert, monthly_trend 三个字段`)
        : (isSelf
          ? `1. health_index.alert is about USER's own state, not partner. 2. monthly_trend exactly 12 numbers 0-100 reflecting user's own wellbeing. 3. No compatibility field in self mode.`
          : `1. compatibility must have at least 8 MBTI types\n2. health_index monthly_trend must have exactly 12 numbers (0-100)\n3. health_index must contain current_score, alert, monthly_trend`),

      suggestions: zh
        ? (isSelf
          ? `1. growth_suggestions 必须恰好 6 条(grid-3 × 2 行布局需要),每条是**对用户自己**的成长建议,用"你"称呼\n2. 每条建议必须基于观察到的用户自己的模式,不是对 partner 的建议\n3. 不要输出 gift_suggestions (self 模式不适用)`
          : `1. growth_suggestions 必须恰好 6 条(grid-3 × 2 行布局需要)\n2. gift_suggestions 4-6 条`)
        : (isSelf
          ? `1. Exactly 6 growth_suggestions for the USER, addressed as "you", based on user's own observed patterns. 2. No gift_suggestions in self mode.`
          : `1. growth_suggestions must be EXACTLY 6 (grid-3 × 2 layout)\n2. gift_suggestions 4-6 items`),

      // ── Self-analysis only ──
      relationships: zh
        ? `1. partners 数组必须按 message_count 降序,最多 15 条,至少 5 条(如样本够多)\n2. name 字段必须照搬 partner stats 里的原名(不要翻译、不要改写)\n3. relation_type 只能选给定的枚举值,不要自造\n4. 如果数据不足以判断 relation_type,用 "弱联系" 或 "weak_tie"`
        : `1. partners array sorted by message_count desc, max 15, min 5 (if enough samples)\n2. name must be verbatim from partner stats (no translation)\n3. relation_type must be from the given enum only\n4. Use "weak_tie" when uncertain`,
      identity: zh
        ? `1. 挑选 4-8 个最有 **身份差异** 的 partner,不要覆盖所有人\n2. 每个 mode_label 必须反映真实差异,不要泛泛("好朋友"一类)\n3. common_phrases 必须从 selfContext 的 per-partner 样本里摘原话,不得编造\n4. analysis 用 "你" 称呼,2-3 句`
        : `1. Pick 4-8 partners with the MOST DIVERGENT self-expressions\n2. mode_label must reflect real contrast — not generic labels like "good friend"\n3. common_phrases must be verbatim from the per-partner samples — no fabrication\n4. Write analysis in second person "you", 2-3 sentences`,
      perceived: zh
        ? `1. 只使用 **对方的消息**(samples 里 sender != Me 的那部分) 作为证据,不要用你自己的消息\n2. perception_label 要具体,避免空泛词\n3. evidence 必须摘对方原话,≤60 字 × 2-3 条\n4. analysis 用 "你" 称呼`
        : `1. Evidence MUST come from partner messages (sender != Me), not user's own\n2. perception_label must be specific — avoid vague words\n3. evidence is verbatim from partner, ≤60 chars × 2-3 items\n4. Analysis in second person "you"`,
      growth_arc: zh
        ? `1. phases 必须按年份升序,3-5 段,每段 year_range 不重叠\n2. 分段依据优先级: (a) 消息量显著变化 (b) 话题显著切换 (c) 语气/emoji 显著变化\n3. dominant_themes 摘自当阶段的样本,具体到行为或话题,不要泛泛\n4. summary 用 "你" 称呼,避免自夸和煽情`
        : `1. phases chronological, 3-5 phases, non-overlapping year_range\n2. Split criteria priority: (a) volume shifts (b) topic pivots (c) voice/emoji shifts\n3. dominant_themes grounded in samples — specific behaviors or topics\n4. summary in second person "you", no flattery or melodrama`,
      timeline: zh
        ? `1. 只收录 **明确** 出现在聊天证据里的事件,不要编造\n2. 每条事件必须附一条 evidence 原话(≤80 字)\n3. 8-15 条,按时间升序排列\n4. category 只能选给定枚举;不确定就归到最接近的一个`
        : `1. Only include events CLEARLY present in chat evidence — no fabrication\n2. Every event must have an evidence quote (≤80 chars)\n3. 8-15 events, chronological\n4. category from the given enum only`,
      memories: zh
        ? `1. 10-20 条独特回忆,按时间升序\n2. 不是代表性模式,而是**特殊、难忘、带情绪重量**的瞬间。不要选日常问候类\n3. 每条必须有 2-4 条来自聊天原文的 messages (带 sender 标签和原话)\n4. scene 字段帮读者回忆当时情境,不只是复述消息\n5. analysis 说明这个瞬间为什么独特/值得被记住,1-2 句即可\n6. 只选**能在聊天证据里找到**的瞬间,严禁编造或推断\n7. 🚫 messages[].sender 必须是 "me" 或具体名字(如"张淑云"),**严禁写"对方"或"them"**。scene/analysis 里提到他人也用具体名字。partner 名字列表见上面的 "社交圈概览"\n8. 🚨 内部双引号 " 必须转义成 \\\\" 或改用中文引号「」。title 里出现带引号的词语请使用 「词语」 而不是 "词语",否则破坏 JSON`
        : `1. 10-20 unique memories, chronological\n2. NOT representative patterns — SPECIAL, memorable, emotionally-weighted moments. Skip routine greetings\n3. Each needs 2-4 verbatim messages from chat (with sender label + text)\n4. scene field sets the backdrop — not just a message recap\n5. analysis explains what makes this moment special, 1-2 sentences\n6. Only moments CLEARLY present in chat evidence — no fabrication\n7. 🚫 messages[].sender must be "me" or a specific name (e.g. "Mom") — NEVER "them"/"对方". scene/analysis also use specific names. See partner names in "社交圈概览" block above.\n8. 🚨 Escape inner double quotes as \\\\" or use CJK 「」 in title/scene fields to avoid JSON parse errors.`,
    }
    return reqs[groupId] || ''
  }

  /**
   * Build the prompt for one section group (2-5 related sections).
   * Each prompt is much smaller than the original all-in-one prompt,
   * letting weaker models produce valid JSON per group reliably.
   */
  _buildGroupPrompt(group, name, isSelf, lang, stats, narrativeAnalysis, sampleBlock, artifactBlock) {
    const zh = lang === 'zh'
    const subject = isSelf ? (zh ? '**你**(被分析的用户本人)' : '**you** (the user being analyzed)') : `"${name}"`
    // Self-mode directives: subject guard + voice. The subject guard is the
    // critical piece — without it, multi-partner imports cause the LLM to
    // silently attribute partner traits/quotes to the user.
    const voiceDirective = isSelf
      ? (zh
        ? `\n\n## 🎯 分析对象（最重要,读两遍）\n\n本次分析的**唯一主体**是用户本人,即聊天记录中以 **"你(Me)"** 标签出现的那一方。用户的显示名是 **${name}**。聊天里出现的所有其他人(家人、朋友、同事等)都是"对方",不是分析对象。\n\n每一句分析性结论都必须描述**用户的**特质、模式、价值观、行为。对方的话可以作为证据或信号,但**结论永远回到用户身上**。\n\n### ⚠️ 归属检查(必做)\n\n引用聊天原文作为证据时,**必须看样本里这条消息前面的 sender 标签**:\n- 如果标签是 \`你(Me):\` → 这句话是**你**说的\n- 如果标签是 \`对方:\` 或具体 partner 名(如 \`张淑云:\`) → 这句话是**对方**说的\n\n常见的误判模式:一条"儿子,记得吃药"的消息,如果 sender 是 \`对方\`,那么是**对方(妈妈)对你说的**,表明**你**在对方眼里是需要被提醒的角色;如果 sender 是 \`你(Me)\`,那么是**你**对某人说的,表明**你**是主动关心/照料者的角色。两种情况结论完全相反。\n\n如果之前的叙事分析(narrative)对某条消息的归属有误,你**必须基于样本里的 sender 标签重新归属**,不要盲从 narrative。narrative 是参考,样本的 sender 标签是事实。\n\n### 正反例\n\n❌ 错误: "妈妈经常提醒你吃饭 → 妈妈是关心型的人。"\n(这是在分析妈妈,偏题了)\n\n✅ 正确: "妈妈频繁提醒你吃饭,反映出**你**往往把自己的生活细节让给别人照料,自己不主动管理。"\n(用对方行为作为信号,推断你的特质)\n\n❌ 错误: "老板说 '别多事' — 他重视边界。"\n(分析老板)\n\n✅ 正确: "老板直接跟你说 '别多事',说明**你**有主动介入的习惯,以至于对方需要明确划界。"\n(借对方话语推断你的模式)\n\n每写一句分析句,先问自己: **"我在描述用户,还是在描述对方?"** 如果是对方 → 停下,重新用"对方行为 → 用户特质"的路径写。\n\n特别注意 evidence 引用: 引用的原话可以是你自己的,也可以是对方的;**但结论段落必须是关于你的**。如果全段都在说对方的性格,这段就是错的。\n\n## 🗣 叙事口吻\n\n所有分析性文本用**第二人称"你"**写,像一位观察力敏锐的朋友在对你说话。\n- ✅ "你在压力下容易沉默,但会用行动补偿。"\n- ❌ "用户在压力下会沉默" / "我在压力下容易沉默"\n- 克制、温和、有洞察力。不自夸,不煽情。`
        : `\n\n## 🎯 ANALYSIS SUBJECT (MOST IMPORTANT — read twice)\n\nThe **ONLY subject** of this analysis is the user — the "Me" speaker in the chat records. The user's name is **${name}**. Everyone else appearing in the chat (family, friends, colleagues) is a "partner", NOT an analysis subject.\n\nEvery analytical sentence must describe the **user's** traits, patterns, values, behaviors. Partner messages may serve as evidence or signal, but **conclusions always return to the user**.\n\n### Right vs Wrong\n\n❌ WRONG: "Mom often reminds you to eat → Mom is a caring person."\n(analyzes Mom, off-topic)\n\n✅ RIGHT: "Mom's frequent food reminders reveal that **you** tend to let others manage life details rather than track them yourself."\n(uses partner's behavior as signal, infers user trait)\n\n❌ WRONG: "Boss says 'don't meddle' — he values boundaries."\n(analyzes boss)\n\n✅ RIGHT: "Boss had to explicitly tell you 'don't meddle' — showing **you** have a habit of stepping in enough that partners need to draw hard lines."\n(uses partner quote to infer user pattern)\n\nBefore every analytical sentence, ask: **"Am I describing the user, or the partner?"** If partner — stop, reframe via "partner behavior → user trait".\n\nNote on evidence: quoted messages can be from you OR from partners; **but the conclusion paragraph must always be about you**. If an entire paragraph describes a partner's personality, that paragraph is wrong.\n\n## 🗣 Narrative voice\n\nAll analytical text in **second person "you"** — like a perceptive friend addressing the user directly.\n- ✅ "You tend to go silent under stress but compensate through actions."\n- ❌ "The user goes silent" / "I go silent under stress"\n- Restrained, warm, insightful. No flattery or melodrama.`)
      : ''

    const schemas = this._getSectionSchemas(zh, isSelf)
    const schemaBody = group.keys.map(k => '  ' + schemas[k]).join(',\n\n')
    const schemaStr = '{\n' + schemaBody + '\n}'
    const requirements = this._getGroupRequirements(group.id, zh, isSelf)

    if (zh) {
      return `你是一位性格分析专家。你已经完成了对 ${subject} 的深度叙事分析。现在只需要把叙事分析 + 原始聊天样本转化为 **${group.keys.length} 个 section** 的结构化 JSON 数据(${group.keys.join(', ')})。${voiceDirective}

## 🚨 JSON 输出硬性规则

**必须严格使用 ASCII 标点符号。任何中文标点都会导致 JSON 解析失败。**

| 字符 | ❌ 错误(中文) | ✅ 正确(ASCII) |
|---|---|---|
| 双引号 | \u201C...\u201D | \`"..."\` |
| 冒号 | : | \`:\` |
| 逗号 | , | \`,\` |

字符串**内容**可以包含中文,但 JSON 语法(引号、冒号、逗号、括号)必须全部 ASCII。字符串内容里不能出现裸换行,用 \\n 转义。

**⚠️ Token 节省规则**:中文字符必须原样输出(UTF-8),严禁使用 \\uXXXX unicode 转义。每个 \\uXXXX 占 6 字节而原生字符只占 2-3 字节,转义会让输出膨胀 2-3 倍并触发截断。

---

## 已完成的叙事分析

${narrativeAnalysis}

## 聊天样本

${sampleBlock}

${artifactBlock}

## 数据概况
- 总消息:${stats.total_messages} 条
- 时间跨度:${stats.date_range?.first} — ${stats.date_range?.last}

## 任务

输出**严格的 JSON**,只包含这 ${group.keys.length} 个 section(${group.keys.join(', ')})。不要输出 markdown 代码块标记,不要输出解释——只输出 JSON 对象。

${schemaStr}

## 硬性要求

${requirements}

直接输出 JSON,开头必须是 { :`
    }

    return `You are a character analyst. You've already completed the deep narrative analysis of ${subject}. Now convert that narrative + raw chat samples into structured JSON for **${group.keys.length} sections** (${group.keys.join(', ')}).${voiceDirective}

## 🚨 STRICT JSON OUTPUT RULES

**Use ASCII punctuation ONLY. Any non-ASCII punctuation will break the JSON parser.**

| Symbol | ❌ Wrong | ✅ Correct |
|---|---|---|
| double quote | \u201C \u201D \u00AB \u00BB | \`"..."\` |
| colon | \uFF1A | \`:\` |
| comma | \uFF0C | \`,\` |

String content may contain any Unicode, but JSON syntax must be ASCII only. No raw newlines inside strings — use \\n.

**⚠️ Token conservation**: emit non-ASCII characters (CJK, emoji) as raw UTF-8. Do NOT use \\uXXXX unicode escapes — each escape costs 6 bytes vs 2-3 for raw UTF-8, causing 2-3x output bloat and mid-response truncation.

---

## Completed narrative analysis

${narrativeAnalysis}

## Chat samples

${sampleBlock}

${artifactBlock}

## Data overview
- Total messages: ${stats.total_messages}
- Date range: ${stats.date_range?.first} — ${stats.date_range?.last}

## Task

Output **strict JSON** with only these ${group.keys.length} sections (${group.keys.join(', ')}). No markdown fences, no explanation — just the JSON object.

${schemaStr}

## Hard requirements

${requirements}

Output JSON directly, starting with { :`
  }

  /**
   * Read pre-computed artifacts from the Nuwa import pipeline.
   * Gracefully handles any or all files being missing — returns what exists.
   */
  _readImportArtifacts() {
    const fs = require('fs')
    const agentId = this.targetAgentId
    const result = {
      agent_name: this.targetAgentName,
      imported: false,   // true if any import artifacts found
      speechDna: null,
      nuwaSections: null,
      evidenceIndex: null,
      replyBank: null,
      harness: null,
    }

    // Determine soul file locations — check both system/ and users/
    const soulsDir = path.join(this.dataPath, 'souls')
    let soulType = null
    for (const t of ['system', 'users']) {
      if (fs.existsSync(path.join(soulsDir, t, `${agentId}.md`))) {
        soulType = t
        break
      }
    }

    // 1. Speech DNA
    try {
      for (const t of ['system', 'users']) {
        const speechPath = path.join(soulsDir, t, `${agentId}.speech.json`)
        if (fs.existsSync(speechPath)) {
          result.speechDna = JSON.parse(fs.readFileSync(speechPath, 'utf8'))
          result.imported = true
          break
        }
      }
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] speech.json read error:', err.message)
    }

    // 2. Evidence Index
    try {
      for (const t of ['system', 'users']) {
        const evidencePath = path.join(soulsDir, t, `${agentId}.evidence.json`)
        if (fs.existsSync(evidencePath)) {
          result.evidenceIndex = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
          result.imported = true
          break
        }
      }
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] evidence.json read error:', err.message)
    }

    // 3. Harness validation scores
    try {
      for (const t of ['system', 'users']) {
        const harnessPath = path.join(soulsDir, t, `${agentId}.harness.json`)
        if (fs.existsSync(harnessPath)) {
          result.harness = JSON.parse(fs.readFileSync(harnessPath, 'utf8'))
          result.imported = true
          break
        }
      }
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] harness.json read error:', err.message)
    }

    // 4. Nuwa sections from the soul file (extract only Nuwa-specific sections)
    if (soulType) {
      try {
        const soulPath = path.join(soulsDir, soulType, `${agentId}.md`)
        const content = fs.readFileSync(soulPath, 'utf8')
        const nuwaSectionNames = ['Mental Models', 'Decision Heuristics', 'Values & Anti-Patterns',
          'Relational Genealogy', 'Honest Boundaries', 'Core Tensions', 'Relationship Timeline']
        const sections = {}
        let currentSection = null
        let currentLines = []
        for (const line of content.split('\n')) {
          const m = line.match(/^## (.+)$/)
          if (m) {
            if (currentSection && nuwaSectionNames.includes(currentSection)) {
              sections[currentSection] = currentLines.join('\n').trim()
            }
            currentSection = m[1]
            currentLines = []
          } else if (currentSection) {
            currentLines.push(line)
          }
        }
        if (currentSection && nuwaSectionNames.includes(currentSection)) {
          sections[currentSection] = currentLines.join('\n').trim()
        }
        // Only include if at least one section has real content (not just placeholder)
        const hasSections = Object.values(sections).some(s => s && !s.startsWith('_(none'))
        if (hasSections) {
          result.nuwaSections = sections
          result.imported = true
        }
      } catch (err) {
        logger.warn('[AnalyzeAgentTool] soul file read error:', err.message)
      }
    }

    // 5. Reply Bank metadata
    try {
      const rbMetaPath = path.join(this.memoryDir, 'agents', agentId, 'replybank', 'meta.json')
      if (fs.existsSync(rbMetaPath)) {
        result.replyBank = JSON.parse(fs.readFileSync(rbMetaPath, 'utf8'))
        result.imported = true
      }
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] replybank meta read error:', err.message)
    }

    if (!result.imported) {
      return this._ok(JSON.stringify({
        agent_name: this.targetAgentName,
        imported: false,
        message: 'No import artifacts found for this agent. This agent was likely created manually or via the agent wizard (not imported from chat history). You can still analyze it using action="stats" and action="analyze_all" if chat history has been indexed.',
      }, null, 0), { imported: false })
    }

    // Build a human-readable summary for the LLM
    const summary = []
    if (result.speechDna) {
      const sd = result.speechDna
      summary.push(`Speech DNA: ${(sd.catchphrases || []).length} catchphrases, ${(sd.emoji || []).length} emoji patterns, avg sentence ${sd.sentenceStyle?.avgLength || '?'} chars, ${sd.sentenceStyle?.punctuation || '?'} punctuation`)
    }
    if (result.evidenceIndex) {
      const ei = result.evidenceIndex
      summary.push(`Evidence: ${(ei.claims || []).length} verified claims (${(ei.claims || []).filter(c => c.verdict === 'mental_model').length} mental models, ${(ei.claims || []).filter(c => c.verdict === 'heuristic').length} heuristics), ${ei.rejectedCount || 0} rejected, mode=${ei.mode || '?'}`)
    }
    if (result.replyBank) {
      summary.push(`Reply Bank: ${result.replyBank.pairCount || 0} trigger-reply pairs indexed`)
    }
    if (result.harness) {
      const h = result.harness
      const score = h.score
      summary.push(`Validation: ${score ? `${score.likes}/${score.total} liked (${score.pct}%)` : 'run but not scored'}`)
    }
    if (result.nuwaSections) {
      const filled = Object.entries(result.nuwaSections).filter(([, v]) => v && !v.startsWith('_(none')).map(([k]) => k)
      summary.push(`Nuwa sections populated: ${filled.join(', ')}`)
    }
    result.summary = summary.join('\n')

    logger.agent('[AnalyzeAgentTool] read_import_artifacts', { agentId, imported: true, artifacts: summary.length })
    return this._ok(JSON.stringify(result, null, 0), { imported: true })
  }

  /**
   * Adaptive full-coverage analysis.
   *
   * Path A (< ~5000 msgs): Load ALL messages, give 100% to a single LLM call.
   *   → No sampling, no data loss. ~60 seconds.
   *
   * Path B (> ~5000 msgs): Split into conversation segments (by 30-min silence gaps),
   *   pack segments into chunks that respect model context, run parallel extraction
   *   (each chunk: "record what's noteworthy, don't judge"), then one synthesis call.
   *   → Every message read by LLM, conversation boundaries never split.
   */
  /**
   * Path for the cached analysis JSON.
   * Stored alongside other soul artifacts so it lives with the agent.
   */
  _analysisCachePath() {
    const fs = require('fs')
    const type = this.targetAgentType === 'user' ? 'users' : 'system'
    const dir = path.join(this.dataPath, 'souls', type)
    try { fs.mkdirSync(dir, { recursive: true }) } catch (_) {}
    return path.join(dir, `${this.targetAgentId}.analysis.json`)
  }

  /**
   * Build a cache-invalidation key. If totalMessages OR last message timestamp
   * changes, the cache is stale. This is cheap to compute (stats are fast).
   */
  _cacheKeyFromStats(stats) {
    return {
      totalMessages: stats.total_messages,
      lastTimestamp: stats.date_range?.last || '',
    }
  }

  /**
   * Read cached analysis if it exists and matches the current data fingerprint.
   * Returns { cached, fileSize, filePath } or null.
   */
  _readCachedAnalysis(stats) {
    try {
      const fs = require('fs')
      const p = this._analysisCachePath()
      if (!fs.existsSync(p)) return null
      const stat = fs.statSync(p)
      const cached = JSON.parse(fs.readFileSync(p, 'utf8'))
      const currKey = this._cacheKeyFromStats(stats)
      if (cached.cacheKey?.totalMessages === currKey.totalMessages
          && cached.cacheKey?.lastTimestamp === currKey.lastTimestamp) {
        return { ...cached, cacheFileSize: stat.size, cacheFilePath: p }
      }
      return null
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] cache read failed:', err.message)
      return null
    }
  }

  /**
   * Persist a successful analysis result for next-time reuse.
   */
  _writeCachedAnalysis(stats, resultObject) {
    try {
      const fs = require('fs')
      const payload = {
        ...resultObject,
        cacheKey: this._cacheKeyFromStats(stats),
        cachedAt: new Date().toISOString(),
      }
      fs.writeFileSync(this._analysisCachePath(), JSON.stringify(payload, null, 2), 'utf8')
    } catch (err) {
      logger.warn('[AnalyzeAgentTool] cache write failed (non-fatal):', err.message)
    }
  }

  async _analyzeAll(idx, onUpdate, forceRefresh = false) {
    if (!this.llmConfig) {
      return this._err('LLM config not available for analysis. Falling back: use action="messages" to read pages manually.')
    }

    const { estimateTokens, getContextWindow, _callLLM } = require('../chatImport/personaBuilder')

    const emit = (text) => {
      if (onUpdate) onUpdate({ type: 'progress', text })
    }

    const stats = idx.getStats(this.targetAgentId)
    if (!stats) {
      return this._err(`No imported chat history found for "${this.targetAgentName}".`)
    }

    const isSelf = this.targetAgentType === 'user'
    const name = this.targetAgentName
    const nameSlug = name.replace(/\s+/g, '_')

    // ── Cache check (instant return if data unchanged) ────────────────
    if (!forceRefresh) {
      const cached = this._readCachedAnalysis(stats)
      if (cached) {
        const lang = cached.language || 'en'
        const zhCached = lang === 'zh'
        const sizeKB = (cached.cacheFileSize / 1024).toFixed(1)
        // Use the ACTUAL recorded runtime from the previous run — not a guess.
        // Fall back when old cache has no timing recorded.
        const lastRunSec = cached.lastRunDurationSec
        let savedTimeLabel
        if (typeof lastRunSec === 'number' && lastRunSec > 0) {
          if (lastRunSec < 60) savedTimeLabel = zhCached ? `约 ${lastRunSec} 秒` : `~${lastRunSec}s`
          else if (lastRunSec < 3600) savedTimeLabel = zhCached ? `约 ${Math.round(lastRunSec / 60)} 分钟` : `~${Math.round(lastRunSec / 60)} min`
          else savedTimeLabel = zhCached ? `约 ${(lastRunSec / 3600).toFixed(1)} 小时` : `~${(lastRunSec / 3600).toFixed(1)} h`
        } else {
          savedTimeLabel = zhCached ? '未知（旧缓存未记录耗时）' : 'unknown (old cache without timing)'
        }

        emit(zhCached
          ? `使用缓存结果（${stats.total_messages} 条消息自上次分析以来未变）`
          : `Using cached result (${stats.total_messages} messages unchanged since last analysis)`)
        logger.agent('[AnalyzeAgentTool] cache hit', {
          agentId: this.targetAgentId,
          totalMessages: stats.total_messages,
          cachedAt: cached.cachedAt,
          sizeKB,
          lastRunSec,
        })
        return this._ok(JSON.stringify({
          ...cached,
          cached: true,
          cachedAt: cached.cachedAt,
          cache_info: {
            cached_at: cached.cachedAt,
            file_size_kb: parseFloat(sizeKB),
            file_path: cached.cacheFilePath,
            source_messages: cached.cacheKey?.totalMessages,
            last_message_ts: cached.cacheKey?.lastTimestamp,
            // ACTUAL time from the previous fresh run — use this in user-facing messages
            last_run_duration_sec: lastRunSec || null,
            saved_time_label: savedTimeLabel,
          },
          instructions: zhCached
            ? `分析缓存命中（${sizeKB}KB，${cached.cachedAt}，上次实际跑了 ${savedTimeLabel}）。请告知用户发现了缓存，明确告诉用户重跑大约需要 ${savedTimeLabel}（不要编造时间），询问是否使用缓存或重新分析。如用户选择使用缓存，调用 analyze_agent_history(action="extract_sections") 再调用 render_persona_report({sections, stats}) 生成 HTML 报告。工具会自动生成所有 D 标量和 HTML 片段。不要使用 file_operation。如需强制重跑，传 force_refresh=true。`
            : `Cache hit (${sizeKB}KB, ${cached.cachedAt}, prior run took ${savedTimeLabel}). Tell the user a cached analysis exists and that re-running would take ${savedTimeLabel} (use this exact figure, do not invent). Ask whether to use cache or re-analyze. If cache accepted, call analyze_agent_history(action="extract_sections") then call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and HTML. Do NOT use file_operation. To force re-run, pass force_refresh=true.`,
        }, null, 0), { total: stats.total_messages, cached: true })
      }
    }

    // Start timing the fresh analysis run — stored in cache so next hit
    // can tell the user exactly how long a re-run would take.
    const _runStartMs = Date.now()

    // ── Decide path ────────────────────────────────────────────────────
    const um = this.llmConfig.utilityModel
    const ctxWindow = getContextWindow(um?.model, null)
    // Reserve tokens for: prompt instructions (~2000), output (~8192), safety margin (~500)
    const promptOverhead = 2000
    const outputReserve = 8192
    const availableForMessages = ctxWindow - promptOverhead - outputReserve - 500

    // Estimate total token cost of all messages
    emit('Loading messages...')
    const allMessages = idx.getAllMessages(this.targetAgentId)
    if (!allMessages || allMessages.length === 0) {
      return this._err('No messages found in imported history.')
    }

    const language = this._detectLanguage(allMessages)
    const zh = language === 'zh'

    // Format all messages as text to estimate tokens
    const formatMsg = (m) => {
      const sender = (m.sender === 'Me' || m.sender === 'me') ? 'Me' : name
      const ts = m.timestamp ? `[${m.timestamp}] ` : ''
      return `${ts}${sender}: ${m.content}`
    }
    const allText = allMessages.map(formatMsg).join('\n')
    const totalTokens = estimateTokens(allText)

    logger.agent('[AnalyzeAgentTool] analyze_all', {
      agentId: this.targetAgentId,
      totalMessages: allMessages.length,
      estimatedTokens: totalTokens,
      contextWindow: ctxWindow,
      availableForMessages,
    })

    // ── Load import artifacts for both paths ───────────────────────────
    let artifactBlock = ''
    try {
      const fs = require('fs')
      const soulsDir = path.join(this.dataPath, 'souls')
      for (const t of ['system', 'users']) {
        const sp = path.join(soulsDir, t, `${this.targetAgentId}.speech.json`)
        if (fs.existsSync(sp)) {
          const sd = JSON.parse(fs.readFileSync(sp, 'utf8'))
          artifactBlock += `\n\nSpeech DNA: catchphrases=[${(sd.catchphrases||[]).map(c=>c.phrase||c).join(', ')}], emoji=[${(sd.emoji||[]).map(e=>e.char).join('')}], avg_len=${sd.sentenceStyle?.avgLength}, punctuation=${sd.sentenceStyle?.punctuation}, reply_latency=${sd.replyTiming?.medianLatencySec}s`
          if (sd.conventions?.callsYou?.length) artifactBlock += `, calls_user=[${sd.conventions.callsYou.join(', ')}]`
          break
        }
      }
      for (const t of ['system', 'users']) {
        const ep = path.join(soulsDir, t, `${this.targetAgentId}.evidence.json`)
        if (fs.existsSync(ep)) {
          const ei = JSON.parse(fs.readFileSync(ep, 'utf8'))
          const topClaims = (ei.claims||[]).slice(0, 8).map(c => c.claim).join('; ')
          if (topClaims) artifactBlock += `\nVerified claims: ${topClaims}`
          break
        }
      }
    } catch (_) {}

    // ── Build the narrative analysis prompt ─────────────────────────────
    const buildNarrativePrompt = (messagesText, msgCount, isPartial) => {
      const taskSection = isPartial
        ? (zh
          ? `## 任务\n读这段对话记录，列出所有值得注意的观察。\n\n对每个观察，保留原文引用。分类记录：\n- 关键对话片段（保留原文 + 标注情感含义）\n- 情绪转折点（前后对比）\n- 表达关心/不满/脆弱/幽默的方式\n- 沉默和时间间隔的含义\n- 关系变化信号\n- 话题兴趣信号\n\n不要下性格结论，只记录观察。每条观察引用原文。`
          : `## Task\nRead this conversation and list all noteworthy observations.\n\nFor each observation, include the original quote. Categorize:\n- Key dialogue moments (with original text + emotional meaning)\n- Emotional turning points (before/after contrast)\n- How they express care/displeasure/vulnerability/humor\n- Meaning of silences and time gaps\n- Relationship change signals\n- Topic/interest signals\n\nDo NOT draw personality conclusions. Only record observations with quotes.`)
        : (zh
          ? `## 分析任务\n\n你是一位深谙人性的传记作者。你的任务不是给人贴标签，而是让读者"认识"这个人。\n\n**用故事和具体对话让读者认识 ${name}，不要按维度打分。**\n\n### 必须回答：\n\n1. **${name}是谁？** 用一个场景开头，不是标签。让读者 50 字内"见到"这个人。\n\n2. **TA 怎么表达关心？** 引用具体对话。TA 不说"我在乎你"——用什么替代？\n\n3. **TA 说话为什么这样？** 短/长、有无 emoji、什么语气——背后是性格、安全感、还是文化？用对话证据。\n\n4. **什么话题让 TA "亮"了？** 对比日常和兴奋时的消息长度/密度变化。\n\n5. **你们的关系怎么变的？** 哪个片段是转折点？用前后对比证明。\n\n6. **TA 最让人意外的矛盾？** 每个真实的人都有——找到它，展开。\n\n7. **TA 不谈什么？** 空白说明了 TA 还是你们的关系？\n\n8. **一句话概括？** 不是 MBTI，是"TA 就是那种……的人"。\n\n### 附录（最后 200 字以内）：\n- OCEAN 倾向（偏高/中等/偏低）\n- MBTI 可能类型 + 置信度\n- 依恋类型倾向`
          : `## Analysis Task\n\nYou are a biographer who understands human nature. Your job is not to label a person, but to make the reader KNOW them.\n\n**Use stories and real dialogue to introduce ${name}. Do not score dimensions.**\n\n### Must answer:\n\n1. **Who is ${name}?** Open with a scene, not a label. The reader should "see" this person in 50 words.\n\n2. **How do they show they care?** Quote real dialogue. They never say "I care about you" — what's the substitute?\n\n3. **Why do they talk like that?** Short/long, emoji or not, what tone — is it personality, security, or culture? Evidence.\n\n4. **What topic makes them light up?** Compare daily brevity vs excited message density.\n\n5. **How did your relationship change?** Which moment was the turning point? Show before/after.\n\n6. **Most surprising contradiction?** Every real person has one — find it, unpack it.\n\n7. **What don't they talk about?** Do the blanks say something about them or about you two?\n\n8. **One sentence to describe them?** Not MBTI — "They're the kind of person who..."\n\n### Appendix (under 200 words):\n- OCEAN tendencies (high/medium/low)\n- Likely MBTI + confidence\n- Attachment style tendency`)

      const statsLine = zh
        ? `数据概况：${msgCount} 条消息，时间 ${stats.date_range?.first || '?'} — ${stats.date_range?.last || '?'}${artifactBlock}`
        : `Data: ${msgCount} messages, ${stats.date_range?.first || '?'} — ${stats.date_range?.last || '?'}${artifactBlock}`

      return `${statsLine}\n\n## ${zh ? '完整对话记录' : 'Full Conversation'}\n\n${messagesText}\n\n${taskSection}`
    }

    // ══════════════════════════════════════════════════════════════════════
    // PATH A: Full context — all messages fit in one call
    // ══════════════════════════════════════════════════════════════════════
    if (totalTokens <= availableForMessages * 0.85) {
      emit(zh ? `全量模式：${allMessages.length} 条消息一次性给 AI 分析...` : `Full mode: sending all ${allMessages.length} messages to AI...`)
      logger.agent('[AnalyzeAgentTool] Path A: full context', { messages: allMessages.length, tokens: totalTokens })

      const prompt = buildNarrativePrompt(allText, allMessages.length, false)
      let analysis = ''
      try {
        analysis = await _callLLM(prompt, this.llmConfig, outputReserve)
      } catch (err) {
        logger.error('[AnalyzeAgentTool] Path A LLM failed:', err.message)
        return this._err(`Analysis failed: ${err.message}`)
      }

      if (!analysis?.trim()) return this._err('AI returned empty analysis.')

      emit(zh ? '分析完成' : 'Analysis complete')
      const durationSec = Math.round((Date.now() - _runStartMs) / 1000)
      const resultA = {
        analysis_mode: isSelf ? 'self' : 'other',
        path: 'full_context',
        analysis,
        total_messages: allMessages.length,
        messages_read_by_llm: allMessages.length,
        language,
        lastRunDurationSec: durationSec,
        instructions: zh
          ? `分析完成，耗时 ${durationSec} 秒。AI 读取了全部 ${allMessages.length} 条消息（零采样）。下一步：调用 analyze_agent_history(action="extract_sections") 生成结构化数据，然后调用 render_persona_report({sections, stats}) 生成 HTML 报告。工具会自动生成所有 D 标量和 HTML 片段。不要使用 file_operation。`
          : `Analysis complete in ${durationSec}s. AI read all ${allMessages.length} messages (zero sampling). Next: call analyze_agent_history(action="extract_sections") to produce structured data, then call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and HTML. Do NOT use file_operation.`,
        suggested_output_path: path.join(this.aidocPath, `${nameSlug}_analysis.md`),
        suggested_html_path: path.join(this.aidocPath, `${nameSlug}_dashboard.html`),
      }
      this._writeCachedAnalysis(stats, resultA)
      return this._ok(JSON.stringify(resultA, null, 0), { total: allMessages.length, path: 'full_context', durationSec })
    }

    // ══════════════════════════════════════════════════════════════════════
    // PATH B: Context-window-driven chunking — too large for one call
    //
    // Algorithm: fill each chunk to ~85% of context budget by walking messages
    // forward. When a chunk is nearly full, look backward within the last 15%
    // for a natural conversation gap (>30 min silence). If found, break there
    // (clean boundary). If not found, break at current position (no data loss).
    //
    // This produces a predictable number of chunks (total_tokens / budget),
    // never splits mid-conversation when avoidable, and never truncates data.
    // ══════════════════════════════════════════════════════════════════════
    const GAP_THRESHOLD_MS = 30 * 60 * 1000  // 30 minutes = conversation boundary
    const chunkBudget = Math.floor((availableForMessages - 800) * 0.85)
    const expectedChunks = Math.ceil(totalTokens / chunkBudget)

    emit(zh
      ? `分块分析模式：${allMessages.length} 条消息将分成约 ${expectedChunks} 块（每块 ≤${Math.round(chunkBudget / 1000)}k tokens）...`
      : `Chunk mode: ${allMessages.length} messages → ~${expectedChunks} chunks (≤${Math.round(chunkBudget / 1000)}k tokens each)...`)

    // Pre-compute per-message formatted text + tokens + timestamp (one pass)
    const msgLines = allMessages.map(m => formatMsg(m))
    const msgTokens = msgLines.map(line => estimateTokens(line + '\n'))
    const msgTimestamps = allMessages.map(m => {
      if (!m.timestamp) return 0
      const d = new Date(m.timestamp)
      return isNaN(d.getTime()) ? 0 : d.getTime()
    })

    // Build chunks by forward-filling
    const chunks = []
    let ci = 0  // current message index

    while (ci < allMessages.length) {
      const chunkStartIdx = ci
      let tokensUsed = 0

      // Fill forward until budget is ~85% full
      while (ci < allMessages.length && tokensUsed + msgTokens[ci] <= chunkBudget) {
        tokensUsed += msgTokens[ci]
        ci++
      }

      if (ci === chunkStartIdx) {
        // Single message exceeds budget — include it anyway (don't lose data)
        ci++
      }

      // Look backward in the last 15% of the chunk for a natural gap (>30 min)
      const chunkLen = ci - chunkStartIdx
      const searchStart = Math.max(chunkStartIdx + 1, ci - Math.floor(chunkLen * 0.15))
      let bestBreak = ci  // default: break at current position

      if (ci < allMessages.length) {
        // Only search for a gap if we're not at the end
        for (let bi = ci - 1; bi >= searchStart; bi--) {
          const tsA = msgTimestamps[bi]
          const tsB = msgTimestamps[bi + 1] || 0
          if (tsA > 0 && tsB > 0 && (tsB - tsA) > GAP_THRESHOLD_MS) {
            bestBreak = bi + 1  // break AFTER the gap
            break
          }
        }
      }

      // If we found a better break point, adjust
      if (bestBreak < ci && bestBreak > chunkStartIdx) {
        ci = bestBreak
      }

      // Build chunk text
      const chunkLines = msgLines.slice(chunkStartIdx, ci)
      const chunkMsgCount = ci - chunkStartIdx
      chunks.push({
        text: chunkLines.join('\n'),
        msgCount: chunkMsgCount,
        startIdx: chunkStartIdx,
        endIdx: ci - 1,
      })
    }

    logger.agent('[AnalyzeAgentTool] Path B: context-window chunking', {
      messages: allMessages.length,
      chunks: chunks.length,
      avgMsgsPerChunk: Math.round(allMessages.length / chunks.length),
      budgetPerChunk: chunkBudget,
    })

    // ── Stage 1: Parallel extraction (observations only, no conclusions) ──
    emit(zh ? `阶段 1/2：${chunks.length} 个对话块并行提取观察...` : `Stage 1/2: extracting observations from ${chunks.length} chunks...`)

    const CONCURRENCY = 5
    const observations = []
    let completed = 0

    for (let ci = 0; ci < chunks.length; ci += CONCURRENCY) {
      const batch = chunks.slice(ci, Math.min(ci + CONCURRENCY, chunks.length))
      const results = await Promise.all(
        batch.map(async (chunk, j) => {
          const idx2 = ci + j
          try {
            const prompt = buildNarrativePrompt(chunk.text, chunk.msgCount, true)
            const obs = await _callLLM(prompt, this.llmConfig, 4096)
            return { success: true, text: obs, msgCount: chunk.msgCount }
          } catch (err) {
            logger.warn(`[AnalyzeAgentTool] chunk ${idx2} extraction failed:`, err.message)
            return { success: false }
          }
        })
      )
      for (const r of results) {
        if (r.success && r.text?.trim()) observations.push(r.text)
        completed++
      }
      const pct = Math.round((completed / chunks.length) * 70)
      emit(zh ? `阶段 1/2：已完成 ${completed}/${chunks.length} 块...` : `Stage 1/2: ${completed}/${chunks.length} chunks done...`)
    }

    if (observations.length === 0) {
      return this._err('All chunk extractions returned empty.')
    }

    // ── Stage 2: Synthesis — one call with all observations ─────────────
    emit(zh ? `阶段 2/2：合成最终分析（${observations.length} 份观察）...` : `Stage 2/2: synthesizing final analysis (${observations.length} observation sets)...`)

    const obsBlock = observations.map((o, i) => `### ${zh ? '观察' : 'Observations'} ${i + 1}\n${o}`).join('\n\n')
    const synthesisPrompt = buildNarrativePrompt(obsBlock, allMessages.length, false)
      .replace(zh ? '## 完整对话记录' : '## Full Conversation', zh ? '## 全量对话观察（由 AI 从全部消息中提取）' : '## Full Observations (extracted by AI from all messages)')

    let analysis = ''
    try {
      analysis = await _callLLM(synthesisPrompt, this.llmConfig, outputReserve)
    } catch (err) {
      logger.error('[AnalyzeAgentTool] synthesis LLM failed:', err.message)
      return this._err(`Synthesis failed: ${err.message}`)
    }

    if (!analysis?.trim()) return this._err('AI returned empty synthesis.')

    emit(zh ? '分析完成' : 'Analysis complete')
    const durationSec = Math.round((Date.now() - _runStartMs) / 1000)
    const resultB = {
      analysis_mode: isSelf ? 'self' : 'other',
      path: 'segment_chunking',
      analysis,
      total_messages: allMessages.length,
      messages_read_by_llm: allMessages.length,
      chunks_used: chunks.length,
      observations_collected: observations.length,
      language,
      lastRunDurationSec: durationSec,
      instructions: zh
        ? `分析完成，耗时 ${durationSec} 秒（${Math.round(durationSec / 60)} 分钟）。AI 通过 ${chunks.length} 个对话块读取了全部 ${allMessages.length} 条消息。下一步：调用 analyze_agent_history(action="extract_sections") 生成结构化数据，然后调用 render_persona_report({sections, stats}) 生成 HTML 报告。工具会自动生成所有 D 标量和 HTML 片段。不要使用 file_operation。`
        : `Analysis complete in ${durationSec}s (${Math.round(durationSec / 60)}min). AI read all ${allMessages.length} messages via ${chunks.length} chunks. Next: call analyze_agent_history(action="extract_sections") to produce structured data, then call render_persona_report({sections, stats}) — the tool auto-generates all D scalars and HTML. Do NOT use file_operation.`,
      suggested_output_path: path.join(this.aidocPath, `${nameSlug}_analysis.md`),
      suggested_html_path: path.join(this.aidocPath, `${nameSlug}_dashboard.html`),
    }
    this._writeCachedAnalysis(stats, resultB)
    return this._ok(JSON.stringify(resultB, null, 0), { total: allMessages.length, path: 'segment_chunking', chunks: chunks.length, durationSec })
  }

  /**
   * Build a chunk analysis prompt for parallel processing.
   */
  _buildAnalysisChunkPrompt(profile, messageBlock, chunkIdx, totalChunks, analyzeTarget, language) {
    const name = profile.name || 'Unknown'
    const isSelf = analyzeTarget === 'self'
    const zh = language === 'zh'

    const targetDesc = isSelf
      ? (zh ? `分析标记为 "Me" 的消息（第 ${chunkIdx + 1}/${totalChunks} 块），提取自我性格特征。`
           : `Analyze messages from "Me" (chunk ${chunkIdx + 1} of ${totalChunks}). Focus on "Me"'s personality and communication patterns.`)
      : (zh ? `分析 ${name} 的消息（第 ${chunkIdx + 1}/${totalChunks} 块），提取性格特征。`
           : `Analyze messages about ${name} (chunk ${chunkIdx + 1} of ${totalChunks}). Focus on their personality and communication patterns.`)

    const subjectLabel = isSelf ? (zh ? '"Me"' : '"Me"') : (zh ? `"${name}"` : `"${name}"`)
    const lang = zh ? 'Chinese (Simplified)' : 'English'

    return `You are analyzing chat messages for a comprehensive character analysis report.

${targetDesc}

Extract observations about ${subjectLabel} for EACH category. Be specific, quote actual messages when possible. Output in ${lang}.

1. **Personality Traits**: core personality patterns, strengths, weaknesses
2. **MBTI Indicators**: evidence for extraversion/introversion, sensing/intuition, thinking/feeling, judging/perceiving
3. **Communication Style**: tone, vocabulary, emoji usage, message length, formality, humor
4. **Emotional Patterns**: how they express emotions, stress responses, conflict style
5. **Topics & Interests**: recurring topics, expertise areas, things they care about
6. **Notable Quotes**: 3-5 most characteristic messages that capture their personality

Output your observations as structured notes. Do NOT generate a full report — just observations.

---
## MESSAGES (chunk ${chunkIdx + 1}/${totalChunks})
${messageBlock}`
  }

  /**
   * Detect primary language from message content.
   */
  _detectLanguage(messages) {
    const sample = messages.slice(0, 50).map(m => m.content || '').join('')
    let cjk = 0
    for (const ch of sample) {
      const code = ch.codePointAt(0)
      if ((code >= 0x2E80 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF)
          || (code >= 0x20000 && code <= 0x2FA1F)) cjk++
    }
    return cjk > sample.length * 0.3 ? 'zh' : 'en'
  }
}

module.exports = { AnalyzeAgentTool }
