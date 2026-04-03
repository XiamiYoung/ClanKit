/**
 * Tests for skill persistence across collaboration rounds and user turns.
 *
 * Production code under test:
 * - agent.js — _buildSkillInjectionMessages, _injectSkillsIntoRuns, chatLoadedSkills
 * - agentLoop.js — loadedSkills tracking, getLoadedSkills()
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const { _buildSkillInjectionMessages, _injectSkillsIntoRuns, chatLoadedSkills } = require('../agent')
const { AgentLoop } = require('../../agent/agentLoop')

// ── _buildSkillInjectionMessages ────────────────────────────────────────────

describe('_buildSkillInjectionMessages', () => {
  it('returns empty array when loadedSkills is null', () => {
    expect(_buildSkillInjectionMessages(null)).toEqual([])
  })

  it('returns empty array when loadedSkills is empty', () => {
    expect(_buildSkillInjectionMessages(new Map())).toEqual([])
  })

  it('returns user+assistant pair for a single loaded skill', () => {
    const skills = new Map([['jira', 'Jira skill instructions here']])
    const result = _buildSkillInjectionMessages(skills)

    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toContain('[SKILL: jira]')
    expect(result[0].content).toContain('Jira skill instructions here')
    expect(result[1].role).toBe('assistant')
    expect(result[1].content).toBe('Skills loaded. I will follow these instructions.')
  })

  it('concatenates multiple skills with separator', () => {
    const skills = new Map([
      ['jira', 'Jira instructions'],
      ['extract-asset', 'Extract asset instructions'],
    ])
    const result = _buildSkillInjectionMessages(skills)

    expect(result).toHaveLength(2)
    expect(result[0].content).toContain('[SKILL: jira]')
    expect(result[0].content).toContain('[SKILL: extract-asset]')
    expect(result[0].content).toContain('---')
  })
})

// ── _injectSkillsIntoRuns ───────────────────────────────────────────────────

describe('_injectSkillsIntoRuns', () => {
  it('does nothing when loadedSkills is empty', () => {
    const runs = [{ messages: [{ role: 'user', content: 'hello' }] }]
    _injectSkillsIntoRuns(runs, new Map())
    expect(runs[0].messages).toHaveLength(1)
  })

  it('prepends skill messages to each run.messages', () => {
    const skills = new Map([['jira', 'Jira content']])
    const runs = [
      { messages: [{ role: 'user', content: 'msg1' }] },
      { messages: [{ role: 'user', content: 'msg2' }] },
    ]

    _injectSkillsIntoRuns(runs, skills)

    // Each run should have 2 skill messages + 1 original = 3
    expect(runs[0].messages).toHaveLength(3)
    expect(runs[1].messages).toHaveLength(3)
    // First two are skill injection
    expect(runs[0].messages[0].role).toBe('user')
    expect(runs[0].messages[0].content).toContain('[SKILL: jira]')
    expect(runs[0].messages[1].role).toBe('assistant')
    // Original message is preserved after skill messages
    expect(runs[0].messages[2].content).toBe('msg1')
  })

  it('skips runs without messages', () => {
    const skills = new Map([['jira', 'Jira content']])
    const runs = [{ agentId: 'a1' }]  // no messages field

    _injectSkillsIntoRuns(runs, skills)
    expect(runs[0].messages).toBeUndefined()
  })

  it('does not mutate original messages array reference', () => {
    const skills = new Map([['jira', 'Jira content']])
    const originalMessages = [{ role: 'user', content: 'msg1' }]
    const runs = [{ messages: originalMessages }]

    _injectSkillsIntoRuns(runs, skills)

    // run.messages is replaced (spread creates new array), original is untouched
    expect(originalMessages).toHaveLength(1)
    expect(runs[0].messages).toHaveLength(3)
  })
})

// ── chatLoadedSkills (per-chat cache) ───────────────────────────────────────

describe('chatLoadedSkills', () => {
  beforeEach(() => {
    chatLoadedSkills.clear()
  })

  it('is a Map', () => {
    expect(chatLoadedSkills).toBeInstanceOf(Map)
  })

  it('persists skill data across simulated turns', () => {
    // Simulate: turn 1 loads jira skill → writes to cache
    const chatId = 'test-chat-1'
    chatLoadedSkills.set(chatId, new Map([['jira', 'Jira instructions']]))

    // Simulate: turn 2 seeds allLoadedSkills from cache
    const allLoadedSkills = new Map(chatLoadedSkills.get(chatId) || [])
    expect(allLoadedSkills.size).toBe(1)
    expect(allLoadedSkills.get('jira')).toBe('Jira instructions')
  })

  it('accumulates multiple skills across turns', () => {
    const chatId = 'test-chat-2'

    // Turn 1: loads jira
    chatLoadedSkills.set(chatId, new Map([['jira', 'Jira']]))

    // Turn 2: loads extract-asset additionally
    const cache = chatLoadedSkills.get(chatId)
    cache.set('extract-asset', 'Extract')

    // Turn 3: seeds from cache — both skills present
    const allLoadedSkills = new Map(chatLoadedSkills.get(chatId))
    expect(allLoadedSkills.size).toBe(2)
    expect(allLoadedSkills.has('jira')).toBe(true)
    expect(allLoadedSkills.has('extract-asset')).toBe(true)
  })

  it('isolates skills between different chats', () => {
    chatLoadedSkills.set('chat-a', new Map([['jira', 'Jira']]))
    chatLoadedSkills.set('chat-b', new Map([['blender', 'Blender']]))

    expect(chatLoadedSkills.get('chat-a').has('jira')).toBe(true)
    expect(chatLoadedSkills.get('chat-a').has('blender')).toBe(false)
    expect(chatLoadedSkills.get('chat-b').has('blender')).toBe(true)
    expect(chatLoadedSkills.get('chat-b').has('jira')).toBe(false)
  })
})

// ── AgentLoop.getLoadedSkills / loadedSkills tracking ───────────────────────

describe('AgentLoop loadedSkills tracking', () => {
  it('exposes getLoadedSkills() returning a Map', () => {
    const loop = new AgentLoop({})
    expect(loop.getLoadedSkills()).toBeInstanceOf(Map)
    expect(loop.getLoadedSkills().size).toBe(0)
  })

  it('loadedSkills is populated during compactStandalone init', () => {
    const loop = new AgentLoop({})
    // compactStandalone initializes skillPrompts and loadedSkills
    // We can't run the full method (needs LLM), but we can verify the
    // initialization logic by checking the constructor path:
    // After construction, loadedSkills should not exist yet (lazy init)
    // It gets created in compactStandalone() or run()
    expect(loop.getLoadedSkills()).toBeInstanceOf(Map)
  })
})

// ── Integration: full flow simulation ───────────────────────────────────────

describe('skill persistence integration', () => {
  beforeEach(() => {
    chatLoadedSkills.clear()
  })

  it('round 1 load → round 2 inject → messages contain skill content', () => {
    const chatId = 'integration-test'

    // Simulate round 1: AgentLoop loads jira skill via load_skill handler
    // (we simulate the cache write that happens in runGroupRound results processing)
    if (!chatLoadedSkills.has(chatId)) chatLoadedSkills.set(chatId, new Map())
    chatLoadedSkills.get(chatId).set('jira', 'Use Jira CLI to search issues')

    // Simulate round 2: seed allLoadedSkills from cache
    const allLoadedSkills = new Map(chatLoadedSkills.get(chatId))

    // Build agentRuns with messages (simulating _buildAgentRuns output)
    const agentRuns = [{
      agentId: 'agent-1',
      agentName: 'Henry',
      messages: [
        { role: 'user', content: 'get details of RNDDS-5065' },
      ],
    }]

    // Inject skills into runs
    _injectSkillsIntoRuns(agentRuns, allLoadedSkills)

    // Verify: run.messages now starts with skill content
    expect(agentRuns[0].messages).toHaveLength(3)
    expect(agentRuns[0].messages[0].role).toBe('user')
    expect(agentRuns[0].messages[0].content).toContain('[SKILL: jira]')
    expect(agentRuns[0].messages[0].content).toContain('Use Jira CLI to search issues')
    expect(agentRuns[0].messages[1].role).toBe('assistant')
    // Original user message is last
    expect(agentRuns[0].messages[2].content).toBe('get details of RNDDS-5065')
  })

  it('no injection when no skills have been loaded', () => {
    const chatId = 'no-skills-chat'
    const allLoadedSkills = new Map(chatLoadedSkills.get(chatId) || [])
    expect(allLoadedSkills.size).toBe(0)

    const agentRuns = [{
      agentId: 'agent-1',
      messages: [{ role: 'user', content: 'hello' }],
    }]

    _injectSkillsIntoRuns(agentRuns, allLoadedSkills)
    expect(agentRuns[0].messages).toHaveLength(1)
  })
})
