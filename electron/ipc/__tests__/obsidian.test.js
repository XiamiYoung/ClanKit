import { it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { registerHandlers } = require('../obsidian')

it('keeps AI Doc roots fixed and knowledge pages read-only while allowing source moves', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aidoc-workspace-'))
  const handlers = new Map()
  const config = { DoCPath: root }
  registerHandlers({ handle: (key, handler) => handlers.set(key, handler) }, {
    paths: () => ({ DATA_DIR: root, CONFIG_FILE: path.join(root, 'config.json') }),
    readJSONAsync: async () => config,
    readJSON: () => config,
  })
  const call = (channel, ...args) => handlers.get('obsidian:' + channel)(null, ...args)
  const general = path.join(root, 'general')
  const sources = path.join(root, 'kb_source')
  const wiki = path.join(root, 'wiki')
  const page = path.join(wiki, 'Page.md')
  const draft = path.join(general, 'Draft.md')
  const source = path.join(sources, 'Draft.md')
  try {
    await call('get-config')
    await writeFile(page, '# Existing page')
    await writeFile(draft, '# Draft')
    for (const section of [general, sources, wiki]) {
      expect(call('rename', section, path.join(root, 'renamed'))).toHaveProperty('error')
      expect(call('delete-file', section)).toHaveProperty('error')
    }
    expect(call('write-file', page, '# Modified')).toHaveProperty('error')
    expect(call('write-file-binary', page, 'AA==')).toHaveProperty('error')
    expect(call('create-file', wiki, 'New')).toHaveProperty('error')
    expect(call('create-folder', general, '../wiki/subfolder')).toHaveProperty('error')
    expect(call('copy-files-to-dir', [draft], wiki)[0]).toHaveProperty('error')
    expect(call('rename', draft, path.join(wiki, 'Moved.md'))).toHaveProperty('error')
    expect(call('rename', page, path.join(general, 'Moved.md'))).toHaveProperty('error')
    expect(call('delete-file', page)).toHaveProperty('error')
    expect(await readFile(page, 'utf8')).toBe('# Existing page')

    expect(call('rename', draft, source)).toEqual({ success: true })
    expect(await readFile(source, 'utf8')).toBe('# Draft')
    expect(call('rename', source, draft)).toEqual({ success: true })
    expect(await readFile(draft, 'utf8')).toBe('# Draft')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
