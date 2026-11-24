<template>
  <section
    ref="panel"
    class="aidoc-wiki-panel"
    data-testid="aidoc-wiki-panel"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    :aria-label="t('aidoc.wikiDialog')"
    @keydown.esc.stop="emit('close')"
    @mousedown.stop
    @mouseup.stop
  >
    <header class="wiki-titlebar">
      <h2>{{ t('aidoc.wiki') }}</h2>
      <AppTooltip :text="t('common.close')">
        <AppButton size="icon" variant="ghost" data-testid="aidoc-wiki-close" :aria-label="t('common.close')" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </AppButton>
      </AppTooltip>
    </header>

    <p v-if="loadingPages" class="wiki-empty" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="!store.wikiPages && errorText" class="wiki-empty" role="alert">{{ errorText }}</p>
    <div v-else-if="!store.wikiPages?.length" class="wiki-empty">
      <h3>{{ t('aidoc.wikiEmptyTitle') }}</h3>
      <p>{{ t('aidoc.wikiEmptyHint') }}</p>
    </div>

    <div v-else class="wiki-columns">
      <nav class="wiki-navigation" :aria-label="t('aidoc.wiki')">
        <div class="wiki-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m16 16 4 4" />
          </svg>
          <input v-model="query" type="search" @keydown.esc.stop.prevent="query = ''" :placeholder="t('aidoc.wikiSearch')" :aria-label="t('aidoc.wikiSearch')" />
        </div>
        <button v-if="home" type="button" class="wiki-nav-link" :aria-current="page?.rel === home.rel ? 'page' : undefined" @click="selectPage(home.rel)">
          {{ t('aidoc.wikiHome') }}
        </button>
        <p v-if="query.trim() && !matchingPages.length" class="wiki-muted">{{ t('common.noResults') }}</p>
        <section v-for="group in navigationGroups" :key="group.label" class="wiki-nav-group">
          <h3>{{ t(group.label) }}</h3>
          <ul>
            <li v-for="item in group.pages" :key="item.rel">
              <button type="button" class="wiki-nav-link" :title="item.rel" :aria-current="page?.rel === item.rel ? 'page' : undefined" @click="selectPage(item.rel)">
                {{ item.title }}
              </button>
            </li>
          </ul>
        </section>
      </nav>

      <div ref="readingPane" class="wiki-reader" :aria-busy="store.wikiLoading">
        <p v-if="store.wikiLoading" class="wiki-muted" role="status">{{ t('common.loading') }}</p>
        <p v-if="errorText" class="wiki-muted" role="alert">{{ errorText }}</p>
        <article v-if="page">
          <header class="wiki-page-header">
            <h3>{{ page.title }}</h3>
            <div class="wiki-page-meta">
              <span class="wiki-type">{{ t(typeLabel(page.type)) }}</span>
              <time v-if="page.updated">{{ page.updated }}</time>
            </div>
          </header>
          <div ref="bodyElement" class="prose-obsidian wiki-markdown" v-html="html" @click="followLink" @auxclick.prevent />
        </article>
      </div>

      <aside v-if="page" class="wiki-details">
        <section>
          <h3>{{ t('aidoc.wikiBacklinks') }}</h3>
          <ul v-if="page.backlinks?.length">
            <li v-for="link in page.backlinks" :key="link.rel">
              <button type="button" class="wiki-nav-link" :title="link.rel" @click="selectPage(link.rel)">{{ link.title }}</button>
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
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch, watchPostEffect } from 'vue'
import { useI18n } from '../../i18n/useI18n'
import { useAiDocStore } from '../../stores/aidoc'
import { renderObsidianMarkdown } from '../../utils/obsidianMarkdown'
import AppButton from '../common/AppButton.vue'
import AppTooltip from '../common/AppTooltip.vue'

const emit = defineEmits(['close', 'open-file'])
const { t } = useI18n()
const store = useAiDocStore()
const panel = ref(null)
const readingPane = ref(null)
const bodyElement = ref(null)
const query = ref('')
const loadingPages = ref(true)
const page = computed(() => store.currentWikiPage)
const errorText = computed(() => store.errorKey ? t(store.errorKey) : store.error)
const home = computed(() => store.wikiPages?.find(item => item.isIndex || item.rel.toLowerCase() === 'wiki/index.md'))
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

