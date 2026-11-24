'use strict'

// App locales that can own an independent wiki tree (wiki/<lang>/...). Single source of truth.
const WIKI_LANGUAGES = Object.freeze(['en', 'zh'])
const DEFAULT_WIKI_LANGUAGE = 'en'

// Language names used in the ingest agent prompt.
const WIKI_LANGUAGE_NAMES = Object.freeze({ en: 'English', zh: 'Simplified Chinese' })

function isWikiLanguage(value) {
  return typeof value === 'string' && WIKI_LANGUAGES.includes(value)
}

// Maps any locale-like value (for example "zh-CN") to a supported wiki language.
function normalizeWikiLanguage(value) {
  const base = String(value || '').toLowerCase().split(/[-_]/)[0]
  return isWikiLanguage(base) ? base : DEFAULT_WIKI_LANGUAGE
}

// Strict validation of a user-supplied selection: a non-empty array of supported languages.
// Returns the deduplicated selection in stable (supported) order, or null when invalid.
function validateWikiLanguages(input) {
  if (!Array.isArray(input) || input.length === 0 || !input.every(isWikiLanguage)) return null
  return WIKI_LANGUAGES.filter(lang => input.includes(lang))
}

function wikiLanguageRoot(lang) {
  return `wiki/${lang}`
}

// Language of a vault-relative wiki path (wiki/<lang>/...), or null for legacy flat pages and non-wiki paths.
function wikiLanguageOf(rel) {
  if (typeof rel !== 'string') return null
  const match = /^wiki\/([^/\\]+)\//i.exec(rel.replace(/\\/g, '/'))
  const lang = match?.[1].toLowerCase()
  return isWikiLanguage(lang) ? lang : null
}

module.exports = {
  WIKI_LANGUAGES, DEFAULT_WIKI_LANGUAGE, WIKI_LANGUAGE_NAMES,
  isWikiLanguage, normalizeWikiLanguage, validateWikiLanguages, wikiLanguageRoot, wikiLanguageOf,
}
