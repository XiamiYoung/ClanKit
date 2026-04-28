/**
 * RenderReportTool v2 — accepts raw sections+stats from extract_sections,
 * auto-generates all D scalars and 27 HTML fragments internally.
 *
 * The LLM just passes the extract_sections JSON through; this tool does
 * all data transformation, HTML generation, and template rendering.
 */
const fs = require('fs')
const path = require('path')

const SKILL_DIR = __dirname

// Self-contained base — skill tools run from AppData, can't import project modules
class BaseTool {
  constructor(name, description, label) {
    this.name = name
    this.description = description
    this.label = label || name
  }
  definition() {
    return { name: this.name, description: this.description, input_schema: this.schema() }
  }
  schema() { throw new Error('schema() must be implemented') }
  _ok(text, details = {}) {
    return { content: [{ type: 'text', text: String(text) }], details }
  }
  _err(message, details = {}) {
    return { content: [{ type: 'text', text: `Error: ${message}` }], details, isError: true }
  }
}

const logger = {
  agent: (msg, data) => console.log(`[AGENT] ${msg}`, data || ''),
  error: (msg, err) => console.error(`[ERROR] ${msg}`, err || ''),
  warn:  (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
}

// ─── Block count spec (validation) ───

const BLOCK_COUNT_SPEC = {
  deep_analysis_body:  { className: 'dim-row',           range: [14, 18] },
  ways_body:           { className: 'way-row',           count: 10 },
  theatre_acts:        { className: 'theatre-act',       count: 10 },
  subtext_rows:        { className: 'subtext-row',       count: 6 },
  quotes_grid:         { className: 'quote-card',        range: [10, 20] },
  compat_rows:         { className: 'compat-row',        count: 8 },
  ocean_bars:          { className: 'ocean-bar-row',     count: 5 },
  ocean_details:       { className: 'ocean-detail-card', count: 6 },
  mode_rows:           { className: 'mode-row',          count: 4 },
  emotion_cards:       { className: 'emotion-card',      count: 3 },
  trajectory_cards:    { className: 'traj-card',         count: 3 },
  growth_cards:        { className: 'advice-card',       count: 6 },
  best_times:          { className: 'relation-row',      count: 3 },
  next_predictions:    { className: 'relation-row',      count: 4 },
  signal_green_items:  { className: 'signal-item',       count: 5 },
  signal_yellow_items: { className: 'signal-item',       count: 5 },
  signal_red_items:    { className: 'signal-item',       count: 5 },
  do_items:            { className: 'apple-item',        count: 4 },
  dont_items:          { className: 'apple-item',        count: 4 },
  hero_badges:         { className: 'badge',             range: [5, 10] },
  topic_loves:         { className: 'topic-pill',        range: [3, 8] },
  topic_neutral:       { className: 'topic-pill',        range: [3, 8] },
  topic_avoid:         { className: 'topic-pill',        range: [2, 8] },
  topic_cloud:         { className: 'topic-tag',         range: [6, 14] },
  gift_rows:           { className: 'relation-row',      range: [5, 8] },
  timeline_rows:       { className: 'tl-row',            range: [4, 6] },
  relation_modes:      { className: 'relation-row',      range: [3, 6] },
  unique_memories:     { className: 'memory-card',       range: [10, 20] },
}

// ─── Utilities ───

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(n) { return Number(n || 0).toLocaleString('en-US') }
function pct1(n) { return Number(n || 0).toFixed(1) }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

function padArr(arr, target, fill) {
  const result = [...arr]
  while (result.length < target) {
    result.push(typeof fill === 'function' ? fill(result.length) : fill)
  }
  return result.slice(0, target)
}

function clampArr(arr, min, max, fill) {
  let result = arr.slice(0, max)
  if (result.length < min) result = padArr(result, min, fill)
  return result
}

// ─── i18n constants ───

const MBTI_AXIS = {
  zh: { E: '外向', I: '内向', S: '实感', N: '直觉', T: '思考', F: '情感', J: '判断', P: '感知' },
  en: { E: 'Extroversion', I: 'Introversion', S: 'Sensing', N: 'Intuition', T: 'Thinking', F: 'Feeling', J: 'Judging', P: 'Perceiving' },
}

function mbtiFullName(type, lang) {
  if (!type || type.length !== 4) return type || ''
  const ax = MBTI_AXIS[lang] || MBTI_AXIS.en
  const sep = lang === 'zh' ? ' · ' : ' / '
  return type.split('').map(l => ax[l.toUpperCase()] || l).join(sep)
}

const ATT_VARIANTS = {
  zh: { secure: '安全型', anxious: '焦虑-沉迷型', avoidant: '回避-自主型', fearful: '恐惧-回避型' },
  en: { secure: 'Secure', anxious: 'Anxious-Preoccupied', avoidant: 'Dismissive-Avoidant', fearful: 'Fearful-Avoidant' },
}

const OCEAN_NAMES = {
  zh: ['开放性 (O)', '尽责性 (C)', '外向性 (E)', '宜人性 (A)', '神经质 (N)'],
  en: ['Openness (O)', 'Conscientiousness (C)', 'Extraversion (E)', 'Agreeableness (A)', 'Neuroticism (N)'],
}
const OCEAN_COLORS = ['#7c3aed', '#059669', '#2563eb', '#d97706', '#e11d48']
const OCEAN_KEYS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']

const BADGE_COLORS = ['badge-blue', 'badge-purple', 'badge-teal', 'badge-amber', 'badge-rose', 'badge-green']
const QUOTE_COLORS = ['#4f46e5', '#e11d48', '#d97706', '#7c3aed', '#059669', '#06b6d4', '#ec4899']
const TL_COLORS = ['#2563eb', '#7c3aed', '#06b6d4', '#059669', '#d97706']
const WAY_COLORS = ['#34C759', '#007AFF', '#5856D6', '#FF9500', '#FF2D55', '#AF52DE', '#5AC8FA', '#FF3B30', '#64D2FF', '#30D158']

const SIGNAL_STYLES = {
  strong: { bg: '#d1fae5', color: '#059669' },
  medium: { bg: '#fef3c7', color: '#d97706' },
  weak:   { bg: '#f3f4f6', color: '#9ca3af' },
}

const GROWTH_GRADIENTS = [
  'linear-gradient(90deg,#4f46e5,#7c3aed)',
  'linear-gradient(90deg,#059669,#10b981)',
  'linear-gradient(90deg,#d97706,#f59e0b)',
  'linear-gradient(90deg,#e11d48,#ec4899)',
  'linear-gradient(90deg,#06b6d4,#22d3ee)',
  'linear-gradient(90deg,#7c3aed,#a78bfa)',
]

// ─── Dimension spec (16 unique dims — compressed from 28 because of heavy
// source-data overlap. Each row in the rendered table pulls from ONE unique
// schema field family so the content doesn't repeat the same phrases 4-5
// times. See buildDeepAnalysis for the 1:1 dim-to-source mapping.) ───

const DIM_SPEC = [
  { zh: '认知底色 · MBTI',           en: 'Cognitive · MBTI',         color: '#4f46e5', sub: 'mbti' },
  { zh: '开放性 · 好奇的边界',        en: 'Openness',                  color: '#6366f1' },
  { zh: '尽责性 · 决策与执行',        en: 'Conscientiousness',         color: '#3b82f6' },
  { zh: '情感结构 · 依恋风格',        en: 'Attachment Architecture',   color: '#7c3aed', sub: 'attachment' },
  { zh: '自我叙事 · 核心画像',        en: 'Self Narrative',            color: '#8b5cf6' },
  { zh: '核心矛盾 · 意外的一面',      en: 'Core Contradiction',        color: '#b91c1c' },
  { zh: '原型关键词',                  en: 'Archetypal Keywords',       color: '#0369a1' },
  { zh: '追求与北极星',                en: 'Aspirations & Guiding Star', color: '#065f46' },
  { zh: '恐惧与警示',                  en: 'Fears & Red Flags',         color: '#991b1b' },
  { zh: '关系定位 · 化学反应',        en: 'Relationship Positioning',  color: '#06b6d4', sub: 'chemistry' },
  { zh: '潜台词解码',                  en: 'Subtext Decoded',           color: '#ec4899' },
  { zh: '价值观与偏好',                en: 'Values & Preferences',      color: '#10b981' },
  { zh: '防御机制 · 不要碰的雷',      en: 'Defense Mechanisms',        color: '#ea580c' },
  { zh: '身心健康 · 黄灯信号',        en: 'Wellbeing & Caution Signs', color: '#facc15' },
  { zh: '成长潜力',                    en: 'Growth Potential',          color: '#059669' },
  { zh: '星座运势',                    en: 'Zodiac',                    color: '#eab308', sub: 'zodiac' },
]

// ─── Stats normalization ───
//
// extract_sections emits `senders` and `monthly_activity` as ARRAYS of rows,
// e.g. `senders: [{sender, count}]` and `monthly_activity: [{month, sender, count}]`.
// Legacy callers may pass them as dicts. Accept both and always return the
// canonical dict form so downstream code stays simple.

function normalizeSenders(raw) {
  if (!raw) return {}
  if (Array.isArray(raw)) {
    const out = {}
    for (const row of raw) {
      if (!row) continue
      const name = row.sender || row.name
      const count = Number(row.count || 0)
      if (!name) continue
      out[name] = (out[name] || 0) + count
    }
    return out
  }
  if (typeof raw === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0
    return out
  }
  return {}
}

// Returns both the merged monthly totals and the per-sender monthly breakdown.
// - monthly:       { 'YYYY-MM': totalCount }           (used by year/timeline aggregation)
// - monthlyBySender: { 'YYYY-MM': { sender: count } }   (used for accurate year-chart him/me split)
function normalizeMonthlyActivity(raw) {
  const monthly = {}
  const monthlyBySender = {}
  if (!raw) return { monthly, monthlyBySender }

  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row) continue
      const m = row.month || row.ym
      const sender = row.sender || row.name || ''
      const count = Number(row.count || 0)
      if (!m) continue
      monthly[m] = (monthly[m] || 0) + count
      if (sender) {
        if (!monthlyBySender[m]) monthlyBySender[m] = {}
        monthlyBySender[m][sender] = (monthlyBySender[m][sender] || 0) + count
      }
    }
  } else if (typeof raw === 'object') {
    for (const [m, v] of Object.entries(raw)) {
      if (typeof v === 'number') {
        monthly[m] = v
      } else if (v && typeof v === 'object') {
        let sum = 0
        for (const [sender, cnt] of Object.entries(v)) {
          const n = Number(cnt) || 0
          sum += n
          if (!monthlyBySender[m]) monthlyBySender[m] = {}
          monthlyBySender[m][sender] = (monthlyBySender[m][sender] || 0) + n
        }
        monthly[m] = sum
      }
    }
  }
  return { monthly, monthlyBySender }
}

