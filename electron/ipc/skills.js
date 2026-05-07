/**
 * IPC handlers for skills (filesystem-based).
 * Channels: skills:*
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { ipcMain, app } = require('electron')
const { logger } = require('../logger')
const ds = require('../lib/dataStore')
const { isBuiltinSkillId } = require('../lib/builtinSkills')
const { getInstance: getAgentStore } = require('../agent/AgentStore')

/**
 * Normalize path separators on Windows.
 */
function normalizePath(p) {
  if (!p) return p
  if (process.platform === 'win32') return p.replace(/\//g, '\\')
  return p
}

/**
 * Resolve skills directory path.
 * If configPath is empty, use platform-specific default.
 */
function resolveSkillsPath(configPath) {
  if (configPath && configPath.trim()) {
    let p = configPath.trim()
    // Expand leading ~ to home directory (shell expansion doesn't apply in Node)
    if (p.startsWith('~/') || p === '~') {
      p = path.join(os.homedir(), p.slice(1))
    }
    return normalizePath(p)
  }
  // Default: CLANKIT_DATA_PATH/skills
  return path.join(ds.paths().DATA_DIR, 'skills')
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { meta: { name, description, ... }, body: "remaining markdown" }
 */
function parseFrontmatter(mdContent) {
  if (!mdContent) return { meta: {}, body: '' }
  const match = mdContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: mdContent }
  const raw = match[1]
  const body = match[2]
  const meta = {}
  const lines = raw.split('\n')
  let currentKey = null
  let multilineMode = null  // '>' folded, '|' literal, 'indent' plain indented

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // New key: value pair (unindented line with colon)
    const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (m) {
      const key = m[1]
      let val = m[2].replace(/^["']|["']$/g, '').trim()
      // Check for YAML multiline indicators
      if (val === '>' || val === '|') {
        currentKey = key
        multilineMode = val === '>' ? 'folded' : 'literal'
        meta[key] = ''
      } else if (val === '') {
        // Empty value — might be followed by indented lines
        currentKey = key
        multilineMode = 'indent'
        meta[key] = ''
      } else {
        meta[key] = val
        currentKey = null
        multilineMode = null
      }
    } else if (currentKey && (line.startsWith('  ') || line.startsWith('\t'))) {
      // Indented continuation line for current multiline value
      const trimmed = line.trim()
      if (multilineMode === 'literal') {
        meta[currentKey] += (meta[currentKey] ? '\n' : '') + trimmed
      } else {
        // folded or indent: join with space (like YAML > folding)
        meta[currentKey] += (meta[currentKey] ? ' ' : '') + trimmed
      }
    } else {
      // Non-indented, non-key line — stop multiline accumulation
      currentKey = null
      multilineMode = null
    }
  }

  // Final trim on all values
  for (const key of Object.keys(meta)) {
    if (typeof meta[key] === 'string') meta[key] = meta[key].trim()
  }

  return { meta, body }
}

/**
 * Extract first paragraph from markdown content as a summary.
 * Skips YAML frontmatter and headings.
 */
function extractSummary(mdContent) {
  if (!mdContent) return ''
  const { body } = parseFrontmatter(mdContent)
  const lines = body.split('\n')
  const paragraphLines = []
  let started = false
  for (const line of lines) {
    const trimmed = line.trim()
    // Skip leading headings and blank lines
    if (!started && (trimmed === '' || trimmed.startsWith('#'))) continue
    if (trimmed === '' && started) break
    started = true
    paragraphLines.push(trimmed)
  }
  return paragraphLines.join(' ').slice(0, 200)
}

function register() {
  ipcMain.handle('skills:scan-dir', async (_, dirPath) => {
    let dir
    try {
      dir = resolveSkillsPath(dirPath)
    } catch (err) {
      logger.error('skills:scan-dir resolveSkillsPath error', err.message)
      return []
    }
    if (!dir) return []
    try {
      let entries
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch { return [] }

      const skills = await Promise.all(
        entries
          .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
          .map(async entry => {
            const skillDir = path.join(dir, entry.name)
            // Look for SKILL.md first, then any .md file as fallback
            let mdFile = null
            const skillMd = path.join(skillDir, 'SKILL.md')
            const skillMdExists = await fs.promises.access(skillMd).then(() => true).catch(() => false)
            if (skillMdExists) {
              mdFile = skillMd
            } else {
              try {
                const files = (await fs.promises.readdir(skillDir)).filter(f => f.endsWith('.md'))
                if (files.length > 0) mdFile = path.join(skillDir, files[0])
              } catch {}
            }
            let summary = '', displayName = '', description = ''
            if (mdFile) {
              try {
                const content = await fs.promises.readFile(mdFile, 'utf8')
                const { meta } = parseFrontmatter(content)
                displayName = meta.name || ''
                description = meta.description || ''
                summary = extractSummary(content)
              } catch {}
            }
            // Get installation time (directory mtime)
            let installedAt = null
            try {
              const stats = await fs.promises.stat(skillDir)
              installedAt = stats.mtimeMs ? new Date(stats.mtimeMs).toISOString() : null
            } catch {}
            // Built-in marker: id matches one of the skills shipped in
            // electron/agent/builtin-skills/. Checked via builtinSkills helper.
            // Also accept a manifest.json override with { builtin: true } for
            // future third-party built-ins, though the source-tree check is
            // the primary mechanism.
            let isBuiltin = isBuiltinSkillId(entry.name)
            if (!isBuiltin) {
              try {
                const manifestPath = path.join(skillDir, 'manifest.json')
                if (fs.existsSync(manifestPath)) {
                  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
                  if (manifest && manifest.builtin === true) isBuiltin = true
                }
              } catch {}
            }
            return { id: entry.name, name: entry.name, displayName, description, summary, path: skillDir, installedAt, isBuiltin }
          })
      )
      return skills
    } catch (err) {
      logger.error('skills:scan-dir error', err.message)
      return []
    }
  })

  ipcMain.handle('skills:read-tree', (_, rawSkillPath) => {
    const skillPath = normalizePath(rawSkillPath)
    const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'System Volume Information', '$WinREAgent', 'Recovery', 'node_modules', '.git'])

    function readDir(dirPath) {
      let entries
      try {
        if (!fs.existsSync(dirPath)) return []
        entries = fs.readdirSync(dirPath, { withFileTypes: true })
      } catch {
        return []
      }
      const items = []
      const sorted = entries
        .filter(e => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
        .sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })

      for (const entry of sorted) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          const children = readDir(fullPath)
          items.push({ name: entry.name, path: fullPath, type: 'dir', children })
        } else {
          items.push({ name: entry.name, path: fullPath, type: 'file' })
        }
      }
      return items
    }

    try {
      return readDir(skillPath)
    } catch (err) {
      logger.error('skills:read-tree error', err.message)
      return []
    }
  })

  ipcMain.handle('skills:read-file', (_, rawPath) => {
    try {
      return { content: fs.readFileSync(normalizePath(rawPath), 'utf8') }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('skills:write-file', (_, rawPath, content) => {
    try {
      fs.writeFileSync(normalizePath(rawPath), content, 'utf8')
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('skills:delete-skill', async (_, skillPath) => {
    try {
      // Built-in skills are auto-reinstalled on next startup, so deleting
      // them here is both confusing (they come back) and unsafe (an agent
      // might be mid-task relying on one). Refuse deletion at the IPC layer.
      const skillId = path.basename(normalizePath(skillPath || ''))
      if (skillId && isBuiltinSkillId(skillId)) {
        return { error: 'Cannot delete a built-in skill.' }
      }
      await fs.promises.rm(skillPath, { recursive: true, force: true })
      if (skillId) {
        try { getAgentStore(ds.paths().DATA_DIR).pruneReferences('skill', skillId) }
        catch (err) { logger.error('skills:delete-skill prune failed', err.message) }
      }
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  })

  ipcMain.handle('skills:load-all-prompts', async (_, dirPath) => {
    let dir
    try {
      dir = resolveSkillsPath(dirPath)
    } catch (err) {
      logger.error('skills:load-all-prompts resolveSkillsPath error', err.message)
      return []
    }
    if (!dir) return []
    try {
      let entries
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
      } catch { return [] }

      const skills = await Promise.all(
        entries
          .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
          .map(async entry => {
            const skillMd = path.join(dir, entry.name, 'SKILL.md')
            try {
              const content = await fs.promises.readFile(skillMd, 'utf8')
              const { meta } = parseFrontmatter(content)
              return {
                id: entry.name,
                name: entry.name,
                displayName: meta.name || '',
                description: meta.description || '',
                systemPrompt: content
              }
            } catch { return null }
          })
      )
      return skills.filter(Boolean)
    } catch (err) {
      logger.error('skills:load-all-prompts error', err.message)
      return []
    }
  })

  // -- Remote SkillHub Support --------------------------------------------------
  /**
   * Fetch remote skills from a skillhub source
   * ClawHub uses Convex backend: POST https://wry-manatee-359.convex.cloud/api/query
   */
  ipcMain.handle('skills:fetch-remote', async (_, sourceId, options = {}) => {
    try {
      const sources = {
        clawhub: async () => {
          try {
            const keyword = options.keyword || ''
            const limit = Math.min(Math.max(options.limit || 50, 1), 200)

            if (keyword.trim()) {
              // Search mode: use Convex Action search:searchSkills (matches website WebSocket behavior).
              logger.info(`[Skills] Fetching ClawHub skills via search:searchSkills action, keyword: "${keyword}"`)

              const payload = {
                path: 'search:searchSkills',
                format: 'convex_encoded_json',
                args: [{
                  query: keyword.trim(),
                  highlightedOnly: false,
                  nonSuspiciousOnly: true,
                  limit
                }]
              }

              const response = await fetch('https://wry-manatee-359.convex.cloud/api/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
                body: JSON.stringify(payload)
              })

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              }

              const data = await response.json()
              if (data.status === 'error' || data.errorMessage) {
                throw new Error(`Convex error: ${data.errorMessage || 'Unknown error'}`)
              }

              // value is SkillSearchEntry[]; each item includes skill / owner / score fields.
              const results = Array.isArray(data.value) ? data.value : []
              logger.info(`[ClawHub API] Search found ${results.length} results`)

              return results.map(item => {
                const skillData = item.skill || item
                const ownerData = item.owner || {}
                const stats = skillData.stats || {}
                const slug = skillData.slug || ''
                return {
                  id: slug || skillData._id || skillData.displayName?.toLowerCase().replace(/\s+/g, '-'),
                  name: skillData.displayName || '',
                  description: skillData.summary || '',
                  category: 'general',
                  author: ownerData.handle || ownerData.displayName || 'ClawHub',
                  downloadUrl: `https://wry-manatee-359.convex.site/api/v1/download?slug=${slug}`,
                  rating: item.score || stats.stars || 0,
                  downloads: stats.downloads || 0,
                  stars: stats.stars || 0,
                  installs: stats.installsAllTime || stats.installsCurrent || 0,
                  homepage: `https://clawhub.ai/${ownerData.handle || 'user'}/${slug}`,
                  sourceId: 'clawhub',
                  installed: false
                }
              })
            } else {
              // Otherwise use the browse API.
              logger.info(`[Skills] Fetching ClawHub skills from browse API (limit: ${limit})`)

              const url = 'https://wry-manatee-359.convex.cloud/api/query'

              const payload = {
                path: 'skills:listPublicPageV4',
                format: 'convex_encoded_json',
                args: [{
                  dir: 'desc',
                  highlightedOnly: false,
                  nonSuspiciousOnly: true,
                  numItems: limit,
                  sort: 'downloads'
                }]
              }

              const headers = {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'User-Agent': 'PostmanRuntime/7.51.0',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
              }

              const body = JSON.stringify(payload)

              const response = await fetch(url, {
                method: 'POST',
                headers,
                body
              })

              const responseText = await response.text()

              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
              }

              const data = JSON.parse(responseText)

              // Check for Convex errors
              if (data.status === 'error' || data.errorMessage) {
                logger.error(`[ClawHub API] Convex Error:`, data.errorMessage)
                throw new Error(`Convex API Error: ${data.errorMessage || 'Unknown error'}`)
              }

              // Parse Convex response: {status: "success", value: {page: [...], hasMore, nextCursor}}
              let skillsData = []

              if (data.value && data.value.page && Array.isArray(data.value.page)) {
                skillsData = data.value.page
                logger.info(`[ClawHub API] Found ${skillsData.length} skills`)
              } else {
                logger.warn(`[ClawHub API] Unexpected response structure, keys:`, Object.keys(data || {}))
                return []
              }

              logger.info(`[ClawHub API] Successfully parsed ${skillsData.length} skills`)

              // Each item has structure: {skill: {...}, owner: {...}, ...}
              return skillsData.map(item => {
                const skillData = item.skill || {}
                const ownerData = item.owner || {}
                const stats = skillData.stats || {}

                return {
                  id: skillData.slug || skillData._id || skillData.displayName?.toLowerCase().replace(/\s+/g, '-'),
                  name: skillData.displayName || '',
                  description: skillData.summary || '',
                  category: skillData.tags ? Object.keys(skillData.tags)[0] : 'general',
                  author: ownerData.handle || ownerData.displayName || 'Unknown',
                  downloadUrl: `https://wry-manatee-359.convex.site/api/v1/download?slug=${skillData.slug}`,
                  rating: stats.stars || 0,
                  downloads: stats.downloads || 0,
                  stars: stats.stars || 0,
                  installs: stats.installsAllTime || stats.installsCurrent || 0,
                  homepage: `https://clawhub.ai/${ownerData.handle || 'user'}/${skillData.slug}`,
                  sourceId: 'clawhub',
                  installed: false
                }
              })
            }
          } catch (e) {
            logger.error(`[ClawHub API] Final Error:`, e.message)
            throw e
          }
        },

        'tencent-top': async () => {
          try {
            logger.info(`[Skills] Fetching Tencent Top 50 skills from lightmake.site/api/skills/top`)
            const response = await fetch('https://lightmake.site/api/skills/top', {
              headers: { 'Accept': 'application/json' }
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            const data = await response.json()
            let skills = []
            if (data.data && data.data.skills && Array.isArray(data.data.skills)) skills = data.data.skills
            else if (data.data && Array.isArray(data.data)) skills = data.data
            else if (data.skills && Array.isArray(data.skills)) skills = data.skills
            else if (Array.isArray(data)) skills = data

            return skills.map(s => ({
              id: s.slug || s.id || s.name?.toLowerCase().replace(/\s+/g, '-'),
              name: s.name || '',
              description: s.description_zh || s.description || '',
              category: s.category || 'general',
              author: s.ownerName || s.author || 'Tencent',
              downloadUrl: s.packageUrl || s.downloadUrl || s.homepage || '',
              rating: s.score || 0,
              downloads: s.downloads || 0,
              stars: s.stars || 0,
              installs: s.installs || 0,
              homepage: s.homepage || '',
              version: s.version || '',
              sourceId: 'tencent-top',
              installed: false
            }))
          } catch (e) {
            logger.error(`[Skills] Tencent Top API error:`, e.message)
            throw e
          }
        },

        tencent: async () => {
          try {

            const url = new URL('https://lightmake.site/api/skills')
            url.searchParams.append('page', String(options.page || 1))
            url.searchParams.append('pageSize', String(options.pageSize || 24))
            url.searchParams.append('sortBy', options.sortBy || 'score')
            url.searchParams.append('order', options.order || 'desc')
            if (options.category) {
              url.searchParams.append('category', options.category)
            }
            if (options.keyword && options.keyword.trim()) {
              url.searchParams.append('keyword', options.keyword.trim())
            }

            const requestUrl = url.toString()
            const response = await fetch(requestUrl, {
              timeout: 10000,
              headers: { 'Accept': 'application/json' }
            })

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data = await response.json()

            let skills = []

            // Handle nested response: {code: 0, data: {skills: [...]}}
            if (data.data && data.data.skills && Array.isArray(data.data.skills)) {
              skills = data.data.skills
            } else if (data.data && Array.isArray(data.data)) {
              skills = data.data
            } else if (data.skills && Array.isArray(data.skills)) {
              skills = data.skills
            } else if (Array.isArray(data)) {
              skills = data
            } else {
              logger.warn(`[Skills] Unexpected Tencent response format:`, JSON.stringify(data).substring(0, 200))
              return []
            }


            return skills.map(s => ({
              id: s.slug || s.id || s.name?.toLowerCase().replace(/\s+/g, '-'),
              name: s.name || '',
              description: s.description_zh || s.description || '',
              category: s.category || 'general',
              author: s.ownerName || s.author || 'Tencent',
              downloadUrl: s.packageUrl || s.downloadUrl || s.homepage || '',
              rating: s.score || 0,
              downloads: s.downloads || 0,
              stars: s.stars || 0,
              installs: s.installs || 0,
              homepage: s.homepage || '',
              version: s.version || '',
              sourceId: 'tencent',
              installed: false
            }))
          } catch (e) {
            logger.error(`[Skills] Tencent API error:`, e.message)
            logger.error(`[Skills] Stack:`, e.stack)
            throw e
          }
        }
      }

      const fetcher = sources[sourceId]
      if (!fetcher) throw new Error(`Unknown skillhub source: ${sourceId}`)

      const result = await fetcher()
      return result
    } catch (err) {
      logger.error(`[Skills] skills:fetch-remote error for ${sourceId}:`, err.message)
      logger.error(`[Skills] Stack:`, err.stack)
      return { error: err.message, skills: [] }
    }
  })

  /**
   * Install a remote skill from a skillhub source
   * Downloads, extracts, and validates the skill package
   */
  ipcMain.handle('skills:install-remote', async (_, sourceId, skillId, skillUrl, skillsPath) => {
    // Use provided skillsPath, or fallback to default
    const skillsDir = skillsPath || path.join(ds.paths().DATA_DIR, 'skills')
    const tempDir = path.join(os.tmpdir(), `skill-${skillId}-${Date.now()}`)

    // Normalize clawhub web page URLs -> actual zip download endpoint
    // Pattern: https://clawhub.ai/{handle}/{slug} -> https://wry-manatee-359.convex.site/api/v1/download?slug={slug}
    if (skillUrl && /^https:\/\/clawhub\.ai\/[^/]+\/[^/?#]+$/.test(skillUrl)) {
      const slug = skillUrl.split('/').pop()
      skillUrl = `https://wry-manatee-359.convex.site/api/v1/download?slug=${slug}`
      logger.info(`[Skills] Normalized clawhub web URL to download URL: ${skillUrl}`)
    }

    // Tencent skillhub.cn listing returns `homepage: https://api.skillhub.cn/{owner}/{slug}`
    // and no real package URL. The site's own SPA downloads via:
    //   https://api.skillhub.cn/api/v1/download?slug={slug}
    // which 302-redirects to a COS-hosted zip (Node fetch follows redirects).
    if (skillUrl && /^https:\/\/(api\.)?skillhub\.cn\/[^/]+\/[^/?#]+\/?$/.test(skillUrl)) {
      const slug = skillUrl.replace(/\/$/, '').split('/').pop()
      skillUrl = `https://api.skillhub.cn/api/v1/download?slug=${slug}`
      logger.info(`[Skills] Normalized skillhub.cn URL to download endpoint: ${skillUrl}`)
    }

    try {
      // Ensure skillsDir exists
      await fs.promises.mkdir(skillsDir, { recursive: true })

      // 1. Download skill package
      logger.info(`[Skills] Downloading ${sourceId}/${skillId} from ${skillUrl}`)
      const response = await fetch(skillUrl)
      if (!response.ok) throw new Error(`Download failed: ${response.status}`)

      const arrayBuf = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuf)
      if (!buffer || buffer.length === 0) throw new Error('Empty package downloaded')

      // 2. Determine format by magic bytes, default to ZIP
      await fs.promises.mkdir(tempDir, { recursive: true })

      const isGzip = buffer[0] === 0x1f && buffer[1] === 0x8b
      const isZip  = !isGzip && (buffer[0] === 0x50 && buffer[1] === 0x4b)
      // Unknown magic bytes -> default to ZIP (most common from web downloads)
      const useZip = isZip || (!isGzip)

      logger.info(`[Skills] Format detect: bytes=[0x${buffer[0].toString(16)},0x${buffer[1].toString(16)}] isGzip=${isGzip} useZip=${useZip} size=${buffer.length}`)

      // 3. Extract package
      if (useZip) {
        const AdmZip = require('adm-zip')
        try {
          const zip = new AdmZip(buffer)
          zip.extractAllTo(tempDir, true)
        } catch (zipErr) {
          // ZIP failed -- last resort: try tar.gz
          logger.warn(`[Skills] ZIP extract failed (${zipErr.message}), retrying as tar.gz`)
          const tar = require('tar')
          const zlib = require('zlib')
          const { Readable } = require('stream')
          await fs.promises.rm(tempDir, { recursive: true })
          await fs.promises.mkdir(tempDir, { recursive: true })
          const stream = Readable.from([buffer])
          await new Promise((resolve, reject) => {
            stream.pipe(zlib.createGunzip()).pipe(tar.x({ cwd: tempDir })).on('finish', resolve).on('error', reject)
          })
        }
      } else {
        // Confirmed gzip magic bytes
        const tar = require('tar')
        const zlib = require('zlib')
        const { Readable } = require('stream')
        const stream = Readable.from([buffer])
        await new Promise((resolve, reject) => {
          stream.pipe(zlib.createGunzip()).pipe(tar.x({ cwd: tempDir })).on('finish', resolve).on('error', reject)
        })
      }

      // 4. Validate: check for SKILL.md
      let skillMdPath = path.join(tempDir, 'SKILL.md')
      if (!fs.existsSync(skillMdPath)) {
        // Try to find SKILL.md in subdirectories (common in nested archives)
        const entries = fs.readdirSync(tempDir)
        for (const entry of entries) {
          const subPath = path.join(tempDir, entry, 'SKILL.md')
          if (fs.existsSync(subPath)) {
            skillMdPath = subPath
            // Move contents up one level -- use cp+rm to handle cross-device
            const contentDir = path.dirname(skillMdPath)
            const tempDir2 = path.join(os.tmpdir(), `skill-${skillId}-flatten`)
            if (fs.existsSync(tempDir2)) await fs.promises.rm(tempDir2, { recursive: true })
            await fs.promises.cp(contentDir, tempDir2, { recursive: true })
            await fs.promises.rm(tempDir, { recursive: true })
            await fs.promises.cp(tempDir2, tempDir, { recursive: true })
            await fs.promises.rm(tempDir2, { recursive: true })
            skillMdPath = path.join(tempDir, 'SKILL.md')
            break
          }
        }
      }

      if (!fs.existsSync(skillMdPath)) {
        throw new Error('Invalid skill package: missing SKILL.md')
      }

      // 5. Copy to target directory (use cp+rm instead of rename to support cross-device moves)
      const targetDir = path.join(skillsDir, skillId)
      if (fs.existsSync(targetDir)) {
        await fs.promises.rm(targetDir, { recursive: true })
      }

      await fs.promises.mkdir(skillsDir, { recursive: true })
      await fs.promises.cp(tempDir, targetDir, { recursive: true })
      await fs.promises.rm(tempDir, { recursive: true })

      logger.info(`[Skills] Successfully installed ${sourceId}/${skillId} to ${targetDir}`)
      return {
        success: true,
        path: targetDir,
        message: `Skill "${skillId}" installed successfully`
      }
    } catch (err) {
      logger.error(`[Skills] install-remote error for ${sourceId}/${skillId}:`, err.message)
      // Cleanup temp directory
      try {
        if (fs.existsSync(tempDir)) {
          await fs.promises.rm(tempDir, { recursive: true })
        }
      } catch {}
      // Strip internal paths from error message before returning to renderer
      const cleanMessage = err.message
        .replace(/\nRequire stack:[\s\S]*/m, '')
        .replace(/Cannot find module '([^']+)'/g, "Missing required module: '$1'")
        .trim()
      return {
        success: false,
        error: cleanMessage
      }
    }
  })
}

module.exports = { register }
