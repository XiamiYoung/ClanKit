/**
 * Tool executor helpers — extracted from AgentLoop.
 *
 * All functions are standalone (no instance state). AgentLoop delegates to these
 * via thin wrapper methods, passing this.config where needed.
 */
const { logger } = require('../logger')
const { mcpManager } = require('./mcp/McpManager')

// ── Image detection helpers ──────────────────────────────────────────────────

/** Check if a text string looks like a base64-encoded image */
function looksLikeBase64Image(text) {
  if (!text || text.length < 100) return false
  // data URI
  if (/^data:image\/[a-z]+;base64,/i.test(text)) return true
  // Pure base64 blob (> 10KB, mostly base64 characters)
  if (text.length > 10000) {
    const sample = text.slice(0, 1000)
    const b64Chars = sample.replace(/[A-Za-z0-9+/=\s]/g, '')
    if (b64Chars.length < sample.length * 0.05) return true
  }
  return false
}

/** Try to extract base64 image data from a standalone text string */
function extractBase64Image(text) {
  // data:image/png;base64,xxxxx
  const dataUriMatch = text.match(/^data:(image\/[a-z]+);base64,(.+)$/is)
  if (dataUriMatch) {
    return { data: dataUriMatch[2].trim(), mimeType: dataUriMatch[1] }
  }
  // Pure base64 — assume PNG
  if (text.length > 10000 && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 1000))) {
    return { data: text.trim(), mimeType: 'image/png' }
  }
  return null
}

/**
 * Scan text for embedded image data, extract them, and replace with a short
 * placeholder. Two cases handled:
 *   1. data:image/...;base64,... URIs (the n8n case — image is the payload).
 *   2. Markdown image syntax ![alt](url) — explicit "this is an image" signal
 *      from the MCP. Plain URLs without markdown wrapping are intentionally
 *      ignored: data MCPs (Linear/GitHub/Slack) emit avatar/asset URLs as
 *      JSON metadata that the user did not ask to be displayed.
 */
function extractEmbeddedImages(text) {
  if (!text || text.length < 100) return { cleaned: text, extracted: [] }

  const extracted = []
  let cleaned = text

  // 1. data:image base64 URIs (n8n-style payload-in-JSON)
  if (text.includes('data:image/')) {
    cleaned = cleaned.replace(/data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]{1000,})/gi, (match, mimeType, data) => {
      extracted.push({ data, mimeType })
      return `[Image extracted for display: ${mimeType}, ${Math.round(data.length * 0.75 / 1024)}KB]`
    })
  }

  // 2. Markdown image syntax — MCP explicitly signaling "render this".
  //    Accepts http(s) URLs and data: URIs (latter already handled above
  //    if base64, but the markdown form would have been left untouched).
  if (cleaned.includes('![')) {
    cleaned = cleaned.replace(/!\[[^\]]*\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/gi, (match, url) => {
      if (url.startsWith('data:image/')) {
        const m = url.match(/^data:(image\/[a-z+]+);base64,(.+)$/i)
        if (m) extracted.push({ data: m[2], mimeType: m[1] })
        else return match
      } else {
        extracted.push({ url })
      }
      return `[Image: ${url.startsWith('data:') ? '(inline)' : url}]`
    })
  }

  if (extracted.length > 0) {
    logger.info(`Extracted ${extracted.length} embedded image(s) from text (${text.length} → ${cleaned.length} chars)`)
  }

  return { cleaned, extracted }
}

// ── MCP tool executor ────────────────────────────────────────────────────────

/**
 * Execute an MCP tool via the McpManager subprocess protocol.
 * Transforms MCP content array to agent-friendly result.
 * Extracts images/binary data so they never enter conversation context.
 */
