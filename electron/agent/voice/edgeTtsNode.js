/**
 * Pure Node.js Edge TTS client — no Python dependency.
 * Port of rany2/edge-tts DRM + WebSocket protocol.
 */
const crypto = require('crypto')
const { WebSocket } = require('ws')

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`
const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
const WIN_EPOCH = 11644473600
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

let clockSkewSeconds = 0

function generateSecMsGec() {
  let ticks = Date.now() / 1000 + clockSkewSeconds
  ticks += WIN_EPOCH
  ticks -= ticks % 300
  ticks *= 1e9 / 100 // convert to 100-nanosecond intervals
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

function uuid() {
  return crypto.randomUUID().replaceAll('-', '')
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Synthesize text to MP3 buffer using Edge TTS.
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.voice] - e.g. 'zh-CN-XiaoxiaoNeural'
 * @param {string} [options.rate] - e.g. '+0%'
 * @param {string} [options.volume] - e.g. '+0%'
 * @param {string} [options.pitch] - e.g. '+0Hz'
 * @param {number} [options.timeout] - ms, default 60000
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
function tts(text, options = {}) {
  const {
    voice = 'en-GB-SoniaNeural',
    rate = '+0%',
    volume = '+0%',
    pitch = '+0Hz',
    timeout = 60000,
  } = options

  return new Promise((resolve, reject) => {
    const secGec = generateSecMsGec()
    const connId = uuid()
    const url = `${WSS_URL}&Sec-MS-GEC=${secGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`

    const ws = new WebSocket(url, {
      host: 'speech.platform.bing.com',
      origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Sec-WebSocket-Version': '13',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${generateMuid()};`,
      },
    })

    const audioChunks = []
    let timer = null
    let settled = false

    const settle = (fn, val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch {}
      fn(val)
    }

    timer = setTimeout(() => settle(reject, new Error('Edge TTS timeout')), timeout)

    ws.on('open', () => {
      const speechConfig = JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
              outputFormat: OUTPUT_FORMAT,
            },
          },
        },
      })
      const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`
      ws.send(configMsg, { compress: true }, (err) => {
        if (err) return settle(reject, err)

        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>`
          + `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>`
          + `${escapeXml(text)}</prosody></voice></speak>`
        const ssmlMsg = `X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`
        ws.send(ssmlMsg, { compress: true }, (err2) => {
          if (err2) settle(reject, err2)
        })
      })
    })

    ws.on('message', (rawData, isBinary) => {
      if (!isBinary) {
        const text = rawData.toString('utf8')
        if (text.includes('turn.end')) {
          settle(resolve, Buffer.concat(audioChunks))
        }
        return
      }
      const separator = 'Path:audio\r\n'
      const idx = rawData.indexOf(separator)
      if (idx >= 0) {
        audioChunks.push(rawData.subarray(idx + separator.length))
      }
    })

    ws.on('error', (err) => {
      // Handle 403 with clock skew adjustment
      if (err.message && err.message.includes('403')) {
        clockSkewSeconds += 300
      }
      settle(reject, err)
    })

    ws.on('close', () => {
      if (!settled) settle(reject, new Error('WebSocket closed before turn.end'))
    })
  })
}

/**
 * List available Edge TTS voices.
 * @returns {Promise<Array>}
 */
async function getVoices() {
  const resp = await fetch(VOICE_LIST_URL)
  if (!resp.ok) throw new Error(`Failed to fetch voices: ${resp.status}`)
  return resp.json()
}

module.exports = { tts, getVoices }
