'use strict'

const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g

function extractWikiLinks(text) {
  let fence = ''
  const visible = text.split(/\r?\n/).map(line => {
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
      if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = ''
      return ''
    }
    const opening = /^ {0,3}(`{3,}(?!`)[^`]*|~{3,}.*)$/.exec(line)
    if (opening) {
      fence = /^(`+|~+)/.exec(opening[1])[0]
      return ''
    }
    return line
  }).join('\n')

  const links = new Set()
  for (const paragraph of visible.split(/\n[ \t]*\n/)) {
    for (const match of paragraph.replace(CODE_SPAN, ' ').matchAll(/\[\[([^\[\]\r\n]+)\]\]/g)) {
      const target = match[1].split(/[|#]/, 1)[0].trim()
      if (target) links.add(target)
    }
  }
  return [...links]
}

module.exports = { extractWikiLinks }
