const { BaseTool } = require('./BaseTool')
const { execFile } = require('child_process')
const os = require('os')

class GitTool extends BaseTool {
  constructor() {
    super(
      'git_operation',
      'Perform git operations: status, diff, log, commit, branch, checkout, add, stash.'
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

  async execute(input) {
    const { operation, args = [], cwd } = input
    const safeCwd = cwd || os.homedir()

    const gitArgs = [operation, ...args]

    return new Promise((resolve) => {
      execFile('git', gitArgs, { timeout: 30000, cwd: safeCwd, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          resolve({ error: err.message, stderr: stderr || '' })
        } else {
          resolve({
            output: (stdout || '').slice(0, 8000),
            stderr: (stderr || '').slice(0, 2000),
            exit_code: err ? err.code : 0
          })
        }
      })
    })
  }
}

module.exports = { GitTool }
