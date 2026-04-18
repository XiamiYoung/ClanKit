/**
 * WebFetchTool — fetch a URL and return its content as clean Markdown.
 *
 * Uses Node-native fetch (no curl dependency) + turndown for HTML→Markdown
 * conversion. Strips noise elements (script, style, nav, footer, etc.) before
 * conversion to keep the output token-efficient for LLM consumption.
 *
 * Always-on core tool — registered in ToolRegistry alongside execute_shell
 * and file_operation.
 */
const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')

// Lazy-loaded to avoid startup cost
let TurndownService = null
let turndownPluginGfm = null

function getTurndown() {
  if (!TurndownService) {
    TurndownService = require('turndown')
    try {
      turndownPluginGfm = require('turndown-plugin-gfm')
    } catch {
      // GFM plugin optional — tables/strikethrough degrade gracefully
    }
  }
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  if (turndownPluginGfm?.gfm) {
    td.use(turndownPluginGfm.gfm)
  }
  // Remove images to save tokens (keep alt text)
  td.addRule('images', {
    filter: 'img',
    replacement: (content, node) => {
      const alt = node.getAttribute('alt') || ''
      return alt ? `[image: ${alt}]` : ''
    }
  })
  return td
}

// HTML noise elements to strip before conversion
const NOISE_TAGS = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  'nav', 'footer', 'header', 'aside',
  'form', 'button', 'input', 'select', 'textarea',
]

/**
 * Strip noise tags and their content from raw HTML.
 * Also removes HTML comments and common ad/tracking elements.
 */
function stripNoise(html) {
  let clean = html
  // Remove noise tags and their contents
  for (const tag of NOISE_TAGS) {
    const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'gi')
    clean = clean.replace(re, '')
    // Self-closing variants
    const reSelf = new RegExp(`<${tag}[^>]*/?>`, 'gi')
    clean = clean.replace(reSelf, '')
  }
  // Remove HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, '')
  // Remove common ad/tracking class elements
  clean = clean.replace(/<[^>]+(class|id)="[^"]*(?:ad-|ads-|advert|tracking|cookie-banner|popup|modal)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
  return clean
}

/**
 * Extract <title> from HTML.
 */
function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : ''
}

/**
 * Extract meta description from HTML.
 */
function extractMetaDescription(html) {
  const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)
  return m ? m[1].trim() : ''
}

class WebFetchTool extends BaseTool {
  constructor() {
    super(
      'web_fetch',
      'Fetch a URL and return its content as clean Markdown text. Use this to read web pages, articles, documentation, or any HTTP-accessible content. Returns the page title, a Markdown-formatted body, and metadata.',
      'web_fetch'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch (must start with http:// or https://)'
        },
        selector: {
          type: 'string',
          description: 'Optional: CSS-like hint for the main content area (e.g. "article", "main", ".post-content"). If omitted, the tool auto-detects the main content.'
        }
      },
      required: ['url']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { url, selector } = params

    // Validate URL
    if (!url || typeof url !== 'string') {
      return this._err('URL is required')
    }
    const trimmedUrl = url.trim()
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return this._err('URL must start with http:// or https://')
    }

    try {
      // Fetch with timeout
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        },
        redirect: 'follow',
      })

      clearTimeout(timeout)

      if (!response.ok) {
        return this._err(`HTTP ${response.status} ${response.statusText}`, { url: trimmedUrl, status: response.status })
      }

      const contentType = response.headers.get('content-type') || ''

      // Non-HTML content: return raw text (JSON, plain text, XML, etc.)
      if (!contentType.includes('html')) {
        const text = await response.text()
        const { text: truncated, truncated: wasTruncated } = truncateOutput(text)
        return this._ok(truncated, {
          url: trimmedUrl,
          contentType,
          truncated: wasTruncated,
          charCount: text.length,
        })
      }

      // HTML content: clean and convert to Markdown
      const html = await response.text()
      const title = extractTitle(html)
      const metaDesc = extractMetaDescription(html)

      // Extract main content area if selector hint is provided
      let contentHtml = html
      if (selector) {
        // Simple extraction: find the first element matching the selector-like pattern
        // Supports: tag name ("article", "main"), class (".post-content"), id ("#content")
        const extracted = this._extractBySelector(html, selector)
        if (extracted) contentHtml = extracted
      } else {
        // Auto-detect: try common main content containers
        const mainContent = this._extractMainContent(html)
        if (mainContent) contentHtml = mainContent
      }

      // Strip noise and convert to Markdown
      const cleaned = stripNoise(contentHtml)
      const td = getTurndown()
      let markdown = td.turndown(cleaned)

      // Clean up excessive whitespace in the result
      markdown = markdown
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      // Prepend title if found
      if (title && !markdown.startsWith('# ')) {
        markdown = `# ${title}\n\n${markdown}`
      }

      const { text: truncated, truncated: wasTruncated } = truncateOutput(markdown)

      return this._ok(truncated, {
        url: trimmedUrl,
        title: title || '(no title)',
        metaDescription: metaDesc || '',
        truncated: wasTruncated,
        charCount: markdown.length,
      })

    } catch (err) {
      if (err.name === 'AbortError') {
        return this._err('Request timed out (30s)', { url: trimmedUrl })
      }
      return this._err(err.message, { url: trimmedUrl })
    }
  }

  /**
   * Try to extract the main content area from HTML using common container patterns.
   * Returns the inner HTML of the best match, or null if no clear match.
   */
  _extractMainContent(html) {
    // Priority order of main content selectors
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]+(?:class|id)="[^"]*(?:content|article|post-body|entry-content|post-content|main-content|page-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+role="main"[^>]*>([\s\S]*?)<\/div>/i,
    ]
    for (const pattern of patterns) {
      const m = html.match(pattern)
      if (m && m[1] && m[1].length > 200) {
        return m[1]
      }
    }
    // Fallback: try to find <body> content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    return bodyMatch ? bodyMatch[1] : null
  }

  /**
   * Extract content matching a CSS-like selector hint.
   * Supports: tag ("article"), class (".post-content"), id ("#content").
   */
  _extractBySelector(html, selector) {
    let pattern
    if (selector.startsWith('.')) {
      const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pattern = new RegExp(`<[^>]+class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pattern = new RegExp(`<[^>]+id="${id}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
    } else {
      const tag = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
    }
    const m = html.match(pattern)
    return m ? m[1] : null
  }
}

module.exports = { WebFetchTool }
