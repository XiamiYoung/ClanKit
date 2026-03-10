const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')
const { execFile } = require('child_process')
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
      execFile(command, safeArgs, { timeout: safeTimeout, cwd: safeCwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout && !stderr) {
          resolve(this._err(err.message, { exit_code: err.code ?? 1 }))
          return
        }

        const combined = [stdout, stderr].filter(Boolean).join('\n---stderr---\n')
        const { text, truncated, totalLines, totalBytes } = truncateOutput(combined)

        const exitCode = err ? (err.code ?? 1) : 0
        let out = text
        if (exitCode !== 0) out += `\n[exit code: ${exitCode}]`

        resolve(this._ok(out, { exit_code: exitCode, truncated, totalLines, totalBytes }))
      })
    })
  }
}

module.exports = { ShellTool }
