import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import reconcile from '../aidocReconcile.js'
import registryApi from '../aidocRegistry.js'
import frontmatter from '../aidocFrontmatter.js'

const { reconcileRemovedSources } = reconcile
const { writeRegistry, readRegistryStrict } = registryApi
const { sha256Text } = frontmatter
const gone = 'kb_source/gone.md'
const live = 'kb_source/live [part] #1.md'
const solo = 'wiki/en/Solo.md'
const shared = 'wiki/en/Shared.md'
const manual = 'wiki/zh/Manual.md'
const stamp = '2026-11-25'
const source = pages => ({ hash: 'source', ingestedAt: stamp, pages, langs: { en: { hash: 'source', ingestedAt: stamp, pages } } })
const note = (title, sources) => `---\r\ntype: concept\r\ntitle: ${title}\r\nsources: [${sources.join(', ')}]\r\nupdated: ${stamp}\r\n---\r\n\r\nOriginal prose.\r\n`

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aidoc-reconcile-'))
  roots.push(root)
  const registryFile = path.join(root, 'registry.json')
  const abs = rel => path.join(root, rel)
  const put = async (rel, content) => {
    await fs.mkdir(path.dirname(abs(rel)), { recursive: true })
    await fs.writeFile(abs(rel), content)
  }
  const read = rel => fs.readFile(abs(rel), 'utf8')
  const run = (options = {}) => reconcileRemovedSources({ root, registryFile, removed: [gone], ...options })
  return { root, registryFile, abs, put, read, run }
}

describe('AI Doc removed source reconciliation', () => {
  it('removes standalone generated pages, prunes shared metadata and leaves edited pages intact', async () => {
    const { registryFile, put, read, run } = await fixture()
    await put(live, '# Live source')
    const soloText = note('Solo', [gone])
    const sharedText = note('Shared', [gone, live])
    const manualText = note('Manual', [gone])
    const editedText = `${manualText}User prose.\r\n`
    const index = '## Pages\r\n\r\n- [[Solo]] — standalone\r\n- [[Shared]] — retained\r\n\r\n```md\r\n- [[Solo]] — example\r\n```\r\n'
    await put(solo, soloText)
    await put(shared, sharedText)
    await put(manual, editedText)
    await put('wiki/en/index.md', index)
    await put('wiki/zh/index.md', '- [[Manual]]\r\n')
    await writeRegistry(registryFile, {
      sources: { [gone]: source([solo, shared, manual]), [live]: source([shared]) },
      pages: {
        [solo]: { hash: sha256Text(soloText), sources: [gone] },
        [shared]: { hash: sha256Text(sharedText), sources: [gone, live] },
        [manual]: { hash: sha256Text(manualText), sources: [gone] },
      },
    })

    await expect(run()).resolves.toEqual({ removed: [gone], deletedPages: [solo], updatedPages: [shared], warnings: [] })
    await expect(read(solo)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(read(shared)).resolves.toBe(sharedText.replace(`sources: [${gone}, ${live}]`, `sources:\r\n  - '${live}'`))
    await expect(read(manual)).resolves.toBe(editedText)
    await expect(read('wiki/en/index.md')).resolves.toBe(index.replace('- [[Solo]] — standalone\r\n', ''))
    await expect(read('wiki/zh/index.md')).resolves.toBe('- [[Manual]]\r\n')
    const registry = await readRegistryStrict(registryFile)
    expect(registry.sources).toEqual({ [live]: source([shared]) })
    expect(registry.pages).toEqual({
      [shared]: { hash: sha256Text(await read(shared)), sources: [live] },
      [manual]: { hash: sha256Text(manualText), sources: [], handEdited: true },
    })
    await expect(run()).resolves.toMatchObject({ removed: [], deletedPages: [] })
  })

  it('leaves restored sources, symlinked inputs, and stopped work in the registry', async () => {
    const { root, registryFile, abs, put, read, run } = await fixture()
    await put(gone, '# Restored after plan')
    const text = note('Solo', [gone])
    await put(solo, text)
    await writeRegistry(registryFile, { sources: { [gone]: source([solo]) }, pages: { [solo]: { hash: sha256Text(text), sources: [gone] } } })
    await expect(run()).resolves.toMatchObject({ removed: [], deletedPages: [] })
    await fs.rm(abs(gone))
    await expect(run({ shouldStop: () => true })).resolves.toMatchObject({ removed: [], deletedPages: [] })
    await fs.rmdir(abs('kb_source'))
    await fs.mkdir(abs('external'))
    await fs.symlink(abs('external'), path.join(root, 'kb_source'), 'junction')
    await expect(run()).resolves.toMatchObject({ removed: [], warnings: [{ rel: gone, step: 'reconcile' }] })
    await expect(read(solo)).resolves.toBe(text)
    expect((await readRegistryStrict(registryFile)).sources).toHaveProperty(gone)
  })

  it('restores an earlier page if its index cannot be safely updated', async () => {
    const { registryFile, abs, put, read, run } = await fixture()
    const text = note('Solo', [gone])
    await put(solo, text)
    await fs.mkdir(abs('external'))
    await fs.symlink(abs('external'), abs('wiki/en/index.md'), 'junction')
    await writeRegistry(registryFile, {
      sources: { [gone]: source([solo]) },
      pages: { [solo]: { hash: sha256Text(text), sources: [gone] } },
    })
    await expect(run()).rejects.toThrow('Unexpected file type')
    await expect(read(solo)).resolves.toBe(text)
    expect((await readRegistryStrict(registryFile)).sources).toHaveProperty(gone)
  })

  it('leaves the registry intact when the vault root is unavailable', async () => {
    const { registryFile, abs, run } = await fixture()
    await writeRegistry(registryFile, { sources: { [gone]: source([solo]) }, pages: {} })
    await expect(run({ root: abs('unavailable') })).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readRegistryStrict(registryFile)).sources).toHaveProperty(gone)
  })
})
