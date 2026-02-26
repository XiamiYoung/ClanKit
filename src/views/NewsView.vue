<template>
  <div class="news-page">
    <!-- Embedded Browser Overlay -->
    <div v-if="embeddedUrl" class="embedded-overlay">
      <div class="embedded-header">
        <button class="back-btn" @click="closeEmbedded">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>Back to News</span>
        </button>
        <span class="embedded-url">{{ embeddedUrl }}</span>
      </div>
      <webview class="embedded-webview" :src="embeddedUrl" allowpopups></webview>
    </div>

    <!-- Main Content -->
    <template v-if="!embeddedUrl">
      <!-- Header -->
      <div class="news-header">
        <h1 class="news-title">News Feeds</h1>
        <button class="action-btn" @click="refreshAll" :disabled="isAnyLoading">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      <!-- Feed Grid -->
      <div class="news-grid">
        <div v-for="(card, idx) in newsStore.cards" :key="idx" class="feed-card" :class="`feed-card--${idx}`">
          <!-- Colored accent bar -->
          <div class="feed-card-accent" :class="`accent--${idx}`"></div>

          <div class="feed-card-body">
            <!-- ComboBox + spinner -->
            <div class="feed-selector">
              <ComboBox
                :modelValue="card.selectedFeedId"
                @update:modelValue="onFeedChange(idx, $event)"
                :options="feedOptions"
                placeholder="Select a feed..."
              />
              <div v-if="card.loading" class="feed-spinner" :class="`spinner--${idx}`"></div>
            </div>

            <!-- Feed info bar -->
            <div v-if="card.selectedFeedId && !card.loading && card.articles.length" class="feed-info">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
              </svg>
              <span class="feed-info-name">{{ feedName(card.selectedFeedId) }}</span>
              <span class="feed-info-count" :class="`count--${idx}`">{{ card.articles.length }}</span>
            </div>

            <!-- Error State -->
            <div v-if="!card.loading && card.error" class="feed-error">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>{{ card.error }}</span>
            </div>

            <!-- No feed selected -->
            <div v-else-if="!card.loading && !card.selectedFeedId" class="feed-empty">
              <svg style="width:24px;height:24px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
              </svg>
              <span>Select a feed above</span>
            </div>

            <!-- Empty State -->
            <div v-else-if="!card.loading && card.fetched && !card.articles.length" class="feed-empty">
              <span>No articles found</span>
            </div>

            <!-- Article List -->
            <div v-else-if="!card.loading && card.articles.length" class="feed-articles" @scroll="onCardScroll(idx, $event)">
              <div v-for="(article, i) in visibleArticles(idx)" :key="i" class="article-item" :class="`article--${idx}`" @click="openEmbedded(article.link)">
                <div class="article-number" :class="`num--${idx}`">{{ i + 1 }}</div>
                <div class="article-content">
                  <span class="article-title">{{ article.title }}</span>
                  <span v-if="article.date" class="article-date">{{ formatDate(article.date) }}</span>
                </div>
              </div>
              <div v-if="card.articles.length > visibleCounts[idx]" class="feed-load-more">
                <div class="load-more-dots"><span></span><span></span><span></span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useNewsStore } from '../stores/news'
import { useConfigStore } from '../stores/config'
import ComboBox from '../components/common/ComboBox.vue'

const PAGE_SIZE = 20

const newsStore = useNewsStore()
const configStore = useConfigStore()

const isAnyLoading = computed(() => newsStore.cards.some(c => c.loading))

const visibleCounts = reactive(Array.from({ length: 8 }, () => PAGE_SIZE))

function visibleArticles(idx) {
  return newsStore.cards[idx].articles.slice(0, visibleCounts[idx])
}

function onCardScroll(idx, e) {
  const el = e.target
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    const total = newsStore.cards[idx].articles.length
    if (visibleCounts[idx] < total) {
      visibleCounts[idx] = Math.min(visibleCounts[idx] + PAGE_SIZE, total)
    }
  }
}

const feedOptions = computed(() =>
  newsStore.allFeeds.map(f => ({ id: f.id, name: f.name, detail: f.url }))
)

function feedName(id) {
  const f = newsStore.allFeeds.find(f => f.id === id)
  return f ? f.name : id
}

const embeddedUrl = ref(null)

function refreshAll() {
  newsStore.fetchAllCards()
}

function onFeedChange(idx, feedId) {
  visibleCounts[idx] = PAGE_SIZE
  newsStore.setCardFeed(idx, feedId)
  if (feedId) {
    newsStore.fetchCard(idx)
  }
}

function openEmbedded(url) {
  if (url) embeddedUrl.value = url
}