async function executeMcpToolViaManager(serverId, toolName, input, serverConfig = null) {
  // Max size for text going into conversation context (characters)
  const MAX_TEXT_FOR_CONTEXT = 50000

  try {
    // Pass serverConfig so McpManager can lazy-start the server if not yet running
    const result = await mcpManager.callTool(serverId, toolName, input, serverConfig)

    // Log raw content types for debugging
    const content = result?.content || []
    logger.info('MCP tool raw content types:', content.map(c => ({
      type: c.type,
      hasData: !!c.data,
      hasText: !!c.text,
      hasBlob: !!c.blob,
      hasResource: !!c.resource,
      textLen: c.text?.length,
      dataLen: c.data?.length,
      mimeType: c.mimeType,
    })))

    if (result?.isError) {
      const errorText = content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n')
      return { success: false, error: errorText || 'MCP tool returned an error' }
    }

    const images = []
    const textParts = []

    for (const item of content) {
      if (item.type === 'image') {
        // Standard MCP image content (base64 or URL)
        if (item.url) {
          images.push({ url: item.url, mimeType: item.mimeType || 'image/png' })
        } else {
          images.push({ data: item.data, mimeType: item.mimeType || 'image/png' })
        }

      } else if (item.type === 'image_url') {
        // OpenAI-style image_url content
        const imgUrl = item.image_url?.url || item.url
        if (imgUrl) images.push({ url: imgUrl })

      } else if (item.type === 'resource' && item.resource) {
        // Embedded resource — may contain binary blobs
        const res = item.resource
        if (res.blob && res.mimeType && res.mimeType.startsWith('image/')) {
          images.push({ data: res.blob, mimeType: res.mimeType })
        } else if (res.text) {
          textParts.push(res.text)
        }

      } else if (item.type === 'text') {
        let text = item.text || ''

        // 1. Check if the ENTIRE text is a standalone base64 image
        if (looksLikeBase64Image(text)) {
          const parsed = extractBase64Image(text)
          if (parsed) {
            images.push(parsed)
            continue // don't add to textParts
          }
        }

        // 2. Scan for data:image URIs EMBEDDED within text/JSON (the n8n case)
        const { cleaned, extracted } = extractEmbeddedImages(text)
        if (extracted.length > 0) {
          images.push(...extracted)
          text = cleaned
        }

        if (text.trim()) {
          textParts.push(text)
        }

      } else {
        // Unknown content type — log and skip large items
        logger.warn('MCP unknown content type:', item.type, 'keys:', Object.keys(item))
        if (item.data && item.data.length > 1000) {
          images.push({ data: item.data, mimeType: item.mimeType || 'application/octet-stream' })
        }
      }
    }

    // Deduplicate images (same data length + mimeType = same image)
    const seenImgs = new Set()
    const uniqueImages = images.filter(img => {
      const key = img.url || `${img.mimeType}:${(img.data || '').length}`
      if (seenImgs.has(key)) return false
      seenImgs.add(key)
      return true
    })
    if (uniqueImages.length < images.length) {
      logger.info(`Deduplicated MCP images: ${images.length} → ${uniqueImages.length}`)
    }

    // Assemble text, with a hard size cap
    let textData = textParts.join('\n')
    if (textData.length > MAX_TEXT_FOR_CONTEXT) {
      logger.warn(`MCP tool text truncated: ${textData.length} → ${MAX_TEXT_FOR_CONTEXT} chars`)
      textData = textData.slice(0, MAX_TEXT_FOR_CONTEXT) + `\n\n[Output truncated — ${textData.length} total characters]`
    }

    // When images were extracted, give the LLM a clean summary so it
    // doesn't try to describe raw base64 or claim it can't render images
    if (uniqueImages.length > 0) {
      // Strip any leftover extraction placeholders from textData
      textData = textData.replace(/\[Image extracted for display:[^\]]*\]/g, '').trim()
      const imgSummary = `[${uniqueImages.length} image(s) returned and displayed to the user in the chat. Describe what you see or inform the user the image is shown above.]`
      textData = textData ? `${textData}\n\n${imgSummary}` : imgSummary
    }

    return {
      success: true,
      data: textData || (uniqueImages.length > 0 ? `[Returned ${uniqueImages.length} image(s)]` : ''),
      _mcpImages: uniqueImages.length > 0 ? uniqueImages : undefined,
    }
  } catch (err) {
    logger.error('MCP tool execution failed', err.message)
    return { success: false, error: err.message }
  }
}

// ── HTTP tool executor ───────────────────────────────────────────────────────

/**
 * Execute an HTTP tool by making the configured HTTP request.
 * Merges agent-provided body with the tool's bodyTemplate.
 */
