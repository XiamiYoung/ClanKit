import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fs = require('fs')
const os = require('os')
const path = require('path')
const md = require('../modelDefaults')

const entry = (ctx) => ({ max_input_tokens: ctx, max_output_tokens: 10 })

describe('modelDefaults catalog lookup', () => {
  let dir
  const catalogPath = () => path.join(dir, 'litellm-models.json')
  const writeCatalog = (catalog) => fs.writeFileSync(catalogPath(), JSON.stringify(catalog), 'utf8')
  const context = (id, type) => md.lookupModelCatalog(id, type, dir).context_length

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'model-defaults-')) })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads the catalog from disk once for a whole batch of models', () => {
    writeCatalog({ 'qwen-max': entry(1000) })
    const read = vi.spyOn(fs, 'readFileSync')
    const models = Array.from({ length: 50 }, (_, i) => ({ id: `unknown-${i}` }))

    md.enrichModelsFromCatalog('qwen', models, dir)
    md.enrichModelsFromCatalog('openrouter', [{ id: 'qwen-max' }], dir)

    expect(read.mock.calls.filter(([file]) => file === catalogPath())).toHaveLength(1)
  })

  it('keeps the match priority: exact, bare id, then longest prefix', () => {
    writeCatalog({
      sample_spec: entry(1),
      'dashscope/Qwen-Max': entry(100),
      'other/qwen-max': entry(200),
      'qwen': entry(300),
      'vendor/solo-model': entry(400),
    })

    expect(context('qwen-max', 'qwen')).toBe(100)
    expect(context('Other/Qwen-Max')).toBe(200)
    expect(context('solo-model')).toBe(400)
    expect(context('qwen-max-2025-01-25')).toBe(100)
    expect(context('qwen-turbo')).toBe(300)
    expect(context('sample_spec')).toBeNull()
    expect(context('nothing-here')).toBeNull()
  })

  it('picks the earlier catalog entry when both the id and the prefixed id exist', () => {
    writeCatalog({ 'dashscope/m1': entry(100), 'm1': entry(200) })

    expect(context('m1', 'qwen')).toBe(100)
  })

  it('serves the new catalog after a remote refresh', async () => {
    writeCatalog({ 'm1': entry(100) })
    expect(context('m1')).toBe(100)

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => JSON.stringify({ 'm1': entry(500) }) })))
    await md.refreshFromRemote(dir)

    expect(context('m1')).toBe(500)
  })
})
