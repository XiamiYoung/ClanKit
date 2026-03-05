<template>
  <div class="news-page">
    <!-- Embedded Browser Overlay -->
    <div v-if="embeddedUrl" class="embedded-overlay">
      <!-- Header: back button + page title -->
      <div class="embedded-header">
        <button class="back-btn" @click="closeEmbedded">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>Back</span>
        </button>
        <span v-if="wvPageTitle" class="embedded-page-title">{{ wvPageTitle }}</span>
      </div>

      <!-- Browser toolbar -->
      <div class="embedded-toolbar">
        <!-- Nav: Back / Forward -->
        <button class="toolbar-btn" @click="wvGoBack" :disabled="!wvCanGoBack" title="Back">
          <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button class="toolbar-btn" @click="wvGoForward" :disabled="!wvCanGoForward" title="Forward">
          <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <!-- Reload / Stop -->
        <button v-if="wvIsLoading" class="toolbar-btn" @click="wvStop" title="Stop">
          <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button v-else class="toolbar-btn" @click="wvReload" title="Reload">
          <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>

        <!-- URL Bar -->
        <div class="toolbar-url-bar">
          <svg class="toolbar-url-icon" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            class="toolbar-url-input"
            :value="wvCurrentUrl"
            @keydown.enter="wvNavigate($event.target.value)"
            spellcheck="false"
          />
          <div v-if="wvIsLoading" class="toolbar-url-loader"></div>
        </div>
      </div>

      <webview
        ref="webviewRef"
        class="embedded-webview"
        :src="embeddedUrl"
        allowpopups
      ></webview>
    </div>

    <!-- Main Content -->
    <template v-if="!embeddedUrl">
      <!-- Header -->
      <div class="news-header">
        <h1 class="news-title">News Feeds</h1>
        <div class="news-header-actions">
          <!-- Rotate -->
          <button class="action-btn" @click="rotateAll" :disabled="isRefreshing">
            <svg v-if="!isRotating" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8"/>
              <line x1="4" y1="20" x2="21" y2="3"/>
              <polyline points="21 16 21 21 16 21"/>
              <line x1="15" y1="15" x2="21" y2="21"/>
              <line x1="4" y1="4" x2="9" y2="9"/>
            </svg>
            <div v-else class="btn-spinner"></div>
            <span>{{ isRotating ? 'Shuffling...' : 'Rotate' }}</span>
          </button>
          <!-- Default (only when rotated) -->
          <button v-if="newsStore.isRotated" class="action-btn" @click="restoreDefaults" :disabled="isRefreshing">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <polyline points="3 3 3 8 8 8"/>
            </svg>
            <span>Default</span>
          </button>
          <!-- Refresh -->
          <button class="action-btn" @click="refreshAll" :disabled="isRefreshing">
            <svg v-if="!isRefreshing" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            <div v-else class="btn-spinner"></div>
            <span>{{ isRefreshing ? 'Loading...' : 'Refresh' }}</span>
          </button>
          <!-- Configure Feeds -->
          <button class="action-btn" @click="openFeedConfig">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
            </svg>
            <span>Feeds</span>
          </button>
        </div>
      </div>

      <!-- Configure Feeds Modal -->
      <Teleport to="body">
        <div v-if="showFeedConfig" class="add-feed-backdrop">
          <div class="add-feed-modal" @keydown.escape="closeFeedConfig">
            <div class="add-feed-header">
              <div class="add-feed-header-icon">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>
                </svg>
              </div>
              <h2 class="add-feed-title">Configure Feeds</h2>
              <span class="add-feed-count">{{ feedRows.length }} feed{{ feedRows.length !== 1 ? 's' : '' }}</span>
              <button class="add-feed-close" @click="closeFeedConfig">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="add-feed-body">
              <div class="add-feed-rows-header">
                <span class="add-feed-col-label" style="flex:1;">Name</span>
                <span class="add-feed-col-label" style="flex:1.5;">RSS URL</span>
                <span style="width:28px;"></span>
              </div>
              <div class="add-feed-rows">
                <div v-for="(row, i) in feedRows" :key="row._key" class="add-feed-row">
                  <input
                    v-model="row.name"
                    class="add-feed-input"
                    placeholder="e.g. TechCrunch"
                    style="flex:1;"
                  />
                  <input
                    v-model="row.url"
                    class="add-feed-input add-feed-input--mono"
                    placeholder="https://feeds.example.com/rss"
                    style="flex:1.5;"
                  />
                  <button
                    class="add-feed-row-remove"
                    @click="removeFeedRow(i)"
                    title="Remove feed"
                  >
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              <button class="add-feed-row-add" @click="addFeedRow">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add new feed
              </button>
              <p v-if="feedConfigError" class="add-feed-error">{{ feedConfigError }}</p>
              <div v-if="feedConfigSuccess" class="add-feed-success">{{ feedConfigSuccess }}</div>
            </div>
            <div class="add-feed-footer">
              <button class="add-feed-cancel" @click="closeFeedConfig">Cancel</button>
              <button class="add-feed-submit" @click="saveFeedConfig">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Save
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Top Stories Criteria Modal -->
      <Teleport to="body">
        <div v-if="showTopCriteria" class="top-criteria-backdrop">
          <div class="top-criteria-modal" @keydown.escape="showTopCriteria = false">
            <div class="top-criteria-header">
              <div class="top-criteria-header-icon">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
              </div>
              <h2 class="top-criteria-title">Top Stories Criteria</h2>
              <button class="top-criteria-close" @click="showTopCriteria = false">
                <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <div class="top-criteria-body">
              <div class="top-criteria-field">
                <label class="top-criteria-label">Priority Topics</label>
                <textarea
                  v-model="criteriaForm.highKeywords"
                  class="top-criteria-textarea"
                  placeholder="artificial intelligence, ai, machine learning..."
                  rows="3"
                ></textarea>
                <span class="top-criteria-hint">Comma-separated keywords (highest weight)</span>
              </div>
              <div class="top-criteria-field">
                <label class="top-criteria-label">Secondary Topics</label>
                <textarea
                  v-model="criteriaForm.medKeywords"
                  class="top-criteria-textarea"
                  placeholder="robot, automation, algorithm..."
                  rows="3"
                ></textarea>
                <span class="top-criteria-hint">Comma-separated keywords (medium weight)</span>
              </div>
              <div class="top-criteria-field">
                <label class="top-criteria-label">Breaking Signals</label>
                <textarea
                  v-model="criteriaForm.breakingKeywords"
                  class="top-criteria-textarea"
                  placeholder="breaking, exclusive, announces..."
                  rows="2"
                ></textarea>
                <span class="top-criteria-hint">Comma-separated keywords (breaking news boost)</span>
              </div>
              <!-- AI Enhance Button -->
              <button
                class="top-criteria-enhance"
                @click="enhanceCriteria"
                :disabled="isEnhancing"
              >
                <div v-if="isEnhancing" class="btn-spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;"></div>
                <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                  <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
                </svg>
                <span>{{ isEnhancing ? 'Enhancing...' : 'AI Enhance' }}</span>
              </button>
              <p v-if="enhanceError" class="top-criteria-error">{{ enhanceError }}</p>
              <div class="top-criteria-field">
                <label class="top-criteria-label">Time Window</label>
                <div class="top-criteria-time-row">
                  <input
                    v-model.number="criteriaForm.timeWindowHours"
                    type="number"
                    class="top-criteria-time-input"
                    min="1"
                    max="168"
                  />
                  <span class="top-criteria-time-suffix">hours</span>
                </div>
                <span class="top-criteria-hint">Articles older than this are excluded from Top Stories</span>
              </div>
            </div>
            <div class="top-criteria-footer">
              <button class="top-criteria-cancel" @click="showTopCriteria = false">Cancel</button>
              <button class="top-criteria-save" @click="saveTopCriteria">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Save
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Scrollable content: top stories + feed grid -->
      <div class="news-scroll">

      <!-- Top Stories -->
      <div v-if="newsStore.topArticles.length || newsStore.topLoading || newsStore.hasFetchedOnce" class="top-news-section">
        <div class="top-news-label">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Top Stories
          <div v-if="newsStore.topLoading" class="top-news-spinner"></div>
          <button class="top-criteria-btn" @click="openTopCriteria" title="Top Stories Settings">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div v-if="newsStore.topArticles.length" class="top-news-row">
          <div
            v-for="(article, i) in newsStore.topArticles"
            :key="i"
            class="top-news-card"
            :class="`top-news--${i}`"
            @click="openEmbedded(article.link)"
          >
            <div class="top-news-rank">{{ i + 1 }}</div>
            <div class="top-news-body">
              <span class="top-news-title">{{ article.title }}</span>
              <div class="top-news-meta">
                <span class="top-news-source">{{ article.source }}</span>
                <span v-if="article.date" class="top-news-date">{{ formatDate(article.date) }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="top-news-loading">
          <div class="top-news-loading-spinner"></div>
        </div>
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

      </div><!-- end .news-scroll -->
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useNewsStore } from '../stores/news'
import { useConfigStore } from '../stores/config'
import ComboBox from '../components/common/ComboBox.vue'

