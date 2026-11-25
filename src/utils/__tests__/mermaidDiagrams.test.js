// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWikiDiagrams } from '../mermaidDiagrams'

const { render } = vi.hoisted(() => ({ render: vi.fn() }))
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render } }))

const messages = { label: 'Diagram', failure: 'Cannot render diagram' }
function markdownBlock(root, source) {
  const block = document.createElement('pre')
  block.className = 'mermaid'
  block.textContent = source
  root.append(block)
  return block
}

beforeEach(() => render.mockReset().mockResolvedValue({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' }))

describe('Wiki diagrams', () => {
  it('shows an individual failure with its original code and still renders the next diagram', async () => {
    const root = document.createElement('div')
    const invalid = markdownBlock(root, 'flowchart TD\nNot valid')
    markdownBlock(root, '%% A comment\nflowchart TD\nA --> B')
    render.mockRejectedValueOnce(new Error('Parse error'))

    await renderWikiDiagrams(root, messages)

    expect(invalid.textContent).toBe('flowchart TD\nNot valid')
    expect(root.querySelector('.wiki-diagram-error').textContent).toBe(messages.failure)
    expect(root.querySelector('figure img').getAttribute('alt')).toBe(messages.label)
    expect(root.querySelector('figure img').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
  })

  it.each([
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\nA --> B',
    'flowchart TD\nA@{ img: "https://example.invalid/file.png" }',
    'flowchart TD\nA --> B\nstyle A fill:url(https://example.invalid/file.svg)',
  ])('keeps resource-capable syntax as source and skips Mermaid rendering', async source => {
    const root = document.createElement('div')
    const block = markdownBlock(root, source)
    await renderWikiDiagrams(root, messages)
    expect(render).not.toHaveBeenCalled()
    expect(block.dataset.wikiDiagram).toBe('error')
    expect(block.textContent).toBe(source)
  })
})
