import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

const { buildSystemPrompt } = require('../systemPromptBuilder')
const { registryPathFor, writeRegistry } = require('../../lib/aidocRegistry')

const baseAgent = {
  systemAgentId: 'a1',
  systemAgentName: 'Clank',
  systemAgentDescription: 'Generalist',
  systemAgentPrompt: 'You are Clank.'
}

let tmpRoot
let docRoot
let baseConfig

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-prompt-'))
  docRoot = path.join(tmpRoot, 'clankit_doc')
  fs.mkdirSync(path.join(docRoot, 'general', 'Reports'), { recursive: true })
  fs.mkdirSync(path.join(docRoot, 'kb_source'), { recursive: true })
  fs.mkdirSync(path.join(docRoot, 'wiki'), { recursive: true })
  baseConfig = {
    language: 'en',
    dataPath: tmpRoot,
    DoCPath: docRoot,
    artifactPath: path.join(tmpRoot, 'artifact')
  }
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const build = (cfg) => buildSystemPrompt(cfg, [], [], [], [], baseAgent)

describe('systemPromptBuilder wiki overview data path', () => {
  it('uses the dataStore fallback data dir for the overview when config.dataPath is unset', async () => {
    const dataStore = require('../../lib/dataStore')
    const spy = vi.spyOn(dataStore, 'paths').mockReturnValue({ DATA_DIR: tmpRoot })
    const registryFile = registryPathFor(tmpRoot, docRoot)
    try {
      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {
        'wiki/source.md': { hash: 'x', type: 'summary', updated: '2026-11-04' }
      } })
      const { dataPath, ...withoutDataPath } = baseConfig
      expect(dataPath).toBe(tmpRoot)
      const out = build({ ...withoutDataPath, mode: 'productivity', aiDocEnabled: true })
      expect(out).toContain('KNOWLEDGE BASE WIKI OVERVIEW')
    } finally {
      spy.mockRestore()
      fs.rmSync(registryFile, { force: true })
    }
  })
})