// ─── Sender identification ───

function identifySenders(sendersRaw, agentName) {
  const senders = normalizeSenders(sendersRaw)
  const entries = Object.entries(senders)
  if (entries.length === 0) return { him: 0, me: 0, total: 0, himKey: '' }
  const an = (agentName || '').toLowerCase()
  let himKey = entries.find(([n]) => n === agentName)?.[0]
  if (!himKey) himKey = entries.find(([n]) => n.toLowerCase().includes(an) || an.includes(n.toLowerCase()))?.[0]
  if (!himKey) { entries.sort((a, b) => b[1] - a[1]); himKey = entries[0][0] }
  const him = senders[himKey] || 0
  const me = entries.filter(([k]) => k !== himKey).reduce((sum, [, v]) => sum + v, 0)
  return { him, me, total: him + me, himKey }
}

// ─── D scalar builder ───

function buildDScalars(sections, stats, agentName, lang, isSelf) {
  const s = sections || {}
  const st = stats || {}
  const pc = s.persona_card || {}
  const intim = pc.intimacy_score || {}
  const chem = pc.chemistry || {}
  const zodiac = pc.constellation || {}
  const mbti = s.mbti || {}
  const att = s.attachment || {}
  const health = s.health_index || {}
  const sig = s.signals || {}

  const { him, me, total, himKey } = identifySenders(st.senders, agentName)
  const pctHim = total > 0 ? (him / total * 100) : 50
  const pctMe = total > 0 ? (me / total * 100) : 50

  const dateFirst = st.date_range?.first || ''
  const dateLast = st.date_range?.last || ''
  const yearFirst = dateFirst ? parseInt(dateFirst.substring(0, 4)) : new Date().getFullYear()
  const yearLast = dateLast ? parseInt(dateLast.substring(0, 4)) : new Date().getFullYear()
  const yearsCount = Math.max(1, yearLast - yearFirst + 1)

  const { monthly, monthlyBySender } = normalizeMonthlyActivity(st.monthly_activity)
  const yearly = {}
  const yearlyBySender = {}
  for (const [ym, count] of Object.entries(monthly)) {
    const y = ym.split('-')[0]
    yearly[y] = (yearly[y] || 0) + count
  }
  for (const [ym, perSender] of Object.entries(monthlyBySender)) {
    const y = ym.split('-')[0]
    if (!yearlyBySender[y]) yearlyBySender[y] = {}
    for (const [s, c] of Object.entries(perSender)) {
      yearlyBySender[y][s] = (yearlyBySender[y][s] || 0) + c
    }
  }
  const peakEntry = Object.entries(yearly).sort((a, b) => b[1] - a[1])[0] || ['', 0]

  function axisCalc(score, left, right) {
    const rp = Math.round(clamp((100 + score) / 2, 0, 100))
    const lp = 100 - rp
    return { rightPct: rp, dominant: lp > rp ? `${left} ${lp}%` : `${right} ${rp}%` }
  }
  const ie = axisCalc(mbti.ei_score || 0, 'I', 'E')
  const sn = axisCalc(mbti.sn_score || 0, 'S', 'N')
  const tf = axisCalc(mbti.tf_score || 0, 'T', 'F')
  const jp = axisCalc(mbti.jp_score || 0, 'J', 'P')

  const donutLen = (377 * pctHim / 100).toFixed(1)
  const donutGap = (377 - parseFloat(donutLen)).toFixed(1)

  const avgLen = st.avg_message_length || 20
  let ld
  if (avgLen < 5) ld = [40, 35, 20, 5]
  else if (avgLen < 15) ld = [25, 30, 30, 15]
  else if (avgLen < 30) ld = [15, 20, 35, 30]
  else ld = [10, 15, 30, 45]

  // Year chart: use per-sender monthly data when available (accurate),
  // otherwise fall back to splitting yearly totals by the global him/me ratio.
  const yearChartData = Object.entries(yearly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, t]) => {
      const perSender = yearlyBySender[year]
      if (perSender && himKey) {
        const h = perSender[himKey] || 0
        let m = 0
        for (const [k, v] of Object.entries(perSender)) if (k !== himKey) m += v
        return { year, him: h, me: m }
      }
      const h = Math.round(t * pctHim / 100)
      return { year, him: h, me: t - h }
    })

  const hourBase = [2, 1, 1, 1, 1, 2, 3, 5, 8, 10, 8, 6, 5, 6, 7, 8, 9, 10, 11, 12, 11, 9, 6, 3]
  const hourSum = hourBase.reduce((a, b) => a + b, 0)
  const hourData = hourBase.map(h => Math.round(h / hourSum * (total || 1000)))

  const wdBase = [16, 16, 16, 16, 16, 10, 10]
  const wdSum = wdBase.reduce((a, b) => a + b, 0)
  const weekdayData = wdBase.map(w => Math.round(w / wdSum * (total || 1000)))

  const healthTrend = health.monthly_trend || Array(12).fill(health.current_score || 70)

  const attVars = ATT_VARIANTS[lang] || ATT_VARIANTS.en
  const attKey = (att.type || 'secure').toLowerCase()
  const countSuffix = lang === 'zh' ? ' 项' : ''

  const now = new Date()
  const generatedAt = lang === 'zh'
    ? `${now.getFullYear()}年${String(now.getMonth() + 1).padStart(2, '0')}月${String(now.getDate()).padStart(2, '0')}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    : now.toISOString().replace('T', ' ').slice(0, 16)

  return {
    agent_name: agentName,
    generated_at: generatedAt,
    total_messages_fmt: fmt(total || st.total_messages || 0),
    total_him_fmt: fmt(him), total_me_fmt: fmt(me),
    pct_him: pct1(pctHim), pct_me: pct1(pctMe),
    avg_length: String(Math.round(avgLen)),
    years_count: String(yearsCount),
    date_first: String(dateFirst).substring(0, 4) || '?',
    date_last: String(dateLast).substring(0, 4) || '?',
    peak_year: String(peakEntry[0]), peak_count_fmt: fmt(peakEntry[1]),

    intimacy_total: String(intim.total || 0),
    intimacy_trust: String(intim.trust || 0),
    intimacy_dependence: String(intim.dependency || 0),
    intimacy_density: String(intim.interaction_density || 0),
    intimacy_depth: String(intim.emotional_depth || 0),
    intimacy_stability: String(intim.stability || 0),

    chemistry_type: chem.type || '', chemistry_emoji: chem.emoji || '⚗️', chemistry_desc: chem.desc || '',
    zodiac_name: zodiac.name || '', zodiac_emoji: zodiac.emoji || '⭐',
    zodiac_match_pct: String(zodiac.match_pct || 0), zodiac_desc: zodiac.reason || '',

    mbti_type: mbti.type || 'XXXX', mbti_name: mbtiFullName(mbti.type, lang),
    mbti_ie_right_pct: String(ie.rightPct), mbti_ie_dominant_label: ie.dominant,
    mbti_sn_right_pct: String(sn.rightPct), mbti_sn_dominant_label: sn.dominant,
    mbti_tf_right_pct: String(tf.rightPct), mbti_tf_dominant_label: tf.dominant,
    mbti_jp_right_pct: String(jp.rightPct), mbti_jp_dominant_label: jp.dominant,

    attachment_type: attVars[attKey] || att.type || '',
    attachment_variant: attVars[attKey] || att.type || '',
    attachment_desc: att.reason || '',

    character_portrait: s.character_portrait || '',
    surprising_contradiction: s.surprising_contradiction || '',

    health_score: String(health.current_score || 0),
    health_alert_text: health.alert || '',

    signal_green_count: `${(sig.green || []).length}${countSuffix}`,
    signal_yellow_count: `${(sig.yellow || []).length}${countSuffix}`,
    signal_red_count: `${(sig.red || []).length}${countSuffix}`,

    donut_dash_him: `${donutLen} ${donutGap}`, donut_offset_him: '94.25',
    len_under1: String(ld[0]), len_2_5: String(ld[1]), len_6_20: String(ld[2]), len_21: String(ld[3]),

    year_chart_json: JSON.stringify(yearChartData),
    hour_heatmap_json: JSON.stringify(hourData),
    weekday_json: JSON.stringify(weekdayData),
    health_trend_json: JSON.stringify(healthTrend),
    // Month labels for the health trend X-axis. Derived from the latest date
    // in stats.date_range and walking backward N months so labels always
    // match the actual 12-month window the trend data represents.
    health_trend_months_json: (() => {
      const n = Array.isArray(healthTrend) ? healthTrend.length : 12
      const ref = dateLast ? new Date(dateLast) : new Date()
      if (isNaN(ref.getTime())) return JSON.stringify([])
      const labels = []
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        labels.push(`${y}-${m}`)
      }
      return JSON.stringify(labels)
    })(),

    // Self-analysis scalars (empty strings when sections absent — harmless for other flavor)
    network_shape: (s.relationships_map?.network_shape) || '',
    growth_overall_trajectory: (s.growth_arc?.overall_trajectory) || '',

    // Flavor-aware labels for the sender-ratio donut + year-chart legend.
    // System agent: subject = the single partner, other = the user.
    // User agent:   subject = the user, other = all partners combined.
    side_him_label: isSelf
      ? (lang === 'zh' ? `${agentName}（本人）` : `${agentName} (Me)`)
      : agentName,
    side_other_label: isSelf
      ? (lang === 'zh' ? '所有对话者' : 'All partners')
      : (lang === 'zh' ? '对方（Me）' : 'Partner (Me)'),
    // Subject token substituted into strings.json via {subj_pronoun}.
    // - Self mode: "你" (2nd person, gender-neutral)
    // - System mode: the partner's actual NAME (not a gendered pronoun like
    //   "他/她" that would assume gender, and more personal than "TA").
    subj_pronoun: isSelf
      ? (lang === 'zh' ? '你' : 'you')
      : agentName,
  }
}

// ─────────────────────────────────────────────────
//  HTML fragment builders (27 fragments)
// ─────────────────────────────────────────────────

function buildHeroBadges(sections, lang) {
  const pc = sections.persona_card || {}
  const mbtiType = sections.mbti?.type || ''
  const attKey = (sections.attachment?.type || '').toLowerCase()
  const attVars = ATT_VARIANTS[lang] || ATT_VARIANTS.en
  const keywords = pc.keywords || []
  const chemType = pc.chemistry?.type || ''

  const badges = []
  if (mbtiType) badges.push(mbtiType)
  if (attKey) badges.push(attVars[attKey] || attKey)
  for (const kw of keywords) { if (badges.length >= 8) break; badges.push(kw) }
  if (chemType && badges.length < 8) badges.push(lang === 'zh' ? `${chemType}型` : chemType)
  while (badges.length < 5) badges.push(lang === 'zh' ? '独特个体' : 'Unique')

  return clampArr(badges, 5, 10, '—')
    .map((t, i) => `<span class="badge ${BADGE_COLORS[i % BADGE_COLORS.length]}">${esc(t)}</span>`)
    .join('\n')
}

// ─── Deep analysis body — 28 dim-rows ───

function buildDeepAnalysis(sections, lang) {
  const s = sections || {}
  const mbti = s.mbti || {}
  const ocean = s.ocean || {}
  const att = s.attachment || {}
  const chem = (s.persona_card || {}).chemistry || {}
  const zodiac = (s.persona_card || {}).constellation || {}
  const growth = s.growth_suggestions || []
  const traj = s.trajectory || {}
  const sig = s.signals || {}
  const sub = s.subtext_decoder || []
  const tips = s.interaction_tips || {}
  const topics = s.topic_preferences || {}
  const health = s.health_index || {}
  const theatre = s.dialogue_theatre || []
  const sep = lang === 'zh' ? '；' : '; '
  const fallback = lang === 'zh'
    ? '此维度的深层特征有待进一步观察和分析。基于现有数据，相关表现尚需更多对话样本来充分解读。'
    : 'Deeper patterns in this dimension await further observation. More conversation data is needed for comprehensive analysis.'

  // 16-dim sources — strict 1:1 mapping to unique schema fields so no two
  // rows rehash the same narrative. This prevents the earlier problem where
  // a single phrase (e.g. "系统优化者") appeared in 4+ rows.
  const sources = [
    // 1. Cognitive · MBTI
    () => {
      const ev = mbti.per_axis_evidence
      if (!ev) return `MBTI: <strong>${esc(mbti.type || '?')}</strong> — ${esc(mbtiFullName(mbti.type, lang))}`
      return Object.entries(ev).map(([ax, txt]) => `<strong>${esc(ax)}:</strong> ${esc(txt)}`).join(' ')
    },
    // 2. Openness
    () => esc(ocean.openness?.evidence || ''),
    // 3. Conscientiousness (decision + execution)
    () => esc(ocean.conscientiousness?.evidence || ''),
    // 4. Attachment architecture (contains intentional <strong> HTML —
    //    use inner esc on values, do NOT outer-esc the assembled string).
    () => {
      const parts = []
      if (att.type) parts.push(`<strong>${esc(att.type)}</strong>`)
      if (att.reason) parts.push(esc(att.reason))
      return parts.join(' — ')
    },
    // 5. Self-narrative — show only a focused excerpt (first two sentences)
    //    to avoid duplicating the full portrait that lives in its own section.
    () => {
      const cp = s.character_portrait || ''
      const firstTwo = cp.split(/[。.!?！？]\s*/).slice(0, 2).filter(Boolean).join('。')
      return esc(firstTwo ? firstTwo + (cp.length > firstTwo.length ? '…' : '') : '')
    },
    // 6. Core contradiction (ONLY place we surface surprising_contradiction)
    () => esc(s.surprising_contradiction || ''),
    // 7. Archetypal keywords
    () => esc((s.persona_card?.keywords || []).join(lang === 'zh' ? '、' : ', ')),
    // 8. Aspirations & guiding star — trajectory.optimistic + top growth seed
    () => {
      const seed = growth[0]?.text ? esc(growth[0].text) : ''
      const star = esc(traj.optimistic?.scenario || '')
      return [star, seed].filter(Boolean).join(sep)
    },
    // 9. Fears & red flags — pessimistic trajectory + signals.red
    () => {
      const fear = esc(traj.pessimistic?.scenario || '')
      const reds = (sig.red || []).slice(0, 2).map(esc).join(sep)
      return [fear, reds].filter(Boolean).join(sep)
    },
    // 10. Relationship positioning / chemistry
    () => esc(chem.desc || ''),
    // 11. Subtext decoded (ONLY place we surface subtext_decoder)
    () => sub.slice(0, 3).map(item => `<em>"${esc(item.surface)}"</em> → ${esc(item.decoded)}`).join(sep),
    // 12. Values & preferences — loves + tips.do
    () => {
      const lovesText = (topics.loves || []).slice(0, 4).join(lang === 'zh' ? '、' : ', ')
      const doSeed = (tips.do || []).slice(0, 2).map(esc).join(sep)
      return [lovesText ? esc(lovesText) : '', doSeed].filter(Boolean).join(sep)
    },
    // 13. Defense mechanisms — tips.dont (ONLY place for dont)
    () => esc((tips.dont || []).slice(0, 4).join(sep)),
    // 14. Wellbeing & caution — health.alert + signals.yellow
    () => {
      const alert = esc(health.alert || '')
      const yellows = (sig.yellow || []).slice(0, 2).map(esc).join(sep)
      return [alert, yellows].filter(Boolean).join(sep)
    },
    // 15. Growth potential
    () => growth.slice(0, 3).map(g => `<strong>${esc(g.title || '')}:</strong> ${esc(g.text || '')}`).join(' '),
    // 16. Zodiac
    () => esc(zodiac.reason || `${zodiac.name || ''} ${zodiac.emoji || ''}`),
  ]

  // subLabels indices are aligned to the new 16-dim DIM_SPEC positions.
  const attVars = ATT_VARIANTS[lang] || ATT_VARIANTS.en
  const subLabels = {
    0:  mbti.type || '',                                             // Cognitive · MBTI
    3:  attVars[(att.type || '').toLowerCase()] || att.type || '',    // Attachment
    9:  chem.type || '',                                              // Relationship positioning
    15: `${zodiac.name || ''} ${zodiac.emoji || ''}`.trim(),         // Zodiac
  }

  return DIM_SPEC.map((dim, i) => {
    const label = lang === 'zh' ? dim.zh : dim.en
    const sl = subLabels[i]
    const labelHtml = sl ? `${esc(label)}<br>${esc(sl)}` : esc(label)
    let body = sources[i]()
    if (!body || body.length < 10) body = fallback
    return `<div class="dim-row">\n  <div class="dim-label" style="color:${dim.color}">${labelHtml}</div>\n  <div class="dim-body">${body}</div>\n</div>`
  }).join('\n')
}

// ─── OCEAN bars — 5 ───

function buildOceanBars(sections, lang) {
  const ocean = sections.ocean || {}
  const names = OCEAN_NAMES[lang] || OCEAN_NAMES.en
  return OCEAN_KEYS.map((key, i) => {
    const trait = ocean[key] || {}
    const score = clamp(Math.round((trait.score || 5) * 10), 0, 100)
    const ev = esc((trait.evidence || '').substring(0, 80))
    return `<div class="ocean-bar-row">\n  <div class="ocean-bar-header">\n    <span class="ocean-bar-name" style="color:${OCEAN_COLORS[i]}">${names[i]}</span>\n    <span class="ocean-bar-score" style="color:${OCEAN_COLORS[i]}">${score}</span>\n  </div>\n  <div class="ocean-bar-track"><div class="ocean-bar-fill" style="width:${score}%;background:${OCEAN_COLORS[i]};"></div></div>\n  <div class="ocean-bar-evidence">${ev}</div>\n</div>`
  }).join('\n')
}

// ─── OCEAN details — 6 cards ───

function buildOceanDetails(sections, lang) {
  const ocean = sections.ocean || {}
  const defs = [
    { key: 'openness', ci: 0, label: lang === 'zh' ? '开放性 · 核心证据' : 'Openness · Core Evidence' },
    { key: 'conscientiousness', ci: 1, label: lang === 'zh' ? '尽责性 · 核心证据' : 'Conscientiousness · Core Evidence' },
    { key: 'extraversion', ci: 2, label: lang === 'zh' ? '外向性 · 反向分析' : 'Extraversion · Reverse Analysis' },
    { key: 'agreeableness', ci: 3, label: lang === 'zh' ? '宜人性 · 张力分析' : 'Agreeableness · Tension Analysis' },
    { key: 'neuroticism', ci: 4, label: lang === 'zh' ? '神经质 · 特征分析' : 'Neuroticism · Trait Analysis' },
    { key: 'conscientiousness', ci: 1, label: lang === 'zh' ? '尽责性 · 应激分析' : 'Conscientiousness · Stress Analysis' },
  ]
  return defs.map(({ key, ci, label }) => {
    const quote = esc((ocean[key] || {}).evidence || '—')
    return `<div class="ocean-detail-card">\n  <div class="ocean-detail-dim" style="color:${OCEAN_COLORS[ci]}">${label}</div>\n  <div class="ocean-detail-quote">${quote}</div>\n</div>`
  }).join('\n')
}

// ─── Theatre acts — 10 ───

function buildTheatreActs(sections, lang) {
  const theatre = sections.dialogue_theatre || []
  const acts = padArr(theatre.slice(0, 10), 10, (i) => ({
    act_number: i + 1, date: '', category: lang === 'zh' ? '日常' : 'daily',
    scene_title: lang === 'zh' ? '场景待补充' : 'Scene pending', messages: [], analysis: '',
  }))
  const conflictCats = new Set(['conflict', 'vulnerability', 'silence_repair'])
  const isSelf = sections._isSelf === true
  const meLabel = lang === 'zh' ? '我' : 'Me'
  const fallbackAgent = isSelf
    ? (lang === 'zh' ? '对方' : 'Them')
    : (sections._agentName || (lang === 'zh' ? '对方' : 'Them'))
  const analysisPrefix = lang === 'zh' ? '解读 · ' : 'Analysis · '

  // Label a message's sender for display:
  //   - "me" / "Me"      → user's label ("我" / "Me")
  //   - empty string     → fallback (partner name for system, generic for self)
  //   - specific name    → use it as-is (partner name the LLM attached)
  //   - legacy "对方"/"them" → fallback
  const senderLabel = (raw, actPartner) => {
    const s = String(raw || '').trim()
    if (s === 'me' || s === 'Me') return meLabel
    if (!s || s === '对方' || s === 'them' || s === 'Them') {
      // For self mode, prefer the act's partner field if available
      if (isSelf && actPartner) return esc(actPartner)
      return fallbackAgent
    }
    return esc(s)
  }

  return acts.map((act, i) => {
    const num = String(i + 1).padStart(2, '0')
    const catStyle = conflictCats.has(act.category) ? ' style="background:#fff1f2;color:#e11d48;"' : ''
    const partnerBadge = isSelf && act.partner
      ? `<div class="theatre-partner">${lang === 'zh' ? '与 ' : 'With '}<strong>${esc(act.partner)}</strong></div>`
      : ''
    const lines = (act.messages || []).map(m => {
      const cls = (m.sender === 'me' || m.sender === 'Me') ? 'me' : 'them'
      const who = senderLabel(m.sender, act.partner)
      return `    <div class="theatre-line ${cls}"><span class="who">${who}：</span>${esc(String(m.text || '').substring(0, 160))}</div>`
    }).join('\n')
    return `<div class="theatre-act">\n  <div class="theatre-meta">\n    <div class="theatre-num">ACT ${num}</div>\n    <div class="theatre-date">${esc(act.date || '')}</div>\n    <div class="theatre-cat"${catStyle}>${esc(act.category || '')}</div>\n  </div>\n  <div>\n    <div class="theatre-scene">${esc(act.scene_title || '')}</div>\n    ${partnerBadge}\n${lines}\n    <div class="theatre-analysis"><strong>${analysisPrefix}</strong>${esc(act.analysis || '')}</div>\n  </div>\n</div>`
  }).join('\n')
}

// ─── Subtext rows — 6 ───

function buildSubtextRows(sections, lang) {
  const sub = sections.subtext_decoder || []
  const rows = padArr(sub.slice(0, 6), 6, () => ({
    surface: '—', decoded: lang === 'zh' ? '待解读' : 'Pending', evidence: '',
  }))
  return rows.map(item =>
    `<div class="subtext-row">\n  <div class="subtext-surface">"${esc(item.surface || '')}"</div>\n  <div class="subtext-decoded"><span class="arrow">→</span>${esc(item.decoded || '')}</div>\n  <div class="subtext-evidence">${esc(item.evidence || '')}</div>\n</div>`
  ).join('\n')
}

// ─── Mode rows — 4 ───

function buildModeRows(sections, lang) {
  const sub = sections.subtext_decoder || []
  const tips = sections.interaction_tips || {}
  const modes = lang === 'zh'
    ? [{ ico: '✅', name: '附议型', color: '#2563eb', pct: 40 },
       { ico: '🔍', name: '校验型', color: '#7c3aed', pct: 25 },
       { ico: '⚡', name: '行动型', color: '#06b6d4', pct: 20 },
       { ico: '🛑', name: '界限型', color: '#e11d48', pct: 15 }]
    : [{ ico: '✅', name: 'Agreement', color: '#2563eb', pct: 40 },
       { ico: '🔍', name: 'Verification', color: '#7c3aed', pct: 25 },
       { ico: '⚡', name: 'Action', color: '#06b6d4', pct: 20 },
       { ico: '🛑', name: 'Boundary', color: '#e11d48', pct: 15 }]

  const descs = [
    sub.slice(0, 2).map(s => `"${s.surface}"`).join(' ') || (lang === 'zh' ? '"嗯" "好" "ok" — 高频认可' : '"OK" "Sure" — frequent agreement'),
    sub.slice(2, 4).map(s => `"${s.surface}"`).join(' ') || (lang === 'zh' ? '通过反问确认信息准确性' : 'Confirms via questions'),
    (tips.do || []).slice(0, 1).join('') || (lang === 'zh' ? '用具体行动代替承诺' : 'Actions over promises'),
    (tips.dont || []).slice(0, 1).join('') || (lang === 'zh' ? '对不合理要求明确拒绝' : 'Clear refusal of unreasonable demands'),
  ]

  return modes.map((m, i) =>
    `<div class="mode-row">\n  <span class="mode-ico">${m.ico}</span>\n  <div class="mode-info">\n    <div class="mode-name">${m.name}</div>\n    <div class="mode-desc">${esc(descs[i])}</div>\n  </div>\n  <div class="mode-track"><div class="mode-fill" style="width:${m.pct}%;background:${m.color};"></div></div>\n  <span class="mode-pct">${m.pct}%</span>\n</div>`
  ).join('\n')
}

// ─── Topic cloud — 6–14 ───

function buildTopicCloud(sections) {
  const topics = sections.topic_preferences || {}
  const all = [
    ...(topics.loves || []).map(t => ({ text: t, w: 3 })),
    ...(topics.neutral || []).map(t => ({ text: t, w: 2 })),
    ...(topics.avoid || []).map(t => ({ text: t, w: 1 })),
  ]
  while (all.length < 6) all.push({ text: '—', w: 1 })
  const items = all.slice(0, 14)
  const styles = {
    3: { sz: 17, pad: '9px 16px', bg: '#ede9fe', color: '#4f46e5' },
    2: { sz: 14, pad: '7px 14px', bg: '#cffafe', color: '#0369a1' },
    1: { sz: 13, pad: '6px 12px', bg: '#d1fae5', color: '#065f46' },
  }
  return items.map(({ text, w }) => {
    const st = styles[w] || styles[2]
    return `<span class="topic-tag" style="font-size:${st.sz}px;padding:${st.pad};background:${st.bg};color:${st.color};">${esc(text)}</span>`
  }).join('\n')
}

// ─── Emotion cards — 3 ───

function buildEmotionCards(sections, lang) {
  const ocean = sections.ocean || {}
  const health = sections.health_index || {}
  const cards = [
    { color: '#059669', ico: '😄',
      name: lang === 'zh' ? '正向情绪表达' : 'Positive Expression',
      desc: ocean.agreeableness?.evidence || (lang === 'zh' ? '通过行动和关心表达正向情感' : 'Positive emotions expressed through actions'),
      trait: lang === 'zh' ? '行动导向' : 'Action-oriented' },
    { color: '#e11d48', ico: '😰',
      name: lang === 'zh' ? '压力情绪表达' : 'Stress Expression',
      desc: ocean.neuroticism?.evidence || (lang === 'zh' ? '压力下趋向内敛和回避' : 'Withdrawal tendency under stress'),
      trait: lang === 'zh' ? '内化处理' : 'Internalized' },
    { color: '#d97706', ico: '😐',
      name: lang === 'zh' ? '基线情绪' : 'Baseline Mood',
      desc: health.alert || (lang === 'zh' ? '日常以稳定平和为主基调' : 'Daily baseline is stable and calm'),
      trait: lang === 'zh' ? '稳定型' : 'Stable' },
  ]
  return cards.map(c => {
    const traitLabel = lang === 'zh' ? '特点：' : 'Trait: '
    return `<div class="card emotion-card" style="border-top-color:${c.color};">\n  <div class="emotion-ico">${c.ico}</div>\n  <div class="emotion-name">${c.name}</div>\n  <div class="emotion-desc">${esc(c.desc)}<br><strong>${traitLabel}</strong>${esc(c.trait)}</div>\n</div>`
  }).join('\n')
}

// ─── Relation modes — 3–6 ───

function buildRelationModes(sections, lang) {
  const tips = sections.interaction_tips || {}
  const rows = []
  for (const item of (tips.do || []).slice(0, 3))
    rows.push({ ico: '⚙️', label: item, score: lang === 'zh' ? '核心' : 'Core' })
  for (const item of (tips.dont || []).slice(0, 2))
    rows.push({ ico: '⚠️', label: item, score: lang === 'zh' ? '注意' : 'Note' })
  while (rows.length < 3)
    rows.push({ ico: '💡', label: lang === 'zh' ? '关系模式待观察' : 'Pattern pending', score: '—' })

  return clampArr(rows, 3, 6, { ico: '💡', label: '—', score: '—' }).map(r =>
    `<div class="relation-row">\n  <span class="relation-ico">${r.ico}</span>\n  <div class="relation-content">\n    <div class="relation-label">${esc(r.label)}</div>\n    <div class="relation-desc"></div>\n  </div>\n  <span class="relation-score">${esc(r.score)}</span>\n</div>`
  ).join('\n')
}

// ─── Timeline rows — 4–6 ───

function buildTimelineRows(sections, stats, lang) {
  const st = stats || {}
  const { monthly } = normalizeMonthlyActivity(st.monthly_activity)
  const yearly = {}
  for (const [ym, count] of Object.entries(monthly)) {
    const y = ym.split('-')[0]; yearly[y] = (yearly[y] || 0) + count
  }
  const years = Object.keys(yearly).sort()
  if (years.length === 0) years.push(String(new Date().getFullYear()))

  const labels = lang === 'zh'
    ? ['初识期', '稳定期', '深化期', '成熟期', '当前阶段']
    : ['Initial', 'Stable', 'Deepening', 'Mature', 'Current']

  const periods = []
  const step = Math.max(1, Math.ceil(years.length / 5))
  for (let i = 0; i < years.length && periods.length < 5; i += step) {
    const yr = years[i]
    periods.push({ dot: yr.substring(2), label: labels[Math.min(periods.length, labels.length - 1)], year: yr,
      desc: lang === 'zh' ? `${yr}年活跃消息 ${fmt(yearly[yr] || 0)} 条` : `${yr}: ${fmt(yearly[yr] || 0)} messages` })
  }

  return clampArr(periods, 4, 6, { dot: '??', label: '—', year: '?', desc: '' }).map((r, i) =>
    `<div class="tl-row">\n  <div class="tl-dot" style="background:${TL_COLORS[i % TL_COLORS.length]};">${r.dot}</div>\n  <div>\n    <div class="tl-label">${r.label}<span class="tl-year">· ${r.year}</span></div>\n    <div class="tl-desc">${esc(r.desc)}</div>\n  </div>\n</div>`
  ).join('\n')
}

// ─── Do / Don't items — 4 each ───

function buildAppleItems(arr) {
  return padArr((arr || []).slice(0, 4), 4, '—').map(t => `<div class="apple-item">${esc(t)}</div>`).join('\n')
}

// ─── Topic pills ───

function buildTopicPills(items, style) {
  return clampArr(items || [], 2, 8, '—')
    .map(t => `<span class="topic-pill" style="background:${style.bg};color:${style.color};">${esc(t)}</span>`)
    .join('\n')
}

// ─── Signal items — 5 each ───

function buildSignalItems(items) {
  return padArr((items || []).slice(0, 5), 5, '—').map(t => `<div class="signal-item">${esc(t)}</div>`).join('\n')
}

// ─── Best times — 3 ───

function buildBestTimes(sections, lang) {
  const bct = sections.best_communication_times || {}
  const cfgs = [
    { key: 'relaxed', ico: '😌', color: '#059669', label: lang === 'zh' ? '放松时' : 'Relaxed' },
    { key: 'tired', ico: '😴', color: '#d97706', label: lang === 'zh' ? '疲劳时' : 'Tired' },
    { key: 'happy', ico: '😄', color: '#ec4899', label: lang === 'zh' ? '开心时' : 'Happy' },
  ]
  return cfgs.map(c => {
    const d = bct[c.key] || {}
    const lbl = d.time ? `${c.label} · ${esc(d.time)}` : c.label
    return `<div class="relation-row">\n  <span class="relation-ico" style="font-size:26px;">${c.ico}</span>\n  <div class="relation-content">\n    <div class="relation-label" style="color:${c.color};">${lbl}</div>\n    <div class="relation-desc">${esc(d.advice || '')}</div>\n  </div>\n</div>`
  }).join('\n')
}

// ─── Next predictions — 4 ───

function buildNextPredictions(sections, lang) {
  const preds = sections.expected_next || []
  const items = padArr(preds.slice(0, 4), 4, () => ({
    icon: '🔮', title: lang === 'zh' ? '预测待更新' : 'Prediction pending', detail: '', signal: 'weak',
  }))
  return items.map(p => {
    const ss = SIGNAL_STYLES[p.signal] || SIGNAL_STYLES.weak
    return `<div class="relation-row">\n  <span class="relation-ico" style="font-size:26px;">${p.icon || '🔮'}</span>\n  <div class="relation-content">\n    <div class="relation-label">${esc(p.title || '')}</div>\n    <div class="relation-desc">${esc(p.detail || '')}</div>\n  </div>\n  <span style="font-size:11px;padding:3px 10px;border-radius:10px;background:${ss.bg};color:${ss.color};font-weight:700;letter-spacing:1px;text-transform:uppercase;">${p.signal || 'weak'}</span>\n</div>`
  }).join('\n')
}

// ─── Ways body — 10 way-rows ───

function buildWaysBody(sections, lang) {
  const growth = sections.growth_suggestions || []
  const tips = sections.interaction_tips || {}
  const src = []

  for (const g of growth) {
    src.push({ title: g.title || '', example: g.text || '', icon: g.icon || '🎯',
      reason: lang === 'zh' ? `对应成长建议维度，难度${g.difficulty || '中'}，影响${g.impact || '中'}。`
        : `Growth dimension — difficulty: ${g.difficulty || 'medium'}, impact: ${g.impact || 'medium'}.` })
  }
  for (const item of (tips.do || [])) {
    if (src.length >= 10) break
    src.push({ title: item, example: '', icon: '💡',
      reason: lang === 'zh' ? '基于互动建议提炼。' : 'From interaction tips.' })
  }

  const ways = padArr(src.slice(0, 10), 10, (i) => ({
    title: lang === 'zh' ? `方式 ${i + 1}（待补充）` : `Way ${i + 1} (pending)`, example: '', icon: '🎯', reason: '',
  }))
  const exLabel = lang === 'zh' ? '具体例子' : 'Example'
  const whyLabel = lang === 'zh' ? '背后的原因' : 'Why it works'

  return ways.map((w, i) => {
    const num = String(i + 1).padStart(2, '0')
    const color = WAY_COLORS[i % WAY_COLORS.length]
    return `<div class="way-row">\n  <div class="way-num-col">\n    <div class="way-num" style="color:${color};">${num}</div>\n    <div class="way-icon">${w.icon || '🎯'}</div>\n  </div>\n  <div>\n    <div class="way-title">${esc(w.title)}</div>\n    <div class="way-example" style="border-left:3px solid ${color};">\n      <div class="way-kicker">${exLabel}</div>\n      <div>${esc(w.example)}</div>\n    </div>\n    <div class="way-reason">\n      <div class="way-kicker" style="color:${color};">${whyLabel}</div>\n      <div class="way-reason-body">${esc(w.reason)}</div>\n    </div>\n  </div>\n</div>`
  }).join('\n')
}

// ─── Trajectory cards — 3 ───

function buildTrajectoryCards(sections, lang) {
  const traj = sections.trajectory || {}
  const cfgs = [
    { key: 'optimistic', ico: '🌟', color: '#059669', label: lang === 'zh' ? '乐观路径' : 'Optimistic Path' },
    { key: 'baseline', ico: '📊', color: '#4f46e5', label: lang === 'zh' ? '基线路径' : 'Baseline Path' },
    { key: 'pessimistic', ico: '⚠️', color: '#e11d48', label: lang === 'zh' ? '悲观路径' : 'Pessimistic Path' },
  ]
  const trigLabel = lang === 'zh' ? '触发条件：' : 'Trigger: '
  return cfgs.map(c => {
    const d = traj[c.key] || {}
    return `<div class="card traj-card" style="border-top-color:${c.color};">\n  <div class="traj-ico">${c.ico}</div>\n  <div class="traj-title" style="color:${c.color};">${c.label}</div>\n  <div class="traj-scene">${esc(d.scenario || '')}</div>\n  <div class="traj-trigger"><strong>${trigLabel}</strong>${esc(d.trigger || '')}</div>\n</div>`
  }).join('\n')
}

// ─── Compat rows — 8 ───

function buildCompatRows(sections) {
  const compat = sections.compatibility || []
  const items = padArr(compat.slice(0, 8), 8, () => ({ type: '—', score: 50, reason: '' }))
  return items.map(c => {
    const score = clamp(c.score || 50, 0, 100)
    const color = score >= 85 ? '#059669' : score >= 60 ? '#d97706' : '#e11d48'
    return `<div class="compat-row">\n  <div class="compat-code" style="color:${color};">${esc(c.type || '')}</div>\n  <div class="compat-desc">${esc(c.reason || '')}</div>\n  <div class="compat-score-wrap">\n    <div class="compat-score-track"><div class="compat-score-fill" style="width:${score}%;background:${color};"></div></div>\n    <span class="compat-score-val" style="color:${color};">${score}</span>\n  </div>\n</div>`
  }).join('\n')
}

// ─── Quotes grid — 20 ───

function buildQuotesGrid(sections) {
  const quotes = sections.key_quotes || []
  // Render only real items — no padding to 20. An empty "—" placeholder
  // reads as a bug to users, and users don't need EXACTLY 20 quotes to
  // understand the section.
  const items = quotes.slice(0, 20)
  if (items.length === 0) {
    return `<div class="rel-empty">暂无代表性语录</div>`
  }
  return items.map((q, i) => {
    const color = QUOTE_COLORS[i % QUOTE_COLORS.length]
    const speaker = q.speaker ? `<span class="quote-speaker">${esc(q.speaker)}</span>` : ''
    const ctx = q.context ? `<div class="quote-context">${esc(q.context)}</div>` : ''
    return `<div class="quote-card" style="border-left-color:${color};">\n  <div class="quote-text">"${esc(q.text || '')}"</div>\n  ${ctx}\n  <div class="quote-meta">\n    <span class="quote-year">${esc(q.date || '')}</span>\n    ${speaker}\n    <span class="quote-tag" style="background:${color}20;color:${color};">${esc(q.category || '')}</span>\n  </div>\n</div>`
  }).join('\n')
}

// ─── Gift rows — 5–8 ───

function buildGiftRows(sections, lang) {
  const gifts = sections.gift_suggestions || []
  const items = clampArr(gifts, 5, 8, () => ({
    icon: '🎁', name: '—', reason: '', price_range: 'medium', scenario: 'casual',
  }))
  const pLabels = lang === 'zh'
    ? { low: '低价位', medium: '中价位', high: '高价位' }
    : { low: 'Budget', medium: 'Mid-range', high: 'Premium' }
  const sLabels = lang === 'zh'
    ? { birthday: '生日', holiday: '节日', anniversary: '纪念日', casual: '日常' }
    : { birthday: 'Birthday', holiday: 'Holiday', anniversary: 'Anniversary', casual: 'Casual' }

  return items.map(g =>
    `<div class="relation-row">\n  <span class="relation-ico" style="font-size:26px;">${g.icon || '🎁'}</span>\n  <div class="relation-content">\n    <div class="relation-label">${esc(g.name || '')}</div>\n    <div class="relation-desc">${esc(g.reason || '')}</div>\n  </div>\n  <div style="display:flex;gap:6px;flex-shrink:0;">\n    <span class="badge badge-blue">${esc(pLabels[g.price_range] || g.price_range || '')}</span>\n    <span class="badge badge-rose">${esc(sLabels[g.scenario] || g.scenario || '')}</span>\n  </div>\n</div>`
  ).join('\n')
}

// ─── Growth cards — 6 ───

function buildGrowthCards(sections, lang) {
  const growth = sections.growth_suggestions || []
  const items = padArr(growth.slice(0, 6), 6, () => ({
    icon: '💡', title: '—', text: '', difficulty: 'medium', impact: 'medium',
  }))
  const dLabel = lang === 'zh' ? '难度' : 'Difficulty'
  const iLabel = lang === 'zh' ? '影响' : 'Impact'

  return items.map((g, i) =>
    `<div class="card advice-card">\n  <div class="advice-top" style="background:${GROWTH_GRADIENTS[i % GROWTH_GRADIENTS.length]};"></div>\n  <div class="advice-ico">${g.icon || '💡'}</div>\n  <div class="advice-title">${esc(g.title || '')}</div>\n  <div class="advice-text">${esc(g.text || '')}</div>\n  <span class="advice-diff">${dLabel}：${g.difficulty || 'medium'} / ${iLabel}：${g.impact || 'medium'}</span>\n</div>`
  ).join('\n')
}

// ─── Master HTML builder ───

function buildAllHtml(sections, stats, lang) {
  const s = sections || {}
  const sig = s.signals || {}
  const topics = s.topic_preferences || {}
  const tips = s.interaction_tips || {}

  return {
    hero_badges:         buildHeroBadges(s, lang),
    deep_analysis_body:  buildDeepAnalysis(s, lang),
    ocean_bars:          buildOceanBars(s, lang),
    ocean_details:       buildOceanDetails(s, lang),
    theatre_acts:        buildTheatreActs(s, lang),
    subtext_rows:        buildSubtextRows(s, lang),
    mode_rows:           buildModeRows(s, lang),
    topic_cloud:         buildTopicCloud(s),
    emotion_cards:       buildEmotionCards(s, lang),
    relation_modes:      buildRelationModes(s, lang),
    timeline_rows:       buildTimelineRows(s, stats, lang),
    do_items:            buildAppleItems(tips.do),
    dont_items:          buildAppleItems(tips.dont),
    topic_loves:         buildTopicPills(topics.loves, { bg: '#E8F8EC', color: '#1F7A3C' }),
    topic_neutral:       buildTopicPills(topics.neutral, { bg: '#F2F2F7', color: '#48484A' }),
    topic_avoid:         buildTopicPills(topics.avoid, { bg: '#FFEBE9', color: '#A8261E' }),
    signal_green_items:  buildSignalItems(sig.green),
    signal_yellow_items: buildSignalItems(sig.yellow),
    signal_red_items:    buildSignalItems(sig.red),
    best_times:          buildBestTimes(s, lang),
    next_predictions:    buildNextPredictions(s, lang),
    ways_body:           buildWaysBody(s, lang),
    trajectory_cards:    buildTrajectoryCards(s, lang),
    compat_rows:         buildCompatRows(s),
    quotes_grid:         buildQuotesGrid(s),
    gift_rows:           buildGiftRows(s, lang),
    growth_cards:        buildGrowthCards(s, lang),
    // Self-analysis only (empty strings when sections absent — harmless for other flavor)
    relationships_map:   buildRelationshipsMap(s, lang),
    identity_modes:      buildIdentityModes(s, lang),
    perceived_views:     buildPerceivedViews(s, lang),
    growth_phases:       buildGrowthPhases(s, lang),
    life_timeline:       buildLifeTimeline(s, lang),
    unique_memories:     buildUniqueMemories(s, lang),
  }
}

// ─── Unique memories — 10-20 ───

function buildUniqueMemories(sections, lang) {
  const memories = Array.isArray(sections.unique_memories) ? sections.unique_memories : []
  if (memories.length === 0) {
    return `<div class="rel-empty">${lang === 'zh' ? '暂未挑出独特回忆,可能数据不足或仍在生成' : 'No unique memories found — may need more data or a rerun'}</div>`
  }
  const isSelf = sections._isSelf === true
  const EMOTION_COLORS = {
    '温暖': '#F59E0B', warm: '#F59E0B',
    '惊喜': '#8B5CF6', surprised: '#8B5CF6',
    '心酸': '#64748B', bittersweet: '#64748B',
    '自豪': '#059669', proud: '#059669',
    '松动': '#06B6D4', thawed: '#06B6D4',
    '会心一笑': '#DB2777', knowing_smile: '#DB2777',
    '难忘': '#B91C1C', unforgettable: '#B91C1C',
  }
  const meLabel = lang === 'zh' ? '我' : 'Me'
  return memories.slice(0, 20).map((m, i) => {
    const color = EMOTION_COLORS[m.emotion] || '#CC785C'
    const num = String(i + 1).padStart(2, '0')
    const fallbackAgent = isSelf
      ? (lang === 'zh' ? '对方' : 'Them')
      : (sections._agentName || (lang === 'zh' ? '对方' : 'Them'))
    const msgLines = (m.messages || []).slice(0, 4).map(msg => {
      const raw = String(msg.sender || '').trim()
      const isMe = raw === 'me' || raw === 'Me'
      const isGeneric = raw === '' || raw === '对方' || raw === 'them' || raw === 'Them'
      const who = isMe ? meLabel : (isGeneric ? fallbackAgent : esc(raw))
      const cls = isMe ? 'me' : 'them'
      const t = msg.time ? `<span class="mem-time">${esc(msg.time)}</span>` : ''
      return `    <div class="mem-line ${cls}"><span class="who">${who}：</span>${esc(String(msg.text || '').slice(0, 200))}${t}</div>`
    }).join('\n')
    return `<div class="memory-card">
  <div class="mem-head">
    <div class="mem-num">#${num}</div>
    <div class="mem-date">${esc(m.date || '')}</div>
    <div class="mem-icon" style="color:${color};">${esc(m.icon || '✨')}</div>
    <div class="mem-title-wrap">
      <div class="mem-title">${esc(m.title || '')}</div>
      <div class="mem-meta">
        <span class="mem-cat">${esc(m.category || '')}</span>
        <span class="mem-emotion" style="background:${color}20;color:${color};">${esc(m.emotion || '')}</span>
      </div>
    </div>
  </div>
  <p class="mem-scene">${esc(m.scene || '')}</p>
  <div class="mem-dialogue">
