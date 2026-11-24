// i18n key of the fixed endonym of a wiki language ("en" -> aidoc.langEn, "zh" -> aidoc.langZh).
// The set of languages itself comes from the main process (languages.available).
export function languageLabelKey(lang) {
  return 'aidoc.lang' + lang.charAt(0).toUpperCase() + lang.slice(1)
}

// Supported wiki language for a UI locale such as "zh-CN", or '' when the list has no match.
export function matchWikiLanguage(locale, available) {
  const base = String(locale || '').toLowerCase().split(/[-_]/)[0]
  return available.includes(base) ? base : ''
}
