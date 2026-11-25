/**
 * Worker-thread entry for CodeToolRunner. Runs one user-defined JavaScript tool body in a fresh `vm` context.
 *
 * No host object is ever placed in the context: `console` and the async wrapper are created inside it from a
 * prelude string, and the result leaves the context as a JSON string. Passing a host function (for example a
 * host `console.log`) would expose the host `Function` constructor to the code and break the sandbox.
 */
const { parentPort, workerData } = require('worker_threads')
const vm = require('vm')

// Output caps. The result object is JSON-encoded twice on its way to the model (once as the tool result, once as text)
// and the model-visible tool result is cut at 100000 chars, which would replace everything. Worst case escaping
// doubles the size, so result + logs must stay well under half of that.
const MAX_LOG_LINES = 50
const MAX_LOG_LINE_CHARS = 500
const MAX_LOG_TOTAL_CHARS = 12000
const MAX_RESULT_CHARS = 24000

// Runs inside the context. Collects console output and exposes __run(body, input).
const PRELUDE = `
  // Pure computation only: binary buffers and typed arrays allocate outside the V8 heap, so the worker heap
  // limit would not bound them. Remove every constructor that can allocate that memory.
  ['ArrayBuffer', 'SharedArrayBuffer', 'WebAssembly', 'Atomics', 'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
   'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float16Array', 'Float32Array', 'Float64Array',
   'BigInt64Array', 'BigUint64Array'].forEach(function (name) { delete globalThis[name]; });
  var __logs = [];
  var __logCount = 0;
  function __push(parts) {
    __logCount++;
    if (__logs.length >= ${MAX_LOG_LINES}) return;
    var line = parts.map(function (p) {
      if (typeof p === 'string') return p;
      try { var s = JSON.stringify(p); return s === undefined ? String(p) : s; } catch (e) { return String(p); }
    }).join(' ');
    __logs.push(line.length > ${MAX_LOG_LINE_CHARS} ? line.slice(0, ${MAX_LOG_LINE_CHARS}) : line);
  }
  var console = {
    log: function () { __push(Array.prototype.slice.call(arguments)); },
    info: function () { __push(Array.prototype.slice.call(arguments)); },
    warn: function () { __push(Array.prototype.slice.call(arguments)); },
    error: function () { __push(Array.prototype.slice.call(arguments)); }
  };
`

// Keeps the worker alive while user code awaits a promise that never settles; the runner's timer then fires
// and terminates the worker, so the caller sees a timeout instead of a silent exit.
const keepAlive = setInterval(() => {}, 1000)

function post(message) {
  clearInterval(keepAlive)
  parentPort.postMessage(message)
}

async function main() {
  const { code, input } = workerData
  // A prototype-less sandbox object: an ordinary `{}` would be a host-realm object, and code could reach the host
  // `Function` through `this.constructor.constructor` and from there `process`.
  const context = vm.createContext(Object.create(null))
  vm.runInContext(PRELUDE, context)

  let value
  try {
    // The user code is the body of an async function with one parameter, `input`.
    const fn = vm.runInContext(`(async function (input) {\n${code}\n})`, context, { timeout: 5000 })
    const pending = fn.call(undefined, String(input))
    value = await pending
  } catch (error) {
    return post({ ok: false, error: String(error && error.message ? error.message : error), logs: readLogs(context).logs, truncated: false })
  }

  let serialised
  try {
    // Serialise inside the context so the result string is the only thing that crosses the boundary.
    context.__value = value
    serialised = vm.runInContext('(function(){ var s = JSON.stringify(__value); return s === undefined ? "" : s; })()', context)
  } catch (error) {
    return post({ ok: false, error: `Result is not serialisable to JSON: ${String(error && error.message ? error.message : error)}`, logs: readLogs(context).logs, truncated: false })
  }
  if (typeof serialised !== 'string') {
    return post({ ok: false, error: 'Result is not serialisable to JSON', logs: readLogs(context).logs, truncated: false })
  }

  const { logs, clamped } = readLogs(context)
  let truncated = clamped || vm.runInContext('__logCount > __logs.length', context) === true
  let result = serialised
  if (result.length > MAX_RESULT_CHARS) {
    result = `${result.slice(0, MAX_RESULT_CHARS)}\n[truncated: ${result.length - MAX_RESULT_CHARS} more chars omitted]`
    truncated = true
  }
  post({ ok: true, result, logs, truncated })
}

// The context's log array and JSON.stringify are writable by user code, so never trust what comes back:
// re-validate and re-apply the caps here, in host code.
function readLogs(context) {
  let raw
  try {
    raw = JSON.parse(vm.runInContext('JSON.stringify(__logs)', context))
  } catch {
    return { logs: [], clamped: false }
  }
  if (!Array.isArray(raw)) return { logs: [], clamped: true }
  const logs = []
  let total = 0
  let clamped = raw.length > MAX_LOG_LINES
  for (const entry of raw.slice(0, MAX_LOG_LINES)) {
    let line = typeof entry === 'string' ? entry : String(entry)
    if (line.length > MAX_LOG_LINE_CHARS) { line = line.slice(0, MAX_LOG_LINE_CHARS); clamped = true }
    if (total + line.length > MAX_LOG_TOTAL_CHARS) { clamped = true; break }
    total += line.length
    logs.push(line)
  }
  return { logs, clamped }
}

main().catch(error => post({ ok: false, error: String(error && error.message ? error.message : error), logs: [], truncated: false }))
