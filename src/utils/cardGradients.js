export const CARD_GRADIENTS = [
  'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)',
  'linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%)',
  'linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%)',
  'linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%)',
  'linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%)',
  'linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%)',
  'linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%)',
  'linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%)',
]

export function cardGradient(idx = 0) {
  return CARD_GRADIENTS[idx % CARD_GRADIENTS.length]
}
