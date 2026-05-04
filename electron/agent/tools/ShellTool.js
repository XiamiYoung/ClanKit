const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')
const { spawn } = require('child_process')
const os = require('os')

class ShellTool extends BaseTool {
  constructor() {
    super(
      'execute_shell',
      'Execute a shell command and return stdout/stderr. Use for running code, system commands, scripts, or package managers.',
      'execute_shell'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute (e.g. "ls", "python3", "node", "npm")' },
        args:    { type: 'array', items: { type: 'string' }, description: 'Command arguments as array' },
        cwd:     { type: 'string', description: 'Working directory (defaults to home)' },
        timeout: { type: 'number', description: 'Timeout in ms (default 30000, max 120000)' }
      },
      required: ['command']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { command, args = [], cwd, timeout = 30000 } = params
    const safeArgs    = Array.isArray(args) ? args : []
    const safeCwd     = cwd || os.homedir()
    const safeTimeout = Math.min(timeout || 30000, 120000)

    return new Promise((resolve) => {
      // If already aborted before spawn, return immediately
      if (signal && signal.aborted) {
        return resolve(this._ok('[aborted]', { exit_code: 130 }))
      }

      let stdout = '', stderr = ''
      let killed = false

      const child = spawn(command, safeArgs, {
        cwd: safeCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const timer = setTimeout(() => {
        killed = true
        child.kill('SIGTERM')
      }, safeTimeout)

      // Listen to abort signal — kill child process when user clicks Stop
      if (signal) {
        const onAbort = () => {
          killed = true
          child.kill('SIGTERM')
          clearTimeout(timer)
        }
        signal.addEventListener('abort', onAbort, { once: true })
        child.on('close', () => signal.removeEventListener('abort', onAbort))
      }

      child.stdout.on('data', (data) => {
        if (signal && signal.aborted) return  // suppress chunks after abort
        const text = data.toString()
        stdout += text
        if (onUpdate) onUpdate({ type: 'stdout', text })
      })

      child.stderr.on('data', (data) => {
        if (signal && signal.aborted) return  // suppress chunks after abort
        const text = data.toString()
        stderr += text
        if (onUpdate) onUpdate({ type: 'stderr', text })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        resolve(this._err(err.message, { exit_code: 1 }))
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        const exitCode = killed ? (signal && signal.aborted ? 130 : 124) : (code ?? 0)
        const combined = [stdout, stderr].filter(Boolean).join('\n---stderr---\n')
        const { text, truncated, totalLines, totalBytes } = truncateOutput(combined)

        let out = text
        if (signal && signal.aborted) out += '\n[aborted]'
        else if (killed) out += '\n[timed out]'
        else if (exitCode !== 0) out += `\n[exit code: ${exitCode}]`

        resolve(this._ok(out, { exit_code: exitCode, truncated, totalLines, totalBytes }))
      })
    })
  }
}

module.exports = { ShellTool }
