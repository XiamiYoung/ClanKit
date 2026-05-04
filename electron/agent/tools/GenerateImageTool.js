/**
 * GenerateImageTool — calls an OpenAI-compat image generation endpoint
 * (e.g. OpenRouter Gemini image models) and returns the image data so
 * the chat window can render it directly.
 *
 * The tool is injected into the agentLoop dynamically when the active
 * provider config includes a valid imageModel setting.
 */
const { logger } = require('../../logger')

class GenerateImageTool {
  get name() { return 'generate_image' }

  get definition() {
    return {
      name: 'generate_image',
      description: 'Generate an image from a text description using an AI image model. Returns the image directly in the chat window. Use this for any request to create, draw, illustrate, or generate a picture.',
      input_schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed description of the image to generate. Be specific about style, colors, composition, lighting, etc.'
          }
        },
        required: ['prompt']
      }
    }
  }

  /**
   * @param {object} input  { prompt: string }
   * @param {object} providerConfig  { apiKey, baseURL, model }
   * @returns {{ content: [{type:'text',text:string}], details: { images: Array } }}
   */
  async execute(input, providerConfig) {
    const { prompt } = input
    const { apiKey, baseURL, model } = providerConfig

    if (!apiKey || !baseURL || !model) {
      return { content: [{ type: 'text', text: 'Image generation not configured: missing apiKey, baseURL, or model.' }], details: {} }
    }

    // Normalize baseURL: some providers store /api (OpenRouter), others /api/v1
    let base = baseURL.replace(/\/+$/, '')
    if (base.endsWith('/api')) base += '/v1'
    const url = base + '/chat/completions'
    logger.agent('GenerateImageTool: calling', { model, url, promptLen: prompt.length })

    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // Do NOT send tools — image models reject tool use
    })

    let respData
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(120000), // 2 min timeout
      })
      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 300)}`)
      }
      respData = await resp.json()
    } catch (err) {
      logger.error('GenerateImageTool: request failed', err.message)
      return { content: [{ type: 'text', text: `Image generation failed: ${err.message}` }], details: {} }
    }

    const message = respData?.choices?.[0]?.message || {}
    const images = []

    logger.agent('GenerateImageTool: raw response', {
      hasMessageImages: Array.isArray(message.images),
      messageImagesCount: message.images?.length ?? 0,
      contentType: typeof message.content,
      contentIsArray: Array.isArray(message.content),
      contentLength: Array.isArray(message.content) ? message.content.length : (typeof message.content === 'string' ? message.content.length : 0),
    })

    // OpenRouter Gemini image models return images in message.images[]
    if (Array.isArray(message.images)) {
      for (const img of message.images) {
        const url = img?.image_url?.url || img?.url || ''
        if (url.startsWith('data:')) {
          const commaIdx = url.indexOf(',')
          const mimeType = url.slice(5, commaIdx).replace(';base64', '')
          const data = url.slice(commaIdx + 1)
          images.push({ data, mimeType: mimeType || 'image/png' })
        } else if (url) {
          images.push({ url })
        }
      }
    }

    // Fallback: image embedded in content as array (multimodal response)
    if (images.length === 0 && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === 'image_url') {
          const u = part.image_url?.url || ''
          if (u.startsWith('data:')) {
            const commaIdx = u.indexOf(',')
            const mimeType = u.slice(5, commaIdx).replace(';base64', '')
            images.push({ data: u.slice(commaIdx + 1), mimeType: mimeType || 'image/png' })
          } else if (u) {
            images.push({ url: u })
          }
        }
      }
    }

    const textContent = typeof message.content === 'string'
      ? message.content
      : (message.content?.find?.(p => p.type === 'text')?.text || '')

    if (images.length > 0) {
      logger.agent('GenerateImageTool: success', { images: images.length, textLen: textContent.length })
      return {
        content: [{ type: 'text', text: textContent || `Generated ${images.length} image(s).` }],
        details: { images }
      }
    }

    // No image found — return whatever text we got
    logger.warn('GenerateImageTool: no image in response', JSON.stringify(respData).slice(0, 400))
    return {
      content: [{ type: 'text', text: textContent || 'No image was returned by the model. The model may not support image generation.' }],
      details: {}
    }
  }
}

module.exports = { GenerateImageTool }