describe('systemPromptBuilder AI Doc gating', () => {
  it('aiDocEnabled true: explains the three folders and forbids writing to kb_source and wiki', () => {
    const out = build({ ...baseConfig, mode: 'productivity', aiDocEnabled: true })
    expect(out).toContain('AI DOC PATH')
    expect(out).toContain('general')
    expect(out).toContain('kb_source')
    expect(out).toContain('wiki')
    expect(out).toContain('NEVER write into kb_source/ or wiki/')
    expect(out).toContain('  - Reports/')
    expect(out).not.toContain('  - kb_source/\n')
    expect(out).not.toContain('  - wiki/\n')
  })

  it('aiDocEnabled false: no AI Doc content anywhere, all files go to the artifact path', () => {
    const out = build({ ...baseConfig, mode: 'productivity', aiDocEnabled: false })
    expect(out).not.toContain('AI DOC PATH')
    expect(out).not.toContain('clankit_doc')
    expect(out).not.toContain('kb_source')
    expect(out).not.toContain('wiki/')
    expect(out).toContain('ARTIFACT PATH')
    expect(out).toContain('Every generated file')
    expect(out).toContain(baseConfig.artifactPath)
  })

  it('aiDocEnabled absent is byte-equal to aiDocEnabled true', () => {
    const absent = build({ ...baseConfig, mode: 'productivity' })
    const on = build({ ...baseConfig, mode: 'productivity', aiDocEnabled: true })
    expect(absent).toBe(on)
    expect(absent).toContain('kb_source')
  })

  it('productivity mode without chatWorkingPath injects no WORKING FOLDER section', () => {
    const out = build({ ...baseConfig, mode: 'productivity', aiDocEnabled: true })
    expect(out).not.toContain('WORKING FOLDER FOR THIS CHAT')
  })

  it('DOC_PATH / obsidianVaultPath overrides do not introduce a second general/ root', () => {
    const other = path.join(tmpRoot, 'other_root')
    const prev = process.env.DOC_PATH
    process.env.DOC_PATH = other
    try {
      const out = build({ ...baseConfig, mode: 'productivity', obsidianVaultPath: other })
      expect(out).toContain(path.join(docRoot, 'general'))
      expect(out).not.toContain(other)
    } finally {
      if (prev === undefined) delete process.env.DOC_PATH
      else process.env.DOC_PATH = prev
    }
  })

  it('chat mode (default) is byte-equivalent to omitting mode', () => {
    const a = build(baseConfig)
    const b = build({ ...baseConfig, mode: 'chat' })
    expect(b).toBe(a)
  })

  it('injects wiki recall only in AI Doc-enabled productivity mode after the folder list', async () => {
    const registryFile = registryPathFor(baseConfig.dataPath, docRoot)
    const productivity = { ...baseConfig, mode: 'productivity' }
    const baseline = build(productivity)
    try {
      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {
        'wiki/en/source.md': { hash: 'x', type: 'summary', updated: '2026-11-04' }
      } })
      const on = build({ ...productivity, aiDocEnabled: true })
      expect(on).toContain('KNOWLEDGE BASE WIKI OVERVIEW')
      expect(on).toContain(`${docRoot.replace(/\\/g, '/')}/wiki/en/index.md`)
      expect(on.indexOf('KNOWLEDGE BASE WIKI OVERVIEW')).toBeGreaterThan(on.indexOf('AI-maintained knowledge pages'))
      expect(on.indexOf('KNOWLEDGE BASE WIKI OVERVIEW')).toBeLessThan(on.indexOf('All readable documents live under'))
      expect(build(productivity)).toBe(on)
      expect(build({ ...productivity, aiDocEnabled: false })).not.toContain('wiki/index.md')
      expect(build({ ...baseConfig, mode: 'chat', aiDocEnabled: true })).not.toContain('wiki/index.md')
      expect(build(baseConfig)).not.toContain('wiki/index.md')

      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {} })
      expect(build(productivity)).toBe(baseline)
    } finally {
      fs.rmSync(registryFile, { force: true })
    }
  })

  it('points the recall at the wiki language of the configured language, else the first available one', async () => {
    const registryFile = registryPathFor(baseConfig.dataPath, docRoot)
    const productivity = { ...baseConfig, mode: 'productivity' }
    const posixRoot = docRoot.replace(/\\/g, '/')
    const baseline = build(productivity)
    const baselineZh = build({ ...productivity, language: 'zh' })
    try {
      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {
        'wiki/en/a.md': { hash: 'x', type: 'summary', updated: '2026-11-04' },
        'wiki/zh/a.md': { hash: 'y', type: 'concept', updated: '2026-11-05' },
        'wiki/zh/b.md': { hash: 'z', type: 'concept', updated: '2026-11-06' }
      } })
      const zh = build({ ...productivity, language: 'zh' })
      expect(zh).toContain(`Location: ${posixRoot}/wiki/zh\n`)
      expect(zh).toContain(`${posixRoot}/wiki/zh/index.md`)
      expect(zh).toContain('Pages: 2 (concept: 2)')
      expect(zh).not.toContain('/wiki/en/index.md')
      const en = build(productivity)
      expect(en).toContain(`${posixRoot}/wiki/en/index.md`)
      expect(en).toContain('Pages: 1 (summary: 1)')

      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {
        'wiki/zh/a.md': { hash: 'y', type: 'concept', updated: '2026-11-05' }
      } })
      expect(build(productivity)).toContain(`${posixRoot}/wiki/zh/index.md`)
      expect(build({ ...productivity, aiDocEnabled: false })).not.toContain('KNOWLEDGE BASE WIKI OVERVIEW')

      await writeRegistry(registryFile, { version: 1, sources: {}, pages: {} })
      expect(build({ ...productivity, language: 'zh' })).toBe(baselineZh)
      expect(build(productivity)).toBe(baseline)
    } finally {
      fs.rmSync(registryFile, { force: true })
    }
  })
})
