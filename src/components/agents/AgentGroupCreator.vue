<template>
  <Teleport to="body">
    <div class="agc-backdrop">
      <div class="agc-modal">
        <div class="agc-header">
          <div class="agc-header-left">
            <div class="agc-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <h2 class="agc-title">{{ t('agents.groupCreator.title', 'Add Multiple Agents') }}</h2>
              <span class="agc-meta">{{ t('agents.groupCreator.subtitle', 'Quickly add categories and agents') }}</span>
            </div>
          </div>
          <button class="agc-close-btn" @click="$emit('close')" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="agc-tabs">
          <button class="agc-tab" :class="{ active: activeTab === 'custom' }" @click="activeTab = 'custom'">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            {{ t('agents.groupCreator.custom', 'AI Generate') }}
          </button>
          <button class="agc-tab" :class="{ active: activeTab === 'templates' }" @click="activeTab = 'templates'">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            {{ t('agents.groupCreator.templates', 'Templates') }}
          </button>
        </div>

        <div class="agc-body">
          <!-- Templates Tab -->
          <div v-if="activeTab === 'templates'" class="agc-templates">
            <div class="agc-templates-grid">
              <div
                v-for="template in sortedTemplates"
                :key="template.id"
                class="agc-template-card"
                :class="{ selected: selectedTemplate?.id === template.id, highlighted: highlightedTemplateIds.includes(template.id) }"
                @click="selectedTemplate = template"
              >
                <div class="agc-template-icon">{{ template.emoji }}</div>
                <div class="agc-template-info">
                  <h3 class="agc-template-name">{{ template.name }}</h3>
                  <p class="agc-template-desc">{{ template.description }}</p>
                  <div class="agc-template-meta">
                    <span class="agc-template-cat">{{ template.category.emoji }} {{ template.category.name }}</span>
                    <span class="agc-template-count">{{ template.agents.length }} {{ t('agents.groupCreator.agents', 'agents') }}</span>
                  </div>
                </div>
                <div v-if="selectedTemplate?.id === template.id" class="agc-template-check">
                  <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <!-- Custom Tab -->
          <div v-if="activeTab === 'custom'" class="agc-custom">
            <div class="agc-custom-input-wrap">
              <div class="agc-custom-top-row">
                <span v-if="_aiSurpriseGenerating" class="agc-ai-hint">
                  <svg class="agc-ai-hint-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  {{ t('agents.groupCreator.generatingIdeas', 'Generating new ideas...') }}
                </span>
                <div v-else></div>
                <AppButton
                  size="compact"
                  class="bv-ai-micro"
                  :disabled="generatingProposal"
                  @click="generateSurpriseProposal"
                >
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  {{ t('agents.surpriseMe', 'Surprise me') }}
                </AppButton>
              </div>
              <textarea
                v-model="customDescription"
                class="agc-custom-textarea"
                :placeholder="placeholderText"
                rows="4"
                autofocus
              ></textarea>
              <div v-if="aiError && !generatedProposal" class="agc-ai-error">{{ aiError }}</div>
              <div class="agc-custom-actions">
                <div class="agc-count-picker">
                  <button class="agc-count-btn" @click="agentCount = Math.max(1, agentCount - 1)" :disabled="agentCount <= 1 || generatingProposal">−</button>
                  <span class="agc-count-val">{{ agentCount }}</span>
                  <button class="agc-count-btn" @click="agentCount = Math.min(5, agentCount + 1)" :disabled="agentCount >= 5 || generatingProposal">+</button>
                </div>
                <AppButton
                  size="compact"
                  class="bv-ai-micro"
                  :loading="generatingProposal"
                  :disabled="!customDescription.trim() || generatingProposal"
                  @click="generateFromAI()"
                >
                  <svg v-if="!generatingProposal" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  {{ generatingProposal ? t('agents.groupCreator.generating', 'Generating...') : t('agents.groupCreator.generate', 'Generate') }}
                </AppButton>
              </div>
            </div>

            <!-- Generated Preview -->
            <div v-if="generatedProposal" class="agc-proposal">
              <div class="agc-proposal-header">
                <h3 class="agc-proposal-title">{{ t('agents.groupCreator.proposal', 'Proposed Setup') }}</h3>
                <button class="agc-proposal-regen" :disabled="generatingProposal" @click="generateFromAI()">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                  {{ t('agents.groupCreator.regenerate', 'Regenerate') }}
                </button>
              </div>
              
              <div class="agc-proposal-category">
                <span class="agc-proposal-cat-emoji">{{ generatedProposal.category.emoji }}</span>
                <span class="agc-proposal-cat-name">{{ generatedProposal.category.name }}</span>
              </div>

              <div class="agc-proposal-agents">
                <div
                  v-for="(agent, idx) in generatedProposal.agents"
                  :key="idx"
                  class="agc-proposal-agent"
                  @mouseenter="showAgentHover(agent, $event)"
                  @mousemove="updateAgentHover($event)"
                  @mouseleave="hideAgentHover"
                >
                  <span class="agc-proposal-agent-icon">👤</span>
                  <div class="agc-proposal-agent-info">
                    <span class="agc-proposal-agent-name">{{ agent.name }}</span>
                    <span class="agc-proposal-agent-role">{{ agent.role }}</span>
                  </div>
                </div>
              </div>

              <div v-if="aiWarning" class="agc-ai-warning">{{ aiWarning }}</div>
              <div v-if="aiError" class="agc-ai-error">{{ aiError }}</div>
            </div>

            <div v-if="!generatedProposal && !generatingProposal && customTabAttempted" class="agc-custom-hint">
              {{ t('agents.groupCreator.hint', 'Describe any category and agent setup you want, then click Generate.') }}
            </div>
          </div>
        </div>

        <div class="agc-footer">
          <div v-if="aiWarning" class="agc-footer-warning">{{ aiWarning }}</div>
          <div class="agc-footer-actions">
          <button class="agc-btn agc-btn-cancel" @click="$emit('close')">
            {{ t('common.cancel', 'Cancel') }}
          </button>
          <button
            class="agc-btn agc-btn-create"
            :disabled="!canCreate || creating"
            @click="createAgents"
          >
            <span v-if="creating" class="agc-spinner"></span>
            {{ creating ? t('agents.groupCreator.creating', 'Creating...') : t('agents.groupCreator.create', 'Create {count} Agents', { count: createCount }) }}
          </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="hoverAgent"
        ref="hoverCardRef"
        class="agc-agent-hover-card"
        :style="hoverCardStyle"
        @mouseenter="holdAgentHover"
        @mouseleave="hideAgentHoverNow"
      >
        <div class="agc-hover-row">
          <span class="agc-hover-label">{{ t('agents.agentName', 'Agent Name') }}</span>
          <span class="agc-hover-value" v-html="formatInlineHtml(hoverAgent.name)"></span>
        </div>
        <div class="agc-hover-row">
          <span class="agc-hover-label">{{ t('agents.agentDescription', 'Description') }}</span>
          <span class="agc-hover-value" v-html="formatInlineHtml(hoverAgent.description)"></span>
        </div>
        <div class="agc-hover-row">
          <span class="agc-hover-label">{{ t('agents.agentDefinition', 'Definition') }}</span>
          <span class="agc-hover-value agc-hover-definition" v-html="formatDefinitionHtml(getAgentDefinition(hoverAgent))"></span>
        </div>
      </div>
    </Teleport>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import { useI18n } from '../../i18n/useI18n'
