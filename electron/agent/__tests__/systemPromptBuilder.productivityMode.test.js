import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'

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
    expect(out).toContain('PROFESSIONAL MODE')
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

describe('Working folder context (productivity mode)', () => {
  it('productivity mode injects WORKING FOLDER section when chatWorkingPath is set', () => {
    const tmp = path.join(process.env.TEMP || '/tmp', `t9-${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'a.md'), 'x')
    try {
      const out = buildSystemPrompt(
        { ...baseConfig, mode: 'productivity', chatWorkingPath: tmp },
        [], [], [], [], baseAgent
      )
      expect(out).toContain('WORKING FOLDER FOR THIS CHAT')
      expect(out).toContain(tmp)
      expect(out).toContain('a.md')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('productivity mode without explicit chatWorkingPath defaults to DoCPath', () => {
    const tmp = path.join(process.env.TEMP || '/tmp', `t9-default-${Date.now()}`)
    fs.mkdirSync(tmp, { recursive: true })
    fs.writeFileSync(path.join(tmp, 'doc.md'), 'x')
    try {
      const out = buildSystemPrompt(
        { ...baseConfig, mode: 'productivity', DoCPath: tmp },
        [], [], [], [], baseAgent
      )
      expect(out).toContain('WORKING FOLDER FOR THIS CHAT')
      expect(out).toContain(tmp)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('chat mode does NOT inject WORKING FOLDER section even with chatWorkingPath set', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, mode: 'chat', chatWorkingPath: '/tmp/anything' },
      [], [], [], [], baseAgent
    )
    expect(out).not.toContain('WORKING FOLDER FOR THIS CHAT')
  })
})

describe('Working on this task discipline section', () => {
  it('productivity mode contains "Working on this task" section in English', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'productivity' }, [], [], [], [], baseAgent)
    expect(out).toContain('Working on this task')
    expect(out).toMatch(/DO it|do it/)
  })

  it('productivity mode in zh language uses Chinese section', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, language: 'zh', mode: 'productivity' },
      [], [], [], [], baseAgent
    )
    expect(out).toContain('当前任务工作守则')
  })

  it('chat mode does NOT contain that section', () => {
    const out = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    expect(out).not.toContain('Working on this task')
    expect(out).not.toContain('当前任务工作守则')
  })
})

describe('MODE TRANSITION marker', () => {
  it('appended when modeTransitionPending is set', () => {
    const out = buildSystemPrompt(
      {
        ...baseConfig,
        mode: 'productivity',
        modeTransitionPending: { from: 'chat', to: 'productivity', at: 1700000000000 }
      },
      [], [], [], [], baseAgent
    )
    expect(out).toContain('MODE TRANSITION')
    expect(out).toContain('switched this chat from chat to productivity')
    // ISO date includes the year derived from the at timestamp
    expect(out).toMatch(/2023-1[12]|2024-/)  // 1700000000000 → ~Nov 2023; loose to handle timezone
  })

  it('absent when modeTransitionPending is null', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, mode: 'productivity', modeTransitionPending: null },
      [], [], [], [], baseAgent
    )
    expect(out).not.toContain('MODE TRANSITION')
  })

  it('absent when modeTransitionPending is undefined (default)', () => {
    const out = buildSystemPrompt(
      { ...baseConfig, mode: 'productivity' },
      [], [], [], [], baseAgent
    )
    expect(out).not.toContain('MODE TRANSITION')
  })

  it('also fires in chat mode (when transitioning back to chat)', () => {
    const out = buildSystemPrompt(
      {
        ...baseConfig,
        mode: 'chat',
        modeTransitionPending: { from: 'productivity', to: 'chat', at: 1700000000000 }
      },
      [], [], [], [], baseAgent
    )
    expect(out).toContain('switched this chat from productivity to chat')
  })

  it('uses Date.now fallback when at is missing', () => {
    const out = buildSystemPrompt(
      {
        ...baseConfig,
        mode: 'productivity',
        modeTransitionPending: { from: 'chat', to: 'productivity' }
      },
      [], [], [], [], baseAgent
    )
    expect(out).toContain('MODE TRANSITION')
  })
})

describe('Coding mode block removed', () => {
  it('CODING PROJECT PATH is never present, regardless of mode or config', () => {
    const a = buildSystemPrompt({ ...baseConfig, mode: 'chat', codingMode: true, chatWorkingPath: '/x' }, [], [], [], [], baseAgent)
    const b = buildSystemPrompt({ ...baseConfig, mode: 'productivity', chatWorkingPath: '/x' }, [], [], [], [], baseAgent)
    expect(a).not.toContain('CODING PROJECT PATH')
    expect(b).not.toContain('CODING PROJECT PATH')
  })

  it('chat mode prompt is deterministic across calls (no time-dependent fields)', () => {
    const a = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    const b = buildSystemPrompt({ ...baseConfig, mode: 'chat' }, [], [], [], [], baseAgent)
    expect(b).toBe(a)
  })
})