const matchingPages = computed(() => {
  const term = query.value.trim().toLowerCase()
  return (store.wikiPages || []).filter(item =>
    item !== home.value && (!term || item.title.toLowerCase().includes(term) || item.rel.toLowerCase().includes(term))
  )
})

const navigationGroups = computed(() => {
  const groups = Object.values(TYPE_LABELS).map(label => ({
    label,
    pages: matchingPages.value.filter(item => typeLabel(item.type) === label)
      .sort((a, b) => a.title.localeCompare(b.title) || a.rel.localeCompare(b.rel)),
  }))
  if (!query.value.trim()) {
    groups.unshift({
      label: 'aidoc.wikiRecent',
      pages: [...matchingPages.value].sort((a, b) => b.mtimeMs - a.mtimeMs || a.rel.localeCompare(b.rel)).slice(0, 10),
    })
  }
  return groups.filter(group => group.pages.length)
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

function followLink(event) {
  const anchor = event.target.closest?.('a')
  if (!anchor) return
  event.preventDefault()
  if (anchor.classList.contains('wikilink')) {
    const destination = wikiDestination(anchor)
    if (destination?.startsWith('kb_source/')) openSource(sourceForLink(anchor.dataset.target))
    else selectPage(destination)
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

watchPostEffect(() => {
  if (!html.value || !bodyElement.value) return
  for (const anchor of bodyElement.value.querySelectorAll('a.wikilink')) {
    if (wikiDestination(anchor)) continue
    anchor.setAttribute('aria-disabled', 'true')
    anchor.removeAttribute('href')
    anchor.tabIndex = -1
  }
})

watch(() => page.value?.rel, () => {
  if (readingPane.value) readingPane.value.scrollTop = 0
})

onMounted(async () => {
  panel.value?.focus({ preventScroll: true })
  await store.loadWikiPages()
  if (!active) return
  loadingPages.value = false
  selectPage(home.value?.rel || store.wikiPages?.[0]?.rel)
})
onBeforeUnmount(() => { active = false })
</script>

<style scoped>
.aidoc-wiki-panel {
  position: fixed;
  z-index: 100;
  inset: 0;
  margin: auto;
  width: min(84vw, 92rem);
  height: 86vh;
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
.aidoc-wiki-panel:focus { outline: none; }
.wiki-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.3125rem 0.375rem 0.3125rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.wiki-titlebar h2 { font-size: var(--fs-subtitle); font-weight: 700; }
.wiki-columns {
  display: grid;
  grid-template-columns: minmax(10rem, 1fr) minmax(0, 2.7fr) minmax(10rem, 1fr);
  flex: 1;
  min-height: 0;
}
.wiki-navigation, .wiki-reader, .wiki-details {
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.wiki-navigation, .wiki-details { padding: 0.75rem; font-size: var(--fs-secondary); }
.wiki-navigation { border-inline-end: 1px solid var(--border); }
.wiki-details { border-inline-start: 1px solid var(--border); }
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
.wiki-nav-group, .wiki-details section + section { margin-top: 0.875rem; }
.wiki-nav-group h3, .wiki-details h3 {
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
.wiki-reader { padding: clamp(0.875rem, 2vw, 2rem); }
.wiki-reader article { max-width: 54rem; margin-inline: auto; }
.wiki-page-header { margin-bottom: 1.125rem; }
.wiki-page-header h3 {
  font-size: var(--fs-page-title);
  font-weight: 700;
  line-height: 1.2;
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
.wiki-type {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  background: var(--bg-hover);
}
.wiki-markdown {
  width: 100%;
  max-width: 100%;
  color: inherit;
  overflow-wrap: anywhere;
}
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

@media (max-width: 60rem) {
  .aidoc-wiki-panel { width: calc(100vw - 1.5rem); }
  .wiki-columns { grid-template-columns: minmax(9rem, 1fr) minmax(0, 2.7fr) minmax(9rem, 1fr); }
}
@media (max-width: 42rem) {
  .wiki-columns {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-rows: max-content;
    overflow: auto;
  }
  .wiki-navigation {
    max-height: 12rem;
    border-inline-end: 0;
    border-bottom: 1px solid var(--border);
  }
  .wiki-details { border-inline-start: 0; border-top: 1px solid var(--border); }
}
</style>
