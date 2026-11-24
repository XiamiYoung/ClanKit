export function filterGraph(graph, { hideOrphans = false, hiddenExts = [], query = '' } = {}) {
  const hidden = new Set(hiddenExts)
  const search = query.trim().toLowerCase()
  const eligible = graph.nodes.filter(node => !hidden.has(node.ext))
  const ids = new Set(eligible.map(node => node.id))
  const links = graph.links.filter(link => ids.has(link.source) && ids.has(link.target))
  const connected = new Set(links.flatMap(link => [link.source, link.target]))
  const nodes = eligible.filter(node => !hideOrphans || connected.has(node.id)).map(node => {
    if (!search) return node
    const matched = [node.name, node.title].some(value => value?.toLowerCase().includes(search))
    return { ...node, matched }
  })
  return { nodes, links }
}