function closeEmbedded() {
  embeddedUrl.value = null
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const now = new Date()
    const diff = now - d
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

onMounted(async () => {
  if (!configStore.config.newsFeeds?.length) {
    await configStore.loadConfig()
  }
  if (!newsStore.hasFetchedOnce) {
    newsStore.fetchAllCards()
  }
})
</script>

<style scoped>
/* ── Accent color palette ─────────────────────────────────────────────── */
/* 8 distinct accent colors for visual variety */
.accent--0 { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.accent--1 { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #60A5FA 100%); }
.accent--2 { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #A78BFA 100%); }
.accent--3 { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #34D399 100%); }
.accent--4 { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #FBBF24 100%); }
.accent--5 { background: linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #F87171 100%); }
.accent--6 { background: linear-gradient(135deg, #164E63 0%, #0891B2 60%, #22D3EE 100%); }
.accent--7 { background: linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #FACC15 100%); }

/* Spinner accent colors */
.spinner--0 { border-top-color: #1A1A1A; }
.spinner--1 { border-top-color: #2563EB; }
.spinner--2 { border-top-color: #7C3AED; }
.spinner--3 { border-top-color: #059669; }
.spinner--4 { border-top-color: #D97706; }
.spinner--5 { border-top-color: #DC2626; }
.spinner--6 { border-top-color: #0891B2; }
.spinner--7 { border-top-color: #CA8A04; }

/* Count badge accent */
.count--0 { background: #1A1A1A; }
.count--1 { background: #2563EB; }
.count--2 { background: #7C3AED; }
.count--3 { background: #059669; }
.count--4 { background: #D97706; }
.count--5 { background: #DC2626; }
.count--6 { background: #0891B2; }
.count--7 { background: #CA8A04; }

/* Number accent */
.num--0 { color: #1A1A1A; background: rgba(26, 26, 26, 0.08); }
.num--1 { color: #2563EB; background: rgba(37, 99, 235, 0.08); }
.num--2 { color: #7C3AED; background: rgba(124, 58, 237, 0.08); }
.num--3 { color: #059669; background: rgba(5, 150, 105, 0.08); }
.num--4 { color: #D97706; background: rgba(217, 119, 6, 0.08); }
.num--5 { color: #DC2626; background: rgba(220, 38, 38, 0.08); }
.num--6 { color: #0891B2; background: rgba(8, 145, 178, 0.08); }
.num--7 { color: #CA8A04; background: rgba(202, 138, 4, 0.08); }

/* Article hover per-card accent */
.article--0:hover { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.article--1:hover { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%); }
.article--2:hover { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%); }
.article--3:hover { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%); }
.article--4:hover { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%); }
.article--5:hover { background: linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%); }
.article--6:hover { background: linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%); }
.article--7:hover { background: linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%); }

/* ── Page ─────────────────────────────────────────────────────────────── */
.news-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-main);
  padding: 24px 28px;
  gap: 20px;
}

.news-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.news-title {
  font-family: 'Inter', 'Figtree', system-ui, sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin: 0;
}

/* ── Shared button styles ─────────────────────────────────────────── */
.action-btn,
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm, 8px);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.action-btn:hover,
.back-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.back-btn {
  padding: 6px 14px 6px 10px;
}

/* ── Grid ─────────────────────────────────────────────────────────────── */
.news-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 14px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 1400px) {
  .news-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 1fr 1fr;
  }
}

@media (max-width: 1000px) {
  .news-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(4, 1fr);
  }
}

@media (max-width: 768px) {
  .news-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .feed-card {
    max-height: 400px;
  }
}

/* ── Feed Card ────────────────────────────────────────────────────────── */
.feed-card {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  overflow: hidden;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  transition: box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  min-height: 0;
  max-height: 100%;
}
.feed-card:hover {
  border-color: #D1D1D6;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
}

.feed-card-accent {
  height: 4px;
  width: 100%;
  flex-shrink: 0;
}

.feed-card-body {
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ── Feed Selector ────────────────────────────────────────────────────── */
.feed-selector {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.feed-selector > :first-child {
  flex: 1;
  min-width: 0;
}

/* ── Feed Info Bar ────────────────────────────────────────────────────── */
.feed-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  margin-bottom: 4px;
  border-bottom: 1px solid #F0F0F0;
  flex-shrink: 0;
  color: var(--text-muted);
}

.feed-info-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-secondary);
  flex: 1;
}

.feed-info-count {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #FFFFFF;
  padding: 1px 7px;
  border-radius: 9999px;
  min-width: 20px;
  text-align: center;
}

/* ── Inline Spinner ──────────────────────────────────────────────────── */
.feed-spinner {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 2.5px solid #E5E5EA;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Error / Empty ────────────────────────────────────────────────────── */
.feed-error,
.feed-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
}

.feed-error {
  color: #EF4444;
}

.feed-empty {
  color: var(--text-muted);
}

/* ── Article List ─────────────────────────────────────────────────────── */
.feed-articles {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
}

.feed-articles::-webkit-scrollbar {
  width: 6px;
}
.feed-articles::-webkit-scrollbar-track {
  background: transparent;
}
.feed-articles::-webkit-scrollbar-thumb {
  background: #D1D1D6;
  border-radius: 9999px;
}
.feed-articles::-webkit-scrollbar-thumb:hover {
  background: #A1A1AA;
}

.article-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.article-number {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
  transition: background 0.15s ease, color 0.15s ease;
}

.article-item:hover .article-number {
  background: rgba(255, 255, 255, 0.2) !important;
  color: #FFFFFF !important;
}

.article-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.article-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: var(--text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.article-item:hover .article-title {
  color: #FFFFFF;
}

.article-date {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: var(--text-muted);
}

.article-item:hover .article-date {
  color: rgba(255, 255, 255, 0.5);
}

/* ── Load More Indicator ──────────────────────────────────────────────── */
.feed-load-more {
  display: flex;
  justify-content: center;
  padding: 12px 0 6px;
}

.load-more-dots {
  display: flex;
  gap: 4px;
}

.load-more-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #D1D1D6;
  animation: dotPulse 1s ease-in-out infinite;
}

.load-more-dots span:nth-child(2) { animation-delay: 0.15s; }
.load-more-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}

/* ── Embedded Browser ─────────────────────────────────────────────────── */
.embedded-overlay {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 0;
}

.embedded-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
  flex-shrink: 0;
}

.embedded-url {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embedded-webview {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px);
  background: #FFFFFF;
}

@media (prefers-reduced-motion: reduce) {
  .feed-spinner { animation: none; }
  .feed-card { transition: none; }
  .article-item, .article-number, .action-btn, .back-btn { transition: none; }
  .load-more-dots span { animation: none; }
}
</style>
