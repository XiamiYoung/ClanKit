// Shared Edge-TTS voice list for ConfigView and AgentBodyViewer.
// `vibe` describes the voice's tonal quality so an LLM can pick a persona-fit
// when only language + gender narrows it to multiple candidates.
export const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: 'Xiaoxiao (晓晓)', gender: 'Female', locale: 'zh-CN', vibe: 'warm, mature, conversational' },
  { id: 'zh-CN-XiaoyiNeural',   name: 'Xiaoyi (晓伊)',   gender: 'Female', locale: 'zh-CN', vibe: 'youthful, lively, expressive' },
  { id: 'zh-CN-YunjianNeural',  name: 'Yunjian (云健)',  gender: 'Male',   locale: 'zh-CN', vibe: 'deep, steady, calm' },
  { id: 'zh-CN-YunxiNeural',    name: 'Yunxi (云希)',    gender: 'Male',   locale: 'zh-CN', vibe: 'warm, friendly, conversational' },
  { id: 'zh-CN-YunxiaNeural',   name: 'Yunxia (云夏)',   gender: 'Male',   locale: 'zh-CN', vibe: 'bright, youthful, casual' },
  { id: 'zh-CN-YunyangNeural',  name: 'Yunyang (云扬)',  gender: 'Male',   locale: 'zh-CN', vibe: 'professional, authoritative, formal' },
  { id: 'en-US-AriaNeural',     name: 'Aria',            gender: 'Female', locale: 'en-US', vibe: 'warm, friendly, professional' },
  { id: 'en-US-AvaNeural',      name: 'Ava',             gender: 'Female', locale: 'en-US', vibe: 'gentle, soft, conversational' },
  { id: 'en-US-AndrewNeural',   name: 'Andrew',          gender: 'Male',   locale: 'en-US', vibe: 'calm, confident, professional' },
  { id: 'en-US-BrianNeural',    name: 'Brian',           gender: 'Male',   locale: 'en-US', vibe: 'warm, approachable, casual' },
  { id: 'en-US-EmmaNeural',     name: 'Emma',            gender: 'Female', locale: 'en-US', vibe: 'bright, energetic, expressive' },
]

// Return a sensible default voice based on the app language setting
export function getDefaultVoiceForLocale(language) {
  if (String(language || '').startsWith('zh')) return 'zh-CN-YunxiaNeural'
  return 'en-US-AndrewNeural'
}

/**
 * Pick a default voice id matching both the app language AND the imported
 * persona's gender. Falls back to language-only default when gender is
 * unknown / nonbinary / not in the table.
 *
 * @param {string} language - 'zh' | 'en' | etc.
 * @param {string} gender   - 'male' | 'female' | 'nonbinary' | 'unknown' | ''
 * @returns {string} voice id from EDGE_VOICES
 */
export function getDefaultVoiceForGender(language, gender) {
  const lang = String(language || '').startsWith('zh') ? 'zh-CN' : 'en-US'
  const g = String(gender || '').toLowerCase()
  if (g !== 'male' && g !== 'female') {
    return getDefaultVoiceForLocale(language)
  }
  // Gender label in EDGE_VOICES is capitalized: 'Male' / 'Female'
  const wantGender = g === 'male' ? 'Male' : 'Female'
  const match = EDGE_VOICES.find(v => v.locale === lang && v.gender === wantGender)
  return match ? match.id : getDefaultVoiceForLocale(language)
}

// OpenAI TTS voices (for OpenAI whisper mode)
export const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', gender: 'Neutral' },
  { id: 'echo', name: 'Echo', gender: 'Male' },
  { id: 'fable', name: 'Fable', gender: 'Male' },
  { id: 'onyx', name: 'Onyx', gender: 'Male' },
  { id: 'nova', name: 'Nova', gender: 'Female' },
  { id: 'shimmer', name: 'Shimmer', gender: 'Female' },
]
