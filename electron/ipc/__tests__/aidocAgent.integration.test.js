// @vitest-environment node

import { createServer } from 'node:http'
import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'

const { registerHandlers } = require('../aidoc')
const { readRegistry, registryPathFor } = require('../../lib/aidocRegistry')

const SOURCE = 'kb_source/note.md'
const SOURCE_TEXT = 'The garden has three apple trees.'
const pageText = () => `---\ntype: summary\ntitle: Garden note\nsources:\n  - ${SOURCE}\nupdated: 2026-11-24\n---\n\n${SOURCE_TEXT}\n`

function toolCall(id, args) {
  return { delta: { tool_calls: [{
    index: 0, id, type: 'function',
    function: { name: 'aidoc_wiki', arguments: JSON.stringify(args) },
  }] }, finish_reason: 'tool_calls' }
}

it.each([['en', 'English'], ['zh', 'Simplified Chinese']])('runs the real restricted ingest agent for the %s wiki against a local OpenAI-compatible stream', async (lang, languageName) => {
  const PAGE = `wiki/${lang}/note.md`
  const PAGE_TEXT = pageText()
  const calls = []
  const steps = [
    toolCall('read_note', { operation: 'read_source', path: SOURCE }),
    toolCall('write_note', { operation: 'write_wiki', path: PAGE, content: PAGE_TEXT }),
    { delta: { content: 'Wrote a summary of the garden note.' }, finish_reason: 'stop' },
  ]
  const server = createServer(async (request, response) => {
    try {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      calls.push({ path: request.url, authorization: request.headers.authorization, body })
      const choice = steps[calls.length - 1]
      if (!choice) throw new Error('Unexpected request after the scripted completion')
      const chunk = { id: 'local-completion', object: 'chat.completion.chunk', choices: [{ index: 0, ...choice }] }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: error.message } }))
    }
  })

  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-real-agent-'))
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const root = path.join(dataDir, 'vault')
    await fs.mkdir(path.join(root, 'kb_source'), { recursive: true })
    await fs.writeFile(path.join(root, SOURCE), SOURCE_TEXT)
    const baseURL = `http://127.0.0.1:${server.address().port}/v1`
    const config = {
      language: lang,
      DoCPath: root,
      defaultProvider: 'local',
      providers: [
        { id: 'other', type: 'custom', model: 'other-model', apiKey: 'other-key', baseURL },
        { id: 'local', type: 'custom', model: 'main-model', toolModel: 'utility-model', apiKey: 'local-key', baseURL,
          modelSettings: { 'main-model': { contextWindow: 48000, maxOutputTokens: 12000 } } },
      ],
    }
    const handlers = new Map()
    registerHandlers({ handle: (key, handler) => handlers.set(key, handler) }, {
      paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: path.join(dataDir, 'config.json') }),
      readJSONAsync: async () => config,
    })
    const sender = { send: vi.fn(), isDestroyed: () => false }
    const invoke = (channel, options = {}) => handlers.get(`aidoc:${channel}`)({ sender }, { root, ...options })

    await expect(invoke('ingest-plan')).resolves.toMatchObject({ providerReady: true, sources: [{ rel: SOURCE }] })
    await expect(invoke('ingest-run', { requestId: 'loopback', languages: [lang] })).resolves.toMatchObject({
      success: true, done: [SOURCE], failed: [], stopped: false,
    })

    expect(calls).toHaveLength(3)
    for (const call of calls) {
      expect(call.path).toBe('/v1/chat/completions')
      expect(call.authorization).toBe('Bearer local-key')
      expect(call.body).toMatchObject({ stream: true, model: 'main-model', max_tokens: 12000 })
      expect(call.body.tools.map(tool => tool.function.name)).toEqual(['aidoc_wiki'])
    }
    const prompt = JSON.stringify(calls[0].body.messages)
    expect(prompt).toContain(`Write wiki page prose in ${languageName}`)
    expect(prompt).toContain('The application updates index.md.')
    expect(prompt).toContain(`only under wiki/${lang}/`)
    expect(calls[1].body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'tool', tool_call_id: 'read_note', content: expect.stringContaining(SOURCE_TEXT) }),
    ]))
    expect(sender.send).toHaveBeenCalledWith('aidoc:ingest-progress', expect.objectContaining({
      requestId: 'loopback', type: 'action', action: 'write_wiki', rel: SOURCE,
    }))
    await expect(fs.readFile(path.join(root, PAGE), 'utf8')).resolves.toBe(PAGE_TEXT)
    await expect(fs.readFile(path.join(root, `wiki/${lang}/index.md`), 'utf8')).resolves.toContain('[[note]]')
    await expect(readRegistry(registryPathFor(dataDir, root))).resolves.toMatchObject({
      sources: { [SOURCE]: { pages: [PAGE], langs: { [lang]: { pages: [PAGE] } } } },
      pages: { [PAGE]: { title: 'Garden note', type: 'summary', sources: [SOURCE] } },
    })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})

