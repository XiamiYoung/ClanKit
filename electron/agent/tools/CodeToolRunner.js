/**
 * CodeToolRunner — executes a user-defined "code" tool (JavaScript only) in a short-lived worker thread.
 *
 * The worker evaluates the code in a `vm` context that holds no host objects (see codeToolWorker.js). A wall-clock
 * timer or an abort signal terminates the worker for real, so runaway code cannot freeze the main process.
 * This is a guard against accidents, not a hard security boundary: the permission gate is the primary control.
 */
const path = require('path')
const { Worker } = require('worker_threads')

const DEFAULT_TIMEOUT_MS = 10000
const MAX_TIMEOUT_MS = 30000
const WORKER_PATH = path.join(__dirname, 'codeToolWorker.js')

function normaliseInput(input) {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input) ?? ''
  } catch {
    return String(input)
  }
}

/**
 * @param {{ code: string, input?: unknown, timeoutMs?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ ok: boolean, result?: string, logs: string[], error?: string, truncated: boolean }>}
 */
function runCodeTool({ code, input, timeoutMs, signal } = {}) {
  const limit = Math.min(Math.max(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS)

  return new Promise(resolve => {
    let settled = false
    let worker
    let timer

    const finish = outcome => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      if (worker) worker.terminate().catch(() => {})
      resolve({ logs: [], truncated: false, ...outcome })
    }
    const onAbort = () => finish({ ok: false, error: 'Code tool aborted' })

    if (signal?.aborted) return finish({ ok: false, error: 'Code tool aborted' })
    if (typeof code !== 'string' || !code.trim()) return finish({ ok: false, error: 'Code tool has no code' })

    try {
      worker = new Worker(WORKER_PATH, {
        workerData: { code, input: normaliseInput(input) },
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
        env: {},
      })
    } catch (error) {
      return finish({ ok: false, error: `Could not start code tool worker: ${error.message}` })
    }

    timer = setTimeout(() => finish({ ok: false, error: `Code tool timed out after ${limit} ms` }), limit)
    if (signal) signal.addEventListener('abort', onAbort, { once: true })

    worker.on('message', message => finish(message))
    worker.on('error', error => finish({ ok: false, error: `Code tool failed: ${error.message || error}` }))
    worker.on('exit', exitCode => finish({ ok: false, error: `Code tool worker exited unexpectedly (code ${exitCode})` }))
  })
}

/** What the model sees for a code tool. The source is deliberately left out: the model only needs the contract. */
function buildCodeToolDescription(tool) {
  return `[Code: JavaScript] ${tool.description || tool.name}. Pass any data the code needs as a string in "input". The code runs in a sandbox and its return value is the result.`
}

module.exports = { runCodeTool, buildCodeToolDescription, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS }
