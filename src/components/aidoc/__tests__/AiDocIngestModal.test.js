// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiDocIngestModal from '../AiDocIngestModal.vue'

const { useAiDocStore } = vi.hoisted(() => ({ useAiDocStore: vi.fn() }))
vi.mock('../../../stores/aidoc', () => ({ useAiDocStore }))
vi.mock('../../../i18n/useI18n', () => ({
  useI18n: () => ({ t: (key, params) => [key, ...Object.values(params || {})].join(' ') })
}))

describe('AiDocIngestModal', () => {
  let store
  let wrapper
  const open = () => {
    wrapper = mount(AiDocIngestModal, { attachTo: document.body })
    return document.body.querySelector('dialog')
  }

  beforeEach(() => {
    store = reactive({
      ingestPlan: {
        sources: [{ rel: 'kb_source/report.md', size: 1024, state: 'new' }],
        overflow: 2,
        providerReady: true
      },
      ingesting: false,
      ingestStopping: false,
      ingestProgress: null,
      ingestResult: null,
      ingestError: '',
      ingestErrorKey: '',
      syncPercent: 0,
      cancelIngestPlan: vi.fn(),
      confirmIngest: vi.fn(),
      stopIngest: vi.fn()
    })
    useAiDocStore.mockReturnValue(store)
  })

  afterEach(() => wrapper?.unmount())

  it('lists source metadata and confirms only through its action', () => {
    const dialog = open()
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.textContent).toContain('aidoc.ingestFiles 1')
    expect(dialog.querySelector('[role="tree"] [role="treeitem"][aria-level="2"]').textContent).toContain('report.md')
    expect(dialog.textContent).toContain('kb_source (1)')
    expect(dialog.textContent).toContain('1 KB')
    expect(dialog.textContent).toContain('aidoc.stateNew')
    expect(dialog.textContent).toContain('aidoc.ingestOverflow 2')
    dialog.click()
    expect(store.cancelIngestPlan).not.toHaveBeenCalled()
    dialog.querySelector('[data-testid="aidoc-ingest-start"]').click()
    expect(store.confirmIngest).toHaveBeenCalledExactlyOnceWith()
    dialog.querySelector('[data-testid="aidoc-ingest-dismiss"]').click()
    expect(store.cancelIngestPlan).toHaveBeenCalledOnce()
  })

  it('disables confirmation and displays the provider error', () => {
    store.ingestPlan.providerReady = false
    store.ingestPlan.providerError = 'Connection missing'
    const dialog = open()
    expect(dialog.querySelector('[data-testid="aidoc-ingest-start"]').disabled).toBe(true)
    expect(dialog.querySelector('[role="alert"]').textContent).toContain('Connection missing')
  })

  it('shows progress and allows stopping once, keeping the dialog open', async () => {
    store.ingesting = true
    store.ingestProgress = { index: 1, total: 3, rel: 'kb_source/report.md', action: 'read_source' }
    const dialog = open()
    expect(dialog.textContent).toContain('aidoc.progressPercent 0 2 3 report.md')
    expect(dialog.textContent).toContain('kb_source/report.md')
    expect(dialog.textContent).toContain('aidoc.actionReadSource')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(store.cancelIngestPlan).not.toHaveBeenCalled()
    const stop = dialog.querySelector('[data-testid="aidoc-ingest-stop"]')
    stop.click()
    expect(store.stopIngest).toHaveBeenCalledOnce()
    store.ingestStopping = true
    await nextTick()
    expect(stop.disabled).toBe(true)
  })

  it('renders a progressbar with the store percent and falls back to the raw action name', async () => {
    store.ingesting = true
    store.syncPercent = 42
    store.ingestProgress = { index: 0, total: 3, rel: 'kb_source/sub/a.md', action: 'custom_op' }
    const dialog = open()
    const bar = dialog.querySelector('[role="progressbar"]')
    expect(bar.getAttribute('aria-valuenow')).toBe('42')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
    expect(bar.firstElementChild.style.width).toBe('42%')
    expect(dialog.querySelector('[data-testid="aidoc-ingest-percent"]').textContent).toBe('aidoc.progressPercent 42 1 3 a.md')
    expect(dialog.textContent).toContain('custom_op')
    store.ingestProgress = null
    store.syncPercent = 0
    await nextTick()
    expect(bar.getAttribute('aria-valuenow')).toBe('0')
    expect(dialog.querySelector('[data-testid="aidoc-ingest-percent"]').textContent).toBe('0% · aidoc.ingestPreparing')
  })

  it('shows warnings, the registry_unreadable reason and the consecutive-error abort notice', () => {
    store.ingestPlan = null
    store.syncPercent = 100
    store.ingestResult = {
      done: [], remaining: 2, aborted: 'consecutive_agent_errors',
      failed: [{ rel: 'kb_source/a.md', reason: 'registry_unreadable' }],
      warnings: [{ rel: 'kb_source/b.md', step: 'index', detail: 'disk full' }],
    }
    const dialog = open()
    expect(dialog.textContent).toContain('aidoc.reasonRegistryUnreadable')
    expect(dialog.textContent).not.toContain('aidoc.reasonAgentError')
    expect(dialog.textContent).toContain('aidoc.ingestAbortedAgentErrors')
    expect(dialog.textContent).toContain('aidoc.ingestWarnings')
    expect(dialog.textContent).toContain('kb_source/b.md')
    expect(dialog.textContent).toContain('index: disk full')
    expect(dialog.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100')
  })

  it('shows completion counts, localized failure reasons and the remaining count', () => {
    store.ingestPlan = null
    store.ingestResult = {
      done: ['kb_source/report.md'],
      failed: [{ rel: 'kb_source/scan.pdf', reason: 'scanned_pdf' }],
      stopped: true,
      overflow: 2,
      remaining: 3
    }
    const dialog = open()
    expect(dialog.textContent).toContain('aidoc.ingestDone 1')
    expect(dialog.textContent).toContain('aidoc.ingestFailed 1')
    expect(dialog.textContent).toContain('kb_source/scan.pdf')
    expect(dialog.textContent).toContain('aidoc.reasonScannedPdf')
    expect(dialog.textContent).toContain('aidoc.ingestStopped')
    expect(dialog.textContent).toContain('aidoc.ingestRemaining 3')
    expect(dialog.textContent).toContain('common.close')
  })

  it('maps every failure reason to its own text and hides a zero remaining count', () => {
    store.ingestPlan = null
    const reasons = ['unsupported', 'no_pages', 'read_failed', 'record_failed']
    store.ingestResult = {
      done: [], stopped: false, overflow: 0, remaining: 0,
      failed: reasons.map(reason => ({ rel: `kb_source/${reason}.md`, reason })),
    }
    const dialog = open()
    for (const key of ['reasonUnsupported', 'reasonNoPages', 'reasonReadFailed', 'reasonRecordFailed']) {
      expect(dialog.textContent).toContain(`aidoc.${key}`)
    }
    expect(dialog.textContent).not.toContain('aidoc.reasonAgentError')
    expect(dialog.textContent).not.toContain('aidoc.ingestRemaining')
  })

  it('shows the index error after completion', () => {
    store.ingestPlan = null
    store.ingestResult = { done: [], failed: [], remaining: 0, indexError: 'disk full' }
    const dialog = open()
    const alert = dialog.querySelector('[role="alert"]')
    expect(alert.textContent).toContain('aidoc.ingestIndexError')
    expect(alert.textContent).toContain('disk full')
  })

  describe('model selection', () => {
    beforeEach(() => {
      store.ingestPlan.providers = [
        { id: 'p1', name: 'Provider One', models: ['m1', 'm2'] },
        { id: 'p2', name: 'Provider Two', models: ['n1', 'n2'] },
      ]
      store.ingestPlan.selected = { providerId: 'p1', model: 'm2' }
      store.ingestModel = { providerId: 'p1', model: 'm2' }
      store.runSync = vi.fn()
    })

    it('renders a provider select and a model input with suggestions, preselected', () => {
      const dialog = open()
      const select = dialog.querySelector('[data-testid="aidoc-ingest-provider"]')
      const input = dialog.querySelector('[data-testid="aidoc-ingest-model"]')
      expect(select.value).toBe('p1')
      expect([...select.options].map(option => option.textContent)).toEqual(['Provider One', 'Provider Two'])
      expect(input.value).toBe('m2')
      const options = [...dialog.querySelectorAll(`datalist#${input.getAttribute('list')} option`)]
      expect(options.map(option => option.value)).toEqual(['m1', 'm2'])
      expect(dialog.textContent).toContain('aidoc.ingestModelHint')
    })

    it('resets the model on provider change unless it is the remembered provider', async () => {
      const dialog = open()
      const select = dialog.querySelector('[data-testid="aidoc-ingest-provider"]')
      select.value = 'p2'
      select.dispatchEvent(new Event('change'))
      await nextTick()
      expect(store.ingestModel).toEqual({ providerId: 'p2', model: 'n1' })
      select.value = 'p1'
      select.dispatchEvent(new Event('change'))
      await nextTick()
      expect(store.ingestModel).toEqual({ providerId: 'p1', model: 'm2' })
    })

    it('accepts a typed model and disables the controls while ingesting', async () => {
      const dialog = open()
      const input = dialog.querySelector('[data-testid="aidoc-ingest-model"]')
      input.value = 'brand-new'
      input.dispatchEvent(new Event('input'))
      expect(store.ingestModel.model).toBe('brand-new')
      store.ingesting = true
      await nextTick()
      expect(input.disabled).toBe(true)
      expect(dialog.querySelector('[data-testid="aidoc-ingest-provider"]').disabled).toBe(true)
    })

    it('disables start when the model is empty', async () => {
      store.ingestModel.model = ' '
      const dialog = open()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-start"]').disabled).toBe(true)
    })

    it('shows the model hint and keeps the controls enabled with a retry after a model 404', () => {
      store.ingestResult = {
        done: [], remaining: 1, failed: [{ rel: 'kb_source/a.md', reason: 'agent_error', detail: '404 Model not exist.' }],
      }
      const dialog = open()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model-hint"]').textContent).toContain('aidoc.ingestModelErrorHint')
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model"]').disabled).toBe(false)
      dialog.querySelector('[data-testid="aidoc-ingest-retry"]').click()
      expect(store.runSync).toHaveBeenCalledOnce()
    })

    it('shows no model hint for unrelated failures', () => {
      store.ingestResult = { done: [], remaining: 0, failed: [{ rel: 'kb_source/a.md', reason: 'agent_error', detail: 'timeout' }] }
      const dialog = open()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model-hint"]')).toBeNull()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model"]')).toBeNull()
    })
  })

  describe('model source caption', () => {
    beforeEach(() => {
      store.ingestPlan.providers = [{ id: 'p1', name: 'Provider One', models: ['m1', 'm2'] }]
      store.ingestPlan.selected = { providerId: 'p1', model: 'm1' }
      store.ingestModel = { providerId: 'p1', model: 'm1' }
    })

    it.each([
      ['remembered', 'aidoc.ingestModelSourceRemembered'],
      ['utility', 'aidoc.ingestModelSourceUtility'],
      ['default', 'aidoc.ingestModelSourceDefault'],
    ])('explains a %s selection', (source, key) => {
      store.ingestPlan.selectedSource = source
      const dialog = open()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model-source"]').textContent).toBe(key)
    })

    it('hides the caption once the user changes the model', async () => {
      store.ingestPlan.selectedSource = 'utility'
      const dialog = open()
      store.ingestModel.model = 'm2'
      await nextTick()
      expect(dialog.querySelector('[data-testid="aidoc-ingest-model-source"]')).toBeNull()
    })
  })

  describe('source tree', () => {
    beforeEach(() => {
      const file = rel => ({ rel: `kb_source/${rel}`, size: 2048, state: 'updated' })
      store.ingestPlan.sources = [
        file('top.md'), file('01-AI Foundations/a.md'), file('01-AI Foundations/b.md'),
        file('01-AI Foundations/deep/c.md'), file('02-Other/d.md'),
      ]
    })
    const item = (dialog, text) => [...dialog.querySelectorAll('[role="treeitem"]')]
      .find(el => el.querySelector('.tree-name').textContent === text)
    const key = (el, name) => el.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))

    it('expands only the root and renders collapsed subtrees lazily', () => {
      const dialog = open()
      const root = item(dialog, 'kb_source (5)')
      expect(root.getAttribute('aria-expanded')).toBe('true')
      expect(root.getAttribute('aria-level')).toBe('1')
      const folder = item(dialog, '01-AI Foundations (3)')
      expect(folder.getAttribute('aria-expanded')).toBe('false')
      expect(folder.getAttribute('aria-level')).toBe('2')
      expect(item(dialog, '02-Other (1)')).toBeTruthy()
      expect(item(dialog, 'top.md')).toBeTruthy()
      expect(item(dialog, 'a.md')).toBeUndefined()
      expect(dialog.querySelector('[role="tree"]')).not.toBeNull()
      expect(dialog.textContent).not.toContain('deep')
    })

    it('shows recursive counts after folder names and children once expanded', async () => {
      const dialog = open()
      dialog.querySelector('[aria-label="aidoc.ingestTreeExpand 01-AI Foundations"]').click()
      await nextTick()
      expect(item(dialog, '01-AI Foundations (3)').getAttribute('aria-expanded')).toBe('true')
      expect(item(dialog, 'a.md').getAttribute('aria-level')).toBe('3')
      const deep = item(dialog, 'deep (1)')
      expect(deep.getAttribute('aria-expanded')).toBe('false')
      expect(item(dialog, 'c.md')).toBeUndefined()
      expect(dialog.querySelector('[aria-label="aidoc.ingestTreeCollapse 01-AI Foundations"]')).not.toBeNull()
    })

    it('supports keyboard expand, collapse and navigation', async () => {
      const dialog = open()
      const folder = item(dialog, '01-AI Foundations (3)')
      folder.focus()
      key(folder, 'ArrowRight')
      await nextTick()
      expect(folder.getAttribute('aria-expanded')).toBe('true')
      key(folder, 'ArrowRight')
      await nextTick()
      expect(document.activeElement).toBe(item(dialog, 'deep (1)'))
      key(document.activeElement, 'ArrowDown')
      expect(document.activeElement).toBe(item(dialog, 'a.md'))
      key(document.activeElement, 'ArrowUp')
      expect(document.activeElement).toBe(item(dialog, 'deep (1)'))
      key(document.activeElement, 'ArrowLeft')
      expect(document.activeElement).toBe(folder)
      key(folder, 'ArrowLeft')
      await nextTick()
      expect(folder.getAttribute('aria-expanded')).toBe('false')
      key(folder, 'Enter')
      await nextTick()
      expect(folder.getAttribute('aria-expanded')).toBe('true')
      key(folder, ' ')
      await nextTick()
      expect(folder.getAttribute('aria-expanded')).toBe('false')
    })

    it('keeps confirming the same plan without per-file selection', () => {
      const dialog = open()
      expect(dialog.querySelector('input[type="checkbox"]')).toBeNull()
      dialog.querySelector('[data-testid="aidoc-ingest-start"]').click()
      expect(store.confirmIngest).toHaveBeenCalledExactlyOnceWith()
    })
  })

  it('does not dismiss on a backdrop click or Escape while ingesting', () => {
    store.ingesting = true
    const dialog = open()
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(store.cancelIngestPlan).not.toHaveBeenCalled()
  })
})