it('classifies Wiki bodies through the configured provider and reuses the persisted topics', async () => {
  const calls = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const { messages } = JSON.parse(Buffer.concat(chunks))
    const payload = JSON.parse(messages[1].content)
    calls.push(payload)
    const categories = Object.fromEntries(payload.articles.map(({ id, body }) => [id,
      body.includes('satellite') ? 'Orbital Mechanics' : 'Database Design']))
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(categories) } }] }))
  })
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-topics-ipc-'))
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const root = path.join(dataDir, 'vault')
    const wiki = path.join(root, 'wiki', 'en')
    await fs.mkdir(wiki, { recursive: true })
    await fs.writeFile(path.join(wiki, 'notes.md'), '---\nsources: [kb_source/interview/a.md]\n---\n\nA satellite enters a polar orbit.')
    const config = { DoCPath: root, defaultProvider: 'local', providers: [
      { id: 'local', type: 'custom', model: 'main-model', apiKey: 'fixture-key', baseURL: `http://127.0.0.1:${server.address().port}/v1` },
    ] }
    const handlers = new Map()
    registerHandlers({ handle: (key, fn) => handlers.set(key, fn) }, {
      paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: 'config.json' }), readJSONAsync: async () => config,
    })
    const invoke = channel => handlers.get(`aidoc:${channel}`)({}, { root })
    await expect(invoke('wiki-pages')).resolves.toMatchObject({ pages: [{ topics: [], topicsChecked: false }] })
    expect(calls).toHaveLength(0)
    await expect(invoke('wiki-categorize')).resolves.toMatchObject({ pages: [{ topics: ['Orbital Mechanics'], topicsChecked: true }] })
    expect(calls[0].articles).toEqual([{ id: '1', body: 'A satellite enters a polar orbit.' }])
    await expect(invoke('wiki-pages')).resolves.toMatchObject({ pages: [{ topics: ['Orbital Mechanics'] }] })
    await expect(invoke('wiki-categorize')).resolves.toMatchObject({ pages: [{ topics: ['Orbital Mechanics'] }] })
    expect(calls).toHaveLength(1)
    await fs.writeFile(path.join(wiki, 'notes.md'), 'Transaction isolation and database indexes.')
    await expect(invoke('wiki-categorize')).resolves.toMatchObject({ pages: [{ topics: ['Database Design'] }] })
    expect(calls).toHaveLength(2)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})

it.each([
  ['the output was truncated', 16384, 20480, () => [200, { choices: [{ finish_reason: 'length', message: { content: '' } }] }]],
  ['the server caps max_tokens', 16384, 8192, () => [400, { error: { message: 'Range of max_tokens should be [1, 8192]' } }]],
])('retries Wiki classification with an adjusted output budget when %s', async (_, first, second, rejection) => {
  const budgets = []
  const server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks))
    budgets.push(body.max_tokens)
    const [status, payload] = budgets.length === 1 ? rejection()
      : [200, { choices: [{ finish_reason: 'stop', message: { content: '{"1":["Astronomy"]}' } }] }]
    response.writeHead(status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(payload))
  })
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-topics-retry-'))
  try {
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const root = path.join(dataDir, 'vault')
    await fs.mkdir(path.join(root, 'wiki', 'en'), { recursive: true })
    await fs.writeFile(path.join(root, 'wiki', 'en', 'notes.md'), 'A comet passes the sun.')
    const config = { DoCPath: root, defaultProvider: 'local', providers: [
      { id: 'local', type: 'custom', model: 'main-model', apiKey: 'fixture-key', baseURL: `http://127.0.0.1:${server.address().port}/v1` },
    ] }
    const handlers = new Map()
    registerHandlers({ handle: (key, fn) => handlers.set(key, fn) }, {
      paths: () => ({ DATA_DIR: dataDir, CONFIG_FILE: 'config.json' }), readJSONAsync: async () => config,
    })
    await expect(handlers.get('aidoc:wiki-categorize')({}, { root }))
      .resolves.toMatchObject({ pages: [{ topics: ['Astronomy'] }] })
    expect(budgets).toEqual([first, second])
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.rm(dataDir, { recursive: true, force: true })
  }
})
