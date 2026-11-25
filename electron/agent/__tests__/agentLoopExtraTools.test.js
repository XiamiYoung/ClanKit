// @vitest-environment node
import { describe, it, expect } from 'vitest'
import os from 'os'
import path from 'path'

const { AgentLoop } = require('../agentLoop')
const { ToolRegistry } = require('../tools/ToolRegistry')

function makeTool(name, onExecute = () => 'ok') {
  return {
    name,
    definition: () => ({ name, description: `${name} tool`, input_schema: { type: 'object', properties: {} } }),
    execute: async (id, params) => ({ content: [{ type: 'text', text: onExecute(params) }], details: {} }),
  }
}

describe('ToolRegistry.useOnly / addTools', () => {
  it('useOnly leaves exactly the given tools', () => {
    const reg = new ToolRegistry()
    expect(reg.getToolDefinitions().length).toBeGreaterThan(1)
    reg.useOnly({ wiki: makeTool('wiki') })
    expect(reg.getToolDefinitions().map(d => d.name)).toEqual(['wiki'])
  })

  it('addTools keeps existing tools and overrides same-name entries', async () => {
    const reg = new ToolRegistry()
    const before = reg.getToolDefinitions().map(d => d.name)
    reg.addTools({ wiki: makeTool('wiki', () => 'first') })
    reg.addTools({ wiki: makeTool('wiki', () => 'second') })
    const after = reg.getToolDefinitions().map(d => d.name)
    expect(after).toEqual([...before, 'wiki'])
    const res = await reg.execute('wiki', {})
    expect(res.content[0].text).toBe('second')
  })
})

// Scripted OpenAI-format client: each call to create() returns the next script step
// as an async-iterable of streaming chunks, and records the params it was given.
function makeFakeClient(script) {
  const calls = []
  return {
    calls,
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params)
          const step = script[Math.min(calls.length - 1, script.length - 1)]
          const chunks = step.toolCall
            ? [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: step.toolCall.name, arguments: JSON.stringify(step.toolCall.args || {}) } }] }, finish_reason: 'tool_calls' }] }]
            : [{ choices: [{ delta: { content: step.text }, finish_reason: 'stop' }] }]
          return (async function* () { for (const c of chunks) yield c })()
        },
      },
    },
  }
}

function makeLoop(extra, script) {
  const loop = new AgentLoop({
    provider: { type: 'openrouter', apiKey: 'k', baseURL: 'http://localhost:1', model: 'm' },
    customModel: 'm',
    modelContextWindow: 100000,
    dataPath: os.tmpdir(),
    DoCPath: path.join(os.tmpdir(), 'aidoc-extra-tools-test'),
    ...extra,
  })
  const client = makeFakeClient(script)
  loop.anthropicClient.getClient = () => client
  return { loop, client }
}

async function runLoop(loop, httpTools = []) {
  const chunks = []
  await loop.run([{ role: 'user', content: 'go' }], [], [], c => chunks.push(c), undefined, {}, [{ id: 's1', name: 'srv' }], httpTools)
  return chunks
}

const toolNames = (params) => (params.tools || []).map(t => t.function.name)

describe('AgentLoop extraTools / exclusiveTools', () => {
  it('exclusive mode shows the model only the extra tools and runs them', async () => {
    let executed = null
    const wiki = makeTool('wiki', (p) => { executed = p; return 'WIKI-RESULT' })
    const { loop, client } = makeLoop(
      { extraTools: { wiki }, exclusiveTools: true },
      [{ toolCall: { name: 'wiki', args: { q: 1 } } }, { text: 'done' }],
    )
    const chunks = await runLoop(loop, [{ id: 'h1', type: 'http', name: 'h', endpoint: 'http://x' }])
    expect(toolNames(client.calls[0])).toEqual(['wiki'])
    expect(executed).toEqual({ q: 1 })
    const secondMsgs = client.calls[1].messages
    expect(JSON.stringify(secondMsgs)).toContain('WIKI-RESULT')
    expect(chunks.some(c => c.type === 'tool_result' && c.name === 'wiki')).toBe(true)
  })

  it('exclusive mode rejects a hallucinated tool name without executing it', async () => {
    const wiki = makeTool('wiki')
    const { loop, client } = makeLoop(
      { extraTools: { wiki }, exclusiveTools: true },
      [{ toolCall: { name: 'dispatch_subagent', args: { task: 'x' } } }, { text: 'done' }],
    )
    loop.subAgentManager.dispatch = async () => { throw new Error('must not run') }
    const chunks = await runLoop(loop)
    const res = chunks.find(c => c.type === 'tool_result' && c.name === 'dispatch_subagent')
    expect(JSON.stringify(res.result)).toContain('Tool not available in this run')
    expect(JSON.stringify(client.calls[1].messages)).toContain('Tool not available in this run')
  })

  it('exclusive mode also rejects a registry tool that is not in extraTools', async () => {
    const { loop, client } = makeLoop(
      { extraTools: { wiki: makeTool('wiki') }, exclusiveTools: true },
      [{ toolCall: { name: 'execute_shell', args: { command: 'echo hi' } } }, { text: 'done' }],
    )
    const chunks = await runLoop(loop)
    const res = chunks.find(c => c.type === 'tool_result' && c.name === 'execute_shell')
    expect(JSON.stringify(res.result)).toContain('Tool not available in this run')
    expect(client.calls.length).toBe(2)
  })

  it('without the config fields the default tool set is unchanged and extras are not applied', async () => {
    const { loop, client } = makeLoop({}, [{ text: 'hi' }])
    await runLoop(loop, [{ id: 'h1', type: 'http', name: 'h', endpoint: 'http://x' }])
    const names = toolNames(client.calls[0])
    expect(loop._exclusiveToolNames).toBeNull()
    expect(names).toEqual(expect.arrayContaining(['dispatch_subagent', 'dispatch_subagents', 'background_task', 'submit_plan', 'search_mcp_tools', 'http_h1', 'execute_shell']))
    expect(loop._isToolAllowed('anything')).toBe(true)
  })

  it('non-exclusive extraTools are added next to the default tools', async () => {
    const { loop, client } = makeLoop({ extraTools: { wiki: makeTool('wiki') } }, [{ text: 'hi' }])
    await runLoop(loop)
    const names = toolNames(client.calls[0])
    expect(names).toContain('wiki')
    expect(names).toContain('dispatch_subagent')
    expect(names).toContain('execute_shell')
  })
})
