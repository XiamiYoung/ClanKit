const BACKGROUNDS = ['cafe', 'library', 'office', 'park', 'space']

export function hashAgentId(id) {
  let h = 0
  for (const c of (id || '')) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

export function pickBackground(sessionId) {
  return BACKGROUNDS[hashAgentId(sessionId) % BACKGROUNDS.length]
}
