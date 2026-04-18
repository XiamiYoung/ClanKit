import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    resolveDropPaths: vi.fn().mockResolvedValue([]),
    pickFiles: vi.fn().mockResolvedValue([]),
  },
})

import { useAttachments } from '../useAttachments'

function createAtts(overrides = {}) {
  return useAttachments({
    inputText: ref(''),
    mentionInputRef: ref({ focus: vi.fn(), insertTextAtCursor: vi.fn() }),
    dbg: vi.fn(),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAttachments', () => {
  it('starts with empty attachments', () => {
    const atts = createAtts()
    expect(atts.attachments.value).toEqual([])
    expect(atts.isDragOver.value).toBe(false)
  })

  it('onDragEnter sets isDragOver', () => {
    const atts = createAtts()
    atts.onDragEnter({ dataTransfer: { dropEffect: '', types: [], files: [] } })
    expect(atts.isDragOver.value).toBe(true)
  })

  it('handleAttachResults separates images from paths', () => {
    const inputText = ref('')
    const mentionRef = ref({ insertTextAtCursor: vi.fn() })
    const atts = createAtts({ inputText, mentionInputRef: mentionRef })

    atts.handleAttachResults([
      { type: 'image', path: '/img.png', name: 'img.png', preview: 'data:...', id: 'i1' },
      { type: 'file', path: '/doc.pdf', name: 'doc.pdf' },
    ])

    // Image added to attachments
    expect(atts.attachments.value).toHaveLength(1)
    expect(atts.attachments.value[0].type).toBe('image')
    // Both paths inserted via mentionInputRef
    expect(mentionRef.value.insertTextAtCursor).toHaveBeenCalledWith('/img.png\n/doc.pdf')
  })

  it('removeAttachment removes by id and cleans input text', () => {
    const inputText = ref('before\n/img.png\nafter')
    const atts = createAtts({ inputText })
    atts.attachments.value = [
      { id: 'a1', type: 'image', placeholderText: '/img.png' },
    ]
    atts.removeAttachment('a1')
    expect(atts.attachments.value).toHaveLength(0)
    expect(inputText.value).toBe('before\nafter')
  })

  it('pickFiles calls electronAPI and processes results', async () => {
    window.electronAPI.pickFiles.mockResolvedValue([
      { type: 'file', path: '/test.txt', name: 'test.txt' },
    ])
    const inputText = ref('')
    const atts = createAtts({ inputText, mentionInputRef: ref(null) })
    await atts.pickFiles()
    // Path should be in inputText (fallback path when mentionInputRef is null)
    expect(inputText.value).toBe('/test.txt')
  })
})
