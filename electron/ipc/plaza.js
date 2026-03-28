/**
 * IPC handlers for Plaza (multi-agent discussion arena).
 * Channels: plaza:*
 */
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { ipcMain } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { accumulateUtilityUsage } = require('../ipc/store')

function register() {
  ipcMain.handle('plaza:get-topics', async () => ds.readJSONAsync(ds.paths().PLAZA_TOPICS_FILE, []))

  ipcMain.handle('plaza:save-topics', async (_, data) => {
    try {
      await ds.writeJSONAtomic(ds.paths().PLAZA_TOPICS_FILE, data)
      return true
    } catch (err) {
      logger.error('plaza:save-topics error', err.message)
      return false
    }
  })

  ipcMain.handle('plaza:get-sessions', async (_, topicId) => {
    try {
      const dir = path.join(ds.paths().PLAZA_SESSIONS_DIR, topicId)
      if (!fs.existsSync(dir)) return []
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
      const sessions = []
      for (const f of files) {
        const s = await ds.readJSONAsync(path.join(dir, f), null)
        if (s) sessions.push(s)
      }
      return sessions
    } catch (err) {
      logger.error('plaza:get-sessions error', err.message)
      return []
    }
  })

  ipcMain.handle('plaza:save-session', async (_, session) => {
    try {
      const dir = path.join(ds.paths().PLAZA_SESSIONS_DIR, session.topicId)
      fs.mkdirSync(dir, { recursive: true })
      await ds.writeJSONAtomic(path.join(dir, `${session.id}.json`), session)
      return true
    } catch (err) {
      logger.error('plaza:save-session error', err.message)
      return false
    }
  })

  ipcMain.handle('plaza:get-session-by-id', async (_, sessionId) => {
    try {
      const { PLAZA_SESSIONS_DIR } = ds.paths()
      if (!fs.existsSync(PLAZA_SESSIONS_DIR)) return null
      const dirs = fs.readdirSync(PLAZA_SESSIONS_DIR, { withFileTypes: true }).filter(x => x.isDirectory())
      for (const d of dirs) {
        const file = path.join(PLAZA_SESSIONS_DIR, d.name, `${sessionId}.json`)
        if (fs.existsSync(file)) return ds.readJSONAsync(file, null)
      }
      return null
    } catch (err) {
      logger.error('plaza:get-session-by-id error', err.message)
      return null
    }
  })

  // Utility model: generate 10 debate topics
  ipcMain.handle('plaza:generate-topics', async (_, { config, language }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) {
        return { success: false, error: 'Utility model not configured.' }
      }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) {
        return { success: false, error: `Provider "${um.provider}" missing apiKey or baseURL.` }
      }
      const lang = language === 'zh' ? 'Chinese (Simplified)' : 'English'
      const langExample = language === 'zh'
        ? '[{"title":"时间旅行悖论能被解决吗？","description":"探讨祖父悖论、因果循环等时间旅行难题是否存在合理的解决方案。"}]'
        : '[{"title":"Can time travel paradoxes be resolved?","description":"Exploring whether paradoxes like the grandfather problem have coherent solutions."}]'
      const prompt = `Generate exactly 10 creative and surprising debate topics for a multi-agent discussion arena.
Topics MUST be imaginative, thought-provoking, and span wildly different domains. Do NOT focus on AI or technology — be creative!
Include topics from: philosophy, history, mythology, food & culture, space, biology, psychology, art, music, sports, literature, hypothetical scenarios, moral dilemmas, everyday life paradoxes, weird science, and "what if" thought experiments.
Each topic should spark genuine disagreement and interesting arguments from different perspectives.
Topics must be non-political, non-discriminatory, and suitable for intellectual fun.
All titles and descriptions MUST be written in ${lang}.

Return ONLY a JSON array with objects containing "title" (short, max 60 chars) and "description" (1-2 sentences, max 150 chars).
Example: ${langExample}`

      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
      let text
      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = {
          openaiApiKey: providerCfg.apiKey,
          openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
          customModel: um.model,
          _resolvedProvider: 'openai',
          defaultProvider: 'openai',
          ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
          provider: { type: um.provider },
        }
        const oaiClient = new OpenAIClient(cfg)
        const response = await oaiClient.getClient().chat.completions.create({
          model: um.model, ...oaiClient.tokenLimit(2048),
          messages: [{ role: 'user', content: prompt }],
        })
        text = response.choices?.[0]?.message?.content || ''
        accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      } else {
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
        const client = new AnthropicClient(cfg).getClient()
        const response = await client.messages.create({
          model: um.model, max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        })
        text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      }
      // Parse JSON from response (handle markdown code fences)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return { success: false, error: 'Failed to parse topics from AI response.' }
      const topics = JSON.parse(jsonMatch[0])
      return { success: true, topics }
    } catch (err) {
      logger.error('plaza:generate-topics error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Utility model: description -> single topic
  ipcMain.handle('plaza:generate-from-desc', async (_, { description, config }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: false, error: 'Utility model not configured.' }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return { success: false, error: `Provider "${um.provider}" missing credentials.` }

      const prompt = `Given this description of a debate topic idea: "${description}"

Create a well-formed debate topic. IMPORTANT: Write the title and description in the SAME LANGUAGE as the user's input above. If the input is in Chinese, respond in Chinese. If in English, respond in English. Match the language exactly.

Return ONLY a JSON object with:
- "title": concise debate topic title (max 60 chars, same language as input)
- "description": 1-2 sentence description (max 150 chars, same language as input)

Example (English input): {"title":"Can machines truly think?","description":"Examining whether artificial intelligence possesses genuine consciousness or merely simulates it."}
Example (Chinese input): {"title":"机器真的能思考吗？","description":"探讨人工智能是否具有真正的意识，还是仅仅模拟思考的过程。"}`

      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
      let text
      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = {
          openaiApiKey: providerCfg.apiKey,
          openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''),
          customModel: um.model, _resolvedProvider: 'openai', defaultProvider: 'openai',
          ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}),
          provider: { type: um.provider },
        }
        const oaiClient = new OpenAIClient(cfg)
        const response = await oaiClient.getClient().chat.completions.create({
          model: um.model, ...oaiClient.tokenLimit(512),
          messages: [{ role: 'user', content: prompt }],
        })
        text = response.choices?.[0]?.message?.content || ''
        accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      } else {
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
        const client = new AnthropicClient(cfg).getClient()
        const response = await client.messages.create({
          model: um.model, max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        })
        text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { success: false, error: 'Failed to parse topic from AI response.' }
      const result = JSON.parse(jsonMatch[0])
      return { success: true, title: result.title, description: result.description }
    } catch (err) {
      logger.error('plaza:generate-from-desc error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Surprise me: always generate a new topic + select 2-5 random agents
  ipcMain.handle('plaza:surprise-me', async (_, { config, language }) => {
    try {
      const agentsData = await ds.readJSONAsync(ds.paths().AGENTS_FILE, { categories: [], agents: [] })
      const systemAgents = (agentsData.agents || []).filter(a => a.type === 'system')
      if (systemAgents.length < 2) return { success: false, error: 'Need at least 2 system agents for a discussion.' }

      // Always generate a fresh topic via utility model
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: false, error: 'Utility model not configured.' }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return { success: false, error: `Provider "${um.provider}" missing credentials.` }

      const lang = language === 'zh' ? 'Chinese (Simplified)' : 'English'
      const langExample = language === 'zh'
        ? '{"title":"如果动物能投票，世界会怎样？","description":"探讨动物拥有投票权后的社会变化和荒诞后果。"}'
        : '{"title":"What if animals could vote?","description":"Exploring the absurd consequences of granting animals democratic rights."}'
      const prompt = `Generate 1 creative, surprising, and thought-provoking debate topic.
It should NOT be about AI, technology, or politics. Be wildly creative — think philosophy, mythology, hypothetical scenarios, moral dilemmas, food culture, art, weird science, "what if" thought experiments, etc.
All text MUST be written in ${lang}.
Return ONLY a JSON object: {"title":"... (max 60 chars)","description":"... (1-2 sentences, max 150 chars)"}
Example: ${langExample}`

      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
      let text
      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = { openaiApiKey: providerCfg.apiKey, openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model, _resolvedProvider: 'openai', defaultProvider: 'openai', ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}), provider: { type: um.provider } }
        const oaiClient = new OpenAIClient(cfg)
        const response = await oaiClient.getClient().chat.completions.create({ model: um.model, ...oaiClient.tokenLimit(512), messages: [{ role: 'user', content: prompt }] })
        text = response.choices?.[0]?.message?.content || ''
        accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      } else {
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
        const client = new AnthropicClient(cfg).getClient()
        const response = await client.messages.create({ model: um.model, max_tokens: 512, messages: [{ role: 'user', content: prompt }] })
        text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      }
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return { success: false, error: 'Could not generate a surprise topic.' }
      const res = JSON.parse(match[0])
      const topic = { id: uuidv4(), title: res.title, description: res.description, isBuiltin: false, createdAt: Date.now(), lastSessionId: null, lastSessionStatus: 'idle' }

      // Pick 2-5 random agents
      const count = Math.min(systemAgents.length, 2 + Math.floor(Math.random() * 4))
      const shuffled = [...systemAgents].sort(() => Math.random() - 0.5)
      const agentIds = shuffled.slice(0, count).map(a => a.id)
      return { success: true, topic, agentIds }
    } catch (err) {
      logger.error('plaza:surprise-me error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Run a single discussion round
  ipcMain.handle('plaza:run-discussion-round', async (event, { topicId, sessionId, config }) => {
    try {
      const { PLAZA_SESSIONS_DIR, PLAZA_TOPICS_FILE, AGENTS_FILE, SOULS_DIR, DATA_DIR } = ds.paths()
      const sessionFile = (() => {
        const dir = path.join(PLAZA_SESSIONS_DIR, topicId)
        return path.join(dir, `${sessionId}.json`)
      })()
      let session = await ds.readJSONAsync(sessionFile, null)
      if (!session) return { success: false, error: 'Session not found.' }

      const topics = await ds.readJSONAsync(PLAZA_TOPICS_FILE, [])
      const topic = topics.find(t => t.id === topicId)
      if (!topic) return { success: false, error: 'Topic not found.' }

      const agentsData = await ds.readJSONAsync(AGENTS_FILE, { categories: [], agents: [] })
      const allAgents = agentsData.agents || []
      const sessionAgents = session.agentIds.map(id => allAgents.find(a => a.id === id)).filter(Boolean)
      if (sessionAgents.length < 2) return { success: false, error: 'Not enough agents found.' }

      // Determine next speaker
      let nextSpeaker
      if (session.currentRound === 0) {
        nextSpeaker = sessionAgents[Math.floor(Math.random() * sessionAgents.length)]
      } else {
        // Check for @mentions in last message
        const lastMsg = session.messages[session.messages.length - 1]
        if (lastMsg) {
          const mentionedAgent = sessionAgents.find(a => a.id !== lastMsg.agentId && lastMsg.content && lastMsg.content.includes(`@${a.name}`))
          if (mentionedAgent) {
            nextSpeaker = mentionedAgent
          } else {
            // Round-robin: pick the next agent who didn't speak last
            const lastIdx = sessionAgents.findIndex(a => a.id === lastMsg.agentId)
            nextSpeaker = sessionAgents[(lastIdx + 1) % sessionAgents.length]
          }
        } else {
          nextSpeaker = sessionAgents[0]
        }
      }

      // Build system prompt
      const otherNames = sessionAgents.filter(a => a.id !== nextSpeaker.id).map(a => a.name)
      const plazaPromptAddon = nextSpeaker.plazaStyle?.debatePrompt || ''
      const sessionLang = session.language === 'zh' ? 'Chinese (Simplified)' : 'English'
      const systemPrompt = [
        nextSpeaker.prompt || '',
        plazaPromptAddon,
        `\n\nYou are in a Plaza discussion. Topic: "${topic.title}"`,
        topic.description ? `\n${topic.description}` : '',
        `\nOther participants: ${otherNames.join(', ')}`,
        '\nKeep responses focused and under 200 words. You may address another participant with @TheirName to direct the conversation.',
        `\nIMPORTANT: You MUST respond entirely in ${sessionLang}. All your text must be in ${sessionLang}.`,
        `\nThis is round ${session.currentRound + 1} of ${session.maxRounds}.`,
      ].join('')

      // Build messages array
      const messages = session.messages.map(m => ({
        role: m.agentId === nextSpeaker.id ? 'assistant' : 'user',
        content: `[${m.agentName}]: ${m.content}`,
      }))
      if (messages.length === 0) {
        messages.push({ role: 'user', content: `The discussion topic is: "${topic.title}" — ${topic.description || ''}. Please share your opening thoughts.` })
      }

      // Build agent config
      const { AgentLoop } = require('../agent/agentLoop')
      const globalCfg = { ...config }
      delete globalCfg.apiKey; delete globalCfg.baseURL
      delete globalCfg.openaiApiKey; delete globalCfg.openaiBaseURL
      delete globalCfg._directAuth; delete globalCfg._resolvedProvider

      // Get provider from new providers array or legacy config
      const providerId = nextSpeaker.providerId || config.defaultProvider || 'anthropic'

      // Try to find provider in new providers array first
      let providerConfig = null
      if (config.providers && Array.isArray(config.providers)) {
        // If providerId looks like a UUID, find by id; otherwise find by type
        providerConfig = config.providers.find(p =>
          p.id === providerId || p.type === providerId
        )
      }

      if (providerConfig) {
        // Use new providers array config
        const isOpenAI = providerConfig.type === 'openai' || providerConfig.type === 'openai_official' || providerConfig.type === 'deepseek' || providerConfig.type === 'minimax'

        globalCfg.provider = {
          id: providerConfig.id,
          type: providerConfig.type,
          name: providerConfig.name,
          baseURL: providerConfig.baseURL,
          apiKey: providerConfig.apiKey,
          model: nextSpeaker.modelId || providerConfig.model || '',
          settings: providerConfig.settings || {},
        }

        if (isOpenAI) {
          globalCfg._resolvedProvider = 'openai'
          globalCfg.defaultProvider = 'openai'
          globalCfg._directAuth = (providerConfig.type === 'openai_official' || providerConfig.type === 'deepseek' || providerConfig.type === 'minimax')
        } else {
          globalCfg.defaultProvider = providerConfig.type
          globalCfg._resolvedProvider = providerConfig.type
        }
      } else {
        // Fallback to legacy config structure
        const provider = providerId
        if (provider === 'anthropic') {
          globalCfg.apiKey  = config.anthropic?.apiKey  || ''
          globalCfg.baseURL = config.anthropic?.baseURL || ''
        } else if (provider === 'openrouter') {
          globalCfg.apiKey  = config.openrouter?.apiKey  || ''
          globalCfg.baseURL = config.openrouter?.baseURL || ''
        } else if (provider === 'openai') {
          globalCfg.openaiApiKey  = config.openai?.apiKey  || ''
          globalCfg.openaiBaseURL = config.openai?.baseURL || ''
          globalCfg._resolvedProvider = 'openai'
          globalCfg.defaultProvider   = 'openai'
        } else if (provider === 'deepseek') {
          globalCfg.openaiApiKey  = config.deepseek?.apiKey  || ''
          globalCfg.openaiBaseURL = (config.deepseek?.baseURL || '').replace(/\/+$/, '')
          globalCfg._resolvedProvider = 'openai'
          globalCfg._directAuth       = true
          globalCfg.defaultProvider   = 'openai'
        }
      }

      globalCfg.soulsDir      = SOULS_DIR
      globalCfg.dataPath      = DATA_DIR
      globalCfg.artifactPath  = ''
      globalCfg.skillsPath    = ''
      globalCfg.DoCPath       = ''
      globalCfg.chatPermissionMode = 'allow_all'
      globalCfg.chatAllowList = []

      let fullText = ''
      const enableTools = session.agentToolPermissions?.[nextSpeaker.id] === true
      const loop = new AgentLoop({ ...globalCfg })
      await loop.run(
        messages,
        enableTools ? sessionAgents : [],
        [],
        (chunk) => {
          if (chunk.type === 'text' && chunk.text) {
            fullText += chunk.text
            event.sender.send('plaza:chunk', { sessionId, agentId: nextSpeaker.id, agentName: nextSpeaker.name, chunk })
          }
        },
        null,
        {
          systemAgentPrompt: systemPrompt,
          systemAgentId: nextSpeaker.id,
          userAgentId: '__plaza__',
          groupChatContext: {
            agentName: nextSpeaker.name,
            agentDescription: nextSpeaker.description || '',
            otherParticipants: otherNames,
          },
        },
        [],
        [],
        null
      )

      // Append message to session
      session.messages.push({
        id: uuidv4(),
        agentId: nextSpeaker.id,
        agentName: nextSpeaker.name,
        content: fullText,
        round: session.currentRound,
      })
      session.currentRound++
      if (session.status === 'setup') session.status = 'running'

      // Check termination
      if (session.currentRound >= session.maxRounds) {
        session.status = 'concluded'
      }

      await ds.writeJSONAtomic(sessionFile, session)
      return { success: true, session }
    } catch (err) {
      logger.error('plaza:run-discussion-round error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Memory extraction via utility model
  ipcMain.handle('plaza:extract-memories', async (_, { session, agents, config }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: false, error: 'Utility model not configured.' }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return { success: false, error: `Provider "${um.provider}" missing credentials.` }

      const transcript = session.messages.map(m => `[${m.agentName}]: ${m.content}`).join('\n\n')
      const agentNames = agents.map(a => `"${a.name}" (id: ${a.id})`).join(', ')
      const memLang = session.language === 'zh' ? 'Chinese (Simplified)' : 'English'
      const memExample = session.language === 'zh'
        ? '{"agent-id-1":["认为X很重要","主张应优先考虑Y"]}'
        : '{"agent-id-1":["Believes X is important","Argues that Y should be prioritized"]}'

      const prompt = `Analyze this multi-agent discussion transcript and extract 2-5 key opinions, insights, or stances for each participant.
IMPORTANT: All extracted memories MUST be written in ${memLang}.

Participants: ${agentNames}

Transcript:
${transcript}

Return ONLY a JSON object where keys are agent IDs and values are arrays of short memory strings (1 sentence each, in ${memLang}).
Example: ${memExample}`

      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
      let text
      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = { openaiApiKey: providerCfg.apiKey, openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model, _resolvedProvider: 'openai', defaultProvider: 'openai', ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}), provider: { type: um.provider } }
        const oaiClient = new OpenAIClient(cfg)
        const response = await oaiClient.getClient().chat.completions.create({ model: um.model, ...oaiClient.tokenLimit(2048), messages: [{ role: 'user', content: prompt }] })
        text = response.choices?.[0]?.message?.content || ''
        accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      } else {
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
        const client = new AnthropicClient(cfg).getClient()
        const response = await client.messages.create({ model: um.model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] })
        text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { success: false, error: 'Failed to parse memories from AI response.' }
      const memories = JSON.parse(jsonMatch[0])
      return { success: true, memories }
    } catch (err) {
      logger.error('plaza:extract-memories error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Generate conclusion summary via utility model
  ipcMain.handle('plaza:generate-conclusion', async (_, { session, topicTitle, agents, config }) => {
    try {
      const um = config.utilityModel
      if (!um?.provider || !um?.model) return { success: false, error: 'Utility model not configured.' }
      const providerCfg = (config.providers || []).find(p => p.type === um.provider && p.isActive)
      if (!providerCfg?.apiKey || !providerCfg?.baseURL) return { success: false, error: `Provider "${um.provider}" missing credentials.` }

      const transcript = session.messages.map(m => `[${m.agentName}]: ${m.content}`).join('\n\n')
      const agentNames = agents.map(a => a.name).join(', ')

      const concLang = session.language === 'zh' ? 'Chinese (Simplified)' : 'English'
      const prompt = `You are summarizing a multi-agent discussion that has concluded.
Topic: "${topicTitle}"
Participants: ${agentNames}

Transcript:
${transcript}

Write a concise conclusion (3-5 sentences) that summarizes:
1. The key points of agreement and disagreement
2. The most compelling arguments made
3. The overall outcome of the discussion

IMPORTANT: You MUST write the entire conclusion in ${concLang}. Every word of your response must be in ${concLang}.

Return ONLY the conclusion text, no JSON, no formatting, just plain text.`

      const isOpenAI = um.provider === 'openai' || um.provider === 'openai_official' || um.provider === 'deepseek'
      let text
      if (isOpenAI) {
        const { OpenAIClient } = require('../agent/core/OpenAIClient')
        const cfg = { openaiApiKey: providerCfg.apiKey, openaiBaseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model, _resolvedProvider: 'openai', defaultProvider: 'openai', ...(um.provider === 'openai_official' || um.provider === 'deepseek' ? { _directAuth: true } : {}), provider: { type: um.provider } }
        const oaiClient = new OpenAIClient(cfg)
        const response = await oaiClient.getClient().chat.completions.create({ model: um.model, ...oaiClient.tokenLimit(1024), messages: [{ role: 'user', content: prompt }] })
        text = response.choices?.[0]?.message?.content || ''
        accumulateUtilityUsage(um.model, um.provider, response.usage?.prompt_tokens || 0, response.usage?.completion_tokens || 0).catch(() => {})
      } else {
        const { AnthropicClient } = require('../agent/core/AnthropicClient')
        const cfg = { apiKey: providerCfg.apiKey, baseURL: providerCfg.baseURL.replace(/\/+$/, ''), customModel: um.model }
        const client = new AnthropicClient(cfg).getClient()
        const response = await client.messages.create({ model: um.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
        text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        accumulateUtilityUsage(um.model, um.provider, response.usage?.input_tokens || 0, response.usage?.output_tokens || 0).catch(() => {})
      }
      return { success: true, conclusion: text.trim() }
    } catch (err) {
      logger.error('plaza:generate-conclusion error', err.message)
      return { success: false, error: err.message }
    }
  })

  // Commit memories to soul files
  ipcMain.handle('plaza:commit-memories', async (_, { topicTitle, agentMemories, agentTypes }) => {
    try {
      const { SOULS_DIR } = ds.paths()
      for (const [agentId, memories] of Object.entries(agentMemories)) {
        if (!memories || memories.length === 0) continue
        const type = agentTypes?.[agentId] || 'system'
        const dir = path.join(SOULS_DIR, type)
        fs.mkdirSync(dir, { recursive: true })
        const filePath = path.join(dir, `${agentId}.md`)
        let existing = ''
        try { existing = fs.readFileSync(filePath, 'utf8') } catch {}
        const section = `\n\n## Plaza Discussion: ${topicTitle}\n${memories.map(m => `- ${m}`).join('\n')}\n`
        fs.writeFileSync(filePath, existing + section, 'utf8')
      }
      return { success: true }
    } catch (err) {
      logger.error('plaza:commit-memories error', err.message)
      return { success: false, error: err.message }
    }
  })
}

module.exports = { register }