import { getAgentTemplates, PROFESSIONAL_TEMPLATE_IDS, getEntertainmentTemplateIds, templateMemoryToSections, templateSpeechToDna } from '../../data/agentTemplates'
import AppButton from '../common/AppButton.vue'
import { getCharacterPromptSections, getProfessionalPromptSections } from '../../utils/agentDefinitionPrompts'

const props = defineProps({
  agentType: {
    type: String,
    default: 'system'
  },
  initialTab: {
    type: String,
    default: ''
  },
  highlightCategory: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close', 'created'])

const { t, locale } = useI18n()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()

const templates = computed(() => getAgentTemplates(locale.value))

const highlightedTemplateIds = computed(() => {
  if (props.highlightCategory === 'professional') return PROFESSIONAL_TEMPLATE_IDS
  if (props.highlightCategory === 'entertainment') return getEntertainmentTemplateIds(locale.value)
  return []
})

const sortedTemplates = computed(() => {
  if (!highlightedTemplateIds.value.length) return templates.value
  return [...templates.value].sort((a, b) => {
    const aH = highlightedTemplateIds.value.includes(a.id) ? 0 : 1
    const bH = highlightedTemplateIds.value.includes(b.id) ? 0 : 1
    return aH - bH
  })
})

const activeTab = ref(props.initialTab || 'custom')
const selectedTemplate = ref(null)
const customDescription = ref('')
const generatingSurprise = ref(false)
const generatingProposal = ref(false)
const creating = ref(false)
const agentCount = ref(3)
const customTabAttempted = ref(false)
const generatedProposal = ref(null)
const aiError = ref('')
const aiWarning = ref('')

const hoverAgent = ref(null)
const hoverCardRef = ref(null)
const hoverCardStyle = ref({})
const hoverHideTimer = ref(null)

function clearHoverHideTimer() {
  if (hoverHideTimer.value) {
    clearTimeout(hoverHideTimer.value)
    hoverHideTimer.value = null
  }
}

function scheduleHideHover() {
  clearHoverHideTimer()
  hoverHideTimer.value = setTimeout(() => {
    hoverAgent.value = null
    hoverHideTimer.value = null
  }, 140)
}

onBeforeUnmount(() => {
  clearHoverHideTimer()
})

// ── Surprise Me phrase pools ─────────────────────────────────────────────
// Pre-curated so JS controls variety — no LLM convergence risk.
// Mix: named fictional characters, real historical figures, pop-culture types, internet archetypes.
const EN_SURPRISE_PHRASES = [
  // Named fictional characters
  "The Avengers but they're all passive-aggressive middle managers",
  'Breaking Bad crew running a startup: Walter White, Jesse, Saul Goodman, Gus Fring',
  'Sherlock Holmes, Moriarty, Irene Adler, and Watson as rival consulting agency',
  'Marvel antiheroes as life coaches: Loki, Deadpool, Magneto, Doctor Strange',
  'Disney villains at a mandatory team-building retreat: Scar, Ursula, Maleficent, Jafar',
  'Game of Thrones power players in a modern corporate boardroom',
  'The Joker, Harley Quinn, Riddler, and Penguin as a dysfunctional marketing agency',
  'Groot, Rocket Raccoon, Drax, and Star-Lord running a daily standup meeting',
  'Famous fictional detectives on the same cold case: Sherlock, Poirot, Columbo, Miss Marple',
  'The Lord of the Rings fellowship reimagined as a startup founding team',
  'Hannibal Lecter, Patrick Bateman, Amy Dunne, and Tom Ripley as corporate high-performers',
  'Harry Potter cast as adult coworkers: Harry, Hermione, Draco, Dumbledore, Snape',
  'The Godfather family running a modern consulting firm',
  'Star Wars strategists as rival consultants: Yoda, Darth Vader, Obi-Wan, Palpatine',
  // Historical / public figures
  'Napoleon, Genghis Khan, Cleopatra, and Caesar in a modern strategy war room',
  'Tesla, Edison, Newton, and Curie competing to pitch at a startup demo day',
  "History's most ruthless rulers: Caligula, Ivan the Terrible, Nero, Qin Shi Huang",
  'Great philosophers as podcast hosts: Socrates, Nietzsche, Freud, Confucius',
  'Steve Jobs, Elon Musk, Jeff Bezos, and Bill Gates as co-founders of the same startup',
  // Pop culture / archetypes
  'The most insufferable coworker personalities from every department',
  'Iconic horror movie monsters as customer service representatives',
  'Every type of gym personality fighting for the squat rack',
  'Extreme hobbyist stereotypes: the sourdough obsessive, the vinyl collector, the marathon evangelist',
  'Social media personality types: the LinkedIn thought leader, the Instagram aesthetic, the conspiracy TikToker',
  'Reality TV archetypes: the villain, the crier, the strategic player, the delusional one, the fan favourite',
  'Legendary rock icons stuck in a tour bus breakdown: Jimi Hendrix, Freddie Mercury, Kurt Cobain, David Bowie',
  'Famous chefs with wildly clashing food philosophies trapped in one kitchen',
  'The most difficult hotel guests and their impossibly specific complaints',
  'Classic therapist types: the Freudian, the radical-honesty coach, the astrology-believer, the journaling fanatic',
  'Late-night talk show hosts debating the meaning of life',
  'Different eras of tech CEOs pitching to the same VC: 1990s, 2010s, 2020s vibes',
]

const ZH_SURPRISE_PHRASES = [
  // 动漫角色
  '哆啦A梦、大雄、胖虎、小夫、静香同在一家公司打工',
  '西游记师徒四人在现代互联网公司的职场日常',
  '《海贼王》草帽一伙入职同一家初创企业',
  '七龙珠经典角色：孙悟空、贝吉塔、弗利萨、比克的职场版',
  '《名侦探柯南》的经典角色集体在同一间办公室办案',
  '《进击的巨人》里的角色组成创业公司争夺话语权',
  '《鬼灭之刃》柱们在一家猎头公司共事',
  '《火影忍者》三代目弟子们在现代咨询公司角力：鸣人、佐助、小樱、卡卡西',
  // 古装剧/历史人物
  '《甄嬛传》后宫众人搬到现代职场争夺总裁青睐',
  '《延禧攻略》魏璎珞和众嫔妃在商场里的权谋角逐',
  '三国顶级谋士同台竞技：诸葛亮、郭嘉、司马懿、周瑜',
  '水浒好汉在现代快递公司打工：宋江、武松、鲁智深、李逵',
  '中国古代最强帝王在同一间会议室：秦始皇、武则天、汉武帝、乾隆',
  '《琅琊榜》梅长苏和众公子哥在创投公司里博弈',
  '四大名著的反派合伙开公司：西门庆、王熙凤、曹操、宋江',
  '金庸武侠高手在现代公司竞岗：令狐冲、郭靖、张无忌、杨过、韦小宝',
  // 历史名人
  '鲁迅、胡适、林语堂、郭沫若在今天的互联网上battle',
  '慈禧、孝庄、武则天、吕后在一家家族企业争夺话语权',
  '三国枭雄：曹操、刘备、孙权的现代版商战',
  // 网络/现实类型
  '各大平台的典型网红：抖音带货主播、B站UP主、小红书博主、知乎大V',
  '奇葩办公室生态：甩锅大师、邀功惯犯、摸鱼专家、职场哭包',
  '中式家长的六种经典操作：比较型、哭穷型、画饼型、催婚型、报喜不报忧型、控制型',
  '饭圈文化的经典人格：大粉、控评女孩、撕番位专家、数据哥、脱粉回踩玩家',
  '每个宿舍都有的几种室友世界线',
  '高考前的各方势力：鸡娃家长、摆烂学生、内卷同学、神奇班主任、佛系老师',
  '各地捍卫美食的死忠粉：四川火锅卫道士、广东早茶拥趸、北京烤鸭传教士、湖南辣椒狂信者',
  '不同段位的麻将玩家：老烟枪老手、运气型新手、眼神杀手、报牌刺客',
  '传说中相亲市场上的各路奇人类型',
  '上海弄堂、北京胡同里的邻里众生相',
  '职场新人的四种极端生存策略',
]

// Tracks recently used indices per language to prevent immediate repeats
const _surpriseUsedEN = []
const _surpriseUsedZH = []

// AI-generated surprise pool
const _aiSurprisePool = ref([])
const _aiSurpriseIndex = ref(0)
const _aiSurpriseGenerating = ref(false)

function generateDynamicSurpriseIdea() {
  const appLang = configStore.config?.language || 'en'
  const isZh = appLang.startsWith('zh')

  // Use AI pool if available
  if (_aiSurprisePool.value.length > 0 && _aiSurpriseIndex.value < _aiSurprisePool.value.length) {
    const idea = _aiSurprisePool.value[_aiSurpriseIndex.value]
    _aiSurpriseIndex.value++
    // When pool exhausted, trigger background regeneration
    if (_aiSurpriseIndex.value >= _aiSurprisePool.value.length) {
      _aiSurprisePool.value = []
      _aiSurpriseIndex.value = 0
      _generateAiSurprisePool()
    }
    return idea
  }

  // Fallback to fixed phrases
  const pool = isZh ? ZH_SURPRISE_PHRASES : EN_SURPRISE_PHRASES
  const used = isZh ? _surpriseUsedZH : _surpriseUsedEN
  const recentLimit = Math.min(10, Math.floor(pool.length / 2))
  const available = pool.map((_, i) => i).filter(i => !used.includes(i))
  const candidates = available.length > 0 ? available : pool.map((_, i) => i)
  const idx = candidates[Math.floor(Math.random() * candidates.length)]
  used.push(idx)
  if (used.length > recentLimit) used.shift()
  return pool[idx]
}

async function _generateAiSurprisePool() {
  if (_aiSurpriseGenerating.value) return
  _aiSurpriseGenerating.value = true
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const um = config.utilityModel
    if (!um?.provider || !um?.model) return

    const appLang = config.language || 'en'
    const isZh = appLang.startsWith('zh')
    const examples = isZh ? ZH_SURPRISE_PHRASES : EN_SURPRISE_PHRASES
    const lang = isZh ? 'Chinese' : 'English'

    const res = await window.electronAPI.enhancePrompt({
      prompt: `You are a creative writing assistant. Below are example prompts that describe fun, imaginative group-chat agent scenarios. Study their style — they are vivid, specific, culturally resonant, and often humorous.

Examples:
${examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Now generate 50 NEW prompts in the same style. They must be:
- In ${lang}
- Completely different from the examples (no duplicates or paraphrases)
- Each one line, no numbering
- Creative, specific, and fun — mixing pop culture, history, archetypes, daily life
- Varied in theme (don't repeat the same genre)

Reply with ONLY a JSON array of 50 strings. No explanation, no markdown.`,
      config,
    })
    if (res.success && res.text) {
      try {
        const parsed = JSON.parse(extractJSON(res.text))
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Shuffle the array
          for (let i = parsed.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [parsed[i], parsed[j]] = [parsed[j], parsed[i]]
          }
          _aiSurprisePool.value = parsed.map(s => String(s).trim()).filter(Boolean)
          _aiSurpriseIndex.value = 0
        }
      } catch { /* ignore parse errors, keep using fixed phrases */ }
    }
  } catch { /* silently fail, fixed phrases remain as fallback */ }
  _aiSurpriseGenerating.value = false
}
const placeholderText = computed(() => {
  return t('agents.groupCreator.placeholder', 'Describe what you need... e.g. Build a category of quirky neighbors, anime-style heroes, or aliens with clashing personalities.')
})

