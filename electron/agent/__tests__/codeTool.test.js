import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
const { AgentLoop } = require('../agentLoop')
const { buildCodeToolDescription } = require('../tools/CodeToolRunner')

function makeLoop(sandboxConfig = {}, extra = {}) {
  return new AgentLoop({
    provider: { type: 'openai', apiKey: 'test-key', baseURL: 'http://localhost:1/v1' },
    sandboxConfig: { defaultMode: 'sandbox', dangerBlockList: [], sandboxAllowList: [], ...sandboxConfig },
    ...extra,
  })
}

const echoTool = { id: 'echo', name: 'Echo', description: 'Echo the input', type: 'code', language: 'javascript', code: 'return input + "!"' }

describe('AgentLoop code tools', () => {
  it('_executeCodeTool returns the code result', async () => {
    const loop = makeLoop()
    const result = await loop._executeCodeTool(echoTool, { input: 'hi' })
    expect(result.success).toBe(true)
    expect(result.result).toBe('"hi!"')
  })

  it('a large result or many log lines still reach the model with an intentional truncation marker', async () => {
    const { serializeToolResult } = require('../messageConverter')
    const loop = makeLoop()
    const noisy = await loop._executeCodeTool({ ...echoTool, code: "for (let i = 0; i < 200; i++) console.log('x'.repeat(600)); return 'ok'" }, { input: '' })
    const noisyText = serializeToolResult(noisy, 'code_echo')
    expect(noisyText).toContain('ok')
    expect(noisyText).not.toContain('Result truncated')
    const huge = await loop._executeCodeTool({ ...echoTool, code: "return '\"'.repeat(5e6)" }, { input: '' })
    const hugeText = serializeToolResult(huge, 'code_echo')
    expect(hugeText).toContain('truncated:')
    expect(hugeText).not.toContain('Result truncated')
  })

  it('_executeCodeTool returns an error object when the code throws', async () => {
    const loop = makeLoop()
    const result = await loop._executeCodeTool({ ...echoTool, code: "throw new Error('nope')" }, { input: '' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('nope')
  })

  it('_checkPermission asks in sandbox mode and shows the code to run', async () => {
    const loop = makeLoop()
    const chunks = []
    const pending = loop._checkPermission('code_echo', { input: 'hi', code: echoTool.code }, chunk => {
      chunks.push(chunk)
      if (chunk.type === 'permission_request') loop._pendingPermissions.get(chunk.blockId)('allow_once')
    })
    const decision = await pending
    expect(chunks.find(c => c.type === 'permission_request').toolInput.code).toBe(echoTool.code)
    expect(decision.decision).toBe('allow')
  })

  it('_checkPermission rejects when the user rejects', async () => {
    const loop = makeLoop()
    const decision = await loop._checkPermission('code_echo', { input: 'hi', code: 'x' }, chunk => {
      if (chunk.type === 'permission_request') loop._pendingPermissions.get(chunk.blockId)('reject')
    })
    expect(decision.decision).toBe('reject')
  })

  it('_checkPermission allows without asking when the allow list has code_echo', async () => {
    const loop = makeLoop({ sandboxAllowList: [{ pattern: 'code_echo' }] })
    const chunks = []
    const decision = await loop._checkPermission('code_echo', { input: 'hi', code: 'x' }, c => chunks.push(c))
    expect(decision.decision).toBe('allow')
    expect(chunks).toEqual([])
  })

  it('_checkPermission blocks danger-listed code tools even in all_permissions mode', async () => {
    const loop = makeLoop({ defaultMode: 'all_permissions', dangerBlockList: [{ id: 'd1', pattern: 'code_*', description: 'no code tools' }] })
    const decision = await loop._checkPermission('code_echo', { input: 'hi', code: 'x' }, () => {})
    expect(decision.decision).toBe('block')
  })

  it('the model-facing description does not embed the source', () => {
    const description = buildCodeToolDescription(echoTool)
    expect(description).toContain('[Code: JavaScript]')
    expect(description).toContain('Echo the input')
    expect(description).not.toContain(echoTool.code)
  })

  it('no longer returns the reference-snippet stub', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'agentLoop.js'), 'utf8')
    expect(source).not.toContain('reference code snippet')
  })
})