const PAGE_SIZE = 20

const newsStore = useNewsStore()
const configStore = useConfigStore()

const isAnyLoading = computed(() => newsStore.cards.some(c => c.loading))

const visibleCounts = reactive(Array.from({ length: 8 }, () => PAGE_SIZE))

// ── Webview browser controls ────────────────────────────────────────────
const webviewRef = ref(null)
const wvCanGoBack = ref(false)
const wvCanGoForward = ref(false)
const wvIsLoading = ref(false)
const wvCurrentUrl = ref('')
const wvPageTitle = ref('')

let wvCleanupFns = []

function attachWebviewListeners() {
  cleanupWebviewListeners()
  const wv = webviewRef.value
  if (!wv) return

  const onDidNavigate = (e) => {
    wvCurrentUrl.value = e.url
    wvCanGoBack.value = wv.canGoBack()
    wvCanGoForward.value = wv.canGoForward()
  }
  const onDidNavigateInPage = (e) => {
    if (e.isMainFrame) {
      wvCurrentUrl.value = e.url
      wvCanGoBack.value = wv.canGoBack()
      wvCanGoForward.value = wv.canGoForward()
    }
  }
  const onStartLoading = () => { wvIsLoading.value = true }
  const onStopLoading = () => {
    wvIsLoading.value = false
    wvCanGoBack.value = wv.canGoBack()
    wvCanGoForward.value = wv.canGoForward()
  }
  const onTitleUpdated = (e) => { wvPageTitle.value = e.title || '' }

  wv.addEventListener('did-navigate', onDidNavigate)
  wv.addEventListener('did-navigate-in-page', onDidNavigateInPage)
  wv.addEventListener('did-start-loading', onStartLoading)
  wv.addEventListener('did-stop-loading', onStopLoading)
  wv.addEventListener('page-title-updated', onTitleUpdated)

  wvCleanupFns = [
    () => wv.removeEventListener('did-navigate', onDidNavigate),
    () => wv.removeEventListener('did-navigate-in-page', onDidNavigateInPage),
    () => wv.removeEventListener('did-start-loading', onStartLoading),
    () => wv.removeEventListener('did-stop-loading', onStopLoading),
    () => wv.removeEventListener('page-title-updated', onTitleUpdated),
  ]
}