const canCreate = computed(() => {
  if (activeTab.value === 'templates') {
    return selectedTemplate.value !== null
  }
  return generatedProposal.value !== null
})

const createCount = computed(() => {
  if (activeTab.value === 'templates' && selectedTemplate.value) {
    return selectedTemplate.value.agents.length
  }
  if (generatedProposal.value) {
    return generatedProposal.value.agents.length
  }
  return 0
})

watch(activeTab, (newVal) => {
  if (newVal === 'custom') {
    customTabAttempted.value = true
  }
})

function detectLanguage() {
  const appLang = configStore.config.language || 'en'
  return appLang.startsWith('zh') ? 'Chinese' : 'English'
}

// getCharacterPromptSections and getProfessionalPromptSections are imported
// from ../../utils/agentDefinitionPrompts — single source of truth.
function normalizeName(value) {
  return (value || '').trim().toLowerCase()
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

function parseProposalJSON(rawText) {
  const extracted = extractJSON(rawText)
  const candidates = [
    extracted,
    extracted
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\r\n/g, '\n')
  ]

  let lastError = null
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Invalid JSON')
}

function resolveDefaultProviderModel() {
  const cfg = configStore.config || {}
  const providers = Array.isArray(cfg.providers) ? cfg.providers : []
  const active = providers.filter(p => p?.apiKey)

  const preferredProvider = cfg.utilityModel?.provider || ''
  const preferredModel = cfg.utilityModel?.model || ''

  // preferredProvider is stored as type (e.g., 'anthropic'), not UUID
  const provider = (preferredProvider && active.find(p => p.type === preferredProvider)) || active[0] || null
  if (!provider) return { providerId: null, modelId: null }

  const modelId = preferredModel
    || provider.model
    || provider.settings?.sonnetModel
    || provider.settings?.opusModel
    || provider.settings?.haikuModel
    || null

  return { providerId: provider.id, modelId }
}

