#!/usr/bin/env node
/**
 * prepare-embedding-model — fetch the sentence-transformers ONNX embedding
 * model into `electron/models/` so it ships with the installer via
 * electron-builder's `extraResources` config.
 *
 * Run before building a release:   `npm run prepare-models`
 * (Auto-runs as part of dist:win / dist:mac / dist:all.)
 *
 * Idempotent: if the files already exist with the expected size, the script
 * exits early. Safe to re-run.
 *
 * Source priority:
 *   1. HF_MIRROR=true env → hf-mirror.com (China users)
 *   2. Default → huggingface.co
 *
 * The model is paraphrase-multilingual-MiniLM-L12-v2 (~449MB ONNX). Files
 * pulled match what @huggingface/transformers needs at runtime:
 *   - config.json
 *   - tokenizer.json
 *   - tokenizer_config.json
 *   - special_tokens_map.json
 *   - onnx/model.onnx
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const { URL } = require('url')

const REPO = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
const HOST = process.env.HF_MIRROR === 'true'
  ? 'https://hf-mirror.com'
  : 'https://huggingface.co'
const REVISION = 'main'

// Files transformers.js needs at runtime
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model.onnx',
]

const projectRoot = path.resolve(__dirname, '..')
const targetDir = path.join(projectRoot, 'electron', 'models', 'sentence-transformers', 'paraphrase-multilingual-MiniLM-L12-v2')
const minOnnxSize = 100 * 1024 * 1024  // 100 MB sanity floor — full model is ~449 MB

console.log('=== prepare-embedding-model ===')
console.log('Target dir:', targetDir)
console.log('Source:    ', HOST)
console.log()

// Fast path: skip if the model is already there
const onnxLocal = path.join(targetDir, 'onnx', 'model.onnx')
if (fs.existsSync(onnxLocal)) {
  const stat = fs.statSync(onnxLocal)
  if (stat.size > minOnnxSize) {
    console.log(`✓ Model already prepared (${Math.round(stat.size / 1024 / 1024)} MB) — skipping download`)
    process.exit(0)
  }
  console.log(`! Existing model.onnx is suspiciously small (${stat.size} bytes); re-downloading`)
}

fs.mkdirSync(path.join(targetDir, 'onnx'), { recursive: true })

function fetchOnce(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest + '.part')
    const u = new URL(url)
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': 'ClankAI-prepare-models/1.0' },
    }, (res) => {
      // Follow redirects (HF returns 302 to CDN)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlink(dest + '.part', () => {})
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).toString()
        return fetchOnce(next, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dest + '.part', () => {})
        return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} for ${url}`))
      }

      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      let lastTick = Date.now()
      res.on('data', (chunk) => {
        received += chunk.length
        const now = Date.now()
        if (now - lastTick > 500 && total > 0) {
          const pct = Math.floor((received / total) * 100)
          process.stdout.write(`\r  ${pct}%  (${(received / 1024 / 1024).toFixed(1)}/${(total / 1024 / 1024).toFixed(1)} MB)`)
          lastTick = now
        }
      })

      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          if (total > 0) process.stdout.write(`\r  100%  (${(total / 1024 / 1024).toFixed(1)} MB)\n`)
          fs.renameSync(dest + '.part', dest)
          resolve()
        })
      })
      file.on('error', (err) => {
        fs.unlink(dest + '.part', () => {})
        reject(err)
      })
    })
    req.on('error', (err) => {
      file.close()
      fs.unlink(dest + '.part', () => {})
      reject(err)
    })
    req.setTimeout(120_000, () => {
      req.destroy(new Error('request timed out after 120s'))
    })
  })
}

async function main() {
  let failed = 0
  for (const rel of FILES) {
    const url = `${HOST}/${REPO}/resolve/${REVISION}/${rel}`
    const dest = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (fs.existsSync(dest)) {
      const stat = fs.statSync(dest)
      // Tiny config files: trust if they exist. ONNX gets the size floor check.
      if (rel === 'onnx/model.onnx' && stat.size < minOnnxSize) {
        console.log(`! ${rel} too small (${stat.size}), re-downloading`)
        fs.unlinkSync(dest)
      } else {
        console.log(`✓ ${rel} already present (${stat.size} bytes)`)
        continue
      }
    }
    console.log(`→ ${rel}`)
    try {
      await fetchOnce(url, dest)
    } catch (err) {
      console.error(`  ✗ ${rel} failed: ${err.message}`)
      failed++
    }
  }

  console.log()
  if (failed > 0) {
    console.error(`Failed to fetch ${failed} file(s).`)
    if (HOST === 'huggingface.co') {
      console.error('Hint: try HF_MIRROR=true npm run prepare-models from China.')
    }
    process.exit(1)
  }
  console.log('Done. Model ready at:', targetDir)
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(2)
})
