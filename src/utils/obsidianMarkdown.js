import { Marked, Renderer } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import markedKatex from 'marked-katex-extension'
import markedFootnote from 'marked-footnote'

// GitHub-style heading slug — lowercase, strip non-word chars, spaces to hyphens.
// Matches the anchor format used in hand-written Markdown TOCs.
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

// Markdown rendering — custom renderers for images and headings
// marked 12.x passes positional args: (href, title, text)
const renderer = new Renderer()
renderer.image = function (href, title, text) {
  // For relative/local paths, store original path in data attributes for async base64 loading
  const fileDir = this.options.localImageBasePath
  if (fileDir !== undefined && href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('data:')) {
    const absPath = fileDir ? `${fileDir}/${href}` : href
    return `<img src="" data-relpath="${href}" data-abspath="${absPath}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
  }
  return `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
}
renderer.heading = function (text, level) {
  const id = slugify(text.replace(/<[^>]+>/g, ''))
  return `<h${level} id="${id}">${text}</h${level}>\n`
}
// Code renderer: intercept ```mermaid``` blocks; otherwise delegate to highlight.js when language is known.
renderer.code = function (code, infostring) {
  const lang = (infostring || '').trim().split(/\s+/)[0]
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${escapeHtml(code)}</pre>`
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      const out = hljs.highlight(code, { language: lang }).value
      return `<pre><code class="hljs language-${lang}">${out}</code></pre>`
    } catch {}
  }
  return `<pre><code>${escapeHtml(code)}</code></pre>`
}
const markdown = new Marked({ gfm: true, breaks: true, renderer })
// strict:'ignore' silences KaTeX warnings about CJK chars / en-dashes / fullwidth
// punctuation when content inside `$…$` isn't actually math (very common in
// Chinese docs where `$` shows up as a literal). nonStandard already tolerates
// these tokens; without strict:'ignore' KaTeX still floods the console.
markdown.use(markedKatex({ throwOnError: false, nonStandard: true, strict: 'ignore' }))
markdown.use(markedFootnote())

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
export function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Strip leading YAML frontmatter and parse simple key:value lines.
// Returns { meta: {key: value|array} | null, body: stripped markdown }.
export function extractFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { meta: null, body: md }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (!km) continue
    let v = km[2].trim()
    if (/^\[.*\]$/.test(v)) {
      v = v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    } else if (/^["'].*["']$/.test(v)) {
      v = v.slice(1, -1)
    }
    meta[km[1]] = v
  }
  return { meta, body: md.slice(m[0].length) }
}

export function renderProperties(meta) {
  if (!meta || Object.keys(meta).length === 0) return ''
  const rows = Object.entries(meta).map(([k, v]) => {
    let val
    if (Array.isArray(v)) {
      val = v.map(x => `<span class="prop-tag">${escapeHtml(String(x))}</span>`).join('')
    } else {
      val = `<span class="prop-value">${escapeHtml(String(v))}</span>`
    }
    return `<div class="prop-row"><div class="prop-key">${escapeHtml(k)}</div><div class="prop-val">${val}</div></div>`
  }).join('')
  return `<div class="doc-properties">${rows}</div>\n\n`
}

// Convert Obsidian-only inline syntax: [[wikilinks]] and ==highlights==.
// Skips content inside inline code spans (`...`).
export function transformInline(text, resolveLink) {
  // Split on inline code so we don't transform inside backticks.
  const parts = text.split(/(`[^`\n]*`)/)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // odd parts = code spans, leave alone
    let s = part
    // [[Page#section|alias]] / [[Page|alias]] / [[Page]]
    s = s.replace(/\[\[([^\]\n|#^]+)(?:#([^\]\n|]*))?(?:\^[^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g,
      (_, target, section, alias) => {
        const t = (alias ? target.replace(/\\$/, '') : target).trim()
        const display = alias?.trim() || t
        const sec = section ? ` data-section="${escapeAttr(section.trim())}"` : ''
        const rel = resolveLink?.(t)
        const resolution = resolveLink
          ? (rel == null ? ' data-unresolved="true"' : ` data-rel="${escapeAttr(rel)}"`)
          : ''
        return `<a class="wikilink" data-target="${escapeAttr(t)}"${sec}${resolution} href="#">${escapeHtml(display)}</a>`
      })
    // ==highlight==
    s = s.replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
    return s
  }).join('')
}

// Obsidian callout: > [!type] Title \n > body...
// Recognized types: note tip info abstract todo success warning failure danger error question example quote cite bug.
// Emits pre-rendered HTML so marked passes through unchanged.
export function preprocessObsidian(md, { resolveLink, localImageBasePath } = {}) {
  const lines = md.split(/\r?\n/)
  const out = []
  let inFence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line) || /^~~~/.test(line)) {
      inFence = !inFence
      out.push(line); i++; continue
    }
    if (inFence) { out.push(line); i++; continue }
    const calloutMatch = line.match(/^>\s*\[!([\w-]+)\][+-]?\s*(.*)$/)
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase()
      const rawTitle = calloutMatch[2].trim()
      const title = rawTitle || (type.charAt(0).toUpperCase() + type.slice(1))
      const bodyLines = []
      i++
      while (i < lines.length && /^>/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      const innerMd = transformInline(bodyLines.join('\n'), resolveLink)
      const innerHtml = markdown.parse(innerMd, { localImageBasePath })
      out.push(`<div class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}">`)
      out.push(`<div class="callout-title"><span class="callout-icon"></span>${transformInline(escapeHtml(title), resolveLink)}</div>`)
      out.push(`<div class="callout-body">${innerHtml}</div>`)
      out.push(`</div>`)
      out.push('')
      continue
    }
    out.push(transformInline(line, resolveLink))
    i++
  }
  return out.join('\n')
}

export function renderObsidianMarkdown(md, options = {}) {
  if (!md) return ''
  try {
    const { meta, body } = extractFrontmatter(md)
    const propsHtml = renderProperties(meta)
    const processed = preprocessObsidian(body, options)
    const raw = propsHtml + markdown.parse(processed, { localImageBasePath: options.localImageBasePath })
    return DOMPurify.sanitize(raw, {
      ALLOW_UNKNOWN_PROTOCOLS: true,
      USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
      ADD_ATTR: ['data-relpath', 'data-abspath', 'data-target', 'data-section', 'data-callout', 'data-rel', 'data-unresolved', 'style'],
    })
  } catch { return '' }
}
