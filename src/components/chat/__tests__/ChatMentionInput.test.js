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
      longBlobs: {},
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
  it('renders the contenteditable editor', () => {
    const wrapper = mountInput()
    const editor = wrapper.find('.cmi-editor')
    expect(editor.exists()).toBe(true)
    // The editor is a contenteditable div, not a textarea. This is what lets
    // blob chips sit inline with text and participate in the native selection,
    // undo stack, and Ctrl+A.
    expect(editor.attributes('contenteditable')).toBe('true')
  })

  it('shows group placeholder when isGroupChat is true', () => {
    const wrapper = mountInput({ isGroupChat: true })
    expect(wrapper.find('.cmi-placeholder').text()).toBe('chats.groupMessagePlaceholder')
  })

  it('shows default placeholder for non-group chats', () => {
    const wrapper = mountInput({ isGroupChat: false })
    expect(wrapper.find('.cmi-placeholder').text()).toBe('chats.placeholder')
  })

  it('emits send when Enter is pressed without shift', () => {
    const wrapper = mountInput({ modelValue: 'hello' })
    const editor = wrapper.find('.cmi-editor')
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    editor.element.dispatchEvent(event)
    expect(wrapper.emitted('send')).toBeTruthy()
    expect(wrapper.emitted('send')[0]).toEqual(['hello'])
  })

  it('does not emit send when Shift+Enter is pressed', () => {
    const wrapper = mountInput({ modelValue: 'hello' })
    const editor = wrapper.find('.cmi-editor')
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
    editor.element.dispatchEvent(event)
    expect(wrapper.emitted('send')).toBeFalsy()
  })

  it('applies compact class when compact prop is true', () => {
    const wrapper = mountInput({ compact: true })
    expect(wrapper.find('.cmi-editor-compact').exists()).toBe(true)
  })

  it('emits escape when Escape is pressed', () => {
    const wrapper = mountInput()
    const editor = wrapper.find('.cmi-editor')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    editor.element.dispatchEvent(event)
    expect(wrapper.emitted('escape')).toBeTruthy()
  })
})
