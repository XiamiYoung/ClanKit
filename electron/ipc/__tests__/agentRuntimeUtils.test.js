const { describe, it, expect, vi, beforeEach } = require('vitest')

const mockReadJSON = vi.fn()
const mockPaths = {
  AGENTS_FILE: 'agents.json',
}

vi.mock('../../logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock('../../lib/dataStore', () => ({
  readJSON: (...args) => mockReadJSON(...args),
  paths: () => mockPaths,
}))

const {
  applyProviderCredsToConfig,
  buildHeuristicSequentialDispatch,
  normalizeLoopConfig,
  validateLoopConfig,
} = require('../agentRuntimeUtils')

describe('agentRuntimeUtils regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadJSON.mockReturnValue({
      agents: [
        {
          id: 'agent-yifei',
          name: 'Ding Yifei',
          providerId: 'provider-deepseek-uuid',
          modelId: 'deepseek-chat',
        },
      ],
    })
  })

  it('normalizes UUID-backed DeepSeek providers into OpenAI-compatible loop config', () => {
    const cfg = {
      providers: [
        {
          id: 'provider-deepseek-uuid',
          type: 'deepseek',
          apiKey: 'deepseek-key',
          baseURL: 'https://api.deepseek.com/',
          model: 'deepseek-chat',
          isActive: true,
        },
      ],
    }

    const normalized = normalizeLoopConfig(cfg, 'agent-yifei')

    expect(normalized.openaiApiKey).toBe('deepseek-key')
    expect(normalized.openaiBaseURL).toBe('https://api.deepseek.com')
    expect(normalized.defaultProvider).toBe('openai')
    expect(normalized._resolvedProvider).toBe('openai')
    expect(normalized._directAuth).toBe(true)
    expect(normalized.customModel).toBe('deepseek-chat')
    expect(normalized.apiKey).toBeUndefined()
    expect(normalized.baseURL).toBeUndefined()
  })

  it('fails fast when normalized OpenAI-compatible config is missing credentials', () => {
    const err = validateLoopConfig({
      defaultProvider: 'openai',
      _resolvedProvider: 'openai',
      customModel: 'deepseek-chat',
      openaiBaseURL: 'https://api.deepseek.com',
      openaiApiKey: '',
    })

    expect(err).toBe('Provider "openai" is missing apiKey')
  })

  it('detects Chinese ordered multi-agent requests and builds sequential dispatch', () => {
    const result = buildHeuristicSequentialDispatch('bo jun 先回答，yifei 等他说完再补充。', [
      { id: 'bojun', name: 'bo jun' },
      { id: 'yifei', name: 'yifei' },
    ])

    expect(result).toBeTruthy()
    expect(result.executionMode).toBe('sequential')
    expect(result.dispatched).toHaveLength(2)
    expect(result.dispatched[0]).toMatchObject({
      agentId: 'bojun',
      dependsOn: [],
    })
    expect(result.dispatched[1]).toMatchObject({
      agentId: 'yifei',
      dependsOn: ['bojun'],
    })
  })

  it('applies provider credentials for UUID-based DeepSeek providers directly', () => {
    const cfg = {
      providers: [
        {
          id: 'provider-deepseek-uuid',
          type: 'deepseek',
          apiKey: 'deepseek-key',
          baseURL: 'https://api.deepseek.com/',
          model: 'deepseek-chat',
        },
      ],
    }

    applyProviderCredsToConfig(cfg, 'provider-deepseek-uuid')

    expect(cfg.openaiApiKey).toBe('deepseek-key')
    expect(cfg.openaiBaseURL).toBe('https://api.deepseek.com')
    expect(cfg._directAuth).toBe(true)
    expect(cfg.defaultProvider).toBe('openai')
  })
})