async function executeHttpTool(tool, input) {
  const MAX_RESPONSE_SIZE = 100000

  try {
    const method = (tool.method || 'GET').toUpperCase()
    // Substitute {param} placeholders in endpoint URL with LLM-provided values
    const rawUrl = tool.endpoint
    if (!rawUrl) return { success: false, error: 'No endpoint URL configured for this tool' }
    const url = rawUrl.replace(/\{(\w+)\}/g, (_, key) => {
      const val = input?.[key]
      return val !== undefined ? encodeURIComponent(String(val)) : key
    })

    const headers = { ...tool.headers }
    if (!headers['Content-Type'] && (method === 'POST' || method === 'PUT')) {
      headers['Content-Type'] = 'application/json'
    }

    let body = undefined
    if (method !== 'GET' && method !== 'DELETE') {
      let templateBody = {}
      try { templateBody = JSON.parse(tool.bodyTemplate || '{}') } catch {}
      const inputBody = input?.body || {}
      body = JSON.stringify({ ...templateBody, ...inputBody })
    }

    logger.agent('HTTP tool exec', { name: tool.name, method, url })

    const https = require('https')
    const http = require('http')
    const { URL } = require('url')
    const parsed = new URL(url)
    const fetcher = parsed.protocol === 'https:' ? https : http

    const responseData = await new Promise((resolve, reject) => {
      const options = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers,
        timeout: 30000,
      }

      const req = fetcher.request(options, (res) => {
        let data = ''
        res.on('data', chunk => {
          data += chunk
          if (data.length > MAX_RESPONSE_SIZE) {
            req.destroy()
            resolve({ status: res.statusCode, data: data.slice(0, MAX_RESPONSE_SIZE) + '\n[Response truncated]', truncated: true })
          }
        })
        res.on('end', () => resolve({ status: res.statusCode, data }))
      })

      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('HTTP request timed out')) })

      if (body) req.write(body)
      req.end()
    })

    // Try to parse as JSON
    let parsed_data
    try { parsed_data = JSON.parse(responseData.data) } catch { parsed_data = responseData.data }

    const isSuccess = responseData.status >= 200 && responseData.status < 300
    logger.agent('HTTP tool result', { name: tool.name, status: responseData.status, dataLen: responseData.data.length })

    return {
      success: isSuccess,
      status: responseData.status,
      data: parsed_data,
      ...(responseData.truncated ? { truncated: true } : {}),
    }
  } catch (err) {
    logger.error('HTTP tool execution failed', { name: tool.name, error: err.message })
    return { success: false, error: err.message }
  }
}

// ── SMTP tool executor ───────────────────────────────────────────────────────

/** Send email via SMTP using the app's configured SMTP credentials */
async function executeSmtpTool(config, { to, subject, body, html, cc, bcc, from_name, attachments }) {
  const smtp = config.smtpConfig || {}
  const { host, port, user, pass } = smtp

  if (!host || !user || !pass) {
    return { error: 'SMTP not configured. Open Config → Email and fill in host, username, and password.' }
  }

  try {
    const nodemailer = require('nodemailer')
    const fs = require('fs')
    const path = require('path')

    const transporter = nodemailer.createTransport({
      host,
      port: port || 587,
      secure: (port === 465),
      requireTLS: (port !== 465),
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    })

    const fromAddress = from_name
      ? `"${String(from_name).replace(/"/g, '')}" <${user}>`
      : user

    // Resolve attachments
    const resolvedAttachments = []
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        const filePath = typeof att === 'string' ? att : att.path
        const filename = (typeof att === 'object' && att.filename) ? att.filename : path.basename(filePath)
        if (!filePath) continue
        if (!fs.existsSync(filePath)) return { error: `Attachment not found: ${filePath}` }
        resolvedAttachments.push({ path: filePath, filename })
      }
    }

    const mailOptions = {
      from: fromAddress, to, subject, text: body,
      ...(html ? { html } : {}),
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      ...(resolvedAttachments.length > 0 ? { attachments: resolvedAttachments } : {}),
    }

    logger.agent('SMTP tool exec', { to, subject })
    const info = await transporter.sendMail(mailOptions)
    return { success: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }
  } catch (err) {
    logger.error('SMTP tool execution failed', err.message)
    return { success: false, error: err.message }
  }
}

module.exports = { executeMcpToolViaManager, executeHttpTool, executeSmtpTool, looksLikeBase64Image, extractBase64Image, extractEmbeddedImages }
