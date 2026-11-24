// sourceStates is keyed by main-process absolute paths while tree nodes carry renderer paths, which may differ in
// separators and drive-letter case on Windows. Both sides are normalised before the lookup.
export function normalizeSourcePathKey(path) {
  const slashed = String(path || '').replace(/\\/g, '/')
  return /^[a-zA-Z]:/.test(slashed) ? slashed.toLowerCase() : slashed
}

const indexCache = new WeakMap()

export function lookupSourceState(states, path) {
  if (!states || !path) return undefined
  let index = indexCache.get(states)
  if (!index) {
    index = new Map(Object.entries(states).map(([key, state]) => [normalizeSourcePathKey(key), state]))
    indexCache.set(states, index)
  }
  return index.get(normalizeSourcePathKey(path))
}
