/**
 * SVG icon definitions for persona avatars.
 * Each icon uses Lucide-style paths (24x24 viewBox, stroke-based).
 * `paths` is an array of SVG <path> `d` attributes.
 */
export const PERSONA_ICONS = [
  // ── System / AI personas ────────────────────────────────────────────────
  { id: 'cpu',          label: 'CPU',           category: 'system', paths: ['M4 4h16v16H4z', 'M9 1v3', 'M15 1v3', 'M9 20v3', 'M15 20v3', 'M1 9h3', 'M1 15h3', 'M20 9h3', 'M20 15h3'] },
  { id: 'bot',          label: 'Bot',           category: 'system', paths: ['M12 8V4H8', 'M4 12h16', 'M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1', 'M9 16h0', 'M15 16h0'] },
  { id: 'brain',        label: 'Brain',         category: 'system', paths: ['M12 2a6 6 0 0 0-6 6c0 3 2 5 3 7h6c1-2 3-4 3-7a6 6 0 0 0-6-6z', 'M9 15v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-4'] },
  { id: 'zap',          label: 'Bolt',          category: 'system', paths: ['M13 2L3 14h9l-1 8 10-12h-9l1-8'] },
  { id: 'terminal',     label: 'Terminal',      category: 'system', paths: ['M4 17l6-6-6-6', 'M12 19h8'] },
  { id: 'code',         label: 'Code',          category: 'system', paths: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'] },
  { id: 'sparkles',     label: 'Sparkles',      category: 'system', paths: ['M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z', 'M5 19l.5 1.5L7 21l-1.5.5L5 23l-.5-1.5L3 21l1.5-.5L5 19z'] },
  { id: 'wand',         label: 'Wand',          category: 'system', paths: ['M15 4V2', 'M15 16v-2', 'M8 9h2', 'M20 9h2', 'M17.8 11.8L19 13', 'M15 9h0', 'M17.8 6.2L19 5', 'M3 21l9-9'] },
  { id: 'globe',        label: 'Globe',         category: 'system', paths: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M2 12h20', 'M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'] },
  { id: 'shield',       label: 'Shield',        category: 'system', paths: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'] },
  { id: 'rocket',       label: 'Rocket',        category: 'system', paths: ['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z', 'M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'] },
  { id: 'microscope',   label: 'Microscope',    category: 'system', paths: ['M6 18h8', 'M3 22h18', 'M14 22a7 7 0 1 0 0-14h-1', 'M9 14h2', 'M9 12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2z'] },

  // ── User / People personas ──────────────────────────────────────────────
  { id: 'user',         label: 'User',          category: 'user', paths: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'] },
  { id: 'user-cog',     label: 'User Cog',      category: 'user', paths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M19.7 14.3a1.1 1.1 0 0 0-.1-1.5l-.5-.4a1 1 0 0 1 0-1.6l.5-.4a1.1 1.1 0 0 0 .1-1.5l-.7-.7a1.1 1.1 0 0 0-1.5-.1l-.4.5a1 1 0 0 1-1.6 0l-.4-.5a1.1 1.1 0 0 0-1.5.1l-.7.7'] },
  { id: 'users',        label: 'Team',          category: 'user', paths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'] },
  { id: 'graduation',   label: 'Graduate',      category: 'user', paths: ['M22 10v6M2 10l10-5 10 5-10 5z', 'M6 12v5c0 2 3 3 6 3s6-1 6-3v-5'] },
  { id: 'briefcase',    label: 'Briefcase',     category: 'user', paths: ['M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z', 'M16 5V3a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2'] },
  { id: 'crown',        label: 'Crown',         category: 'user', paths: ['M2 18l3-10 5 4 2-8 2 8 5-4 3 10z'] },
  { id: 'heart',        label: 'Heart',         category: 'user', paths: ['M20.8 4.6a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.02-1.08a5.5 5.5 0 0 0-7.78 7.78l1.02 1.08L12 21.23l7.78-7.78 1.02-1.08a5.5 5.5 0 0 0 0-7.78z'] },

  // ── Domain / Topic icons ─────────────────────────────────────────────────
  { id: 'palette',      label: 'Palette',       category: 'domain', paths: ['M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.65 1.5-1.5 0-.39-.15-.74-.39-1.02-.24-.28-.39-.63-.39-1.02 0-.83.67-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.96-10-9.96z', 'M6.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M10 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M14 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M17.5 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'] },
  { id: 'book',         label: 'Book',          category: 'domain', paths: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'] },
  { id: 'pen-tool',     label: 'Pen Tool',      category: 'domain', paths: ['M12 19l7-7 3 3-7 7-3-3z', 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z', 'M2 2l7.586 7.586', 'M11 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'] },
  { id: 'music',        label: 'Music',         category: 'domain', paths: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'] },
  { id: 'camera',       label: 'Camera',        category: 'domain', paths: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'] },
]

/** Lookup by id. Returns null if not found. */
export function getPersonaIcon(id) {
  return PERSONA_ICONS.find(i => i.id === id) || null
}
