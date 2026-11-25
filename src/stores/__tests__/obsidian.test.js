// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useObsidianStore } from '../obsidian'

vi.mock('../config', () => ({ useConfigStore: () => ({ config: {} }) }))

const obsidian = {
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  readTree: vi.fn(),
  probeFiles: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
}
const root = '/vault'
const entries = [{ name: 'note.md', path: `${root}/note.md`, type: 'file' }]

beforeEach(() => {
  setActivePinia(createPinia())
  window.electronAPI = { obsidian }
  vi.resetAllMocks()
  obsidian.getConfig.mockResolvedValue({ vaultPath: root })
  obsidian.probeFiles.mockResolvedValue({})
})

describe('AI Doc tree loading', () => {
  it('can load the vault configuration at startup without scanning or probing files', async () => {
    obsidian.readTree.mockResolvedValue(entries)
    obsidian.probeFiles.mockResolvedValue({})
    const store = useObsidianStore()
    await store.loadConfig({ loadFiles: false })
    expect(store.vaultPath).toBe(root)
    expect(obsidian.readTree).not.toHaveBeenCalled()
    expect(obsidian.probeFiles).not.toHaveBeenCalled()
    await store.loadTree()
    expect(store.fileTree).toEqual(entries)
    expect(obsidian.probeFiles).toHaveBeenCalledWith([entries[0].path])
  })

  it('keeps an open document at its new path when its folder moves into index scope', async () => {
    obsidian.readTree.mockResolvedValue([])
    obsidian.readFile.mockResolvedValue({ content: '# Draft' })
    obsidian.rename.mockResolvedValue({ success: true })
    const store = useObsidianStore()
    const oldFolder = root + '/general/Notes'
    const newFolder = root + '/kb_source/Notes'
    await store.loadConfig()
    await store.openFile(oldFolder + '/Draft.md', 'Draft.md')
    await store.renameItem(oldFolder, newFolder)
    expect(store.activeFile).toMatchObject({ path: newFolder + '/Draft.md', content: '# Draft' })
    expect(obsidian.saveConfig).toHaveBeenLastCalledWith({
      lastOpenedDoc: { path: newFolder + '/Draft.md', name: 'Draft.md' },
    })
  })

  it('shares the startup scan and shows results while file probing is pending', async () => {
    let finishScan
    obsidian.readTree.mockReturnValue(new Promise(resolve => { finishScan = resolve }))
    obsidian.probeFiles.mockReturnValue(new Promise(() => {}))
    const store = useObsidianStore()

    const startup = store.loadConfig()
    await vi.waitFor(() => expect(store.treeStatus).toBe('loading'))
    const page = store.loadTree()
    expect(store.treeStatus).toBe('loading')
    expect(obsidian.readTree).toHaveBeenCalledTimes(1)

    finishScan(entries)
    await Promise.all([startup, page])
    expect(store.fileTree).toEqual(entries)
    expect(store.treeStatus).toBe('ready')
  })

  it('ignores an older scan when switching vaults', async () => {
    let finishOldScan
    obsidian.readTree
      .mockReturnValueOnce(new Promise(resolve => { finishOldScan = resolve }))
      .mockResolvedValueOnce([])
    const store = useObsidianStore()

    const oldScan = store.loadConfig()
    await Promise.resolve()
    await store.setVaultManually('/new-vault')
    finishOldScan(entries)
    await oldScan

    expect(store.vaultPath).toBe('/new-vault')
    expect(store.fileTree).toEqual([])
    expect(store.treeStatus).toBe('ready')
  })

  it('distinguishes scan failure from a successful empty scan on retry', async () => {
    obsidian.readTree.mockRejectedValueOnce(new Error('access denied')).mockResolvedValueOnce([])
    const store = useObsidianStore()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await store.loadConfig()
      expect(store.treeStatus).toBe('error')
      await store.loadTree()
      expect(store.treeStatus).toBe('ready')
      expect(store.fileTree).toEqual([])
    } finally {
      log.mockRestore()
    }
  })
})