async function repairProposalJSON(rawText, config, langInstruction = '') {
  const repairRes = await window.electronAPI.enhancePrompt({
    prompt: `Convert the following content into valid JSON only. Do not add explanations.

Target schema:
{
  "category": { "name": "Category Name", "emoji": "emoji" },
  "agents": [
    {
      "name": "Agent Name",
      "role": "brief role (3-8 words)",
      "description": "keyword-style summary, max 100 characters",
      "prompt": "full agent definition prompt text"
    }
  ]
}

Rules:
- Keep original meaning
- Ensure strict valid JSON
- Keep all strings escaped correctly${langInstruction}

Source content:
${rawText}`,
    config,
  })

  if (!repairRes?.success || !repairRes?.text) {
    throw new Error(repairRes?.error || 'JSON repair failed')
  }
  return parseProposalJSON(repairRes.text)
}

function buildFallbackPrompt(agent, lang) {
  const name = (agent?.name || '').trim() || 'Agent'
  const role = (agent?.role || '').trim() || (lang === 'Chinese' ? '通用助手' : 'General Assistant')
  const desc = (agent?.description || '').trim() || (lang === 'Chinese' ? '专注于提供清晰、实用、有趣的帮助。' : 'Focused on clear, practical, engaging help.')
  const isLikelyCharacter = /朋友|邻居|同事|孩子|侦探|名人|魔法|幻想|角色|persona|character|friend|neighbor|colleague|kid|wizard|detective/i.test(`${role} ${desc}`)

  if (lang === 'Chinese') {
    if (isLikelyCharacter) {
      return `### 核心身份\n你是 ${name} — ${role}\n\n### 核心限制\n保持角色一致，不提供危险或误导内容。\n\n### 说话方式\n语气鲜明但友好，表达简洁，优先可执行建议。\n\n### 触发规则\nIF 用户求助 THEN 给出分步骤建议\nIF 用户质疑 THEN 解释依据并给替代方案\nIF 对话冷场 THEN 主动抛出一个相关有趣问题\nIF 对话结束 THEN 总结一句并友好收尾\n\n### 铁律\n始终在有趣与实用之间保持平衡。`
    }
    return `### 核心定位\n你是 ${name}，${role}。\n\n### 专业能力\n${desc}\n\n### 工作规则\nIF 需求不清晰 THEN 先追问关键约束\nIF 需要方案 THEN 提供可执行步骤与优先级\nIF 方案存在风险 THEN 明确风险并给备选\n\n### 输出格式\n先结论，再步骤，最后补充可选优化项。\n\n### 边界约束\n不编造事实，不提供违规建议，信息不足时先澄清。`
  }

  if (isLikelyCharacter) {
    return `### Core Identity\nYou are ${name} — ${role}.\n\n### Core Constraint\nStay in character and avoid unsafe or misleading content.\n\n### Speaking Style\nDistinct but friendly tone, concise wording, actionable suggestions first.\n\n### Trigger Rules\nIF user asks for help THEN provide step-by-step guidance\nIF user challenges you THEN explain rationale and offer alternatives\nIF conversation stalls THEN ask one relevant playful question\nIF conversation ends THEN close with a short summary\n\n### One Rule\nBalance personality and practical value in every reply.`
  }
  return `### Core Role\nYou are ${name}, ${role}.\n\n### Expertise & Tools\n${desc}\n\n### Working Rules\nIF requirements are unclear THEN ask clarifying questions first\nIF a solution is requested THEN provide prioritized actionable steps\nIF risks exist THEN state risks and suggest alternatives\n\n### Output Format\nConclusion first, then steps, then optional improvements.\n\n### Hard Constraints\nNo fabricated facts, no policy-violating guidance, clarify when context is missing.`
}