function cleanupWebviewListeners() {
  wvCleanupFns.forEach(fn => fn())
  wvCleanupFns = []
}

function wvGoBack() { webviewRef.value?.goBack() }
function wvGoForward() { webviewRef.value?.goForward() }
function wvReload() { webviewRef.value?.reload() }
function wvStop() { webviewRef.value?.stop() }

function wvNavigate(url) {
  if (!url) return
  let target = url.trim()
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target
  const wv = webviewRef.value
  if (wv) wv.loadURL(target)
}

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
const isRefreshing = ref(false)
const isRotating = ref(false)

function refreshAll() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  newsStore.fetchAllCards()          // fire-and-forget
  setTimeout(() => {
    isRefreshing.value = false       // re-enable after 2s regardless
  }, 2000)
}

function rotateAll() {
  if (isRefreshing.value || isRotating.value) return
  isRotating.value = true
  newsStore.rotateFeeds()            // fire-and-forget
  setTimeout(() => {
    isRotating.value = false
  }, 2000)
}

function restoreDefaults() {
  if (isRefreshing.value) return
  newsStore.restoreDefaults()
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

// ── Configure Feeds modal ────────────────────────────────────────────────
const showFeedConfig = ref(false)
const feedRows = ref([])
const feedConfigError = ref('')
const feedConfigSuccess = ref('')
let _feedRowKey = 0    // monotonic key for v-for stability

function openFeedConfig() {
  const existing = configStore.config.newsFeeds || []
  feedRows.value = existing.map(f => ({
    _key: _feedRowKey++,
    id: f.id,
    name: f.name,
    url: f.url,
  }))
  // Start with at least one empty row if no feeds exist
  if (!feedRows.value.length) {
    feedRows.value.push({ _key: _feedRowKey++, id: null, name: '', url: '' })
  }
  feedConfigError.value = ''
  feedConfigSuccess.value = ''
  showFeedConfig.value = true
}

function addFeedRow() {
  feedRows.value.push({ _key: _feedRowKey++, id: null, name: '', url: '' })
}

function removeFeedRow(i) {
  feedRows.value.splice(i, 1)
}

function closeFeedConfig() {
  showFeedConfig.value = false
  feedRows.value = []
  feedConfigError.value = ''
  feedConfigSuccess.value = ''
}

function saveFeedConfig() {
  feedConfigError.value = ''
  feedConfigSuccess.value = ''

  // Filter out fully empty rows
  const rows = feedRows.value.filter(r => r.name.trim() || r.url.trim())

  // Validate each non-empty row
  for (let i = 0; i < rows.length; i++) {
    const name = rows[i].name.trim()
    const url = rows[i].url.trim()
    if (!name || !url) {
      feedConfigError.value = `Row ${i + 1}: Both name and URL are required`
      return
    }
    try {
      new URL(url)
    } catch {
      feedConfigError.value = `Row ${i + 1}: "${url}" is not a valid URL`
      return
    }
    // Check for duplicates within the rows
    for (let j = 0; j < i; j++) {
      if (rows[j].url.trim() === url) {
        feedConfigError.value = `Row ${i + 1}: Duplicate URL`
        return
      }
    }
  }

  // Build the new feed list, preserving IDs for existing feeds
  const newFeeds = rows.map(r => ({
    id: r.id || uuidv4(),
    name: r.name.trim(),
    url: r.url.trim(),
  }))

  // Determine which feed IDs were removed
  const oldFeedIds = new Set((configStore.config.newsFeeds || []).map(f => f.id))
  const newFeedIds = new Set(newFeeds.map(f => f.id))
  const removedIds = new Set([...oldFeedIds].filter(id => !newFeedIds.has(id)))

  // Unselect any card that references a removed feed
  if (removedIds.size > 0) {
    newsStore.cards.forEach((card, idx) => {
      if (card.selectedFeedId && removedIds.has(card.selectedFeedId)) {
        newsStore.setCardFeed(idx, '')
      }
    })
  }

  // Persist
  configStore.saveConfig({ newsFeeds: newFeeds })

  feedConfigSuccess.value = 'Feeds saved'
  setTimeout(() => closeFeedConfig(), 1000)
}

// ── Top Stories Criteria modal ──────────────────────────────────────────
const showTopCriteria = ref(false)
const criteriaForm = ref({
  highKeywords: '',
  medKeywords: '',
  breakingKeywords: '',
  timeWindowHours: 24,
})
const isEnhancing = ref(false)
const enhanceError = ref('')

function openTopCriteria() {
  const c = configStore.config.topStoriesCriteria || {}
  criteriaForm.value = {
    highKeywords: c.highKeywords || '',
    medKeywords: c.medKeywords || '',
    breakingKeywords: c.breakingKeywords || '',
    timeWindowHours: c.timeWindowHours || 24,
  }
  enhanceError.value = ''
  isEnhancing.value = false
  showTopCriteria.value = true
}

function saveTopCriteria() {
  configStore.saveConfig({
    topStoriesCriteria: { ...criteriaForm.value }
  })
  showTopCriteria.value = false
  newsStore.recomputeTop()
}

async function enhanceCriteria() {
  isEnhancing.value = true
  enhanceError.value = ''

  const prompt = `You are a news curation assistant. Given these keyword categories for filtering news articles, enhance and expand them with additional relevant terms. Keep them comma-separated. Return ONLY a valid JSON object with the enhanced keywords in the exact same 3-category format, no other text:

Current keywords:
- Priority Topics: ${criteriaForm.value.highKeywords}
- Secondary Topics: ${criteriaForm.value.medKeywords}
- Breaking Signals: ${criteriaForm.value.breakingKeywords}

Return format: {"highKeywords": "...", "medKeywords": "...", "breakingKeywords": "..."}`

  try {
    const cfg = configStore.config
    // Deep-clone to strip Vue reactive proxies before IPC serialization
    const config = JSON.parse(JSON.stringify({
      apiKey: cfg.anthropic?.apiKey || '',
      baseURL: cfg.anthropic?.baseURL || 'https://api.anthropic.com',
      anthropic: cfg.anthropic,
    }))
    const result = await window.electronAPI.enhancePrompt({ prompt, config })
    if (!result.success) {
      enhanceError.value = result.error || 'Failed to enhance keywords'
      return
    }
    // Parse JSON from response (handle markdown code blocks)
    let text = result.text.trim()
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) text = jsonMatch[1].trim()
    const parsed = JSON.parse(text)
    if (parsed.highKeywords) criteriaForm.value.highKeywords = parsed.highKeywords
    if (parsed.medKeywords) criteriaForm.value.medKeywords = parsed.medKeywords
    if (parsed.breakingKeywords) criteriaForm.value.breakingKeywords = parsed.breakingKeywords
  } catch (err) {
    enhanceError.value = err.message || 'Failed to parse AI response'
  } finally {
    isEnhancing.value = false
  }
}

