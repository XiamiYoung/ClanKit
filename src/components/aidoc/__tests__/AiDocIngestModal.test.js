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
    expect(dialog.textContent).toContain('kb_source/report.md')
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
    expect(dialog.textContent).toContain('aidoc.ingestRunning 2 3')
    expect(dialog.textContent).toContain('kb_source/report.md')
    expect(dialog.textContent).toContain('read_source')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(store.cancelIngestPlan).not.toHaveBeenCalled()
    const stop = dialog.querySelector('[data-testid="aidoc-ingest-stop"]')
    stop.click()
    expect(store.stopIngest).toHaveBeenCalledOnce()
    store.ingestStopping = true
    await nextTick()
    expect(stop.disabled).toBe(true)
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
})
