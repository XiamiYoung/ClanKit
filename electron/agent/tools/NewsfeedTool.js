/**
 * NewsfeedTool — fetches and parses RSS/Atom feeds for agents.
 *
 * Supports two modes:
 *   1. Fetch specific URLs passed as `urls` parameter
 *   2. Fetch all configured feeds from config.newsFeeds (use_configured_feeds: true)
 *
 * Returns structured article data: title, link, date, summary (truncated to 300 chars).
 */
const { BaseTool } = require('./BaseTool')
const https = require('https')
const http = require('http')
const { logger } = require('../../logger')

class NewsfeedTool extends BaseTool {
  constructor() {
    super(
      'fetch_newsfeed',
      'Fetch and read articles from RSS/Atom news feeds. Provide specific URLs to fetch, or set use_configured_feeds=true to read all news feeds configured in the app.',
      'Newsfeed Reader'
    )
    // Config reference injected via setConfig() by AgentLoop
    this._config = null
  }

  /** Called by AgentLoop to inject runtime config so we can read newsFeeds */
  setConfig(config) {
    this._config = config
  }

  schema() {
    return {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of RSS/Atom feed URLs to fetch. Leave empty if using use_configured_feeds.'
        },
        use_configured_feeds: {
          type: 'boolean',
          description: 'If true, fetch all news feeds configured in the app settings. Overrides urls if both are provided.'
        },
        max_articles_per_feed: {
          type: 'number',
          description: 'Maximum number of articles to return per feed (default: 10, max: 50).'
        }
      },
      required: []
    }
  }

  async execute(toolCallId, params, signal) {
    const { urls = [], use_configured_feeds = false, max_articles_per_feed = 10 } = params || {}
    const limit = Math.min(Math.max(1, max_articles_per_feed || 10), 50)

    // Build feed list
    let feedList = []

    if (use_configured_feeds && this._config) {
      const configured = this._config.newsFeeds || []
      if (configured.length === 0) {
        return this._err('No news feeds are configured in the app. Go to the AINnews page to add RSS feeds.')
      }
      feedList = configured.map(f => ({ id: f.id || f.url, name: f.name || f.url, url: f.url }))
    } else if (urls.length > 0) {
      feedList = urls.map((url, i) => ({ id: `feed_${i}`, name: url, url }))
    } else {
      // Fall back to configured feeds if no URLs given
      if (this._config) {
        const configured = this._config.newsFeeds || []
        if (configured.length > 0) {
          feedList = configured.map(f => ({ id: f.id || f.url, name: f.name || f.url, url: f.url }))
        }
      }
      if (feedList.length === 0) {
        return this._err('No feed URLs provided and no configured feeds found. Provide urls parameter or configure feeds in the AINnews page.')
      }
    }

    // Check abort signal
    if (signal?.aborted) {
      return this._err('Cancelled')
    }

    try {
      const results = await Promise.allSettled(feedList.map(f => fetchFeed(f)))

      const sections = []
      let totalArticles = 0

      for (const result of results) {
        if (result.status === 'rejected') {
          sections.push(`## Unknown Feed\nError: ${result.reason?.message || 'Fetch failed'}\n`)
          continue
        }
        const { feed, body, error, status } = result.value
        if (error) {
          sections.push(`## ${feed.name}\nError: ${error}\n`)
          continue
        }
        if (status >= 400) {
          sections.push(`## ${feed.name}\nError: HTTP ${status}\n`)
          continue
        }
        const articles = parseArticles(body).slice(0, limit)
        if (articles.length === 0) {
          sections.push(`## ${feed.name}\nNo articles found (feed may be empty or in an unsupported format).\n`)
          continue
        }
        totalArticles += articles.length
        const lines = [`## ${feed.name} (${articles.length} articles)`]
        for (const art of articles) {
          lines.push(`\n### ${art.title || '(no title)'}`)
          if (art.date) lines.push(`Date: ${art.date}`)
          if (art.link) lines.push(`Link: ${art.link}`)
          if (art.summary) lines.push(`Summary: ${art.summary}`)
        }
        sections.push(lines.join('\n'))
      }

      const output = sections.join('\n\n---\n\n')
      logger.agent('NewsfeedTool: fetched', { feeds: feedList.length, articles: totalArticles })
      return this._ok(output, { feedCount: feedList.length, articleCount: totalArticles })
    } catch (err) {
      logger.error('NewsfeedTool: error', err.message)
      return this._err(err.message)
    }
  }
}

// ---------------------------------------------------------------------------
// Shared fetch + parse helpers (mirrors logic in electron/ipc/news.js)
// ---------------------------------------------------------------------------

function fetchFeed(feed) {
  return new Promise((resolve) => {
    try {
      const url = feed.url
      if (!url || typeof url !== 'string') {
        return resolve({ feed, body: '', error: 'Invalid or missing URL' })
      }
      const fetcher = url.startsWith('https') ? https : http
      const req = fetcher.get(url, {
        headers: {
          'User-Agent': 'ClanKit/1.0 RSS Reader',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
        },
        timeout: 15000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const redirectUrl = new URL(res.headers.location, url).href
            const rFetcher = redirectUrl.startsWith('https') ? https : http
            const rReq = rFetcher.get(redirectUrl, {
              headers: {
                'User-Agent': 'ClanKit/1.0 RSS Reader',
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
              },
              timeout: 15000
            }, (rRes) => {
              let body = ''
              rRes.on('data', chunk => { body += chunk })
              rRes.on('end', () => resolve({ feed, body, status: rRes.statusCode }))
            })
            rReq.on('error', (err) => resolve({ feed, body: '', error: err.message }))
            rReq.on('timeout', () => { rReq.destroy(); resolve({ feed, body: '', error: 'Request timed out' }) })
          } catch (redirectErr) {
            resolve({ feed, body: '', error: 'Redirect error: ' + (redirectErr.message || 'Invalid redirect URL') })
          }
          return
        }
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ feed, body, status: res.statusCode }))
      })
      req.on('error', (err) => resolve({ feed, body: '', error: err.message }))
      req.on('timeout', () => { req.destroy(); resolve({ feed, body: '', error: 'Request timed out' }) })
    } catch (err) {
      resolve({ feed, body: '', error: err.message || 'Fetch error' })
    }
  })
}

function parseArticles(xml) {
  const articles = []
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
  if (rssItems.length > 0) {
    for (const item of rssItems) {
      const title = (item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || ''
      const link = (item.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i) || [])[1] || ''
      const date = (item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] ||
                   (item.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || [])[1] || ''
      const summary = (item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || ''
      articles.push({
        title: title.replace(/<[^>]+>/g, '').trim(),
        link: link.replace(/<[^>]+>/g, '').trim(),
        date: date.trim(),
        summary: summary.replace(/<[^>]+>/g, '').trim().slice(0, 300)
      })
    }
    return articles
  }
  const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
  for (const entry of atomEntries) {
    const title = (entry.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || ''
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i) ||
                     entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || []
    const link = linkMatch[1] || ''
    const date = (entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] ||
                 (entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || ''
    const summary = (entry.match(/<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i) || [])[1] ||
                    (entry.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content>/i) || [])[1] || ''
    articles.push({
      title: title.replace(/<[^>]+>/g, '').trim(),
      link: link.trim(),
      date: date.trim(),
      summary: summary.replace(/<[^>]+>/g, '').trim().slice(0, 300)
    })
  }
  return articles
}

module.exports = { NewsfeedTool }
