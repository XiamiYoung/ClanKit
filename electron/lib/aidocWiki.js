'use strict'

const fs = require('fs')
const path = require('path')
const { extractWikiLinks } = require('./aidocLinkParser')

const DEFAULT_SCHEMA_MD = `# Wiki Schema

This wiki is maintained by an AI agent from the user's source documents. Follow these rules exactly.

## Page types

Every wiki page has exactly one type:

- \`summary\` - a source summary page. One per ingested source: what the source says, its key points and conclusions.
- \`entity\` - a page about a person, organization, product, or tool that appears in one or more sources.
- \`concept\` - a page explaining an idea, term, method, or topic that spans sources.
- \`comparison\` - a page comparing two or more entities or concepts side by side.
- \`other\` - anything that fits none of the types above.

## Page format

Each page is a Markdown file that starts with frontmatter:

\`\`\`
---
type: summary | entity | concept | comparison | other
title: Page Title
sources: [kb_source/papers/attention.pdf, kb_source/notes/other-source.md]
updated: YYYY-MM-DD
---
\`\`\`

- \`type\` must be one of: summary, entity, concept, comparison, other.
- \`title\` is required, must not be empty, and must equal the page file name without \`.md\` so that \`[[Title]]\` links resolve.
- \`sources\` is required: a non-empty list of source paths relative to the documents root, each starting with \`kb_source/\`.
- \`updated\` is the date of the last change, formatted YYYY-MM-DD.
- Link to other wiki pages with \`[[Page Name]]\`.
- Cite a source file in a page body with its full path, for example \`[[kb_source/papers/attention.pdf]]\` (include the folder and extension).

## File names

- A page file is named after its title: \`Page Title.md\`.
- Do not use characters that are illegal in file names (\\ / : * ? " < > |) or that break links ([ ] # ^).
- Keep names short and stable. Reuse an existing page instead of creating a near-duplicate.

## index.md

\`index.md\` lists every wiki page, grouped into sections by type (Summaries, Entities, Concepts, Comparisons). Each page has exactly one line:

\`\`\`
- [[Page Name]] — one-sentence summary
\`\`\`

## Ingesting a source

1. Read the source completely before writing anything.
2. Write the summary page for the source, or update it if it already exists.
3. Create or extend entity pages and concept pages for what the source mentions.
4. Add links between related pages in both directions.
5. Update \`index.md\` so every new or changed page appears with a one-sentence summary.

## Rules

- \`wiki/log.md\` and \`wiki/SCHEMA.md\` are owned by the app and the user. Never write them; the app appends to the log itself.
- Every page you write or revise must be listed in \`index.md\`.
- Do not invent anything that the source does not say.
- If new information conflicts with an existing page, keep both and note the conflict (with its sources) inside the page. Never silently overwrite.
- Do not edit or delete the user's source files.
`

const INDEX_MD = `# Index

Catalog of all wiki pages, grouped by type. One line per page: \`- [[Page Name]] — one-sentence summary\`.
`

const LOG_MD = '# Log\n'

const UNCATEGORIZED = '## Uncategorized'

function _wikiDir(root) {
  return path.join(root, 'wiki')
}

function ensureWikiScaffold(root) {
  const dir = _wikiDir(root)
  fs.mkdirSync(dir, { recursive: true })
  const created = []
  const files = [
    ['SCHEMA.md', DEFAULT_SCHEMA_MD],
    ['index.md', INDEX_MD],
    ['log.md', LOG_MD],
  ]
  for (const [name, content] of files) {
    try {
      fs.writeFileSync(path.join(dir, name), content, { flag: 'wx' })
      created.push(name)
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
    }
  }
  return { created }
}

// Make a name safe to place inside [[...]] on a single line.
function _safeName(name) {
  return String(name == null ? '' : name).replace(/[\[\]|#]+/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function _singleLine(text) {
  return String(text == null ? '' : text).replace(/[\r\n]+/g, ' ').trim()
}

async function appendLog(root, { date, sourceRel, pages }) {
  ensureWikiScaffold(root)
  const logPath = path.join(_wikiDir(root), 'log.md')
  const existing = await fs.promises.readFile(logPath, 'utf8')
  const lead = existing && !existing.endsWith('\n') ? '\n' : ''
  const lines = (pages || []).map(p => `- [[${_safeName(p)}]]\n`).join('')
  const entry = `${lead}\n## [${_singleLine(date)}] ingest | ${_singleLine(sourceRel)}\n${lines}`
  await fs.promises.appendFile(logPath, entry, 'utf8')
}

function _baseName(rel) {
  const file = String(rel || '').split(/[\\/]/).pop()
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

async function ensureIndexCoverage(root, pages) {
  ensureWikiScaffold(root)
  const indexPath = path.join(_wikiDir(root), 'index.md')
  const content = await fs.promises.readFile(indexPath, 'utf8')
  const linked = new Set(extractWikiLinks(content).map(l => l.toLowerCase()))

  const added = []
  const lines = []
  for (const page of pages || []) {
    const name = _safeName(_baseName(page.rel))
    if (!name) continue
    const title = _singleLine(page.title)
    const keys = [name, _baseName(page.rel).trim(), title].filter(Boolean).map(k => k.toLowerCase())
    if (keys.some(k => linked.has(k))) continue
    linked.add(name.toLowerCase())
    added.push(name)
    lines.push(`- [[${name}]] — ${title || name}`)
  }
  if (!added.length) return { added }

  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const block = lines.join(eol)
  const heading = new RegExp(`^${UNCATEGORIZED}[ \\t]*\\r?$`, 'im').exec(content)
  let next
  if (heading) {
    const afterHeading = heading.index + heading[0].length
    const nextSection = /^## /m.exec(content.slice(afterHeading))
    const end = nextSection ? afterHeading + nextSection.index : content.length
    const head = content.slice(0, end).replace(/\s+$/, '')
    const tail = content.slice(end)
    next = `${head}${eol}${block}${eol}${tail ? `${eol}${tail}` : ''}`
  } else {
    next = `${content.replace(/\s+$/, '')}${eol}${eol}${UNCATEGORIZED}${eol}${eol}${block}${eol}`
  }
  await fs.promises.writeFile(indexPath, next, 'utf8')
  return { added }
}

module.exports = { DEFAULT_SCHEMA_MD, ensureWikiScaffold, appendLog, ensureIndexCoverage }
