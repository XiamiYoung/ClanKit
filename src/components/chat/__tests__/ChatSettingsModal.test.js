// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

// Use vi.hoisted so these are available inside vi.mock factories (which are hoisted)
const { mockSetMode, mockSetChatSettings, mockChats } = vi.hoisted(() => {
  const chats = [
    {
      id: 'c1',
      title: 'Test',
      isRunning: false,
      mode: 'chat',
      workingPath: '/some/path',
      maxAgentRounds: 10,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
    },
    {
      id: 'c2',
      title: 'Prod',
      isRunning: false,
      mode: 'productivity',
      workingPath: null,
      maxAgentRounds: 10,
      permissionMode: 'inherit',
      chatAllowList: [],
      chatDangerOverrides: [],
    },
  ]
  return {
    mockSetMode: vi.fn(),
    mockSetChatSettings: vi.fn(),
    mockChats: chats,
  }
})

vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => ({
    chats: mockChats,
    setChatSettings: mockSetChatSettings,
    setMode: mockSetMode,
  }),
}))

// Convenience aliases
const mockChat = mockChats[0]
vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
    config: { DoCPath: '/clankit_doc', dataPath: '/data', sandboxConfig: { sandboxAllowList: [], dangerBlockList: [] } },
  }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {},
})

import ChatSettingsModal from '../ChatSettingsModal.vue'

function mountModal(props = {}) {
  return shallowMount(ChatSettingsModal, {
    props: { visible: true, chatId: 'c1', ...props },
    global: {
      stubs: {
        Teleport: true,
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockSetMode.mockClear()
  mockSetChatSettings.mockClear()
})

describe('ChatSettingsModal', () => {
  it('renders when visible is true', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.ccm-backdrop').exists()).toBe(true)
    expect(wrapper.find('.ccm-dialog').exists()).toBe(true)
  })

  it('does not render when visible is false', () => {
    const wrapper = mountModal({ visible: false })
    expect(wrapper.find('.ccm-backdrop').exists()).toBe(false)
  })

  it('shows permission mode buttons on permissions tab', async () => {
    const wrapper = mountModal()
    const tabs = wrapper.findAll('.ccm-tab')
    const permTab = tabs.find(t => t.text().includes('chats.permissions'))
    permTab.element.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.ccm-provider-btn').length).toBe(3)
  })

  it('shows working path input in general tab', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.ccm-working-path-input').exists()).toBe(true)
  })
})

describe('working folder UI (mode is configured via the chat header dropdown)', () => {
  it('mode radio is gone (moved to ChatHeader dropdown)', () => {
    const wrapper = mountModal()
    expect(wrapper.find('input[type="radio"][value="chat"]').exists()).toBe(false)
    expect(wrapper.find('input[type="radio"][value="productivity"]').exists()).toBe(false)
    expect(wrapper.find('.ccm-mode-radio').exists()).toBe(false)
  })

  it('coding-mode UI is gone', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.ccm-coding-toggle-row').exists()).toBe(false)
    expect(wrapper.find('.ccm-coding-switch').exists()).toBe(false)
    expect(wrapper.find('.ccm-coding-info-chip').exists()).toBe(false)
  })

  it('working folder placeholder uses DoCPath', () => {
    const wrapper = mountModal()
    const input = wrapper.find('.ccm-working-path-input')
    expect(input.attributes('placeholder')).toContain('clankit_doc')
  })

  it('artifactDirectory badge is gone', () => {
    const wrapper = mountModal()
    expect(wrapper.html()).not.toContain('chats.artifactDirectory')
  })

  it('saving does NOT call chatsStore.setMode (mode set via header)', async () => {
    const wrapper = mountModal()
    const saveBtn = wrapper.find('.ccm-save-btn')
    saveBtn.element.click()
    await wrapper.vm.$nextTick()
    expect(mockSetMode).not.toHaveBeenCalled()
  })
})
