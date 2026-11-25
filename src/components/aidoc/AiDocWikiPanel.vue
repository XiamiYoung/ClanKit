<template>
  <section
    ref="panel"
    class="aidoc-wiki-panel"
    :style="panelStyle"
    :class="{ 'wiki-standalone': standalone }"
    data-testid="aidoc-wiki-panel"
    tabindex="-1"
    :role="standalone ? 'main' : 'dialog'"
    :aria-modal="standalone ? undefined : true"
    :aria-label="t('aidoc.wikiDialog')"
    @keydown.esc.stop="emit('close')"
    @keydown="focusSearch"
    @mousedown.stop
    @mouseup.stop
  >
    <header class="wiki-titlebar" @pointerdown.self="startDrag($event, 'move')">
      <h2 v-if="standalone">{{ t('aidoc.wiki') }}</h2>
      <div v-else class="wiki-drag-handle" :class="{ 'is-dragging': interaction === 'move' }" tabindex="0"
        :aria-description="t('aidoc.moveWiki')" @pointerdown="startDrag($event, 'move')" @keydown="adjustWithKeys($event, 'move')">
        <h2>{{ t('aidoc.wiki') }}</h2>
      </div>
        <div class="wiki-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 4 4" />
          </svg>
          <input ref="searchInput" v-model="query" type="search" @keydown.esc.stop.prevent="query = ''" :placeholder="t('aidoc.wikiSearch')" :aria-label="t('aidoc.wikiSearch')" />
        </div>
      <select v-if="languages.length > 1" class="wiki-language" :aria-label="t('aidoc.wikiLanguage')"
        :value="activeLanguage" data-testid="aidoc-wiki-languages" @keydown.esc.stop @change="selectLanguage($event.target.value)">
        <option v-for="lang in languages" :key="lang" :value="lang">{{ t(languageLabelKey(lang)) }}</option>
      </select>
      <AppTooltip v-if="!standalone" :text="t('common.close')">
        <AppButton size="icon" variant="ghost" data-testid="aidoc-wiki-close" :aria-label="t('common.close')" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </AppButton>
      </AppTooltip>
      <slot name="window-controls" />
    </header>

    <p v-if="loadingPages" class="wiki-empty" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!store.wikiPages && errorText" class="wiki-empty" role="alert">{{ errorText }}</p>
    <div v-else-if="!hasContentPages" class="wiki-empty">
      <h3>{{ t('aidoc.wikiEmptyTitle') }}</h3>
      <p>{{ t('aidoc.wikiEmptyHint') }}</p>
    </div>

    <div v-else class="wiki-columns" :style="menuColumns" :class="{
      'wiki-layout-search': query.trim(), 'wiki-layout-browse': !query.trim() && mode === 'browse',
      'wiki-layout-details': !query.trim() && (mode === 'overview' || (mode === 'browse' && viewMode === 'reader' && hasDetails)),
    }">
      <div class="wiki-menu" :class="{ 'wiki-menu-closed': menus.topics.closed }">
      <nav v-show="!menus.topics.closed" id="wiki-topics-menu" class="wiki-navigation" :aria-label="t('aidoc.wiki')">
        <template v-if="!query.trim()">
          <button type="button" class="wiki-nav-link wiki-tree-row document-tree-row" :style="rowStyle(0)" :aria-current="mode === 'overview' ? 'page' : undefined" @click="showOverview">
            {{ t('aidoc.wikiOverview') }}
          </button>
          <button type="button" class="wiki-nav-link wiki-tree-row document-tree-row" :style="rowStyle(1)" data-testid="aidoc-wiki-graph"
            :aria-current="mode === 'graph' ? 'page' : undefined" @click="showGraph">
            {{ t('aidoc.graph') }}
          </button>
          <button type="button" class="wiki-nav-link wiki-tree-row document-tree-row" :style="rowStyle(2)" :aria-current="activeGroup === 'all' ? 'page' : undefined" @click="browse('all')">
            {{ t('aidoc.wikiAllArticles') }}
          </button>
          <h3 class="wiki-nav-label">{{ t('aidoc.wikiBrowseTopics') }}</h3>
          <button v-for="(group, index) in visibleTopicNavigation" :key="group.key" type="button"
            class="wiki-nav-link wiki-topic wiki-tree-row document-tree-row"
            :style="[rowStyle(index + 3), { paddingInlineStart: (0.75 + (group.depth || 0) * 1.125) + 'rem' }]"
            :aria-expanded="group.children?.length ? expandedTopics.has(group.key) : undefined"
            :aria-current="activeGroup === group.key ? 'page' : undefined" @click="clickTopic(group)">
            <svg v-if="group.children?.length" class="wiki-tree-chevron" :class="{ 'is-expanded': expandedTopics.has(group.key) }"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span v-else class="wiki-tree-chevron" aria-hidden="true" />
            <svg class="wiki-folder-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
            <span class="wiki-tree-name">{{ group.label }}</span><span class="wiki-topic-count">{{ group.pages.length }}</span>
          </button>
        </template>
        <template v-else>
          <h3 class="wiki-nav-label">{{ t('aidoc.wikiFilters') }}</h3>
          <label class="wiki-filter">{{ t('aidoc.wikiBrowseTopics') }}
            <select v-model="topicFilter">
              <option value="">{{ t('aidoc.wikiAllArticles') }}</option>
              <option v-for="group in topicNavigation" :key="group.key" :value="group.key">{{ group.name || group.label }}</option>
            </select>
          </label>
          <label class="wiki-filter">{{ t('aidoc.wikiArticleType') }}
            <select v-model="typeFilter">
              <option value="">{{ t('aidoc.wikiAllTypes') }}</option>
              <option v-for="(label, type) in TYPE_LABELS" :key="type" :value="type">{{ t(label) }}</option>
            </select>
          </label>
        </template>
      </nav>
        <div v-if="!menus.topics.closed" class="wiki-menu-resizer" role="separator" tabindex="0" aria-orientation="vertical"
          :aria-label="t('aidoc.wikiResizeTopics')" :aria-controls="'wiki-topics-menu'"
          @pointerdown="startMenuResize($event, 'topics')" @pointermove="moveMenuResize" @pointerup="stopMenuResize"
          @pointercancel="stopMenuResize" @lostpointercapture="stopMenuResize"
          @keydown.left.prevent="resizeMenu('topics', -16)" @keydown.right.prevent="resizeMenu('topics', 16)" />
        <button ref="topicsToggle" type="button" class="document-tree-toggle wiki-menu-toggle" :aria-expanded="!menus.topics.closed"
          :style="topicsDrag.dynamicStyle.value" @mousedown="topicsDrag.onMouseDown"
          @click.capture="topicsDrag.onClickCapture"
          :aria-controls="'wiki-topics-menu'" :aria-label="t(menus.topics.closed ? 'aidoc.wikiExpandTopics' : 'aidoc.wikiCollapseTopics')"
          @click="menus.topics.closed = !menus.topics.closed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 7h12M6 12h12M6 17h12" />
          </svg>
        </button>
      </div>

      <div v-if="query.trim() || mode === 'browse'" class="wiki-menu wiki-menu-articles" :class="{ 'wiki-menu-closed': menus.articles.closed }">
        <section v-show="!menus.articles.closed" id="wiki-articles-menu" class="wiki-article-list">
          <h3>{{ query.trim() ? t('aidoc.wikiSearchResults') : (currentGroup?.name || currentGroup?.label) || t('aidoc.wikiAllArticles') }}</h3>
          <div class="wiki-list-meta">
            <span>{{ t('aidoc.wikiArticleCount', { count: visibleArticles.length }) }}</span>
            <select v-if="!query.trim()" v-model="articleSort" :aria-label="t('aidoc.wikiArticleSort')">
              <option value="recent">{{ t('aidoc.wikiRecent') }}</option>
              <option value="title">{{ t('aidoc.wikiSortTitle') }}</option>
            </select>
          </div>
          <p v-if="!visibleArticles.length" class="wiki-muted">{{ t('common.noResults') }}</p>
          <button v-for="(item, index) in visibleArticles" :key="item.rel" type="button" class="wiki-nav-link wiki-article-row wiki-tree-row document-tree-row" :style="rowStyle(index)"
            :aria-current="(query.trim() ? searchSelection : readingSelection) === item.rel ? 'page' : undefined" @click="chooseArticle(item)">
            <svg class="wiki-file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm0 0v6h6" />
            </svg>
            <strong class="wiki-tree-name">{{ item.title }}</strong>
          </button>
        </section>
        <div v-if="!menus.articles.closed" class="wiki-menu-resizer" role="separator" tabindex="0" aria-orientation="vertical"
          :aria-label="t('aidoc.wikiResizeArticles')" :aria-controls="'wiki-articles-menu'"
          @pointerdown="startMenuResize($event, 'articles')" @pointermove="moveMenuResize" @pointerup="stopMenuResize"
          @pointercancel="stopMenuResize" @lostpointercapture="stopMenuResize"
          @keydown.left.prevent="resizeMenu('articles', -16)" @keydown.right.prevent="resizeMenu('articles', 16)" />
        <button ref="articlesToggle" type="button" class="document-tree-toggle wiki-menu-toggle" :aria-expanded="!menus.articles.closed"
          :style="articlesDrag.dynamicStyle.value" @mousedown="articlesDrag.onMouseDown"
          @click.capture="articlesDrag.onClickCapture"
          :aria-controls="'wiki-articles-menu'" :aria-label="t(menus.articles.closed ? 'aidoc.wikiExpandArticles' : 'aidoc.wikiCollapseArticles')"
          @click="menus.articles.closed = !menus.articles.closed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M6 7h12M6 12h12M6 17h12" />
          </svg>
        </button>
      </div>


      <section v-if="query.trim()" class="wiki-reader wiki-search-preview" :aria-busy="store.wikiLoading">
        <template v-if="searchSelection && page?.rel === searchSelection">
          <h3>{{ page.title }}</h3>
          <p class="wiki-muted">{{ t(typeLabel(page.type)) }}</p>
          <p v-if="previewExcerpt" class="wiki-excerpt">{{ previewExcerpt }}</p>
          <ul v-if="previewHeadings.length" class="wiki-preview-headings">
            <li v-for="(heading, index) in previewHeadings" :key="index">{{ heading }}</li>
          </ul>
          <AppButton size="compact" @click="openSearchArticle">{{ t('aidoc.wikiOpenArticle') }}</AppButton>
        </template>
        <p v-else-if="store.wikiLoading" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="searchSelection && errorText" role="alert">{{ errorText }}</p>
        <p v-else-if="visibleArticles.length" class="wiki-muted">{{ t('aidoc.wikiSelectResult') }}</p>
      </section>

      <section v-else-if="mode === 'overview'" class="wiki-reader wiki-overview">
        <h3>{{ t('aidoc.wikiOverview') }}</h3>
        <p class="wiki-muted">{{ t('aidoc.wikiArticleCount', { count: languageArticles.length }) }}</p>
        <h4 v-if="topicGroups.length">{{ t('aidoc.wikiBrowseTopics') }}</h4>
        <div v-if="topicGroups.length" class="wiki-topic-grid">
          <div v-for="group in topicGroups" :key="group.key" class="wiki-topic-group">
            <button type="button" class="wiki-topic-card" @click="browse(group.key)">
              <strong>{{ group.label }}</strong>
              <span>{{ t('aidoc.wikiArticleCount', { count: group.pages.length }) }}</span>
            </button>
            <button v-for="child in flattenWikiTopics(group.children)" :key="child.key" type="button" class="wiki-subtopic"
              :class="{ 'is-nested': child.depth > 1 }" :style="{ paddingInlineStart: (0.8 + (child.depth - 1) * 1.125) + 'rem' }"
              @click="browse(child.key)">
              <span>{{ child.label }}</span><span class="wiki-topic-count">{{ child.pages.length }}</span>
            </button>
          </div>
        </div>
        <h4>{{ t('aidoc.wikiRecent') }}</h4>
        <button v-for="item in recentArticles" :key="item.rel" type="button" class="wiki-nav-link wiki-recent-row" @click="openArticle(item.rel)">
          <span>{{ item.title }}</span><span>{{ wikiCategories(item)[0] || t(typeLabel(item.type)) }}</span>
        </button>
      </section>

      <AiDocGraphPanel v-else-if="mode === 'graph'" embedded @open-file="openGraphNode" />

      <div v-else ref="readingPane" class="wiki-reader" :aria-busy="store.wikiLoading">
        <p v-if="store.wikiLoading" class="wiki-muted" role="status">{{ t('common.loading') }}</p>
        <p v-if="errorText" class="wiki-muted" role="alert">{{ errorText }}</p>
        <article v-if="page && !store.wikiLoading && page.rel === readingSelection">
          <p class="wiki-breadcrumb">{{ t('aidoc.wiki') }} › {{ (currentGroup?.name || currentGroup?.label) || t('aidoc.wikiAllArticles') }}</p>
          <header class="wiki-page-header">
            <h3>{{ page.title }}</h3>
            <div class="wiki-page-meta">
              <span class="wiki-type">{{ t(typeLabel(page.type)) }}</span>
              <span>{{ t('aidoc.wikiReadonly') }}</span>
              <time v-if="page.updated" :datetime="page.updated">{{ page.updated }}</time>
            </div>
            <div class="wiki-view-modes" role="group" :aria-label="t('aidoc.wikiViewMode')">
              <button type="button" :aria-pressed="viewMode === 'reader'" @click="viewMode = 'reader'">{{ t('aidoc.wikiReading') }}</button>
              <button type="button" :aria-pressed="viewMode === 'source'" @click="viewMode = 'source'">Markdown</button>
            </div>
          </header>
          <div v-if="viewMode === 'reader'" ref="bodyElement" class="prose-obsidian wiki-markdown" v-html="html" @click="followLink" @auxclick.prevent />
          <pre v-else class="wiki-source"><code>{{ page.body }}</code></pre>


        </article>
      </div>
      <aside v-if="!query.trim() && mode === 'overview'" class="wiki-context">
        <h3>{{ t('aidoc.wikiTopicStatus') }}</h3>
        <p>{{ t('aidoc.wikiTopicCoverage', { count: categorizedCount, total: languageArticles.length }) }}</p>
        <p v-if="store.wikiTopicsLoading" role="status">{{ t('aidoc.wikiClassifyingTopics') }}</p>
        <button v-if="unclassified.length" type="button" class="wiki-nav-link" @click="browse('unclassified')">
          {{ t('aidoc.wikiCategoryUncategorized') }} · {{ unclassified.length }}
        </button>
        <button v-if="home" type="button" class="wiki-nav-link" @click="openArticle(home.rel)">{{ t('aidoc.wikiOriginalIndex') }}</button>
      </aside>
      <aside v-else-if="!query.trim() && mode === 'browse' && viewMode === 'reader' && hasDetails" class="wiki-context wiki-details">
          <nav v-if="headings.length" class="wiki-outline" :aria-label="t('aidoc.wikiOutline')">
            <h4>{{ t('aidoc.wikiOutline') }}</h4>
            <ul>
              <li v-for="heading in headings" :key="heading.index" :class="{ 'wiki-outline-subheading': heading.nested }">
                <button type="button" @click="goToHeading(heading.index)">{{ heading.text }}</button>
              </li>
            </ul>
          </nav>
        <section v-if="page.backlinks?.length">
          <h3>{{ t('aidoc.wikiBacklinks') }}</h3>
          <ul v-if="page.backlinks?.length">
            <li v-for="link in page.backlinks" :key="link.rel">
              <button type="button" class="wiki-nav-link" :title="link.rel" @click="openArticle(link.rel)">{{ link.title }}</button>
            </li>
          </ul>
          <p v-else class="wiki-muted">{{ t('aidoc.wikiNoBacklinks') }}</p>
        </section>
        <section v-if="page.sources?.length">
          <h3>{{ t('aidoc.wikiSources') }}</h3>
          <ul>
            <li v-for="source in page.sources" :key="source.rel">
              <button v-if="source.exists && source.path" type="button" class="wiki-nav-link" :title="source.rel" @click="openSource(source)">
                {{ source.rel }}
              </button>
              <div v-else class="wiki-missing-source">
                {{ source.rel }}
                <p>{{ t('aidoc.wikiSourceMissing') }}</p>
              </div>
            </li>
          </ul>
        </section>
      </aside>
    </div>
    <AppTooltip v-if="!standalone" class="wiki-resize-handle" :text="t('aidoc.resizeWiki')">
      <AppButton size="icon" variant="ghost" :aria-label="t('aidoc.resizeWiki')" class="wiki-resize-button"
        @pointerdown="startDrag($event, 'resize')" @keydown="adjustWithKeys($event, 'resize')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="m5 19 14-14m-7 14 7-7" />
        </svg>
      </AppButton>
    </AppTooltip>
  </section>