async function requestCompactProposal({
  desc,
  config,
  langInstruction = '',
  existingAgentNames = [],
  existingCategoryNames = [],
}) {
  const compactRes = await window.electronAPI.enhancePrompt({
    prompt: `Return STRICT valid JSON only. No markdown. No explanation.

User description: "${desc}"

Schema:
{
  "category": { "name": "Category Name", "emoji": "emoji" },
  "agents": [
    {
      "name": "Agent Name",
      "role": "brief role",
      "description": "short summary"
    }
  ]
}

Hard rules:
- Exactly 3 agents
- Keep each string short
- Do not include a "prompt" field
- Agent names must not duplicate existing names: ${JSON.stringify(existingAgentNames)}
- Category name must not duplicate existing category names: ${JSON.stringify(existingCategoryNames)}
- Keep output compact and parseable JSON${langInstruction}`,
    config,
  })

  if (!compactRes?.success || !compactRes?.text) {
    throw new Error(compactRes?.error || 'Compact proposal generation failed')
  }

  return parseProposalJSON(compactRes.text)
}

function makeUniqueName(baseName, usedNames) {
  const safeBase = (baseName || '').trim() || 'Agent'
  let candidate = safeBase
  let i = 2
  while (usedNames.has(normalizeName(candidate))) {
    candidate = `${safeBase} (${i})`
    i += 1
  }
  usedNames.add(normalizeName(candidate))
  return candidate
}

function uniqueCategoryName(baseName, existingCategoryNames) {
  const safeBase = (baseName || '').trim() || 'Category'
  let candidate = safeBase
  let i = 2
  while (existingCategoryNames.has(normalizeName(candidate))) {
    candidate = `${safeBase} (${i})`
    i += 1
  }
  return candidate
}

