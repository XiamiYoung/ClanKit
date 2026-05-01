import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const { buildSystemPrompt } = require('../systemPromptBuilder')

const baseConfig = {
  language: 'en',
  dataPath: '/tmp/clankit',
  DoCPath: '/tmp/clankit/clankit_doc',
  artifactPath: '/tmp/clankit/artifact'
}

const baseAgent = {
  systemAgentId: 'a1',
  systemAgentName: 'Clank',
  systemAgentDescription: 'Generalist',
  systemAgentPrompt: 'You are Clank.'
}

describe('systemPromptBuilder mode parameter', () => {
  it('chat mode (default) is byte-equivalent to omitting mode', () => {
    const a = buildSystemPrompt(baseConfig, [], [], [], [], baseAgent)
    const b = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    expect(b).toBe(a)
  })

  it('chat mode contains CHARACTER ENFORCEMENT block', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    expect(out).toContain('CHARACTER ENFORCEMENT')
  })

  it('productivity mode does NOT contain CHARACTER ENFORCEMENT block', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'productivity' }, [], [], [], [], baseAgent)
    expect(out).not.toContain('CHARACTER ENFORCEMENT')
  })
})

describe('Speech DNA in productivity mode', () => {
  // readSpeechDna reads from AgentStore (SQLite via better-sqlite3). Since
  // better-sqlite3 is compiled for Electron's Node version and cannot load in
  // Vitest, we monkey-patch both the AgentStore singleton and ds.paths() so
  // the inner require() calls inside readSpeechDna work without native SQLite.

  const AgentStore = require('../AgentStore')
  const ds = require('../../lib/dataStore')
  let origGetInstance
  let origPaths

  const fakeSpeechDna = {
    catchphrases: ['哈哈', 'lol'],
    avg_sentence_length: 12,
    emoji_usage: 'frequent'
  }

  beforeAll(() => {
    origPaths = ds.paths
    ds.paths = () => ({ DATA_DIR: '/tmp/fake-data-dir' })

    origGetInstance = AgentStore.getInstance
    AgentStore.getInstance = () => ({
      getImportArtifacts: (id) => id === 'a1' ? { speechDna: fakeSpeechDna } : null
    })
  })

  afterAll(() => {
    AgentStore.getInstance = origGetInstance
    ds.paths = origPaths
  })

  it('chat mode injects Speech DNA when present', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, mode: 'chat' },
      [], [], [], [], baseAgent
    )
    // The Speech DNA block uses formatSpeechDnaBlock; assert on its unconditional header.
    expect(out).toContain('## SPEECH DNA — HARD CONSTRAINTS (overrides everything below)')
  })

  it('productivity mode skips Speech DNA even when speech DNA is available', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, mode: 'productivity' },
      [], [], [], [], baseAgent
    )
    expect(out).not.toContain('## SPEECH DNA — HARD CONSTRAINTS (overrides everything below)')
  })
})

describe('TOOL USE HARD RULE', () => {
  it('productivity mode contains TOOL USE — HARD RULE block', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'productivity' }, [], [], [], [], baseAgent)
    expect(out).toContain('TOOL USE — HARD RULE')
    expect(out).toContain('PRODUCTIVITY MODE')
    // ordering: TOOL USE block must appear BEFORE the persona/identity line
    const toolUseIdx = out.indexOf('TOOL USE — HARD RULE')
    const personaIdx = out.indexOf('You are "Clank"')
    expect(toolUseIdx).toBeGreaterThan(-1)
    expect(personaIdx).toBeGreaterThan(-1)
    expect(toolUseIdx).toBeLessThan(personaIdx)
  })

  it('chat mode does NOT contain TOOL USE — HARD RULE block', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    expect(out).not.toContain('TOOL USE — HARD RULE')
  })

  it('productivity mode in zh language uses Chinese hard rule', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, language: 'zh', mode: 'productivity' },
      [], [], [], [], baseAgent
    )
    expect(out).toContain('工具使用 — 硬性规则')
  })
})
