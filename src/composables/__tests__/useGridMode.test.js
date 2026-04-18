import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

let mockChatsStore
vi.mock('../../stores/chats', () => ({ useChatsStore: () => mockChatsStore }))

import { useGridMode } from '../useGridMode'

function createGrid(overrides = {}) {
  return useGridMode({
    showChatConfigModal: ref(false),
    triggerMemoryExtractionOnSwitch: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockChatsStore = {
    chats: [
      { id: 'c1', updatedAt: 300 },
      { id: 'c2', updatedAt: 200 },
      { id: 'c3', updatedAt: 100 },
      { id: 'c4', updatedAt: 50 },
      { id: 'c5', updatedAt: 10 },
    ],
    activeChatId: 'c1',
    setActiveChat: vi.fn(),
    createChat: vi.fn().mockResolvedValue({ id: 'c-new' }),
  }
})

describe('useGridMode', () => {
  it('enterGridMode populates gridChatIds sorted by updatedAt', () => {
    const g = createGrid()
    g.enterGridMode()
    expect(g.gridMode.value).toBe(true)
    expect(g.gridChatIds.value).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('exitGridMode sets gridMode false', () => {
    const g = createGrid()
    g.enterGridMode()
    g.exitGridMode()
    expect(g.gridMode.value).toBe(false)
  })

  it('gridMaximizeChat sets active chat and exits grid', () => {
    const g = createGrid()
    g.enterGridMode()
    g.gridMaximizeChat('c3')
    expect(mockChatsStore.setActiveChat).toHaveBeenCalledWith('c3')
    expect(g.gridMode.value).toBe(false)
  })

  it('gridSwapChat replaces a chat in the grid', () => {
    const g = createGrid()
    g.enterGridMode()
    g.gridSwapChat('c2', 'c5')
    expect(g.gridChatIds.value).toContain('c5')
    expect(g.gridChatIds.value).not.toContain('c2')
  })

  it('gridNewChat creates a chat and adds it to grid', async () => {
    const g = createGrid()
    g.enterGridMode()
    await g.gridNewChat()
    expect(mockChatsStore.createChat).toHaveBeenCalledWith('New Chat')
    expect(g.gridChatIds.value[0]).toBe('c-new')
  })

  it('gridSelectChat triggers memory extraction and sets active', () => {
    const memFn = vi.fn()
    const g = createGrid({ triggerMemoryExtractionOnSwitch: memFn })
    g.gridSelectChat('c3')
    expect(memFn).toHaveBeenCalledWith('c1')
    expect(mockChatsStore.setActiveChat).toHaveBeenCalledWith('c3')
  })

  it('gridOpenChatSettings opens settings modal', () => {
    const modal = ref(false)
    const g = createGrid({ showChatConfigModal: modal })
    g.gridOpenChatSettings('c2')
    expect(mockChatsStore.setActiveChat).toHaveBeenCalledWith('c2')
    expect(modal.value).toBe(true)
  })
})
