import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useConfigStore } from './config'

const NUM_CARDS = 8

export const useNewsStore = defineStore('news', () => {
  const configStore = useConfigStore()

  // All available feeds from config
  const allFeeds = computed(() => configStore.config.newsFeeds || [])

  // 6 card slots
  const cards = ref(
    Array.from({ length: NUM_CARDS }, () => ({
      selectedFeedId: '',
      articles: [],
      loading: false,
      error: null,
      fetched: false,
    }))
  )

  const hasFetchedOnce = ref(false)
  const isRotated = ref(false)

  // ── Top Stories (AI / breaking news) ────────────────────────────────────
  const topArticles = ref([])
  const topLoading = ref(false)

  // Default keyword strings (fallback when config is empty)
  const DEFAULT_HIGH = 'artificial intelligence, ai, ai-powered, llm, gpt, claude, gemini, machine learning, deep learning, neural net, chatbot, generative ai, large language model, openai, anthropic, deepmind, foundation model, computer vision, natural language'
  const DEFAULT_MED = 'robot, automation, algorithm, model, agent, chip, gpu, inference, training, transformer, diffusion, autonomous, self-driving, copilot, coding, benchmark, reasoning'
  const DEFAULT_BRK = 'breaking, exclusive, announces, launches, reveals, introduces, unveils, raises, acquires, partnership'
  const DEFAULT_WINDOW = 24

  function parseKeywords(str, fallback) {
    const val = (str && str.trim()) ? str : fallback
    return val.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  }

  function scoreArticle(article) {
    const criteria = configStore.config.topStoriesCriteria || {}
    const high = parseKeywords(criteria.highKeywords, DEFAULT_HIGH)
    const med = parseKeywords(criteria.medKeywords, DEFAULT_MED)
    const brk = parseKeywords(criteria.breakingKeywords, DEFAULT_BRK)
    const windowHours = criteria.timeWindowHours || DEFAULT_WINDOW

    const text = ` ${article.title} ${article.summary || ''} `.toLowerCase()
    let score = 0

    // Enforce time window — articles outside the window score 0
    if (article.date) {
      try {
        let h = (Date.now() - new Date(article.date).getTime()) / 3600000
        // Negative age means timezone parsing ambiguity; treat as very recent
        if (h < 0) h = 0
        if (h > windowHours) return 0
        // Time bonus tiers based on configured window
        const q = windowHours / 4
        if (h < q) score += 8
        else if (h < q * 2) score += 6
        else if (h < q * 3) score += 4
        else score += 2
      } catch {}
    }

    for (const kw of high) if (text.includes(kw)) score += 10
    for (const kw of med) if (text.includes(kw)) score += 5
    for (const kw of brk) if (text.includes(kw)) score += 3

    return score
  }

  function computeTopArticles() {
    topLoading.value = true
    const all = []
    for (const card of cards.value) {
      if (!card.selectedFeedId || !card.articles.length) continue
      const feed = allFeeds.value.find(f => f.id === card.selectedFeedId)
      const source = feed ? feed.name : card.selectedFeedId
      for (const a of card.articles) all.push({ ...a, source })
    }
    const scored = all
      .map(a => ({ ...a, _score: scoreArticle(a) }))
      .sort((a, b) => b._score - a._score)

    // Enforce source diversity: max 1 per source in the first pass,
    // then allow a second pick per source if we still need to fill 5.
    const seen = new Set()
    const sourceCounts = {}
    const MAX_PER_SOURCE = 1
    const result = []

    // Pass 1: best article from each source
    for (const a of scored) {
      if (a._score <= 0) continue
      const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
      if (seen.has(key)) continue
      const sc = sourceCounts[a.source] || 0
      if (sc >= MAX_PER_SOURCE) continue
      seen.add(key)
      sourceCounts[a.source] = sc + 1
      result.push(a)
      if (result.length >= 5) break
    }

    // Pass 2: if fewer than 5, allow a second article per source
    if (result.length < 5) {
      for (const a of scored) {
        if (a._score <= 0) continue
        const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50)
        if (seen.has(key)) continue
        const sc = sourceCounts[a.source] || 0
        if (sc >= 2) continue
        seen.add(key)
        sourceCounts[a.source] = sc + 1
        result.push(a)
        if (result.length >= 5) break
      }
    }

    topArticles.value = result
    topLoading.value = false
  }

  /** Load saved card selections from config, fallback to first 6 feeds */
  function loadSelections() {
    const saved = configStore.config.feedSelection
    const feeds = allFeeds.value
    for (let i = 0; i < NUM_CARDS; i++) {
      if (Array.isArray(saved) && saved[i]) {
        cards.value[i].selectedFeedId = saved[i]
      } else if (!cards.value[i].selectedFeedId && feeds[i]) {
        cards.value[i].selectedFeedId = feeds[i].id
      }
    }
  }

  /** Persist current card selections to config.json */
  function saveSelections() {
    const sel = cards.value.map(c => c.selectedFeedId || '')
    configStore.saveConfig({ feedSelection: sel })
  }

  /** Update a card's feed selection and persist (skips persist when rotated) */
  function setCardFeed(idx, feedId) {
    const card = cards.value[idx]
    if (!card) return
    card.selectedFeedId = feedId
    card.articles = []
    card.error = null
    card.fetched = false
    if (!isRotated.value) saveSelections()
  }

  /** Fetch a single card by index (does NOT recompute top stories) */
  async function fetchCard(idx) {
    const card = cards.value[idx]
    if (!card) return
    const feedId = card.selectedFeedId
    if (!feedId) return

    const feedConfig = allFeeds.value.find(f => f.id === feedId)
    if (!feedConfig) {
      card.error = 'Feed not found in config'
      return
    }

    if (!window.electronAPI?.news?.fetchFeeds) {
      card.error = 'News fetching requires Electron'
      return
    }

    card.loading = true
    card.error = null

    try {
      const plain = { id: feedConfig.id, name: feedConfig.name, url: feedConfig.url }
      const result = await window.electronAPI.news.fetchFeeds([plain])
      if (result.success && result.feeds.length > 0) {
        const remote = result.feeds[0]
        card.articles = remote.articles || []
        card.error = remote.error || null
      } else {
        card.error = result.error || 'Failed to fetch feed'
      }
    } catch (err) {
      card.error = err.message || 'Unexpected error'
    } finally {
      card.loading = false
      card.fetched = true
    }
  }

  /** Fetch a single card then recompute top stories (for individual card changes) */
  async function fetchCardAndRecompute(idx) {
    await fetchCard(idx)
    computeTopArticles()
  }

  // Guard against concurrent batch fetches; newer call wins
  let _fetchGeneration = 0

  /** Fetch all cards that have a selected feed, then recompute top stories */
  async function fetchAllCards() {
    const gen = ++_fetchGeneration
    topLoading.value = true
    topArticles.value = []
    if (!isRotated.value) loadSelections()
    const promises = cards.value.map((card, idx) => {
      if (card.selectedFeedId) return fetchCard(idx)
      return Promise.resolve()
    })
    await Promise.allSettled(promises)
    // Only apply results if this is still the latest fetch
    if (gen !== _fetchGeneration) return
    hasFetchedOnce.value = true
    computeTopArticles()
  }

  // ── Rotate / Default ───────────────────────────────────────────────────

  /** Fisher-Yates shuffle (in-place) */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

  /** Swap all cards to feeds not currently displayed (ephemeral) */
  function rotateFeeds() {
    const currentIds = new Set(cards.value.map(c => c.selectedFeedId).filter(Boolean))
    const pool = shuffle(allFeeds.value.filter(f => !currentIds.has(f.id)).map(f => f.id))

    // If pool is too small, include current feeds as fallback (shuffled)
    if (pool.length < NUM_CARDS) {
      const extras = shuffle(allFeeds.value.filter(f => currentIds.has(f.id)).map(f => f.id))
      pool.push(...extras)
    }

    for (let i = 0; i < NUM_CARDS; i++) {
      const card = cards.value[i]
      card.selectedFeedId = pool[i] || ''
      card.articles = []
      card.error = null
      card.fetched = false
    }

    isRotated.value = true
    topLoading.value = true
    topArticles.value = []
    fetchAllCards()
  }

  /** Restore persisted feed selections from config.json */
  function restoreDefaults() {
    for (const card of cards.value) {
      card.articles = []
      card.error = null
      card.fetched = false
    }
    isRotated.value = false
    topLoading.value = true
    topArticles.value = []
    loadSelections()
    fetchAllCards()
  }

  // ── Auto-refresh interval (1 hour) ─────────────────────────────────────
  let _autoRefreshTimer = null
  const AUTO_REFRESH_MS = 60 * 60 * 1000 // 1 hour

  function startAutoRefresh() {
    if (_autoRefreshTimer) return
    _autoRefreshTimer = setInterval(() => {
      fetchAllCards()
    }, AUTO_REFRESH_MS)
  }

  return {
    allFeeds, cards, hasFetchedOnce, isRotated,
    topArticles, topLoading,
    fetchCard: fetchCardAndRecompute, fetchAllCards,
    setCardFeed, loadSelections, startAutoRefresh,
    rotateFeeds, restoreDefaults,
    recomputeTop: computeTopArticles,
  }
})