</template>

<script setup>
import './documentTree.css'
import '../../utils/proseObsidian.css'
import { documentRowGradient } from '../../utils/documentTreeStyle'
import { useDraggableHamburger } from '../../composables/useDraggableHamburger'
import { useFloatingPanel } from '../../composables/useFloatingPanel'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, watchPostEffect } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import { renderObsidianMarkdown } from '../../utils/obsidianMarkdown'
import { renderWikiDiagrams } from '../../utils/mermaidDiagrams'
import { buildWikiTopicTree, flattenWikiTopics, groupWikiPages, wikiCategories } from '../../utils/aidocWikiCategories'
import { languageLabelKey, matchWikiLanguage } from '../../utils/aidocLanguages'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'
import AiDocGraphPanel from './AiDocGraphPanel.vue'

const emit = defineEmits(['close', 'open-file'])
const { t, locale } = useI18n()
const store = useAiDocStore()
const props = defineProps({ standalone: Boolean })
const panel = ref(null)
const topicsToggle = ref(null)
const articlesToggle = ref(null)
const topicsDrag = useDraggableHamburger({ buttonRef: topicsToggle, getPanelEl: () => panel.value, storeY: ref(null) })
const articlesDrag = useDraggableHamburger({ buttonRef: articlesToggle, getPanelEl: () => panel.value, storeY: ref(null) })
const { panelStyle, interaction, startDrag, adjustWithKeys } = props.standalone ? {} : useFloatingPanel({
  widthRatio: 0.94, heightRatio: 0.92, minWidth: 420, minHeight: 300,
})
const menus = reactive({ topics: { width: 220, closed: false }, articles: { width: 260, closed: false } })
const menuColumns = computed(() => Object.fromEntries(Object.entries(menus).map(([key, menu]) => [
  '--wiki-' + key + '-width', menu.closed ? '1.5rem' : 'min(' + menu.width + 'px, 32%)',
])))
const rowStyle = index => ({ '--document-row-gradient': documentRowGradient(index) })
let menuDrag = null