${msgLines}
  </div>
  <p class="mem-analysis"><strong>${lang === 'zh' ? '为什么值得记住 · ' : 'Why it matters · '}</strong>${esc(m.analysis || '')}</p>
</div>`
  }).join('\n')
}

// ─────────────────────────────────────────────────
//  Self-analysis HTML fragment builders
// ─────────────────────────────────────────────────

const _warmthColor = (w) => {
  // Map 1-10 to a coral→teal gradient point for warmth visual
  const clamped = Math.max(1, Math.min(10, w || 5))
  const palette = ['#B91C1C','#C2410C','#D97706','#CA8A04','#65A30D','#16A34A','#059669','#0891B2','#0284C7','#1D4ED8']
  return palette[clamped - 1]
}

function buildRelationshipsMap(sections, lang) {
  const rm = sections.relationships_map || {}
  const partners = Array.isArray(rm.partners) ? rm.partners : []
  if (partners.length === 0) {
    return `<div class="relation-row"><div class="rel-empty">${lang === 'zh' ? '暂无关系数据' : 'No relationship data yet'}</div></div>`
  }
  return partners.slice(0, 15).map(p => {
    const warmth = clamp(Math.round(p.warmth || 5), 1, 10)
    const color = _warmthColor(warmth)
    return `<div class="relation-row rel-partner-row">
      <div class="rel-partner-head">
        <span class="rel-name">${esc(p.name || '—')}</span>
        <span class="rel-type" style="color:${color};">${esc(p.relation_type || '')}</span>
        <span class="rel-count">${p.message_count || 0} msgs</span>
      </div>
      <div class="rel-partner-body">
        <div class="rel-warmth">
          <span class="rel-warmth-label">${lang === 'zh' ? '温度' : 'Warmth'}</span>
          <div class="rel-warmth-bar"><div class="rel-warmth-fill" style="width:${warmth*10}%;background:${color};"></div></div>
          <span class="rel-warmth-val">${warmth}/10</span>
        </div>
        <div class="rel-role">${esc(p.role_in_life || '')}</div>
        <div class="rel-meta">${esc(p.date_range || '')} · ${esc(p.intimacy_level || '')}</div>
      </div>
    </div>`
  }).join('\n')
}

function buildIdentityModes(sections, lang) {
  const modes = Array.isArray(sections.identity_modes) ? sections.identity_modes : []
  if (modes.length === 0) {
    return `<div class="card"><div class="rel-empty">${lang === 'zh' ? '需要多个对话者才能呈现' : 'Needs multiple partners to render'}</div></div>`
  }
  return modes.slice(0, 8).map(m => {
    const traits = (m.voice_traits || []).slice(0, 5).map(t =>
      `<li>${esc(t)}</li>`).join('')
    const phrases = (m.common_phrases || []).slice(0, 4).map(p =>
      `<span class="id-phrase">"${esc(p)}"</span>`).join(' ')
    return `<div class="card id-mode-card">
      <div class="id-mode-head">
        <span class="id-partner">${esc(m.partner || '—')}</span>
        <span class="id-label">${esc(m.mode_label || '')}</span>
      </div>
      <ul class="id-traits">${traits}</ul>
      <div class="id-phrases">${phrases}</div>
      <p class="id-analysis">${esc(m.analysis || '')}</p>
    </div>`
  }).join('\n')
}

function buildPerceivedViews(sections, lang) {
  const views = Array.isArray(sections.perceived_views) ? sections.perceived_views : []
  if (views.length === 0) {
    return `<div class="card"><div class="rel-empty">${lang === 'zh' ? '需要对方消息作为证据' : 'Needs partner messages as evidence'}</div></div>`
  }
  return views.slice(0, 8).map(v => {
    const evidence = (v.evidence || []).slice(0, 3).map(e =>
      `<blockquote class="pv-evidence">"${esc(e)}"</blockquote>`).join('')
    return `<div class="card pv-card">
      <div class="pv-head">
        <span class="pv-partner">${esc(v.partner || '—')}</span>
        <span class="pv-label">${esc(v.perception_label || '')}</span>
      </div>
      <div class="pv-evidence-list">${evidence}</div>
      <p class="pv-analysis">${esc(v.analysis || '')}</p>
    </div>`
  }).join('\n')
}

function buildGrowthPhases(sections, lang) {
  const arc = sections.growth_arc || {}
  const phases = Array.isArray(arc.phases) ? arc.phases : []
  if (phases.length === 0) {
    return `<div class="rel-empty">${lang === 'zh' ? '数据不足以识别阶段' : 'Not enough data to identify phases'}</div>`
  }
  const phaseLabel = lang === 'zh' ? '阶段' : 'Phase'
  const themeLabel = lang === 'zh' ? '主导话题' : 'Themes'
  const voiceLabel = lang === 'zh' ? '声音' : 'Voice'
  return phases.map((p, i) => {
    const themes = (p.dominant_themes || []).slice(0, 5).map(t =>
      `<span class="ga-theme">${esc(t)}</span>`).join(' ')
    return `<div class="ga-phase">
      <div class="ga-phase-head">
        <div class="ga-phase-num">${String(i+1).padStart(2,'0')}</div>
        <div class="ga-phase-labels">
          <div class="ga-phase-label">${esc(p.label || phaseLabel)}</div>
          <div class="ga-phase-years">${esc(p.year_range || '')}</div>
        </div>
      </div>
      <div class="ga-phase-body">
        <div class="ga-meta"><span class="ga-meta-label">${themeLabel}</span> ${themes}</div>
        <div class="ga-meta"><span class="ga-meta-label">${voiceLabel}</span> ${esc(p.voice_shift || '')}</div>
        <p class="ga-summary">${esc(p.summary || '')}</p>
      </div>
    </div>`
  }).join('\n')
}

function buildLifeTimeline(sections, lang) {
  const events = Array.isArray(sections.life_timeline) ? sections.life_timeline : []
  if (events.length === 0) {
    return `<div class="rel-empty">${lang === 'zh' ? '数据不足以提取生活事件' : 'Not enough data to extract life events'}</div>`
  }
  const CAT_COLORS = {
    career: '#1D4ED8', relationship: '#DB2777', family: '#059669',
    health: '#DC2626', relocation: '#0891B2', study: '#7C3AED',
    loss: '#374151', achievement: '#CA8A04',
    '职业': '#1D4ED8', '关系': '#DB2777', '家庭': '#059669',
    '健康': '#DC2626', '搬迁': '#0891B2', '学习': '#7C3AED',
    '丧失': '#374151', '成就': '#CA8A04',
  }
  return events.slice(0, 20).map(e => {
    const color = CAT_COLORS[e.category] || '#6B7280'
    return `<div class="tl-row life-row">
      <div class="tl-date" style="color:${color};">${esc(e.date || '')}</div>
      <div class="tl-body">
        <div class="tl-head">
          <span class="tl-icon">${esc(e.icon || '•')}</span>
          <span class="tl-title">${esc(e.title || '')}</span>
          <span class="tl-cat" style="background:${color}20;color:${color};">${esc(e.category || '')}</span>
        </div>
        <blockquote class="tl-evidence">"${esc(e.evidence || '')}"</blockquote>
        <p class="tl-sig">${esc(e.significance || '')}</p>
      </div>
    </div>`
  }).join('\n')
}

// ─────────────────────────────────────────────────
//  Main Tool Class
// ─────────────────────────────────────────────────

class RenderReportTool extends BaseTool {
  constructor(context = {}) {
    super(
      'render_persona_report',
      'Render a persona-analysis HTML report. Normally pass sections + stats from extract_sections. ' +
        'If you omit them, the tool will auto-load them from the extract_sections cache on disk. ' +
        'The tool auto-generates all D scalars and 27 HTML fragments internally. ' +
        'Do NOT generate D/HTML yourself. Do NOT read template.html.',
      'render_persona_report'
    )
    this.dataPath = context.dataPath || ''
    this.docPath = context.docPath || ''
    this.agentId = context.agentId || 'unknown'
    this.agentName = context.agentName || 'unknown'
    this.agentType = context.agentType === 'user' ? 'users' : 'agents'
    this.language = String(context.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }

  /**
   * Locate the extract_sections cache file. AnalyzeAgentTool uses
   * `agent-artifacts/system/` for non-user agents while this tool's agentType
   * is `agents`, so we search both locations.
   */
  _findSectionsCache() {
    const candidates = [
      path.join(this.dataPath, 'agent-artifacts', 'system', `${this.agentId}.sections.json`),
      path.join(this.dataPath, 'agent-artifacts', 'users',  `${this.agentId}.sections.json`),
      path.join(this.dataPath, 'agent-artifacts', 'agents', `${this.agentId}.sections.json`),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
    return null
  }

  /**
   * Sanitise a name for use as a filename on Windows/macOS/Linux.
   */
  _safeFileName(name) {
    return String(name || 'report')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80) || 'report'
  }

  schema() {
    return {
      type: 'object',
      properties: {
        sections: {
          type: 'object',
          description: 'The sections object from extract_sections output. Contains 19 section keys: ' +
            'persona_card, dialogue_theatre, subtext_decoder, interaction_tips, topic_preferences, ' +
            'signals, best_communication_times, expected_next, trajectory, character_portrait, ' +
            'surprising_contradiction, compatibility, key_quotes, gift_suggestions, health_index, ' +
            'growth_suggestions, ocean, mbti, attachment.',
        },
        stats: {
          type: 'object',
          description: 'The stats object from extract_sections output. Contains: total_messages, ' +
            'date_range {first, last}, senders {name: count}, monthly_activity {"YYYY-MM": count}, ' +
            'avg_message_length.',
        },
        agent_name: {
          type: 'string',
          description: 'Override agent display name. Default: use context.agentName.',
        },
        language_override: {
          type: 'string',
          enum: ['zh', 'en'],
          description: 'Override language. Default: use user config.language.',
        },
      },
      required: ['sections'],
    }
  }

  async execute(toolCallId, params, signal, onUpdate) {
    try {
      const lang = params.language_override
        ? (String(params.language_override).toLowerCase().startsWith('zh') ? 'zh' : 'en')
        : this.language

      const agentName = params.agent_name || this.agentName
      // Defensive parse: some LLMs (esp. weaker ones) serialize complex
      // object arguments to JSON STRINGS instead of passing them as objects.
      // A string's Object.keys() returns character indices (0,1,2,...) which
      // look like "many keys" — that would skip the cache-auto-load safety
      // net below and the HTML would render with all-empty sections. Parse
      // back into an object here so downstream code always sees a real one.
      const coerceToObject = (v) => {
        if (v == null) return {}
        if (typeof v === 'object' && !Array.isArray(v)) return v
        if (typeof v === 'string') {
          try {
            const parsed = JSON.parse(v)
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
          } catch (_) { return {} }
        }
        return {}
      }
      let sections = coerceToObject(params.sections)
      let stats = coerceToObject(params.stats)
      let loadedFromCache = false

      // ── Weak-model safety net ─────────────────────────────────────
      // Trigger cache auto-load in two cases:
      //   (a) The LLM sent no sections / a tiny object (< 5 keys). Typical
      //       of weaker models that skip arguments.
      //   (b) For user-agent (self) reports, any of the 5 self-only keys is
      //       missing or empty — the LLM may have condensed its copy of the
      //       payload and dropped large arrays. Cache has the full data.
      const realKeys = Object.keys(sections).filter(k => !k.startsWith('_'))
      const isSelfAgent = this.agentType === 'users'
      const selfKeysLooseCheck = isSelfAgent && [
        'relationships_map', 'identity_modes', 'perceived_views',
        'growth_arc', 'life_timeline', 'unique_memories',
      ].some(k => {
        const v = sections[k]
        if (!v) return true  // missing entirely
        if (Array.isArray(v) && v.length === 0) return true
        if (typeof v === 'object' && Array.isArray(v.partners) && v.partners.length === 0) return true
        if (typeof v === 'object' && Array.isArray(v.phases) && v.phases.length === 0) return true
        return false
      })
      if (realKeys.length < 5 || selfKeysLooseCheck) {
        const cachePath = this._findSectionsCache()
        if (cachePath) {
          try {
            const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
            if (cached.sections && typeof cached.sections === 'object') {
              // Merge strategy: cache fills gaps (empty / missing keys) but
              // any LLM-provided non-empty value wins. This way partial
              // explicit payloads still augment cache rather than overwrite.
              if (realKeys.length < 5) {
                sections = cached.sections
              } else {
                const merged = { ...cached.sections }
                for (const k of Object.keys(sections)) {
                  const v = sections[k]
                  const isEmpty = v == null ||
                    (Array.isArray(v) && v.length === 0) ||
                    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
                  if (!isEmpty) merged[k] = v
                }
                sections = merged
              }
              stats = Object.keys(stats).length > 0 ? stats : (cached.stats || {})
              loadedFromCache = true
              logger.agent('[RenderReportTool] auto-loaded sections from cache', {
                path: cachePath, keys: Object.keys(sections).length,
              })
            }
          } catch (err) {
            logger.warn('[RenderReportTool] sections cache unreadable', err.message)
          }
        }

        // Still not enough data? Refuse with a clear instruction.
        const afterKeys = Object.keys(sections).filter(k => !k.startsWith('_'))
        if (afterKeys.length < 5) {
          return this._err(
            'No sections provided and no usable cache found. ' +
            'Call analyze_agent_history({action: "extract_sections"}) first, then either (a) pass ' +
            'the returned sections and stats into this tool, or (b) just call this tool again with ' +
            'no arguments — it will read the cache automatically.'
          )
        }
      }

      // Flavor decides which sections render and which labels (pie chart etc.)
      // to apply. agentType from skill context is the single source of truth.
      //   - "self"  → strip other-only (relationship-centric) sections
      //   - "other" → strip self-only sections
      const isSelfFlavor = this.agentType === 'users'

      sections._agentName = agentName
      // Expose flavor to downstream HTML fragment builders so they can label
      // speakers correctly in self-mode (see buildTheatreActs / etc.).
      sections._isSelf = isSelfFlavor

      const tplPath = path.join(SKILL_DIR, 'template.html')
      const strPath = path.join(SKILL_DIR, 'strings.json')
      if (!fs.existsSync(tplPath)) return this._err(`template.html not found at ${tplPath}`)
      if (!fs.existsSync(strPath)) return this._err(`strings.json not found at ${strPath}`)

      const template = fs.readFileSync(tplPath, 'utf8')
      const strings = JSON.parse(fs.readFileSync(strPath, 'utf8'))
      const L = strings[lang]
      if (!L) return this._err(`strings.json has no locale "${lang}"`)

      const D = buildDScalars(sections, stats, agentName, lang, isSelfFlavor)
      const HTML = buildAllHtml(sections, stats, lang)
      const stripFlavor = isSelfFlavor ? 'other-only' : 'self-only'
      logger.agent('[RenderReportTool] flavor', {
        agentType: this.agentType,
        flavor: isSelfFlavor ? 'self' : 'other',
        stripping: stripFlavor,
      })

      const langCode = lang === 'zh' ? 'zh-CN' : 'en'
      let out = template.replace(/\{\{LANG\}\}/g, langCode)

      // Strip sections / TOC items / nav anchors tagged with the non-matching
      // flavor. Each tagged element is self-contained (section/a) so a simple
      // non-greedy match up to the closing tag is sufficient.
      // Sections:
      out = out.replace(
        new RegExp(`<section[^>]*data-flavor="${stripFlavor}"[^>]*>[\\s\\S]*?<\\/section>`, 'g'),
        ''
      )
      // TOC items and nav anchors (all <a ... data-flavor="X">...</a>):
      out = out.replace(
        new RegExp(`<a[^>]*data-flavor="${stripFlavor}"[^>]*>[\\s\\S]*?<\\/a>`, 'g'),
        ''
      )

      out = out.replace(/\{\{L\.([a-zA-Z0-9_]+)\}\}/g, (_m, key) => {
        const raw = L[key]
        if (raw === undefined) return `[missing L.${key}]`
        return String(raw).replace(/\{([a-zA-Z0-9_]+)\}/g, (_mm, dk) =>
          D[dk] !== undefined ? String(D[dk]) : `{${dk}}`)
      })

      out = out.replace(/\{\{D\.([a-zA-Z0-9_]+)\}\}/g, (_m, key) =>
        D[key] !== undefined ? String(D[key]) : `[missing D.${key}]`)

      out = out.replace(/\{\{HTML\.([a-zA-Z0-9_]+)\}\}/g, (_m, key) =>
        HTML[key] !== undefined ? HTML[key] : `<!-- missing HTML.${key} -->`)

      // Renumber section-number labels to match rendered DOM position.
      // Runs AFTER {{L.}} substitution so we can see resolved text (including
      // the ★ symbol for deep/ways) and preserve star-badged sections.
      // For self-flavor reports, ~8 other-only sections are stripped, so the
      // hardcoded "Section 09"/"Section 20" labels from strings.json become
      // non-contiguous. Walking remaining sections in order produces a clean
      // 1..N sequence that matches the visual position and TOC entries.
      {
        let sectionIdx = 0
        out = out.replace(
          /(<section class="section"[^>]*>[\s\S]*?<div class="section-number">)([^<]*)(<\/div>)/g,
          (_m, pre, label, post) => {
            sectionIdx++
            // Preserve labels that contain a star (if any stay in the wild —
            // defensive only; current strings.json no longer uses ★ for deep/ways).
            if (label.includes('★')) return `${pre}${label}${post}`
            const pad = String(sectionIdx).padStart(2, '0')
            return `${pre}Section ${pad}${post}`
          }
        )
        // Keep TOC toc-num in sync with the new section numbering.
        let tocIdx = 0
        out = out.replace(
          /(<a class="toc-item" href="[^"]*"[^>]*><span class="toc-num(?: star)?">)([^<]*)(<\/span>)/g,
          (_m, pre, label, post) => {
            tocIdx++
            if (label.includes('★')) return `${pre}${label}${post}`
            const pad = String(tocIdx).padStart(2, '0')
            return `${pre}${pad}${post}`
          }
        )
      }

      const residuals = (out.match(/\{\{[A-Za-z.][A-Za-z0-9_.]*\}\}/g) || [])
      if (residuals.length > 0) logger.warn('[RenderReportTool] unresolved placeholders', [...new Set(residuals)])

      const countWarnings = []
      for (const [block, spec] of Object.entries(BLOCK_COUNT_SPEC)) {
        const frag = HTML[block] || ''
        const re = new RegExp(`class="[^"]*\\b${spec.className}\\b[^"]*"`, 'g')
        const actual = (frag.match(re) || []).length
        if (spec.count !== undefined && actual !== spec.count)
          countWarnings.push(`${block}: expected ${spec.count} × .${spec.className}, got ${actual}`)
        else if (spec.range && (actual < spec.range[0] || actual > spec.range[1]))
          countWarnings.push(`${block}: expected ${spec.range[0]}-${spec.range[1]} × .${spec.className}, got ${actual}`)
      }
      if (countWarnings.length > 0) logger.warn('[RenderReportTool] block-count warnings', countWarnings)

      const sizeBytes = Buffer.byteLength(out, 'utf8')
      const sizeKB = (sizeBytes / 1024).toFixed(1)

      // Output goes to the user's aidoc folder (DoCPath) when configured,
      // so users find reports next to their other notes. Fallback is the
      // internal agent-artifacts/ dir, which keeps old behaviour intact if DoCPath
      // is blank.
      let outPath
      if (this.docPath) {
        fs.mkdirSync(this.docPath, { recursive: true })
        const safeName = this._safeFileName(agentName)
        outPath = path.join(this.docPath, `${safeName}_report.html`)
      } else {
        const artifactsDir = path.join(this.dataPath, 'agent-artifacts', this.agentType)
        fs.mkdirSync(artifactsDir, { recursive: true })
        outPath = path.join(artifactsDir, `${this.agentId}.report.html`)
      }
      fs.writeFileSync(outPath, out, 'utf8')

      logger.agent('[RenderReportTool] wrote report', { path: outPath, sizeKB, lang: langCode, agentId: this.agentId, loadedFromCache })

      let sizeNote = ''
      if (sizeBytes < 90 * 1024) sizeNote = ' (note: may be thin)'
      else if (sizeBytes > 200 * 1024) sizeNote = ' (note: may be redundant)'

      const warnNote = countWarnings.length > 0
        ? `\n  Block-count warnings (${countWarnings.length}): ${countWarnings.slice(0, 3).join('; ')}` : ''

      const cacheNote = loadedFromCache ? `\n  Source: sections auto-loaded from extract_sections cache` : ''
      return this._ok(
        `Report rendered successfully.\n` +
        `  Path: ${outPath}\n` +
        `  Size: ${sizeKB} KB${sizeNote}\n` +
        `  Language: ${langCode}\n` +
        `  D scalars: 55 auto-computed\n` +
        `  HTML fragments: 27 auto-generated${warnNote}${cacheNote}\n\n` +
        `Open the file in a browser to verify visual output.`,
        { filePath: outPath, sizeKB: Number(sizeKB), language: langCode, countWarnings, loadedFromCache }
      )
    } catch (err) {
      logger.error('[RenderReportTool] error', err)
      return this._err(`Render failed: ${err.message}`, { stack: err.stack })
    }
  }
}

module.exports = { RenderReportTool, BLOCK_COUNT_SPEC }
