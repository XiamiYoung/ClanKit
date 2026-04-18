// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../../stores/agents', () => ({
  useAgentsStore: () => ({
    getAgentById: vi.fn((id) => {
      if (id === 'a1') return { id: 'a1', name: 'Alice', avatar: null, description: 'Agent Alice' }
      if (id === 'a2') return { id: 'a2', name: 'Bob', avatar: null, description: 'Agent Bob' }
      return null
    }),
  }),
}))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key) => key, locale: ref('en') }),
}))
vi.mock('../../agents/agentAvatars', () => ({
  getAvatarDataUri: vi.fn(() => null),
}))
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}))

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {},
})

import ChatMentionInput from '../ChatMentionInput.vue'

function mountInput(props = {}) {
  return shallowMount(ChatMentionInput, {
    props: {
      modelValue: '',
      agentIds: [],
      isGroupChat: false,
      isRunning: false,
      ...props,
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('ChatMentionInput', () => {
  it('renders the textarea', () => {
    const wrapper = mountInput()
    expect(wrapper.find('.cmi-textarea').exists()).toBe(true)
  })

  it('uses group placeholder when isGroupChat is true', () => {
    const wrapper = mountInput({ isGroupChat: true })
    const textarea = wrapper.find('.cmi-textarea')
    expect(textarea.attributes('placeholder')).toBe('chats.groupMessagePlaceholder')
  })

  it('emits send when Enter is pressed', () => {
    const wrapper = mountInput({ modelValue: 'hello' })
    const textarea = wrapper.find('.cmi-textarea')
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    textarea.element.dispatchEvent(event)
    expect(wrapper.emitted('send')).toBeTruthy()
    expect(wrapper.emitted('send')[0]).toEqual(['hello'])
  })

  it('applies compact class when compact prop is true', () => {
    const wrapper = mountInput({ compact: true })
    expect(wrapper.find('.cmi-textarea-compact').exists()).toBe(true)
  })
})
