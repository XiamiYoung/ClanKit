import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { buildWorkingFolderContext } = require('../workingFolderContext')

describe('buildWorkingFolderContext', () => {
  let tmp

  beforeEach(() => {
    tmp = path.join(process.env.TEMP || '/tmp', `wfc-${Date.now()}-${Math.floor(Math.random() * 10000)}`)
    fs.mkdirSync(tmp, { recursive: true })
  })

  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns null for missing path', () => {
    expect(buildWorkingFolderContext('/does/not/exist/anywhere')).toBeNull()
  })

  it('returns null for empty/null/undefined input', () => {
    expect(buildWorkingFolderContext('')).toBeNull()
    expect(buildWorkingFolderContext(null)).toBeNull()
    expect(buildWorkingFolderContext(undefined)).toBeNull()
  })

  it('returns block with WORKING FOLDER header for a valid folder', () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), 'hello')
    const out = buildWorkingFolderContext(tmp)
    expect(out).toContain('WORKING FOLDER FOR THIS CHAT')
    expect(out).toContain(tmp)
    expect(out).toContain('a.md')
  })

  it('lists files with size and dirs with trailing slash', () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), 'x')
    fs.writeFileSync(path.join(tmp, 'b.docx'), Buffer.alloc(2048))
    fs.mkdirSync(path.join(tmp, 'sub'))
    fs.writeFileSync(path.join(tmp, 'sub', 'c.txt'), 'y')
    const out = buildWorkingFolderContext(tmp)
    expect(out).toContain('a.md')
    expect(out).toContain('b.docx')
    expect(out).toMatch(/sub\//)  // dir trailing slash
    expect(out).toContain('c.txt')  // depth 1 listed
  })

  it('caps depth at 2', () => {
    fs.mkdirSync(path.join(tmp, 'd1', 'd2', 'd3'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'd1', 'd2', 'd3', 'far.txt'), 'x')
    const out = buildWorkingFolderContext(tmp)
    expect(out).not.toContain('far.txt')  // depth 3+ not listed
  })

  it('caps total entries (writes hint when exceeded)', () => {
    for (let i = 0; i < 70; i++) {
      fs.writeFileSync(path.join(tmp, `f${i}.md`), 'x')
    }
    const out = buildWorkingFolderContext(tmp)
    expect(out).toMatch(/and more|use file_operation list|explore/i)
  })

  it('lists Recently modified section with files modified in last 7 days', () => {
    const fpath = path.join(tmp, 'recent.md')
    fs.writeFileSync(fpath, 'x')
    const out = buildWorkingFolderContext(tmp)
    expect(out).toContain('Recently modified')
    expect(out).toContain('recent.md')
  })

  it('skips hidden dotfiles and ignored dirs (node_modules, .git, dist, etc.)', () => {
    fs.mkdirSync(path.join(tmp, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'node_modules', 'pkg', 'index.js'), 'x')
    fs.mkdirSync(path.join(tmp, '.git'))
    fs.writeFileSync(path.join(tmp, '.git', 'HEAD'), 'x')
    fs.mkdirSync(path.join(tmp, 'dist'))
    fs.writeFileSync(path.join(tmp, 'dist', 'bundle.js'), 'x')
    fs.writeFileSync(path.join(tmp, '.hidden.txt'), 'x')
    const out = buildWorkingFolderContext(tmp)
    expect(out).not.toContain('node_modules')
    expect(out).not.toContain('.git')
    expect(out).not.toContain('dist')
    expect(out).not.toContain('.hidden.txt')
  })

  it('returns degraded message when path is a file, not a directory', () => {
    const fpath = path.join(tmp, 'just-a-file.txt')
    fs.writeFileSync(fpath, 'x')
    const out = buildWorkingFolderContext(fpath)
    expect(out).toMatch(/empty|unreadable|not a directory/i)
  })

  it('returns block with empty-folder note when folder has no entries', () => {
    const out = buildWorkingFolderContext(tmp)
    expect(out).toContain('WORKING FOLDER FOR THIS CHAT')
    // empty folder — should still produce a coherent block, not crash
    expect(out).toMatch(/empty folder|no entries|\(empty/i)
  })
})
