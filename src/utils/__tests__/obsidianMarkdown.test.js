// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { marked } from 'marked'
import { renderObsidianMarkdown } from '../obsidianMarkdown'

const previewMarkdown = [
  '---',
  'title: Example',
  'tags: [draft, review]',
  '---',
  '# Heading',
  '',
  '[[a]] [[a|Alias]] [[a#Section]] `[[x]]` ==highlight==',
  '',
  '> [!tip] A tip',
  '> Body with [[b]].',
].join('\n')

describe('Obsidian Markdown preview', () => {
  it('renders the existing DocsView syntax', () => {
    const preview = document.createElement('div')
    preview.innerHTML = renderObsidianMarkdown(previewMarkdown)
    expect(preview.innerHTML).toMatchInlineSnapshot(`
      "<div class="doc-properties"><div class="prop-row"><div class="prop-key">title</div><div class="prop-val"><span class="prop-value">Example</span></div></div><div class="prop-row"><div class="prop-key">tags</div><div class="prop-val"><span class="prop-tag">draft</span><span class="prop-tag">review</span></div></div></div>

      <h1 id="heading">Heading</h1>
      <p><a class="wikilink" data-target="a" href="#">a</a> <a class="wikilink" data-target="a" href="#">Alias</a> <a class="wikilink" data-target="a" data-section="Section" href="#">a</a> <code>[[x]]</code> <mark>highlight</mark></p>
      <div class="callout callout-tip" data-callout="tip">
      <div class="callout-title"><span class="callout-icon"></span>A tip</div>
      <div class="callout-body"><p>Body with <a class="wikilink" data-target="b" href="#">b</a>.</p>
      </div>
      </div>
      "
    `)
  })

  it('adds resolver results without changing the target or section', () => {
    const preview = document.createElement('div')
    preview.innerHTML = renderObsidianMarkdown('[[a#Section|Alias]] [[missing]]\n\n> [!tip]\n> [[a]]', {
      resolveLink: target => target === 'a' ? 'wiki/a"b.md' : null,
    })
    const [link, missing, calloutLink] = preview.querySelectorAll('a.wikilink')
    expect(link.dataset.target).toBe('a')
    expect(link.dataset.section).toBe('Section')
    expect(link.dataset.rel).toBe('wiki/a"b.md')
    expect(link.textContent).toBe('Alias')
    expect(missing.dataset.unresolved).toBe('true')
    expect(missing.dataset.rel).toBeUndefined()
    expect(calloutLink.dataset.rel).toBe('wiki/a"b.md')
  })

  it('keeps the editor path for local images and sanitizes the result', () => {
    const preview = document.createElement('div')
    preview.innerHTML = renderObsidianMarkdown('![Picture](image.png)\n\n<script>alert(1)</script>', {
      localImageBasePath: '/vault/wiki',
    })
    expect(preview.querySelector('img').dataset.abspath).toBe('/vault/wiki/image.png')
    expect(preview.querySelector('script')).toBeNull()
  })

  it('drops remote and relative images only when images are restricted', () => {
    const md = '![a](https://x.test/a.png) ![b](//x.test/b.png) ![c](rel/c.png) ![d](data:image/png;base64,AAAA)'
    const open = document.createElement('div')
    open.innerHTML = renderObsidianMarkdown(md)
    expect(open.querySelectorAll('img').length).toBeGreaterThan(1)
    const restricted = document.createElement('div')
    restricted.innerHTML = renderObsidianMarkdown(md, { restrictImages: true })
    expect([...restricted.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual(['data:image/png;base64,AAAA'])
  })

  it('blocks CSS and SVG remote-fetch vectors in restricted mode only', () => {
    const md = [
      '<div style="background-image:url(https://evil/?q=x)">a</div>',
      '',
      '<svg><image href="https://evil/x"></svg>',
      '',
      '<img src="https://evil/i.png"> <img src="//evil/j.png"> <img src="data:image/png;base64,AAAA">',
    ].join('\n')
    const restricted = renderObsidianMarkdown(md, { restrictImages: true })
    expect(restricted).not.toContain('evil')
    expect(restricted).not.toContain('style=')
    expect(restricted).not.toContain('<svg')
    expect(restricted).toContain('data:image/png;base64,AAAA')
    const open = renderObsidianMarkdown(md)
    expect(open).toContain('background-image')
    expect(open).toContain('https://evil/x')
  })

  it('blocks media, srcset, form and legacy background fetch vectors in restricted mode', () => {
    const payloads = [
      '<video src="https://evil/v.mp4" poster="https://evil/p.png"></video>',
      '<audio src="https://evil/a.mp3"></audio>',
      '<img srcset="https://evil/x 1x" src="data:image/png;base64,AAAA">',
      '<picture><source srcset="https://evil/s 1x"><img src="data:image/png;base64,BBBB"></picture>',
      '<form action="https://evil/f"><input type="image" src="https://evil/i.png"></form>',
      '<table background="https://evil/b.png"><tr><td>cell</td></tr></table>',
    ]
    for (const payload of payloads) {
      const out = renderObsidianMarkdown('before\n\n' + payload + '\n\nafter', { restrictImages: true })
      expect(out).not.toContain('evil')
      expect(out).not.toContain('srcset')
      expect(out).toContain('before')
      expect(out).toContain('after')
    }
    const open = renderObsidianMarkdown(payloads[0])
    expect(open).toContain('https://evil/v.mp4')
  })

  it('keeps the global marked configured for other views', () => {
    const math = marked.parse('$x^2$')
    expect(math).toContain('katex')
    const foot = marked.parse('text[^1]\n\n[^1]: note')
    expect(foot).toContain('footnote')
    expect(marked.parse('# Hello World')).toContain('<h1 id="hello-world">')
    expect(marked.parse('```js\nconst a = 1\n```')).toContain('hljs')
  })
})
