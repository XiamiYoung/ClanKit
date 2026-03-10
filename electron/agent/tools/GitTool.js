const { BaseTool } = require('./BaseTool')
const { truncateOutput } = require('./truncate')
const { execFile } = require('child_process')
const os = require('os')

class GitTool extends BaseTool {
  constructor() {
    super(
      'git_operation',
      'Perform git operations: status, diff, log, commit, branch, checkout, add, stash.',
      'git_operation'
    )
  }

  schema() {
    return {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['status', 'diff', 'log', 'commit', 'branch', 'checkout', 'add', 'stash', 'pull', 'push'], description: 'Git operation' },
        args:      { type: 'array', items: { type: 'string' }, description: 'Additional git arguments' },
        cwd:       { type: 'string', description: 'Repository directory (defaults to home)' }
      },
      required: ['operation']
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { operation, args = [], cwd } = params
    const safeCwd   = cwd || os.homedir()
    const gitArgs   = [operation, ...args]

    return new Promise((resolve) => {
      execFile('git', gitArgs, { timeout: 30000, cwd: safeCwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          resolve(this._err(err.message, { stderr: stderr || '', exit_code: err.code ?? 1 }))
          return
        }

        const combined = stdout || ''
        const { text, truncated, totalLines } = truncateOutput(combined)
        const exitCode = err ? (err.code ?? 1) : 0
        let out = text
        if (stderr) out += `\n---stderr---\n${stderr.slice(0, 500)}`
        if (exitCode !== 0) out += `\n[exit code: ${exitCode}]`

        resolve(this._ok(out, { exit_code: exitCode, truncated, totalLines }))
      })
    })
  }
}

module.exports = { GitTool }