// Attach listeners when webview appears, clean up when it disappears
watch(embeddedUrl, async (newUrl) => {
  if (newUrl) {
    wvCurrentUrl.value = newUrl
    wvPageTitle.value = ''
    wvCanGoBack.value = false
    wvCanGoForward.value = false
    wvIsLoading.value = true
    await nextTick()
    attachWebviewListeners()
  } else {
    cleanupWebviewListeners()
  }
})

onBeforeUnmount(() => cleanupWebviewListeners())

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const now = new Date()
    const diff = now - d
    // If diff is negative the parsed date is in the future (timezone ambiguity);
    // treat as "just now" when within 24h, otherwise show absolute date.
    if (diff < 0) {
      return Math.abs(diff) < 86400000 ? 'just now' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
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
  newsStore.startAutoRefresh()
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
  padding: 24px 28px 0;
  gap: 20px;
}

.news-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 24px;
  scrollbar-width: thin;
}

.news-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.news-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.back-btn {
  padding: 4px 10px 4px 7px;
  font-size: var(--fs-caption);
  gap: 4px;
}

/* ── Top Stories ──────────────────────────────────────────────────────── */
.top-news-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light, #F0F0F0);
  margin-bottom: 4px;
}

.top-news-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.top-criteria-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  margin-left: 2px;
}
.top-criteria-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}

