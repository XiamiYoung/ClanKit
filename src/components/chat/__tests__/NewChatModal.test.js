// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../../stores/chats', () => ({
  useChatsStore: () => ({
    chats: [],
    chatTree: [],
  }),
}))
vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    agents: [],
    systemAgents: [{ id: 'a1', name: 'Agent1' }],
    userAgents: [],
    systemCategories: [],
    userCategories: [],
    defaultSystemAgent: { id: 'sys1', name: 'Assistant' },
    defaultUserAgent: { id: 'usr1', name: 'User' },
    getAgentById: vi.fn((id) => {
      if (id === 'a1') return { id: 'a1', name: 'Agent1', avatar: null }
      return null
    }),
    agentsInCategory: vi.fn(() => []),
  }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../agents/agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => null),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {},
})

import NewChatModal from '../NewChatModal.vue'

function mountModal(props = {}) {
  return shallowMount(NewChatModal, {
    props: {
      visible: true,
      newChatName: '',
      newChatIcon: '',
      newChatAgentIds: [],
      newChatAgentSearch: '',
      newChatAgentCategoryId: '__all__',
      newChatUserSearch: '',
      newChatUserCategoryId: '__all__',
      newChatFolderId: null,
      showNewChatIconPicker: false,
      newChatFolderTreeExpanded: new Set(),
      filteredNewChatAgents: [],
      filteredNewChatUsers: [],
      activeNewChatUserAgent: null,
      effectiveNewChatUserAgentId: null,
      displayedSystemPersonaAgents: [],
      sortedSystemAgents: [{ id: 'a1', name: 'Agent1', avatar: null }],
      sortedUserAgents: [],
      ...props,
    },
    global: {
      stubs: {
        AppButton: { template: '<button><slot /></button>' },
        EmojiPicker: true,
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('NewChatModal', () => {
  it('renders when visible is true', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.modal-dialog-backdrop').exists()).toBe(true)
  })

  describe('mode radio at creation', () => {
    it('renders two mode radio inputs', () => {
      const wrapper = mountModal({ newChatMode: 'chat' })
      const radios = wrapper.findAll('input[type="radio"]')
      expect(radios.length).toBeGreaterThanOrEqual(2)
    })

    it('first radio is checked when newChatMode is chat', () => {
      const wrapper = mountModal({ newChatMode: 'chat' })
      const radios = wrapper.findAll('input[type="radio"]')
      expect(radios[0].element.checked).toBe(true)
      expect(radios[1].element.checked).toBe(false)
    })

    it('second radio is checked when newChatMode is productivity', () => {
      const wrapper = mountModal({ newChatMode: 'productivity' })
      const radios = wrapper.findAll('input[type="radio"]')
      expect(radios[0].element.checked).toBe(false)
      expect(radios[1].element.checked).toBe(true)
    })

    it('selecting productivity emits update:newChatMode', async () => {
      const wrapper = mountModal({ newChatMode: 'chat' })
      const productivityRadio = wrapper.findAll('input[type="radio"]').at(1)
      productivityRadio.element.checked = true
      productivityRadio.element.dispatchEvent(new Event('change'))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:newChatMode')).toBeTruthy()
      expect(wrapper.emitted('update:newChatMode')[0]).toEqual(['productivity'])
    })

    it('selecting chat emits update:newChatMode with chat', async () => {
      const wrapper = mountModal({ newChatMode: 'productivity' })
      const chatRadio = wrapper.findAll('input[type="radio"]').at(0)
      chatRadio.element.checked = true
      chatRadio.element.dispatchEvent(new Event('change'))
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('update:newChatMode')).toBeTruthy()
      expect(wrapper.emitted('update:newChatMode')[0]).toEqual(['chat'])
    })
  })

  it('does not render when visible is false', () => {
    const wrapper = mountModal({ visible: false })
    expect(wrapper.find('.modal-dialog-backdrop').exists()).toBe(false)
  })

  it('shows chat name input', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.newchat-name-input').exists()).toBe(true)
  })

  it('emits close when close button is clicked', () => {
    const wrapper = mountModal()
    wrapper.find('.modal-dialog-close-btn').element.click()
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
