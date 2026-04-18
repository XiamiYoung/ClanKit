import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, reactive, computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

let mockChatsStore, mockAgentsStore, mockConfigStore
vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))
vi.mock('../../stores/agents', () => ({ useAgentsStore: () => mockAgentsStore }))
vi.mock('../../stores/config', () => ({ useConfigStore: () => mockConfigStore }))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    runAgentAdditional: vi.fn().mockResolvedValue({}),
  },
})

import { useAgentCollaboration } from '../useAgentCollaboration'

function createCollab(overrides = {}) {
  return useAgentCollaboration({
    enabledSkillObjects: computed(() => []),
    scrollToBottom: vi.fn(),
    dbg: vi.fn(),
    collaborationCancelled: ref(false),
    runningAgentKeys: reactive(new Set()),
    isInCollaborationLoop: ref(false),
    waitForAgentEnd: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockChatsStore = {
    addMessage: vi.fn(),
  }
  mockAgentsStore = {
    defaultUserAgent: { id: 'usr1' },
  }
  mockConfigStore = {
    providers: [
      { id: 'p1', type: 'anthropic', apiKey: 'key1', baseURL: 'https://api.anthropic.com', model: 'claude-3' },
      { id: 'p2', type: 'openai', apiKey: 'key2', baseURL: 'https://api.openai.com', model: 'gpt-4' },
      { id: 'p3', type: 'deepseek', apiKey: 'key3', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
    ],
  }
})

describe('useAgentCollaboration', () => {
  describe('applyProviderCredsToConfig', () => {
    it('applies anthropic credentials correctly', () => {
      const collab = createCollab()
      const cfg = { providers: mockConfigStore.providers }
      collab.applyProviderCredsToConfig(cfg, 'anthropic')
      expect(cfg.apiKey).toBe('key1')
      expect(cfg.baseURL).toBe('https://api.anthropic.com')
      expect(cfg.openaiApiKey).toBeUndefined()
    })

    it('applies openai credentials correctly', () => {
      const collab = createCollab()
      const cfg = { providers: mockConfigStore.providers }
      collab.applyProviderCredsToConfig(cfg, 'openai')
      expect(cfg.openaiApiKey).toBe('key2')
      expect(cfg.openaiBaseURL).toBe('https://api.openai.com')
      expect(cfg._resolvedProvider).toBe('openai')
      expect(cfg.defaultProvider).toBe('openai')
      expect(cfg.apiKey).toBeUndefined()
    })

    it('applies deepseek as openai-compatible with _directAuth', () => {
      const collab = createCollab()
      const cfg = { providers: mockConfigStore.providers }
      collab.applyProviderCredsToConfig(cfg, 'deepseek')
      expect(cfg.openaiApiKey).toBe('key3')
      expect(cfg._directAuth).toBe(true)
      expect(cfg._resolvedProvider).toBe('openai')
    })
  })

  describe('_fireGroupAgentsDirect', () => {
    it('calls runAgentAdditional IPC and tracks running keys', async () => {
      const runningKeys = reactive(new Set())
      const collab = createCollab({ runningAgentKeys: runningKeys })
      const targetChat = {
        messages: [{ role: 'user', content: 'Hello' }],
        groupAgentIds: ['a1', 'a2'],
        permissionMode: 'inherit',
        chatAllowList: [],
        chatDangerOverrides: [],
        userAgentId: null,
      }

      await collab._fireGroupAgentsDirect('c1', targetChat, 'Hello', ['a1'], [])
      expect(window.electronAPI.runAgentAdditional).toHaveBeenCalled()
      expect(runningKeys.has('c1:a1')).toBe(true)
    })

    it('cleans up running keys on IPC error', async () => {
      window.electronAPI.runAgentAdditional.mockRejectedValueOnce(new Error('fail'))
      const runningKeys = reactive(new Set())
      const collab = createCollab({ runningAgentKeys: runningKeys })
      const targetChat = {
        messages: [],
        groupAgentIds: [],
        permissionMode: 'inherit',
        chatAllowList: [],
        chatDangerOverrides: [],
        userAgentId: null,
      }

      await collab._fireGroupAgentsDirect('c1', targetChat, 'Hi', ['a1'], [])
      expect(runningKeys.has('c1:a1')).toBe(false)
    })
  })
})
