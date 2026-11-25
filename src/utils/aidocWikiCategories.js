export function wikiCategories(page) {
  return page.topics?.length ? page.topics : ['']
}

export function groupWikiPages(pages, t, locale) {
  const byCategory = new Map()
  for (const page of pages) {
    for (const category of wikiCategories(page)) {
      const key = `category:${category.toLowerCase()}`
      if (!byCategory.has(key)) byCategory.set(key, { key, label: category || t('aidoc.wikiCategoryUncategorized'), pages: [] })
      byCategory.get(key).pages.push(page)
    }
  }
  const collator = new Intl.Collator(locale, { numeric: true })
  const groups = [...byCategory.values()].sort((a, b) =>
    Number(a.key === 'category:') - Number(b.key === 'category:') || collator.compare(a.label, b.label))
  for (const group of groups) group.pages.sort((a, b) => collator.compare(a.title, b.title) || a.rel.localeCompare(b.rel))
  return groups
}

export function buildWikiTopicTree(groups, locale) {
  const roots = new Map()
  const compare = new Intl.Collator(locale, { numeric: true })
  for (const group of groups) {
    const path = group.label.split(' › ').map(label => label.trim()).filter(Boolean).slice(0, 3)
    let siblings = roots
    for (const [depth, label] of path.entries()) {
      const name = path.slice(0, depth + 1).join(' › ')
      const key = 'category:' + name.toLowerCase()
      if (!siblings.has(key)) siblings.set(key, { key, name, label, depth, pages: new Map(), children: new Map() })
      const node = siblings.get(key)
      for (const page of group.pages) node.pages.set(page.rel, page)
      siblings = node.children
    }
  }
  function finish(nodes) {
    return [...nodes.values()].sort((a, b) => compare.compare(a.label, b.label)).map(node => ({
      ...node, pages: [...node.pages.values()], children: finish(node.children),
    }))
  }
  return finish(roots)
}

export function flattenWikiTopics(nodes, expanded) {
  return nodes.flatMap(node => [node, ...(!expanded || expanded.has(node.key) ? flattenWikiTopics(node.children, expanded) : [])])
}
