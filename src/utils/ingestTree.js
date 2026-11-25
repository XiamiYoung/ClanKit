export const INGEST_ROOT_NAME = 'kb_source'
export const INGEST_ROOT_ID = 'folder:'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const byName = (a, b) => collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

export function stripSourceRoot(rel) {
  const text = String(rel ?? '')
  return text.startsWith(`${INGEST_ROOT_NAME}/`) ? text.slice(INGEST_ROOT_NAME.length + 1) : text
}

// Builds a folder tree from plan sources ({ rel, ... }). Every folder carries `count`, the number
// of source files below it at any depth. Children are sorted: folders first, then files, naturally.
export function buildIngestTree(sources) {
  const root = { type: 'folder', id: INGEST_ROOT_ID, name: INGEST_ROOT_NAME, count: 0, folders: new Map(), children: [] }
  for (const source of sources || []) {
    const parts = stripSourceRoot(source.rel).split('/').filter(Boolean)
    if (!parts.length) continue
    const fileName = parts.pop()
    const chain = [root]
    let folder = root
    for (const part of parts) {
      let next = folder.folders.get(part)
      if (!next) {
        next = { type: 'folder', id: `${folder.id}${part}/`, name: part, count: 0, folders: new Map(), children: [] }
        folder.folders.set(part, next)
        folder.children.push(next)
      }
      folder = next
      chain.push(folder)
    }
    for (const node of chain) node.count += 1
    folder.children.push({ type: 'file', id: `file:${source.rel}`, name: fileName, source })
  }
  sortFolder(root)
  return root
}

function sortFolder(folder) {
  delete folder.folders
  folder.children.sort((a, b) => (a.type === b.type ? byName(a, b) : a.type === 'folder' ? -1 : 1))
  for (const child of folder.children) if (child.type === 'folder') sortFolder(child)
}

// Only the root is open by default; every sub-folder starts collapsed.
export const defaultExpanded = () => new Set([INGEST_ROOT_ID])
