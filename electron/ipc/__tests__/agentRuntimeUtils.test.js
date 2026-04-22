import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Under vitest 4.x, vi.mock does not reliably intercept `require()` calls made
// from inside CJS production modules (e.g. the `require('../lib/dataStore')`
// inside agentRuntimeUtils.js). Instead we patch the exported functions on the
// real dataStore singleton — since CJS `module.exports` returns the same
// object to every caller, replacing methods here is visible from the util.
const ds = require('../../lib/dataStore')
const originalPaths = ds.paths
const originalReadJSON = ds.readJSON

const {
  applyProviderCredsToConfig,
  buildHeuristicSequentialDispatch,
  normalizeLoopConfig,
  validateLoopConfig,
} = require('../agentRuntimeUtils')

const FAKE_AGENTS_FILE = '__virtual__/agents.json'

beforeAll(() => {
  ds.paths = () => ({ AGENTS_FILE: FAKE_AGENTS_FILE })
  ds.readJSON = (file, fallback) => {
    if (file === FAKE_AGENTS_FILE) {
      return {
        agents: [
          {
            id: 'agent-yifei',
            name: 'Ding Yifei',
            providerId: 'provider-deepseek-uuid',
            modelId: 'deepseek-chat',
          },
        ],
      }
    }
    return fallback
  }
})

afterAll(() => {
  ds.paths = originalPaths
  ds.readJSON = originalReadJSON
})

describe('agentRuntimeUtils regressions', () => {
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
