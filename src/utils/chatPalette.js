// Shared 8-color palette used by chat-tree row highlights and per-agent
// context bars. Sibling index → palette slot; adjacent chats / agents in the
// same group never share a color, so the visual rotation is consistent across
// the sidebar tree and the context bar above each chat.

export const CHAT_PALETTE_GRADIENTS = [
  'linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%)',
  'linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%)',
  'linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%)',
  'linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%)',
  'linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%)',
  'linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%)',
  'linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%)',
  'linear-gradient(135deg, #831843 0%, #BE185D 60%, #EC4899 100%)',
]

// The mid stop of each gradient — the most saturated color in the 3-stop
// gradient. Used for solid-color fills like context bars where a gradient
// would be too busy.
const PALETTE_MID_RGB = [
  '37, 99, 235',    // blue
  '124, 58, 237',   // violet
  '5, 150, 105',    // emerald
  '217, 119, 6',    // amber
  '220, 38, 38',    // red
  '8, 145, 178',    // cyan
  '202, 138, 4',    // yellow
  '190, 24, 93',    // pink
]

function normIdx(idx) {
  const n = CHAT_PALETTE_GRADIENTS.length
  return ((idx % n) + n) % n
}

export function paletteGradient(idx) {
  return CHAT_PALETTE_GRADIENTS[normIdx(idx)]
}

// Returns 'r, g, b' suitable for `rgb(${paletteRgb(i)})` or `rgba(${...}, 0.5)`.
export function paletteRgb(idx) {
  return PALETTE_MID_RGB[normIdx(idx)]
}

// Resolve a palette slot index for a chat tree node. Sibling index is
// preferred; createdAt / id hash are fallbacks. Mirrors `gradientForChat`
// but returns the slot number so callers can pick either the gradient or
// the solid mid-rgb without duplicating the resolution rules.
export function paletteIndexForChat(node, idx) {
  if (typeof idx === 'number') return idx
  if (node && typeof node.createdAt === 'number') return node.createdAt
  const id = node?.id || ''
  if (!id) return 0
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return Math.abs(hash)
}

// Pick a palette gradient for a chat tree node.
export function gradientForChat(node, idx) {
  return paletteGradient(paletteIndexForChat(node, idx))
}

// Pick the solid mid-rgb ('r, g, b' string) for a chat tree node — same
// resolution rules as `gradientForChat`, for fills like the context bar
// or the scroll-to-bottom pulse.
export function rgbForChat(node, idx) {
  return paletteRgb(paletteIndexForChat(node, idx))
}