function getAgentDefinition(agent) {
  const prompt = (agent?.prompt || '').trim()
  if (prompt) return prompt
  const role = (agent?.role || '').trim()
  const desc = (agent?.description || '').trim()
  if (role && desc) return `${role}. ${desc}`
  if (role) return role
  if (desc) return desc
  return 'General assistant profile.'
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatInlineHtml(input) {
  return escapeHtml(input || '')
}

function formatDefinitionHtml(input) {
  const escaped = escapeHtml(input || '')
  return escaped
    .replace(/^###\s*(.+)$/gm, '<span class="agc-hover-sec">$1</span>')
    .replace(/\n/g, '<br>')
}

function isRichPrompt(prompt) {
  if (typeof prompt !== 'string') return false
  const text = prompt.trim()
  if (!text) return false
  // Full templates have 6 sections (Character) or 5 sections (Professional),
  // must have substantial content to avoid using truncated/skeleton prompts
  const sectionCount = (text.match(/^###/gm) || []).length
  if (sectionCount < 3) return false
  if (text.length < 200) return false
  return true
}

function positionHoverCard(anchorRect) {
  const modalRect = document.querySelector('.agc-modal')?.getBoundingClientRect()
  if (!modalRect) return

  const padding = 12
  const cardRect = hoverCardRef.value?.getBoundingClientRect()
  const cardWidth = cardRect?.width || 360
  const cardHeight = cardRect?.height || 260

  let left = anchorRect.left + anchorRect.width / 2 - cardWidth / 2
  left = Math.max(modalRect.left + padding, Math.min(left, modalRect.right - cardWidth - padding))

  let top = anchorRect.top - cardHeight - 8
  if (top < modalRect.top + padding) {
    top = Math.min(anchorRect.bottom + 8, modalRect.bottom - cardHeight - padding)
  }

  hoverCardStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
  }
}

function showAgentHover(agent, event) {
  clearHoverHideTimer()
  hoverAgent.value = agent
  const rect = event.currentTarget.getBoundingClientRect()
  hoverCardStyle.value = {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
  }
  nextTick(() => positionHoverCard(rect))
}

function updateAgentHover(event) {
  if (!hoverAgent.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  positionHoverCard(rect)
}

function hideAgentHover() {
  scheduleHideHover()
}

function holdAgentHover() {
  clearHoverHideTimer()
}

function hideAgentHoverNow() {
  clearHoverHideTimer()
  hoverAgent.value = null
}

async function generateFromAI(descriptionOverride = null) {
  const descInput = typeof descriptionOverride === 'string'
    ? descriptionOverride
    : customDescription.value
  const desc = String(descInput || '').trim()
  if (!desc) return

  generatingProposal.value = true
  generatedProposal.value = null
  aiError.value = ''
  aiWarning.value = ''
  customTabAttempted.value = true

  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage()
    const charSections = getCharacterPromptSections(lang)
    const profSections = getProfessionalPromptSections(lang)
    const existingAgentNames = agentsStore.agents.map(a => a.name).filter(Boolean)
    const existingCategoryNames = agentsStore.categories
      .filter(c => c.type === props.agentType)
      .map(c => c.name)
      .filter(Boolean)
    const langInstruction = lang ? `\n\nIMPORTANT: Respond entirely in ${lang}.` : ''

    const res = await window.electronAPI.enhancePrompt({
      prompt: `You are a character architect that creates vivid, opinionated, personality-rich agent personas.
The agents you create must feel like real people — full of internal contradictions, distinct speech patterns, and strong opinions.
For each agent, DECONSTRUCT their inner operating system: beliefs that drive behavior, reflexive reactions, speech fingerprint, and core internal contradictions.
Based on the user's description, generate one proposal.

User description: "${desc}"

Existing agent names (must avoid): ${JSON.stringify(existingAgentNames)}
Existing category names (must avoid): ${JSON.stringify(existingCategoryNames)}

Each agent must be one of:
- TYPE A (Character/Persona — PREFERRED for grounded themes): vivid personality, conflict style, strong opinions. Use the Character section style:
${charSections}

- TYPE B (Professional with a twist): has expertise BUT also a defining personality flaw or extreme trait. Use the Professional section style:
${profSections}

The "prompt" field must be a plain string with markdown section headers.

Each agent must ALSO ship with a Nuwa-style "memory" and "speech" block — these become persistent memory injected into the system prompt at runtime, simulating what would normally come from imported chat history. Without them, the agent feels generic on first contact.

Return ONLY valid JSON — no markdown, no code fences, no explanation:
{
  "category": { "name": "Category Name", "emoji": "emoji" },
  "agents": [
    {
      "name": "Agent Name",
      "role": "brief role (3-8 words)",
      "description": "keyword-style summary, max 100 characters",
      "prompt": "full agent definition prompt text",
      "memory": {
        "identity": "1-2 sentence first-person self-intro",
        "mentalModels": ["3-5 beliefs in 'believe X → therefore Y → always Z' form"],
        "decisionHeuristics": ["4-6 concrete decision rules"],
        "valuesAntiPatterns": ["3-5 mixed values + things they avoid"],
        "honestBoundaries": ["3-5 things they openly refuse to fake"],
        "coreTensions": ["2-4 genuinely contradictory traits"]
      },
      "speech": {
        "catchphrases": ["3-6 short phrases they actually say"],
        "emoji": [],
        "sentenceStyle": { "avgLength": 30, "punctuation": "moderate", "endsWith": ["."] },
        "conventions": { "selfReference": ["I"], "callsYou": [], "insideJokes": [] },
        "neverDoes": ["3-5 specific surface behaviors they avoid"]
      }
    }
  ]
}

Rules:
- MOST IMPORTANT: each agent must have a strong, immediately recognizable personality — conflict, humor, drama, or cultural familiarity. No bland functionaries.
- Agents can be real-world archetypes (PUA boss, passive-aggressive coworker, gossip cleaner), famous historical figures (Yongzheng, Napoleon), or iconic fictional characters (Sheldon Cooper, Groot) if the theme implies them
- Default to grounded real-world relatable when the description is ambiguous; only go sci-fi/fantasy if explicitly asked
- Avoid generic "professional helper" personalities — every agent must have a memorable edge
- Group under one category with a suitable emoji
- Include EXACTLY ${agentCount.value} agents — no more, no fewer
- Each agent must have a distinct name and role
- Agent names must not duplicate existing names
- Category name must not duplicate existing category names
- The "prompt" field MUST follow the COMPLETE chosen section template above — all sections, full instructions, full detail. Do NOT abbreviate or shorten.
- Use ALL sections defined in the chosen template — do not skip any section
- Do NOT write fixed dialogue lines in trigger rules — write strategy descriptions instead
- memory.mentalModels / decisionHeuristics / etc. items must be one short sentence each, NOT objects or nested structures${langInstruction}`,
      config,
    })

    if (res.success && res.text) {
      let data
      try {
        data = parseProposalJSON(res.text)
      } catch (e) {
        console.error('[AGC] invalid AI response (raw):', res.text)
        try {
          data = await repairProposalJSON(res.text, config, langInstruction)
        } catch {
          try {
            data = await requestCompactProposal({
              desc,
              config,
              langInstruction,
              existingAgentNames,
              existingCategoryNames,
            })
          } catch {
            generatedProposal.value = null
            aiError.value = 'AI returned invalid response. Try again.'
            generatingProposal.value = false
            return
          }
        }
      }

      if (data.category && Array.isArray(data.agents)) {
        const usedNames = new Set(agentsStore.agents.map(a => normalizeName(a.name)))
        const dedupedAgents = []
        const skippedNames = []
        for (let idx = 0; idx < data.agents.length; idx++) {
          const a = data.agents[idx]
          const name = (a.name || `Agent ${idx + 1}`).trim()
          const key = normalizeName(name)
          if (usedNames.has(key)) { skippedNames.push(name); continue }
          usedNames.add(key)
          dedupedAgents.push({
            name,
            role: a.role || 'General Specialist',
            description: a.description || 'Domain-focused AI assistant',
            prompt: isRichPrompt(a.prompt)
              ? a.prompt.trim()
              : buildFallbackPrompt(a, lang),
            // Pass through Nuwa-style assets (may be undefined if AI omitted them).
            // The install path turns these into MemoryStore rows + .speech.json sidecar.
            memory: (a.memory && typeof a.memory === 'object') ? a.memory : null,
            speech: (a.speech && typeof a.speech === 'object') ? a.speech : null,
          })
        }
        generatedProposal.value = {
          category: {
            name: data.category.name || 'Category',
            emoji: data.category.emoji || '📂'
          },
          agents: dedupedAgents
        }
        if (skippedNames.length > 0) {
          aiWarning.value = t('agents.groupCreator.agentsExistRemoved', { names: skippedNames.join(locale.value === 'zh' ? '、' : ', ') })
        }
      } else {
        generatedProposal.value = null
        aiError.value = 'Invalid response format. Try again.'
      }
    } else {
      generatedProposal.value = null
      aiError.value = res.error || t('agents.groupCreator.error', 'Generation failed. Make sure your utility model is configured in Config → AI → Models.')
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }

  generatingProposal.value = false
}

function generateSurpriseProposal() {
  if (generatingProposal.value) return
  aiError.value = ''
  aiWarning.value = ''
  generatedProposal.value = null
  customDescription.value = generateDynamicSurpriseIdea()
  // Trigger background AI pool generation if not yet started
  if (_aiSurprisePool.value.length === 0 && !_aiSurpriseGenerating.value) {
    _generateAiSurprisePool()
  }
}

async function createAgents() {
  creating.value = true

  try {
    let categoryId
    let agentsData
    const existingCategoryNames = new Set(
      agentsStore.categories
        .filter(c => c.type === props.agentType)
        .map(c => normalizeName(c.name))
    )

    // Map of normalizedName → { memory, speech } for built-in templates that
    // ship pre-fabricated Nuwa-style memory. Populated only on the template
    // path so the AI-proposal path stays unchanged.
    let templateMemoryMap = null

    if (activeTab.value === 'templates' && selectedTemplate.value) {
      const tmpl = selectedTemplate.value
      const existingCat = agentsStore.categories.find(c =>
        c.type === props.agentType &&
        normalizeName(c.name) === normalizeName(tmpl.category.name)
      )
      if (existingCat) {
        categoryId = existingCat.id
      } else {
        const catName = uniqueCategoryName(tmpl.category.name, existingCategoryNames)
        categoryId = await agentsStore.addCategory(catName, tmpl.category.emoji, props.agentType)
      }
      agentsData = tmpl.agents.map(a => ({
        name: a.name,
        description: a.description,
        prompt: a.prompt,
        avatar: a.avatar || `a${Math.floor(Math.random() * 36) + 1}`
      }))
      templateMemoryMap = new Map()
      for (const a of tmpl.agents) {
        if (a.memory || a.speech) {
          templateMemoryMap.set(normalizeName(a.name), { memory: a.memory, speech: a.speech })
        }
      }
    } else if (generatedProposal.value) {
      const prop = generatedProposal.value
      const existingCat = agentsStore.categories.find(c =>
        c.type === props.agentType &&
        normalizeName(c.name) === normalizeName(prop.category.name)
      )
      if (existingCat) {
        categoryId = existingCat.id
      } else {
        const catName = uniqueCategoryName(prop.category.name, existingCategoryNames)
        categoryId = await agentsStore.addCategory(catName, prop.category.emoji, props.agentType)
      }
      agentsData = prop.agents.map(a => ({
        name: a.name,
        description: a.description,
        prompt: a.prompt,
        avatar: `a${Math.floor(Math.random() * 36) + 1}`
      }))
      templateMemoryMap = new Map()
      for (const a of prop.agents) {
        if (a.memory || a.speech) {
          templateMemoryMap.set(normalizeName(a.name), { memory: a.memory, speech: a.speech })
        }
      }
    }

    const { providerId: utilityProviderId, modelId: utilityModelId } = resolveDefaultProviderModel()

    const createdIds = []
    let skippedAtCreate = []

    if (categoryId && agentsData) {
      const existingNames = new Set(agentsStore.agents.map(a => normalizeName(a.name)))
      const toCreate = []
      for (const agent of agentsData) {
        const key = normalizeName(agent.name)
        if (existingNames.has(key)) { skippedAtCreate.push(agent.name); continue }
        existingNames.add(key)
        toCreate.push(agent)
      }

      if (toCreate.length > 0) {
        // saveAgent returns the persisted agent — collect them by id rather
        // than relying on positional `slice(beforeCount)` since the store's
        // merged `agents` view groups system + user separately and new entries
        // don't necessarily land at the array tail.
        const newAgents = []
        for (const agent of toCreate) {
          const created = await agentsStore.saveAgent({
            ...agent,
            type: props.agentType,
            providerId: utilityProviderId,
            modelId: utilityModelId,
            voiceId: null,
            requiredToolIds: [],
            requiredSkillIds: [],
            requiredMcpServerIds: [],
            requiredKnowledgeBaseIds: []
          })
          if (created) newAgents.push(created)
        }
        for (const agent of newAgents) {
          await agentsStore.assignToCategory(agent.id, categoryId)
          createdIds.push(agent.id)
        }

        // Built-in templates ship with pre-fabricated memory + speech DNA so
        // the first conversation feels deep instead of starting from scratch.
        // Write those assets now that we have stable agent IDs. Best-effort —
        // a failure here must not abort the install.
        if (templateMemoryMap && templateMemoryMap.size > 0) {
          for (const newAgent of newAgents) {
            const assets = templateMemoryMap.get(normalizeName(newAgent.name))
            if (!assets) continue
            try {
              if (assets.memory) {
                const sections = templateMemoryToSections(assets.memory)
                if (sections) {
                  await window.electronAPI.agentImport.writeNuwaSections({
                    agentId:    newAgent.id,
                    agentName:  newAgent.name,
                    agentType:  props.agentType,
                    sections,
                    evidenceIndex: null,
                  })
                }
              }
              if (assets.speech) {
                const speechDna = templateSpeechToDna(assets.speech, newAgent.name)
                if (speechDna) {
                  await window.electronAPI.agentImport.writeSpeechDna({
                    agentId:   newAgent.id,
                    agentType: props.agentType,
                    speechDna,
                  })
                }
              }
            } catch (err) {
              console.warn('[AgentGroupCreator] failed to write memory/speech for', newAgent.name, err)
            }
          }
        }
      }
    }

    if (skippedAtCreate.length > 0) {
      aiWarning.value = t('agents.groupCreator.agentsExistSkipped', { names: skippedAtCreate.join(locale.value === 'zh' ? '、' : ', ') })
      if (createdIds.length > 0) {
        emit('created', createdIds)
      }
      creating.value = false
      return
    }
    emit('created', createdIds)
    emit('close')
  } catch (err) {
    console.error('Failed to create agents:', err)
  }

  creating.value = false
}
</script>

<style scoped>
.agc-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: agcFadeIn 0.2s ease-out;
}

@keyframes agcFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.agc-modal {
  width: 70vw;
  height: 70vh;
  max-width: 1100px;
  max-height: 900px;
  min-width: 700px;
  min-height: 560px;
  background: #0F0F0F;
  border-radius: 20px;
  border: 1px solid #2A2A2A;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: agcSlideIn 0.2s ease-out;
}

@media (max-width: 900px) {
  .agc-modal {
    width: 92vw;
    height: 92vh;
    min-width: 0;
    min-height: 0;
  }
}

@keyframes agcSlideIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.agc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #2A2A2A;
  flex-shrink: 0;
}

.agc-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.agc-header-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agc-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.agc-meta {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.agc-close-btn {
  width: 2rem;
  height: 2rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.agc-close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
}

.agc-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #2A2A2A;
  flex-shrink: 0;
}

.agc-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-tab:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
}

.agc-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

.agc-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  min-height: 300px;
}

