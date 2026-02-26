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

  /** Update a card's feed selection and persist */
  function setCardFeed(idx, feedId) {
    const card = cards.value[idx]
    if (!card) return
    card.selectedFeedId = feedId
    card.articles = []
    card.error = null
    card.fetched = false
    saveSelections()
  }

  /** Fetch a single card by index */
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

  /** Fetch all 6 cards that have a selected feed */
  async function fetchAllCards() {
    loadSelections()
    const promises = cards.value.map((card, idx) => {
      if (card.selectedFeedId) return fetchCard(idx)
      return Promise.resolve()
    })
    await Promise.allSettled(promises)
    hasFetchedOnce.value = true
  }

  return { allFeeds, cards, hasFetchedOnce, fetchCard, fetchAllCards, setCardFeed, loadSelections }
})
