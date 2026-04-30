/**
 * IPC handlers for RSS news feed fetching.
 * Channels: news:fetch-feeds
 */
const { ipcMain } = require('electron')
const { logger } = require('../logger')

function register() {
  ipcMain.handle('news:fetch-feeds', async (_, feedConfigs) => {
    if (!Array.isArray(feedConfigs) || feedConfigs.length === 0) {
      return { success: false, error: 'No feed configs provided', feeds: [] }
    }
    const https = require('https')
    const http = require('http')

    function fetchFeed(feed) {
      return new Promise((resolve) => {
        try {
          const url = feed.url
          if (!url || typeof url !== 'string') {
            return resolve({ feed, body: '', error: 'Invalid or missing URL' })
          }
          const fetcher = url.startsWith('https') ? https : http
          const req = fetcher.get(url, {
            headers: { 'User-Agent': 'ClanKit/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
            timeout: 15000
          }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              try {
                const redirectUrl = new URL(res.headers.location, url).href
                const rFetcher = redirectUrl.startsWith('https') ? https : http
                const rReq = rFetcher.get(redirectUrl, {
                  headers: { 'User-Agent': 'ClanKit/1.0 RSS Reader', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
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

    // Generic field cleaner:
    // 1. If the payload contains CDATA sections, extract and concatenate their contents.
    // 2. Otherwise use the raw payload.
    // 3. Strip any residual HTML tags, decode a handful of basic entities, collapse whitespace.
    function cleanField(raw) {
      if (!raw) return ''
      let s = String(raw)
      const cdataParts = [...s.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map(m => m[1])
      if (cdataParts.length > 0) s = cdataParts.join(' ')
      s = s.replace(/<[^>]+>/g, '')
      s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      return s.replace(/\s+/g, ' ').trim()
    }

    function parseArticles(xml) {
      const articles = []
      const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || []
      if (rssItems.length > 0) {
        for (const item of rssItems) {
          const title = (item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''
          const link = (item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || ''
          const date = (item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] ||
                       (item.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i) || [])[1] || ''
          const summary = (item.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || ''
          articles.push({
            title: cleanField(title),
            link: cleanField(link),
            date: date.trim(),
            summary: cleanField(summary).slice(0, 300)
          })
        }
        return articles
      }
      const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
      for (const entry of atomEntries) {
        const title = (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''
        const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i) || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || []
        const link = linkMatch[1] || ''
        const date = (entry.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] ||
                     (entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] || ''
        const summary = (entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] ||
                        (entry.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1] || ''
        articles.push({
          title: cleanField(title),
          link: link.trim(),
          date: date.trim(),
          summary: cleanField(summary).slice(0, 300)
        })
      }
      return articles
    }

    try {
      const results = await Promise.allSettled(feedConfigs.map(f => fetchFeed(f)))
      const feeds = results.map((r) => {
        if (r.status === 'rejected') {
          return { id: 'unknown', name: 'Unknown', articles: [], error: r.reason?.message || 'Fetch failed' }
        }
        const { feed, body, error, status } = r.value
        if (error) return { id: feed.id, name: feed.name, articles: [], error }
        if (status >= 400) return { id: feed.id, name: feed.name, articles: [], error: `HTTP ${status}` }
        const articles = parseArticles(body)
        return { id: feed.id, name: feed.name, articles }
      })
      return { success: true, feeds }
    } catch (err) {
      logger.error('news:fetch-feeds error', err.message)
      return { success: false, error: err.message, feeds: [] }
    }
  })
}

module.exports = { register }
