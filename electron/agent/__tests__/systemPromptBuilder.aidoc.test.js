import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

const { buildSystemPrompt } = require('../systemPromptBuilder')

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
})
