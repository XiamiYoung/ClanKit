import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const { AIDOC_FOLDERS, resolveAiDocRoot, classifyAiDocPath, ensureAiDocLayout } = require('../aidocLayout')

const dirs = []
function mkRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aidoc-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('resolveAiDocRoot', () => {
  it('returns DoCPath when set', () => {
    expect(resolveAiDocRoot({ DoCPath: '/x/docs', dataPath: '/d' })).toBe('/x/docs')
  })
  it('falls back to dataPath/clankit_doc when DoCPath is empty', () => {
    expect(resolveAiDocRoot({ DoCPath: '', dataPath: '/d' })).toBe(path.join('/d', 'clankit_doc'))
  })
  it('returns empty string when neither is set', () => {
    expect(resolveAiDocRoot({})).toBe('')
  })
})

describe('classifyAiDocPath', () => {
  it('classifies by first segment', () => {
    const root = mkRoot()
    expect(classifyAiDocPath(root, root + '/wiki/a.md')).toBe('wiki')
    expect(classifyAiDocPath(root, root + '/kb_source/x/y.pdf')).toBe('kb_source')
    expect(classifyAiDocPath(root, root + '/general/n.md')).toBe('general')
    expect(classifyAiDocPath(root, root + '/README.md')).toBe('general')
    expect(classifyAiDocPath(root, root + '/misc/z.md')).toBe('general')
  })
  it('is case-insensitive and separator-agnostic', () => {
    const root = mkRoot()
    expect(classifyAiDocPath(root, root + '\\Wiki\\a.md')).toBe('wiki')
  })
  it('returns null outside the root or with empty root', () => {
    const root = mkRoot()
    expect(classifyAiDocPath(root, path.join(root, '..', 'other', 'a.md'))).toBeNull()
    expect(classifyAiDocPath('', '/a/b.md')).toBeNull()
  })
})

describe('ensureAiDocLayout', () => {
  it('creates the three folders once', () => {
    const root = mkRoot()
    const first = ensureAiDocLayout(root)
    expect(first.created.sort()).toEqual(['general', 'kb_source', 'wiki'])
    for (const f of Object.values(AIDOC_FOLDERS)) expect(fs.existsSync(path.join(root, f))).toBe(true)
    expect(ensureAiDocLayout(root)).toEqual({ created: [] })
  })
  it('handles an empty root', () => {
    expect(ensureAiDocLayout('')).toEqual({ created: [] })
  })
})
