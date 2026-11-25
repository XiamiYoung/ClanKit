let mermaidPromise
let diagramId = 0

function loadMermaid() {
  return mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false, theme: 'default', securityLevel: 'strict',
      htmlLabels: false, suppressErrorRendering: true, fontFamily: 'Inter, sans-serif',
    })
    return mermaid
  })
}

export async function renderDocumentDiagrams(root) {
  const nodes = Array.from(root?.querySelectorAll('pre.mermaid:not([data-processed])') || [])
  if (nodes.length) await (await loadMermaid()).run({ nodes, suppressErrors: true })
}

// Keep Wiki diagrams static, with no custom CSS, embedded resources or callbacks.
function isStaticDiagram(source) {
  const header = source.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('%%')) || ''
  return /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|mindmap)(?:\s|$)/.test(header)
    && !/%%\s*\{|@\s*\{|<\s*\/?[a-z]|(?:^|[;\n])\s*(?:style|classDef|linkStyle|click|callback)\b/i.test(source.replace(/<br\s*\/?>/gi, ''))
}

export async function renderWikiDiagrams(root, { label, failure }) {
  for (const block of root.querySelectorAll('pre.mermaid:not([data-wiki-diagram])')) {
    block.dataset.wikiDiagram = 'pending'
    const source = block.textContent.trim()
    try {
      if (!isStaticDiagram(source)) throw new Error('Unsupported static diagram syntax')
      const { svg } = await (await loadMermaid()).render(`wiki-mermaid-${++diagramId}`, source)
      if (!root.contains(block)) continue
      const image = root.ownerDocument.createElement('img')
      image.alt = label
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      const svgElement = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
      const [, , width, height] = (svgElement.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        image.width = Math.ceil(width)
        image.height = Math.ceil(height)
      }
      const figure = root.ownerDocument.createElement('figure')
      figure.className = 'wiki-diagram'
      figure.append(image)
      block.replaceWith(figure)
    } catch {
      if (!root.contains(block)) continue
      block.dataset.wikiDiagram = 'error'
      const message = root.ownerDocument.createElement('p')
      message.className = 'wiki-diagram-error'
      message.textContent = failure
      block.before(message)
    }
  }
}