.agc-templates-grid {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.agc-template-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.agc-template-card:hover {
  border-color: #4B5563;
  background: #222222;
}

.agc-template-card.selected {
  border-color: #007AFF;
  background: rgba(0, 122, 255, 0.08);
}

.agc-template-card.highlighted {
  border-color: #4B5563;
  background: rgba(75, 85, 99, 0.12);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.agc-template-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}

.agc-template-info {
  flex: 1;
  min-width: 0;
}

.agc-template-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0 0 0.25rem;
}

.agc-template-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 0.375rem;
}

.agc-template-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.agc-template-cat,
.agc-template-count {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255, 255, 255, 0.4);
}

.agc-template-check {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.agc-custom-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.agc-custom-textarea {
  width: 100%;
  padding: 0.875rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  resize: vertical;
  min-height: 100px;
  transition: border-color 0.15s;
}

.agc-custom-textarea:focus {
  outline: none;
  border-color: #4B5563;
}

.agc-custom-textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.agc-custom-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
}

.agc-count-picker {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.5rem;
  overflow: hidden;
}

.agc-count-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.625rem;
  height: 1.625rem;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
  line-height: 1;
}

.agc-count-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.agc-count-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.agc-count-val {
  min-width: 1.25rem;
  text-align: center;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #fff;
  user-select: none;
  border-left: 1px solid rgba(255, 255, 255, 0.12);
  border-right: 1px solid rgba(255, 255, 255, 0.12);
  padding: 0 0.1rem;
  line-height: 1.625rem;
}