.top-news-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  height: 76px;
}

.top-news-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  min-width: 0;
}
/* Per-card hover gradients (same palette as feed cards) */
.top-news--0:hover { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); border-color: transparent; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14); }
.top-news--1:hover { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%); border-color: transparent; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.25); }
.top-news--2:hover { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%); border-color: transparent; box-shadow: 0 4px 16px rgba(124, 58, 237, 0.25); }
.top-news--3:hover { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%); border-color: transparent; box-shadow: 0 4px 16px rgba(5, 150, 105, 0.25); }
.top-news--4:hover { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%); border-color: transparent; box-shadow: 0 4px 16px rgba(217, 119, 6, 0.25); }

/* Per-card rank badge resting colors */
.top-news--0 .top-news-rank { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.top-news--1 .top-news-rank { background: linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #60A5FA 100%); }
.top-news--2 .top-news-rank { background: linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #A78BFA 100%); }
.top-news--3 .top-news-rank { background: linear-gradient(135deg, #065F46 0%, #059669 60%, #34D399 100%); }
.top-news--4 .top-news-rank { background: linear-gradient(135deg, #92400E 0%, #D97706 60%, #FBBF24 100%); }

.top-news-rank {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-caption);
  font-weight: 700;
  flex-shrink: 0;
  color: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.top-news-card:hover .top-news-rank {
  background: rgba(255, 255, 255, 0.15) !important;
}

.top-news-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top-news-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.top-news-card:hover .top-news-title {
  color: #FFFFFF;
}

.top-news-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
}

.top-news-source {
  color: var(--accent, #007AFF);
  font-weight: 600;
}
.top-news-card:hover .top-news-source {
  color: rgba(255, 255, 255, 0.7);
}

.top-news-date {
  color: var(--text-muted);
}
.top-news-card:hover .top-news-date {
  color: rgba(255, 255, 255, 0.45);
}

/* Spinner next to "Top Stories" label */
.top-news-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #E5E5EA;
  border-top-color: #0F0F0F;
  border-right-color: #374151;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* Loading placeholder — same fixed height as .top-news-row */
.top-news-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 76px;
}

.top-news-loading-spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid #E5E5EA;
  border-top-color: #0F0F0F;
  border-right-color: #374151;
  background: conic-gradient(from 0deg, transparent 0%, transparent 60%, rgba(55, 65, 81, 0.08) 100%);
  animation: spin 0.7s linear infinite;
}

@media (min-width: 1920px) {
  .top-news-row {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (min-width: 2560px) {
  .top-news-row {
    grid-template-columns: repeat(6, 1fr);
  }
}

/* ── Grid ─────────────────────────────────────────────────────────────── */
.news-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 360px;
  gap: 14px;
}

@media (min-width: 1920px) {
  .news-grid {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 360px;
  }
}

@media (min-width: 2560px) {
  .news-grid {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 400px;
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
  height: 360px;
}

@media (min-width: 2560px) {
  .feed-card {
    height: 400px;
  }
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
  font-size: var(--fs-caption);
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
  font-size: var(--fs-caption);
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
  gap: 10px;
}

/* ── Embedded Header (back btn + page title) ─────────────────────────── */
.embedded-header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.embedded-page-title {
  flex: 1;
  min-width: 0;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Browser Toolbar ──────────────────────────────────────────────────── */
.embedded-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: #FFFFFF;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
  flex-shrink: 0;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm, 8px);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.toolbar-btn:hover:not(:disabled) {
  background: var(--bg-hover, #F5F5F5);
  color: var(--text-primary);
}
.toolbar-btn:active:not(:disabled) {
  background: #EBEBEB;
}
.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── URL Bar ──────────────────────────────────────────────────────────── */
.toolbar-url-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  background: var(--bg-main, #F2F2F7);
  border: 1px solid var(--border-light, #F0F0F0);
  border-radius: var(--radius-sm, 8px);
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.toolbar-url-bar:focus-within {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}

.toolbar-url-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.toolbar-url-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small, 0.75rem);
  color: var(--text-primary);
  outline: none;
}
.toolbar-url-input::placeholder {
  color: var(--text-muted);
}

/* Loading progress bar under URL input */
.toolbar-url-loader {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  width: 100%;
  background: linear-gradient(90deg, transparent, var(--accent, #007AFF), transparent);
  animation: urlLoad 1.2s ease-in-out infinite;
}
@keyframes urlLoad {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.embedded-webview {
  flex: 1;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
  background: #FFFFFF;
}

@media (prefers-reduced-motion: reduce) {
  .feed-spinner { animation: none; }
  .feed-card { transition: none; }
  .article-item, .article-number, .action-btn, .back-btn, .toolbar-btn, .top-news-card { transition: none; }
  .load-more-dots span { animation: none; }
  .top-news-spinner { animation: none; }
  .top-news-loading-spinner { animation: none; }
  .toolbar-url-loader { animation: none; }
}
</style>

<!-- Unscoped styles for teleported modals -->
<style>
/* ── Top Stories Criteria Modal ──────────────────────────────────────── */
.top-criteria-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.top-criteria-modal {
  width: min(560px, 90vw);
  max-height: 85vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: topCriteriaEnter 0.2s ease-out;
}

@keyframes topCriteriaEnter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.top-criteria-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #1F1F1F;
}

.top-criteria-header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.top-criteria-title {
  flex: 1;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.top-criteria-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.top-criteria-close:hover { background: #1F1F1F; color: #FFFFFF; }

.top-criteria-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.top-criteria-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top-criteria-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.top-criteria-textarea {
  padding: 10px 12px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #FFFFFF;
  outline: none;
  resize: vertical;
  min-height: 60px;
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.top-criteria-textarea::placeholder { color: #4B5563; }
.top-criteria-textarea:focus {
  border-color: #4B5563;
  box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.15);
}

.top-criteria-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  color: #6B7280;
}

.top-criteria-enhance {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.15s;
}
.top-criteria-enhance:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}
.top-criteria-enhance:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.top-criteria-error {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #FCA5A5;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.12);
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.top-criteria-time-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-criteria-time-input {
  width: 80px;
  padding: 8px 12px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.top-criteria-time-input:focus {
  border-color: #4B5563;
  box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.15);
}

.top-criteria-time-suffix {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  color: #6B7280;
}

.top-criteria-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
}

.top-criteria-cancel {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  background: #1A1A1A;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
  cursor: pointer;
  transition: all 0.15s;
}
.top-criteria-cancel:hover { background: #222222; color: #FFFFFF; border-color: #374151; }

.top-criteria-save {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.15s;
}
.top-criteria-save:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .top-criteria-modal { animation: none; }
}

/* ── Add Feed Modal ─────────────────────────────────────────────────── */
.add-feed-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-feed-modal {
  width: min(720px, 92vw);
  max-height: 80vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 16px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: addFeedEnter 0.2s ease-out;
}

@keyframes addFeedEnter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.add-feed-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #1F1F1F;
}

.add-feed-header-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.add-feed-title {
  flex: 1;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle, 1.0625rem);
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.add-feed-count {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  font-weight: 600;
  color: #9CA3AF;
  padding: 2px 10px;
  background: #1A1A1A;
  border-radius: 9999px;
  border: 1px solid #2A2A2A;
}

.add-feed-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.add-feed-close:hover { background: #1F1F1F; color: #FFFFFF; }

.add-feed-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.add-feed-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add-feed-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.add-feed-input {
  padding: 10px 12px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.add-feed-input::placeholder { color: #4B5563; }
.add-feed-input:focus {
  border-color: #4B5563;
  box-shadow: 0 0 0 3px rgba(75, 85, 99, 0.15);
}

.add-feed-input--mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary, 0.875rem);
}

.add-feed-error {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #FCA5A5;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.12);
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.add-feed-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
}

.add-feed-cancel {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  background: #1A1A1A;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
  cursor: pointer;
  transition: all 0.15s;
}
.add-feed-cancel:hover { background: #222222; color: #FFFFFF; border-color: #374151; }

.add-feed-submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: 8px;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body, 0.9375rem);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #374151;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.15s;
}
.add-feed-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}
.add-feed-submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-feed-rows-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 4px;
}

.add-feed-col-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.add-feed-rows {
  max-height: 420px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
}

.add-feed-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-feed-row-remove {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.add-feed-row-remove:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #EF4444;
}
.add-feed-row-remove:disabled {
  opacity: 0.2;
  cursor: not-allowed;
}

.add-feed-row-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 500;
  color: #9CA3AF;
  cursor: pointer;
  transition: color 0.15s;
}
.add-feed-row-add:hover {
  color: #FFFFFF;
}

.add-feed-success {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: #4ADE80;
  line-height: 1.5;
  margin: 0;
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.12);
  border-radius: 8px;
  border: 1px solid rgba(34, 197, 94, 0.2);
}

@media (prefers-reduced-motion: reduce) {
  .add-feed-modal { animation: none; }
}
</style>
