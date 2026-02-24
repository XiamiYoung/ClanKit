/**
 * McpClient — manages a single MCP server subprocess.
 *
 * Communicates via JSON-RPC 2.0 over stdin/stdout (newline-delimited JSON).
 * Handles initialization handshake, tool discovery, and tool execution.
 */
const { spawn } = require('child_process')
const { logger } = require('../../logger')

const INITIALIZE_TIMEOUT = 30000  // 30s — npx may need to download
const CALL_TIMEOUT = 30000        // 30s for tool calls
const KILL_TIMEOUT = 5000         // 5s before SIGKILL

class McpClient {
  constructor({ name, command, args = [], env = {} }) {
    this.name = name
    this.command = command
    this.args = args
    this.env = env

    this.process = null
    this.started = false
    this.tools = []

    this._nextId = 1
    this._pending = new Map() // id → { resolve, reject, timer }
    this._buffer = ''
  }

  /**
   * Start the subprocess and perform MCP initialization handshake.
   */
  async start() {
    if (this.started) return

    const spawnEnv = { ...process.env, ...this.env }

    logger.info(`[MCP:${this.name}] Spawning: ${this.command} ${this.args.join(' ')}`)

    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      windowsHide: true,
    })

    this.process.stdout.on('data', (chunk) => this._onStdoutData(chunk))
    this.process.stderr.on('data', (chunk) => {
      logger.warn(`[MCP:${this.name}] stderr:`, chunk.toString().trim())
    })
    this.process.on('error', (err) => {
      logger.error(`[MCP:${this.name}] Process error:`, err.message)
      this._rejectAll(err)
    })
    this.process.on('exit', (code, signal) => {
      logger.info(`[MCP:${this.name}] Process exited: code=${code} signal=${signal}`)
      this.started = false
      this._rejectAll(new Error(`MCP server "${this.name}" exited (code=${code}, signal=${signal})`))
    })

    // 1. Send initialize request
    const initResult = await this._sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'SparkAI', version: '1.0.0' },
    }, INITIALIZE_TIMEOUT)

    logger.info(`[MCP:${this.name}] Initialized:`, {
      serverName: initResult?.serverInfo?.name,
      protocolVersion: initResult?.protocolVersion,
    })

    // 2. Send initialized notification (no response expected)
    this._sendNotification('notifications/initialized', {})

    // 3. Discover tools
    this.tools = await this.listTools()

    this.started = true
    logger.info(`[MCP:${this.name}] Ready with ${this.tools.length} tool(s)`)
  }

  /**
   * List tools from the server.
   */
  async listTools() {
    const result = await this._sendRequest('tools/list', {}, CALL_TIMEOUT)
    this.tools = result?.tools || []
    return this.tools
  }

  /**
   * Call a tool on this server.
   */
  async callTool(name, args = {}) {
    const result = await this._sendRequest('tools/call', {
      name,
      arguments: args,
    }, CALL_TIMEOUT)
    return result
  }

  /**
   * Stop the subprocess gracefully, then force-kill after timeout.
   */
  async stop() {
    if (!this.process) return

    this._rejectAll(new Error('Client stopped'))

    return new Promise((resolve) => {
      const proc = this.process
      this.process = null
      this.started = false

      if (!proc || proc.exitCode !== null) {
        resolve()
        return
      }

      const killTimer = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch {}
        resolve()
      }, KILL_TIMEOUT)

      proc.once('exit', () => {
        clearTimeout(killTimer)
        resolve()
      })

      try { proc.kill('SIGTERM') } catch {}
    })
  }

  // ── Private methods ────────────────────────────────────────────────────────

  _sendRequest(method, params, timeout = CALL_TIMEOUT) {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin.writable) {
        return reject(new Error(`MCP server "${this.name}" is not running`))
      }

      const id = this._nextId++
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'

      const timer = setTimeout(() => {
        this._pending.delete(id)
        reject(new Error(`MCP request "${method}" timed out after ${timeout}ms`))
      }, timeout)

      this._pending.set(id, { resolve, reject, timer })

      try {
        this.process.stdin.write(msg)
      } catch (err) {
        clearTimeout(timer)
        this._pending.delete(id)
        reject(err)
      }
    })
  }

  _sendNotification(method, params) {
    if (!this.process || !this.process.stdin.writable) return
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    try {
      this.process.stdin.write(msg)
    } catch (err) {
      logger.warn(`[MCP:${this.name}] Failed to send notification "${method}":`, err.message)
    }
  }

  _onStdoutData(chunk) {
    this._buffer += chunk.toString()
    const lines = this._buffer.split('\n')
    // Keep incomplete last line in buffer
    this._buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed)
        this._handleMessage(json)
      } catch (err) {
        logger.warn(`[MCP:${this.name}] Non-JSON stdout line:`, trimmed.slice(0, 200))
      }
    }
  }

  _handleMessage(msg) {
    // Response to a pending request
    if (msg.id !== undefined && msg.id !== null) {
      const pending = this._pending.get(msg.id)
      if (pending) {
        this._pending.delete(msg.id)
        clearTimeout(pending.timer)

        if (msg.error) {
          pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`))
        } else {
          pending.resolve(msg.result)
        }
        return
      }
    }

    // Server-initiated notification or request — log it
    if (msg.method) {
      logger.info(`[MCP:${this.name}] Server notification: ${msg.method}`)
    }
  }

  _rejectAll(err) {
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer)
      pending.reject(err)
    }
    this._pending.clear()
  }
}

module.exports = { McpClient }
