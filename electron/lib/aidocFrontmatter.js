'use strict'

const crypto = require('crypto')
const fs = require('fs')

const WIKI_TYPES = ['summary', 'entity', 'concept', 'comparison', 'other']

function unquote(value) {
  const v = value.trim()
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    return v.slice(1, -1)
  }
  return v
}

function parseFrontmatter(text) {
  const src = (typeof text === 'string' ? text : '').replace(/^﻿/, '')
  const none = { data: {}, body: src, hasFrontmatter: false }
  const lines = src.split('\n')
  if (lines[0].replace(/\r$/, '').trimEnd() !== '---') return none
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].replace(/\r$/, '').trimEnd() === '---') { end = i; break }
  }
  if (end === -1) return none

  const data = {}
  let listKey = null
  for (const raw of lines.slice(1, end)) {
    const line = raw.replace(/\r$/, '')
    const item = line.match(/^\s+-\s+(.*)$/) || line.match(/^-\s+(.*)$/)
    if (item && listKey) {
      data[listKey].push(unquote(item[1]))
      continue
    }
    const kv = line.match(/^([^\s:][^:]*):\s*(.*)$/)
    if (!kv) { listKey = null; continue }
    const key = kv[1].trim()
    const value = kv[2].trim()
    if (value === '') {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim()
      data[key] = inner ? inner.split(',').map(unquote).filter(Boolean) : []
      listKey = null
    } else {
      data[key] = unquote(value)
      listKey = null
    }
  }
  return { data, body: lines.slice(end + 1).join('\n'), hasFrontmatter: true }
}

function validateWikiFrontmatter(data) {
  const d = data || {}
  if (typeof d.type !== 'string' || !WIKI_TYPES.includes(d.type)) {
    return { ok: false, error: `Frontmatter field "type" is required and must be one of: ${WIKI_TYPES.join(', ')}.` }
  }
  if (typeof d.title !== 'string' || !d.title.trim()) {
    return { ok: false, error: 'Frontmatter field "title" is required and must be a non-empty string.' }
  }
  if (!Array.isArray(d.sources) || d.sources.length === 0) {
    return { ok: false, error: 'Frontmatter field "sources" is required and must be a non-empty list of kb_source/ paths.' }
  }
  const badSource = d.sources.find(s => typeof s !== 'string' || !s.startsWith('kb_source/'))
  if (badSource !== undefined) {
    return { ok: false, error: `Frontmatter field "sources" has an invalid entry "${badSource}"; every entry must start with "kb_source/".` }
  }
  if (typeof d.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.updated)) {
    return { ok: false, error: 'Frontmatter field "updated" is required and must match YYYY-MM-DD.' }
  }
  return { ok: true }
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex')
}

function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(absPath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

module.exports = { WIKI_TYPES, parseFrontmatter, validateWikiFrontmatter, sha256Text, sha256File }
