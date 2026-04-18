// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const mockChat = {
  id: 'c1',
  title: 'Test',
  isRunning: false,
  workingPath: '/some/path',
  codingMode: false,
  codingProvider: 'claude-code',
  maxAgentRounds: 10,
  permissionMode: 'inherit',
  chatAllowList: [],
  chatDangerOverrides: [],
}

vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => ({
    chats: [mockChat],
    setChatSettings: vi.fn(),
  }),
}))
vi.mock('../../../stores/config', () => ({
  useConfigStore: () => ({
    language: 'en',
    config: { artifactPath: '/tmp', dataPath: '/data', sandboxConfig: { sandboxAllowList: [], dangerBlockList: [] } },
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