.agc-custom-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.agc-generate-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.agc-generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.1);
}

.agc-generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agc-proposal {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
}

.agc-proposal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.agc-proposal-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
  margin: 0;
}

.agc-proposal-regen {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-proposal-regen:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
}

.agc-proposal-regen:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.agc-proposal-category {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
  width: fit-content;
}

.agc-proposal-cat-emoji {
  font-size: 1rem;
}

.agc-proposal-cat-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
}

.agc-proposal-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.agc-proposal-agent {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: #2A2A2A;
  border-radius: 0.5rem;
  position: relative;
}

.agc-agent-hover-card {
  position: fixed;
  width: 22rem;
  max-height: min(55vh, 30rem);
  overflow: auto;
  padding: 0.625rem;
  border-radius: 0.625rem;
  background: #111111;
  border: 1px solid #2A2A2A;
  box-shadow: 0 12px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.12);
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  z-index: 260;
}

.agc-agent-hover-card::-webkit-scrollbar {
  width: 6px;
}

.agc-agent-hover-card::-webkit-scrollbar-track {
  background: transparent;
}

.agc-agent-hover-card::-webkit-scrollbar-thumb {
  background: #3A3A3A;
  border-radius: 9999px;
}

.agc-agent-hover-card::-webkit-scrollbar-thumb:hover {
  background: #5A5A5A;
}

.agc-hover-row {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.agc-hover-row + .agc-hover-row {
  margin-top: 0.5rem;
}

.agc-hover-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255,255,255,0.45);
}

.agc-hover-value {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #FFFFFF;
  line-height: 1.4;
}

.agc-hover-definition {
  color: rgba(255,255,255,0.85);
}

:deep(.agc-hover-sec) {
  display: block;
  margin: 0.25rem 0 0.125rem;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
}

.agc-proposal-agent-icon {
  font-size: 0.875rem;
}

.agc-proposal-agent-info {
  display: flex;
  flex-direction: column;
}

.agc-proposal-agent-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 500;
  color: #FFFFFF;
}

.agc-proposal-agent-role {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.5);
}

.agc-ai-error {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.5rem;
  color: #EF4444;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
}

.agc-ai-warning {
  margin-top: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 0.5rem;
  color: #F59E0B;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
}

.agc-custom-hint {
  margin-top: 1.25rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
}

/* Match AgentBodyViewer's amber surprise button style */
:deep(.bv-ai-micro) {
  padding: 0.1875rem 0.5rem !important;
  font-size: 0.6875rem !important;
  border-radius: 0.375rem !important;
  gap: 0.25rem !important;
  background: linear-gradient(135deg, #92400E 0%, #B45309 40%, #D97706 100%) !important;
  color: #FFFFFF !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(180,83,9,0.35), 0 1px 3px rgba(180,83,9,0.2) !important;
}

:deep(.bv-ai-micro):hover:not(:disabled) {
  background: linear-gradient(135deg, #78350F 0%, #92400E 40%, #B45309 100%) !important;
  box-shadow: 0 2px 10px rgba(180,83,9,0.45) !important;
}

:deep(.bv-ai-micro):disabled {
  opacity: 0.4 !important;
  box-shadow: none !important;
}

.agc-footer {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #2A2A2A;
  background: #0A0A0A;
  flex-shrink: 0;
}

.agc-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.625rem;
}

.agc-footer-warning {
  padding: 0.4rem 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 0.5rem;
  color: #F59E0B;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  line-height: 1.5;
}

.agc-btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.agc-btn-cancel {
  background: #2A2A2A;
  color: rgba(255, 255, 255, 0.7);
}

.agc-btn-cancel:hover {
  background: #374151;
  color: #FFFFFF;
}

.agc-btn-create {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
}

.agc-btn-create:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.16), 0 2px 4px rgba(0, 0, 0, 0.1);
}

.agc-btn-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agc-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: agcSpin 0.8s linear infinite;
}

@keyframes agcSpin {
  to { transform: rotate(360deg); }
}

.agc-ai-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  color: #9CA3AF;
  font-style: italic;
}

.agc-ai-hint-spinner {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  animation: agcSpin 1s linear infinite;
}
</style>
