// electron/im-bridge/adapters/feishu.js
'use strict'

let _client   = null
let _wsClient = null
let _running  = false

/**
 * Start the Feishu/Lark WebSocket event listener.
 * @param {{ appId: string, appSecret: string, allowedUsers: string[] }} opts
 * @param {(chatId: string, username: string, text: string) => void} onMessage
 */
function start(opts, onMessage) {
  if (_running) stop()
  const lark = require('@larksuiteoapi/node-sdk')

  const silentLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
  const loggerOpts = { loggerLevel: lark.LogLevel?.OFF ?? 4, logger: silentLogger }

  _client = new lark.Client({ appId: opts.appId, appSecret: opts.appSecret, ...loggerOpts })

  const dispatcher = new lark.EventDispatcher(loggerOpts).register({
    'im.message.receive_v1': async (data) => {
      try {
        const msg = data.message
        if (msg.message_type !== 'text') return
        const content = JSON.parse(msg.content)
        const text = content.text?.trim()
        if (!text) return

        const senderId = (
          data.sender?.sender_id?.open_id ||
          data.sender?.sender_id?.user_id ||
          'unknown'
        )
        const chatId = msg.chat_id || senderId

        const allowed = opts.allowedUsers
        if (allowed?.length > 0 && !allowed.includes(senderId)) return

        onMessage(chatId, senderId, text)
      } catch (err) {
        console.error('[feishu] message handler error:', err.message)
      }
    },
  })

  _wsClient = new lark.WSClient({ appId: opts.appId, appSecret: opts.appSecret, ...loggerOpts })
  _wsClient.start({ eventDispatcher: dispatcher })
  _running = true
}

/**
 * Send a plain-text message to a Feishu chat.
 * @param {string} chatId - chat_id or open_id
 * @param {string} text
 */
async function sendMessage(chatId, text) {
  if (!_client) return
  try {
    await _client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        content:    JSON.stringify({ text }),
        msg_type:   'text',
      },
    })
  } catch (err) {
    console.error('[feishu] sendMessage error:', err.message)
  }
}

function stop() {
  try { _wsClient?.stop?.() } catch {}
  _client   = null
  _wsClient = null
  _running  = false
}

function isRunning() { return _running }

module.exports = { start, stop, sendMessage, isRunning }
