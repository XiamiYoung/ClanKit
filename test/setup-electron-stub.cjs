// Loaded by vitest's `test.setupFiles` before every test file's top-level
// body runs. Hooks Module.prototype.require so any `require('electron')` —
// whether emitted by Vitest's transformer, by Node's native CJS loader, or by
// `createRequire(import.meta.url)` inside a test file — resolves to our stub.
//
// Vitest's resolve.alias alone is not enough: 5+ test files use
// `createRequire(import.meta.url)` to load CJS production modules (a pattern
// documented in LESSONS.md for monkey-patching CJS singletons), and
// createRequire's returned function uses Node's native resolver, which
// bypasses Vitest's alias system entirely.
//
// This hook runs at the Module.prototype level — the lowest common
// denominator — so it intercepts every variant.
const Module = require('module')
const path = require('path')

const STUB_PATH = path.resolve(__dirname, 'electron-stub.cjs')

const originalRequire = Module.prototype.require
Module.prototype.require = function patchedRequire(id) {
  if (id === 'electron') {
    return originalRequire.call(this, STUB_PATH)
  }
  return originalRequire.apply(this, arguments)
}
