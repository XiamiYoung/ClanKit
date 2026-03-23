/**
 * IPC serialization utilities.
 * Vue reactive proxies cannot cross the Electron IPC structured-clone boundary.
 * All data sent via IPC must be plain objects — use safeClone() before every call.
 */

/**
 * Deep-clone a value, stripping Vue reactive proxies.
 * Returns null/undefined as-is. Handles arrays, objects, primitives.
 */
export function safeClone(obj) {
  if (obj == null) return obj
  if (typeof obj !== 'object') return obj
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Clone multiple values at once.
 * Usage: const [a, b, c] = safeCloneAll(refA.value, refB.value, rawObj)
 */
export function safeCloneAll(...args) {
  return args.map(safeClone)
}
