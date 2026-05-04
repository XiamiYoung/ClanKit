'use strict'

/**
 * memorySectionNames.js — i18n labels for the memory-section headings written
 * during chat import. Synthesizer + personaBuilder both write structured
 * markdown into MemoryStore using these headings; systemPromptBuilder reads
 * them back when it size-gates large memory blobs.
 *
 * Architectural rule (per discussion 2026-05-03): memory should hold ONLY
 * episodic / relational / negative-knowledge facts. Abstractive analysis
 * (mental models, decision heuristics, communication patterns, etc.) belongs
 * in the persona body (`agents.prompt`), not in memory — those layers were
 * doubly-injecting catchphrases like "得宝" / "你自己裁剪" into every reply.
 *
 * KEPT_SECTION_KEYS lists the only sections that should round-trip through
 * memory. Anything not in this list must NOT appear in the LLM-generated
 * memory output.
 */

const MEMORY_SECTIONS_I18N = {
  en: {
    SHARED_HISTORY:        'Shared History',
    IMPORTANT_PEOPLE:      'Important People',
    PREFERENCES_HABITS:    'Preferences & Habits',
    HONEST_BOUNDARIES:     'Honest Boundaries',
    RELATIONSHIP_TIMELINE: 'Relationship Timeline',
    LIFE_EVENTS:           'Life Events',
    IDENTITY:              'Identity',
  },
  zh: {
    SHARED_HISTORY:        '共同经历',
    IMPORTANT_PEOPLE:      '重要的人',
    PREFERENCES_HABITS:    '偏好与习惯',
    HONEST_BOUNDARIES:     '诚实边界',
    RELATIONSHIP_TIMELINE: '关系时间线',
    LIFE_EVENTS:           '生活事件',
    IDENTITY:              '身份卡',
  },
}

// Stable canonical keys allowed in memory. Sections OUTSIDE this list (Mental
// Models / Decision Heuristics / Values & Anti-Patterns / Relational Genealogy
// / Core Tensions / Communication Patterns / Topics & Interests) belong in
// the persona body; importers must not write them into memory.
const KEPT_SECTION_KEYS = [
  'SHARED_HISTORY',
  'IMPORTANT_PEOPLE',
  'PREFERENCES_HABITS',
  'HONEST_BOUNDARIES',
  'RELATIONSHIP_TIMELINE',
  'LIFE_EVENTS',
  'IDENTITY',
]

function _lang(language) {
  return language === 'zh' ? 'zh' : 'en'
}

/** Translate a canonical key (e.g. 'SHARED_HISTORY') into a localized heading. */
function getMemorySectionName(key, language) {
  const lang = _lang(language)
  return MEMORY_SECTIONS_I18N[lang][key] || MEMORY_SECTIONS_I18N.en[key] || key
}

/**
 * Localized labels for the kept sections, returned as an object keyed by
 * canonical key. Useful when the LLM prompt needs to enumerate allowed
 * categories ("use exactly these section names").
 */
function getKeptSectionLabels(language) {
  const lang = _lang(language)
  const out = {}
  for (const key of KEPT_SECTION_KEYS) {
    out[key] = MEMORY_SECTIONS_I18N[lang][key]
  }
  return out
}

/**
 * All known section labels across both languages. systemPromptBuilder uses
 * this for its MEMORY_KEY_SECTIONS list so size-gated truncation matches
 * regardless of which language the agent was imported in.
 */
function getAllKnownSectionLabels() {
  const labels = new Set()
  for (const lang of Object.keys(MEMORY_SECTIONS_I18N)) {
    for (const label of Object.values(MEMORY_SECTIONS_I18N[lang])) {
      labels.add(label)
    }
  }
  return Array.from(labels)
}

module.exports = {
  MEMORY_SECTIONS_I18N,
  KEPT_SECTION_KEYS,
  getMemorySectionName,
  getKeptSectionLabels,
  getAllKnownSectionLabels,
}
