const { BaseTool } = require('./BaseTool')
const { execFile } = require('child_process')
const os = require('os')

class ShellTool extends BaseTool {
  constructor() {
    super(
      'execute_shell',
      'Execute a shell command and return stdout/stderr. Use for running code, system commands, scripts, or package managers.'
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

  async execute(input) {
    const { command, args = [], cwd, timeout = 30000 } = input
    const safeArgs = Array.isArray(args) ? args : []
    const safeCwd = cwd || os.homedir()
    const safeTimeout = Math.min(timeout || 30000, 120000)

    return new Promise((resolve) => {
      execFile(command, safeArgs, { timeout: safeTimeout, cwd: safeCwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout && !stderr) {
          resolve({ error: err.message })
        } else {
          // Truncate very long outputs to avoid blowing context
          const maxLen = 8000
          resolve({
            stdout: (stdout || '').slice(0, maxLen),
            stderr: (stderr || '').slice(0, maxLen),
            exit_code: err ? err.code : 0,
            truncated: (stdout || '').length > maxLen || (stderr || '').length > maxLen
          })
        }
      })
    })
  }
}

module.exports = { ShellTool }