function setMenuWidth(key, width) {
  const limit = Math.floor((panel.value?.clientWidth || window.innerWidth) * 0.32)
  menus[key].width = Math.min(Math.max(180, width), Math.max(180, limit))
}

function resizeMenu(key, delta) {
  const actual = panel.value?.querySelector('#wiki-' + key + '-menu')?.getBoundingClientRect().width
  setMenuWidth(key, (actual || menus[key].width) + delta)
}

function startMenuResize(event, key) {
  if (event.button !== 0) return
  const width = event.currentTarget.parentElement.getBoundingClientRect().width || menus[key].width
  menuDrag = { key, width, x: event.clientX, id: event.pointerId }
  event.currentTarget.setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function moveMenuResize(event) {
  if (menuDrag?.id !== event.pointerId) return
  setMenuWidth(menuDrag.key, menuDrag.width + event.clientX - menuDrag.x)
}

function stopMenuResize(event) {
  if (menuDrag?.id === event.pointerId) menuDrag = null
}
const readingPane = ref(null)
const bodyElement = ref(null)
const viewMode = ref('reader')
const headings = ref([])
const query = ref('')
const searchInput = ref(null)
const searchSelection = ref('')
const readingSelection = ref('')
const topicFilter = ref('')
const typeFilter = ref('')
const mode = ref('overview')
const activeGroup = ref('')
const articleSort = ref('recent')
const hasDetails = computed(() => page.value?.rel === readingSelection.value && !store.wikiLoading &&
  !!(headings.value.length || page.value?.backlinks?.length || page.value?.sources?.length))
const loadingPages = ref(true)
const page = computed(() => store.currentWikiPage)
const errorText = computed(() => store.errorKey ? t(store.errorKey) : store.error)
const isIndexPage = item => item.isIndex || item.rel.toLowerCase() === 'wiki/index.md' ||
  (!!item.lang && item.rel.toLowerCase() === `wiki/${item.lang}/index.md`)

// Every language folder is an independent wiki. Only languages with readable pages count, and
// pages directly under wiki/ (from before language folders) form the legacy tree.
const languages = computed(() => [...new Set((store.wikiPages || []).filter(item => item.lang && !isIndexPage(item)).map(item => item.lang))].sort())
const chosenLanguage = ref('')
const activeLanguage = computed(() => languages.value.includes(chosenLanguage.value)
  ? chosenLanguage.value
  : matchWikiLanguage(locale.value, languages.value) || languages.value[0] || null)
const scopedPages = computed(() => (store.wikiPages || []).filter(item => (item.lang || null) === activeLanguage.value))
const legacyPages = computed(() => activeLanguage.value
  ? (store.wikiPages || []).filter(item => !item.lang && !isIndexPage(item))
  : [])
const home = computed(() => scopedPages.value.find(isIndexPage))
// A wiki holding only the scaffold index has nothing to read yet.
const hasContentPages = computed(() => scopedPages.value.some(item => !isIndexPage(item)))
let active = true

const TYPE_LABELS = {
  summary: 'aidoc.typeSummary',
  entity: 'aidoc.typeEntity',
  concept: 'aidoc.typeConcept',
  comparison: 'aidoc.typeComparison',
  other: 'aidoc.typeOther',
}

function typeLabel(type) {
  return Object.hasOwn(TYPE_LABELS, type) ? TYPE_LABELS[type] : TYPE_LABELS.other
}

const matchesQuery = item => {
  const term = query.value.trim().toLowerCase()
  return !term || item.title.toLowerCase().includes(term) || item.rel.toLowerCase().includes(term)
    || wikiCategories(item).some(category => category.toLowerCase().includes(term))
}
const languageArticles = computed(() => scopedPages.value.filter(item => !isIndexPage(item)))
const unclassified = computed(() => languageArticles.value.filter(item => !wikiCategories(item).some(Boolean)))
const categorizedCount = computed(() => languageArticles.value.length - unclassified.value.length)
const topicGroups = computed(() => buildWikiTopicTree(
  groupWikiPages(languageArticles.value, t, locale.value).filter(group => group.key !== 'category:'), locale.value,
))
const expandedTopics = ref(new Set())
// Like a folder in the document tree, a topic row toggles its children and also lists its articles.
function clickTopic(group) {
  const wasExpanded = expandedTopics.value.has(group.key)
  browse(group.key)
  if (wasExpanded) expandedTopics.value.delete(group.key)
}
const browseGroups = computed(() => [
  ...flattenWikiTopics(topicGroups.value),
  ...(unclassified.value.length ? [{ key: 'unclassified', label: t('aidoc.wikiCategoryUncategorized'), pages: unclassified.value }] : []),
  ...(legacyPages.value.length ? [{ key: 'legacy', label: t('aidoc.wikiLegacy'), pages: legacyPages.value }] : []),
])
const currentGroup = computed(() => browseGroups.value.find(group => group.key === activeGroup.value))
const topicNavigation = computed(() => browseGroups.value.filter(group => group.key !== 'legacy'))
const visibleTopicNavigation = computed(() => [
  ...flattenWikiTopics(topicGroups.value, expandedTopics.value),
  ...topicNavigation.value.filter(group => group.key === 'unclassified'),
])
const newestFirst = (a, b) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0) || a.title.localeCompare(b.title)
const recentArticles = computed(() => [...languageArticles.value].sort(newestFirst).slice(0, 6))
const visibleArticles = computed(() => {
  if (!query.value.trim()) {
    const byTitle = new Intl.Collator(locale.value, { numeric: true })
    return [...(currentGroup.value?.pages || languageArticles.value)]
      .sort(articleSort.value === 'title' ? (a, b) => byTitle.compare(a.title, b.title) : newestFirst)
  }
  const pool = topicFilter.value ? browseGroups.value.find(group => group.key === topicFilter.value)?.pages || [] : [...languageArticles.value, ...legacyPages.value]
  return pool.filter(item => matchesQuery(item) && (!typeFilter.value || typeLabel(item.type) === TYPE_LABELS[typeFilter.value])).sort(newestFirst)
})
const previewHeadings = computed(() => [...(page.value?.body || '').matchAll(/^#{1,4} +(.+)$/gm)].slice(0, 6).map(match => match[1]))
const previewExcerpt = computed(() => (page.value?.body || '').split(/\n\s*\n/).map(block => block.trim())
  .find(block => block && !/^(?:#|\x60\x60\x60|~~~|\||!|>|[-*] |\d+\. )/.test(block))?.slice(0, 380) || '')

function focusSearch(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    event.stopPropagation()
    searchInput.value?.focus()
  }
}

function showOverview() {
  mode.value = 'overview'
  activeGroup.value = ''
}

function browse(key) {
  mode.value = 'browse'
  activeGroup.value = key
  expandAncestors(currentGroup.value)
  if (currentGroup.value?.children?.length) expandedTopics.value.add(key)
  const rows = visibleArticles.value
  readingSelection.value = rows.some(item => item.rel === readingSelection.value) ? readingSelection.value : rows[0]?.rel || ''
  if (readingSelection.value !== page.value?.rel) selectPage(readingSelection.value)
}

function chooseArticle(item) {
  if (query.value.trim()) searchSelection.value = item.rel
  else readingSelection.value = item.rel
  if (page.value?.rel !== item.rel) selectPage(item.rel)
}

// Reveals a nested topic in the sidebar.
function expandAncestors(group) {
  const path = group?.name?.toLowerCase().split(' › ') || []
  for (let size = 1; size < path.length; size++) expandedTopics.value.add('category:' + path.slice(0, size).join(' › '))
}

function openArticle(rel) {
  const group = browseGroups.value.filter(group => group.pages.some(item => item.rel === rel)).at(-1)
  activeGroup.value = group?.key || 'all'
  expandAncestors(group)
  mode.value = 'browse'
  readingSelection.value = rel
  if (page.value?.rel !== rel) selectPage(rel)
}

function openSearchArticle() {
  const rel = searchSelection.value
  query.value = ''
  openArticle(rel)
}

watch(query, (value, oldValue) => {
  if (!value.trim() && oldValue.trim() && mode.value === 'browse' && readingSelection.value !== page.value?.rel) selectPage(readingSelection.value)
  topicFilter.value = ''
  typeFilter.value = ''
  searchSelection.value = ''
})
watch(visibleArticles, rows => {
  if (query.value.trim() && !rows.some(item => item.rel === searchSelection.value)) searchSelection.value = ''
})
watch(currentGroup, group => {
  if (!group && mode.value === 'browse' && activeGroup.value !== 'all') activeGroup.value = 'all'
})

function isWikiRel(rel) {
  return typeof rel === 'string' && /^wiki\/(?:[^\\/:]+\/)*[^\\/:]+\.md$/i.test(rel)
    && !rel.split('/').some(segment => segment === '..' || segment === '.')
}

function sourceForLink(target) {
  const links = page.value?.links
  const rel = links && Object.hasOwn(links, target) ? links[target] : null
  const name = String(target).toLowerCase()
  return (page.value?.sources || []).find(source => {
    if (!source.exists || !source.path) return false
    if (rel) return source.rel === rel
    const file = source.rel.split('/').at(-1).toLowerCase()
    return file === name || file.replace(/\.[^.]+$/, '') === name
  }) || null
}

function resolveWikiLink(target) {
  const links = page.value?.links
  const rel = links && Object.hasOwn(links, target) ? links[target] : null
  if (isWikiRel(rel)) return rel
  return sourceForLink(target)?.rel || null
}

const html = computed(() => renderObsidianMarkdown(page.value?.body, { resolveLink: resolveWikiLink, restrictImages: true }))

function wikiDestination(anchor) {
  if (anchor.dataset.unresolved) return null
  const rel = resolveWikiLink(anchor.dataset.target)
  return rel === anchor.dataset.rel ? rel : null
}

function selectPage(rel) {
  if (isWikiRel(rel)) store.openWikiPage(rel)
}

function selectLanguage(lang) {
  if (lang === activeLanguage.value) return
  chosenLanguage.value = lang
  expandedTopics.value.clear()
  query.value = ''
  readingSelection.value = ''
  showOverview()
}

function followLink(event) {
  const anchor = event.target.closest?.('a')
  if (!anchor) return
  event.preventDefault()
  if (anchor.classList.contains('wikilink')) {
    const destination = wikiDestination(anchor)
    if (destination?.startsWith('kb_source/')) openSource(sourceForLink(anchor.dataset.target))
    else if (isWikiRel(destination)) openArticle(destination)
    return
  }
  const href = anchor.getAttribute('href')
  if (href?.startsWith('#')) {
    const id = href.slice(1)
    const target = [...event.currentTarget.querySelectorAll('[id]')].find(element => element.id === id)
    target?.scrollIntoView({ block: 'start' })
  } else if (/^https?:\/\//i.test(href || '')) {
    window.electronAPI?.openExternal?.(href)
  }
}

function openSource(source) {
  emit('open-file', { path: source.path, name: source.rel.split('/').at(-1) })
}

function showGraph() {
  mode.value = 'graph'
  activeGroup.value = ''
}

// Wiki pages open here; sources go to the document editor like any other source link.
function openGraphNode(file) {
  const path = String(file.path).replace(/\\/g, '/').toLowerCase()
  const target = (store.wikiPages || []).find(item => path.endsWith('/' + item.rel.toLowerCase()))
  if (!target) {
    emit('open-file', file)
    return
  }
  query.value = ''
  if (target.lang) selectLanguage(target.lang)
  openArticle(target.rel)
}

function articleHeadings() {
  return [...(bodyElement.value?.querySelectorAll('h1, h2, h3, h4') || [])]
}

function goToHeading(index) {
  articleHeadings()[index]?.scrollIntoView({ block: 'start' })
}

watchPostEffect(() => {
  const body = bodyElement.value
  if (!html.value || !body) {
    headings.value = []
    return
  }
  const items = articleHeadings()
  const level = Math.min(...items.map(item => Number(item.tagName[1])))
  headings.value = items.map((item, index) => ({ index, text: item.textContent.trim(), nested: Number(item.tagName[1]) > level }))
    .filter(heading => heading.text)
  for (const anchor of body.querySelectorAll('a.wikilink')) {
    if (wikiDestination(anchor)) continue
    anchor.setAttribute('aria-disabled', 'true')
    anchor.removeAttribute('href')
    anchor.tabIndex = -1
  }
  void renderWikiDiagrams(body, { label: t('aidoc.wikiDiagram'), failure: t('aidoc.wikiDiagramFailed') })
})

watch(() => page.value?.rel, () => {
  if (readingPane.value) readingPane.value.scrollTop = 0
})

onMounted(async () => {
  panel.value?.focus({ preventScroll: true })
  await store.loadWikiPages()
  if (!active) return
  loadingPages.value = false

})
onBeforeUnmount(() => { active = false })
</script>

<style scoped>
.aidoc-wiki-panel {
  position: fixed;
  z-index: 100;
  container: wiki-panel / inline-size;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-app-region: no-drag;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 0.625rem 2rem var(--shadow-hover), 0 0.125rem 0.375rem var(--shadow);
}
.aidoc-wiki-panel.wiki-standalone {
  position: relative;
  height: 100dvh;
  width: 100%;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.aidoc-wiki-panel:focus { outline: none; }
.wiki-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3125rem 0.375rem 0.3125rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.wiki-titlebar h2 { font-size: var(--fs-subtitle); font-weight: 700; }
/* The standalone window is frameless: this bar mirrors the main window title bar and drags the window. */
.wiki-standalone .wiki-titlebar {
  min-height: 3rem;
  padding-block: 0.5rem;
  padding-inline: 0.75rem 0.5rem;
  background: var(--bg-card);
  -webkit-app-region: drag;
  user-select: none;
}
.wiki-standalone .wiki-titlebar :is(.wiki-search, .wiki-language) { -webkit-app-region: no-drag; }
/* Same control height as the main title bar's center strip, leaving clear space above and below. */
.wiki-standalone .wiki-titlebar :is(.wiki-search, .wiki-language) { height: 1.75rem; padding-block: 0; }
.wiki-columns {
  display: grid;
  flex: 1;
  min-height: 0;
}
.wiki-navigation, .wiki-reader {
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.wiki-navigation { padding: 0.75rem; font-size: var(--fs-secondary); border-inline-end: 1px solid var(--border); }
.wiki-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  gap: 1.25rem;
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: var(--fs-secondary);
}
.wiki-language {
  max-width: min(9rem, 42%);
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  background: var(--bg-hover);
  font-size: var(--fs-secondary);
}
.wiki-search {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  margin-bottom: 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: var(--bg-hover);
}
.wiki-search:focus-within { border-color: var(--text-secondary); }
.wiki-search svg { flex: 0 0 auto; }
.wiki-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: none;
  color: var(--text-primary);
  background: transparent;
}
.wiki-details h3 {
  margin: 0 0 0.25rem;
  padding-inline: 0.375rem;
  color: var(--text-secondary);
  font-size: var(--fs-secondary);
  font-weight: 650;
}
.wiki-nav-link, .wiki-missing-source {
  display: block;
  width: 100%;
  min-height: 1.75rem;
  padding: 0.3125rem 0.375rem;
  border-radius: var(--radius-sm);
  overflow-wrap: anywhere;
  text-align: start;
}
.wiki-nav-link:hover { background: var(--bg-hover); }
.wiki-nav-link[aria-current='page'] {
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: var(--bg-sidebar);
}
.wiki-reader { padding: clamp(1rem, 4vw, 3.5rem); }
.wiki-reader article { max-width: 72ch; margin-inline: auto; font-size: var(--fs-body); }
.wiki-page-header { margin-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
.wiki-page-header h3 {
  font-size: clamp(var(--fs-page-title), 3vw, calc(1.5 * var(--fs-page-title)));
  font-weight: 700;
  line-height: 1.16;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.wiki-page-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  color: var(--text-secondary);
  font-size: var(--fs-secondary);
}
.wiki-view-modes { display: flex; gap: 1.125rem; margin-top: 0.75rem; }
.wiki-view-modes button {
  padding-block: 0.375rem;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-size: var(--fs-secondary);
}
.wiki-view-modes button[aria-pressed='true'] {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
  font-weight: 650;
}
.wiki-outline {
  margin-bottom: 1.75rem;
  padding: 0.75rem 1rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: var(--fs-secondary);
}
.wiki-outline h4 { margin-bottom: 0.375rem; font-weight: 650; }
.wiki-outline li { padding-block: 0.125rem; }
.wiki-outline-subheading { padding-inline-start: 0.75rem; }
.wiki-outline button { color: var(--text-secondary); text-align: start; }
.wiki-outline button:hover { color: var(--text-primary); text-decoration: underline; }
.wiki-source {
  padding: 1rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  font-size: var(--fs-secondary);
  line-height: 1.6;
}
.wiki-markdown {
  width: 100%;
  max-width: 100%;
  color: inherit;
  overflow-wrap: anywhere;
  font-size: var(--fs-body);
  line-height: 1.75;
}
.wiki-markdown :deep(h1), .wiki-markdown :deep(h2), .wiki-markdown :deep(h3), .wiki-markdown :deep(h4) {
  margin-block: 1.8em 0.5em;
  scroll-margin-block-start: 1rem;
  line-height: 1.3;
}
.wiki-markdown :deep(p) { margin-block: 0 0.95em; }
.wiki-markdown :deep(table) { display: block; max-width: 100%; overflow-x: auto; }
.wiki-markdown :deep(.wiki-diagram) {
  margin-block: 1.25rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  overflow: auto;
}
.wiki-markdown :deep(.wiki-diagram img) { display: block; margin: 0 auto; max-width: 100%; height: auto; }
.wiki-markdown :deep(.wiki-diagram-error) { color: var(--text-secondary); font-size: var(--fs-secondary); }
.wiki-markdown :deep(a.wikilink[aria-disabled='true']) {
  color: var(--text-muted);
  background: transparent;
  border-bottom-style: dotted;
  text-decoration: none;
  cursor: default;
}
.wiki-empty { margin: auto; padding: 1.25rem; text-align: center; }
.wiki-empty h3 { font-size: var(--fs-section); font-weight: 700; }
.wiki-empty p, .wiki-muted, .wiki-missing-source { color: var(--text-secondary); }
.wiki-empty p { margin-top: 0.375rem; }
.wiki-muted { padding-inline: 0.375rem; }

.wiki-titlebar { gap: 0.65rem; flex-shrink: 0; }
.wiki-drag-handle { display: flex; align-items: center; min-height: 1.6rem; cursor: grab; touch-action: none; user-select: none; }
.wiki-drag-handle.is-dragging { cursor: grabbing; }
.wiki-resize-handle { position: absolute; inset-inline-end: 0.125rem; bottom: 0.125rem; z-index: 1; }
.wiki-resize-button { cursor: nwse-resize; touch-action: none; }
.wiki-columns { margin-bottom: 0.6rem; }
.wiki-titlebar > :last-child { flex-shrink: 0; }
.wiki-titlebar .wiki-search { width: min(34rem, 46%); margin: 0 auto; }
.wiki-titlebar .wiki-language { margin: 0; flex-shrink: 0; }
.wiki-columns { grid-template-columns: var(--wiki-topics-width) minmax(0, 1fr); }
.wiki-columns.wiki-layout-details { grid-template-columns: var(--wiki-topics-width) minmax(0, 1fr) 12rem; }
.wiki-columns.wiki-layout-browse { grid-template-columns: var(--wiki-topics-width) var(--wiki-articles-width) minmax(0, 1fr); }
.wiki-columns.wiki-layout-browse.wiki-layout-details { grid-template-columns: var(--wiki-topics-width) var(--wiki-articles-width) minmax(0, 1fr) 11rem; }
.wiki-columns.wiki-layout-search { grid-template-columns: var(--wiki-topics-width) var(--wiki-articles-width) minmax(0, 1fr); }
.wiki-navigation, .wiki-article-list { background: var(--bg-card); }
.wiki-columns > .aidoc-graph-panel { min-width: 0; }
.wiki-nav-label { margin: 1.15rem 0 0.35rem; font-size: var(--fs-caption); color: var(--text-secondary); }
.wiki-recent-row { display: flex; justify-content: space-between; gap: 0.6rem; }
.wiki-topic-count, .wiki-recent-row span + span { flex-shrink: 0; font-size: var(--fs-caption); }
.wiki-context, .wiki-article-list { min-height: 0; overflow: auto; padding: 1rem 0.75rem; }
.wiki-context { display: block; border-inline-start: 1px solid var(--border); }
.wiki-context > * + * { margin-top: 0.75rem; }
.wiki-context p, .wiki-context li { font-size: var(--fs-caption); }
.wiki-article-list { border-inline-end: 1px solid var(--border); }
.wiki-list-meta { display: flex; justify-content: space-between; gap: 0.25rem; align-items: baseline; color: var(--text-secondary); font-size: var(--fs-small); }
.wiki-list-meta select { min-width: 0; background: var(--bg-card); }
.wiki-article-list h3, .wiki-search-preview h3 { font-size: var(--fs-section); font-weight: 700; margin-bottom: 0.55rem; }

.wiki-menu { position: relative; min-width: 0; min-height: 0; border-inline-end: 1px solid var(--border); }
.wiki-menu > nav, .wiki-menu > section { height: 100%; padding-inline: 0.4rem; border: 0; }
.wiki-menu-resizer { position: absolute; inset-block: 0; inset-inline-end: -0.2rem; width: 0.4rem; cursor: col-resize; touch-action: none; z-index: 2; }
.wiki-menu-resizer:hover, .wiki-menu-resizer:focus-visible { background: var(--accent); }
.wiki-menu-toggle { left: auto; inset-inline-start: 100%; z-index: 3; }
.wiki-menu-articles .wiki-menu-toggle { top: 62%; }
.wiki-menu-closed .wiki-menu-toggle { inset-inline-start: 0; }
/* Row format mirrors the AI Doc document tree. */
.wiki-tree-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block: 0.25rem;
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}
.wiki-tree-row:hover, .wiki-tree-row:focus-visible, .wiki-tree-row[aria-current='page'] {
  background: var(--document-row-gradient);
  color: var(--bg-sidebar);
  box-shadow: 0 0.125rem 0.4rem var(--shadow);
}
.wiki-tree-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
.wiki-topic .wiki-tree-name { font-weight: 600; }
.wiki-tree-chevron, .wiki-folder-icon, .wiki-file-icon { flex-shrink: 0; }
.wiki-tree-chevron { width: 0.875rem; transition: transform 0.15s; }
.wiki-tree-chevron.is-expanded { transform: rotate(90deg); }

.wiki-overview h3 { font-size: var(--fs-page-title); font-weight: 700; }
.wiki-overview h4 { font-size: var(--fs-section); font-weight: 650; margin: 1.5rem 0 0.6rem; }
.wiki-topic-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr)); align-items: start; gap: 0.65rem; }
.wiki-topic-group { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
.wiki-topic-card { display: grid; gap: 0.3rem; width: 100%; padding: 0.8rem; text-align: start; }
.wiki-topic-card:hover, .wiki-subtopic:hover { background: var(--bg-hover); }
.wiki-subtopic { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; width: 100%; padding: 0.3rem 0.8rem; text-align: start; font-size: var(--fs-caption); font-weight: 600; }
.wiki-topic-card + .wiki-subtopic { border-top: 1px solid var(--border); }
.wiki-subtopic:last-child { padding-bottom: 0.55rem; }
.wiki-subtopic.is-nested { color: var(--text-secondary); font-weight: 400; }
.wiki-topic-card span, .wiki-breadcrumb { color: var(--text-secondary); font-size: var(--fs-caption); }
.wiki-breadcrumb { margin-bottom: 0.75rem; }
.wiki-recent-row { border-bottom: 1px solid var(--border); }
.wiki-filter { display: grid; gap: 0.25rem; margin-top: 0.65rem; }
.wiki-filter select { width: 100%; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.35rem; background: var(--bg-card); }
.wiki-preview-headings { margin-block: 0.8rem; list-style: inside disc; }
.wiki-excerpt { margin-block: 0.8rem; line-height: 1.65; }
.wiki-outline { padding: 0; background: transparent; margin-bottom: 0; }
.wiki-context section + section, .wiki-context .wiki-outline + section { border-top: 1px solid var(--border); padding-top: 0.65rem; }
@container wiki-panel (max-width: 66rem) {
  .wiki-columns.wiki-layout-browse.wiki-layout-details { grid-template-columns: var(--wiki-topics-width) var(--wiki-articles-width) minmax(0, 1fr) 8rem; }
  .wiki-reader { padding: 1rem; }
}
@container wiki-panel (max-width: 52rem) {
  .wiki-columns.wiki-layout-browse.wiki-layout-details { grid-template-columns: var(--wiki-topics-width) var(--wiki-articles-width) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .wiki-layout-browse .wiki-context { grid-column: 3; max-height: 9rem; border-top: 1px solid var(--border); }
}
@container wiki-panel (max-width: 42rem) {
  .wiki-columns[class] { display: flex; flex-direction: column; overflow: auto; }
  .wiki-columns > * { flex-shrink: 0; }
  .wiki-columns > .aidoc-graph-panel { min-height: 28rem; }
  .wiki-menu { padding-inline-end: 1.5rem; }
  .wiki-menu > nav, .wiki-menu > section { max-height: 12rem; }
  .wiki-menu-closed { min-height: 2rem; }
  .wiki-menu-resizer { display: none; }
  .wiki-menu-toggle, .wiki-menu-articles .wiki-menu-toggle, .wiki-menu-closed .wiki-menu-toggle {
    top: 50%; inset-inline-start: auto; inset-inline-end: 0; height: 1.75rem;
  }
  .wiki-titlebar { flex-wrap: wrap; }
  .wiki-titlebar .wiki-search { order: 1; width: 100%; }
}
</style>
