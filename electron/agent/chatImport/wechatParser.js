'use strict'

/**
 * wechatParser.js — Node.js port of wechat_parser.py
 *
 * Parses decrypted WeChat (3.x & 4.x) and iMessage (macOS) SQLite databases.
 * Uses better-sqlite3 for read-only DB access.
 *
 * NOTE: classifyMessages() and buildMessageBlock() live in chatParser.js — not duplicated here.
 */

const fs   = require('fs')
const path = require('path')
const crypto = require('crypto')

let Database = null
function getDatabase() {
  if (!Database) Database = require('better-sqlite3')
  return Database
}

// ── WeChat 3.x SQL queries ─────────────────────────────────────────────────

const MSG_QUERY_SIMPLE = `
SELECT
    localId,
    Type,
    IsSender,
    CreateTime,
    StrContent
FROM MSG
WHERE Type = 1
ORDER BY CreateTime ASC
`

const CONTACT_QUERY = `
SELECT
    UserName,
    Alias,
    Remark,
    NickName,
    Type
FROM Contact
WHERE Type != 4
ORDER BY NickName
`

// ── WeChat 4.x SQL queries ─────────────────────────────────────────────────

const CONTACT_QUERY_V4 = `
SELECT
    username  AS UserName,
    alias     AS Alias,
    remark    AS Remark,
    nick_name AS NickName
FROM contact
WHERE delete_flag = 0
ORDER BY nick_name
`

// ── Non-text message placeholders to skip ──────────────────────────────────

const SKIP_CONTENT = new Set([
  '[图片]', '[语音]', '[文件]', '[视频]', '[撤回了一条消息]', '',
])

// ── Database helpers ───────────────────────────────────────────────────────

/**
 * Open a SQLite database in read-only mode via better-sqlite3.
 * @param {string} dbPath - Absolute path to the .db file
 * @returns {object|null} better-sqlite3 Database instance, or null on error
 */
function openDb(dbPath) {
  try {
    const BetterSqlite3 = getDatabase()
    const db = new BetterSqlite3(dbPath, { readonly: true })
    // Quick validation — will throw if the file is not a valid SQLite DB
    db.prepare('SELECT name FROM sqlite_master LIMIT 1').get()
    return db
  } catch (err) {
    console.error(`[wechatParser] Cannot open database ${dbPath}: ${err.message}`)
    console.error('[wechatParser] Make sure the database is decrypted first.')
    return null
  }
}

/**
 * List all table names in a database.
 * @param {object} db - better-sqlite3 Database instance
 * @returns {string[]}
 */
function getTables(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  return rows.map(r => r.name)
}

// ── Layout detection ───────────────────────────────────────────────────────

/**
 * Check if a directory has WeChat 4.x layout (contact/contact.db + message/).
 * @param {string} dbDir
 * @returns {boolean}
 */
function detectV4Layout(dbDir) {
  const contactDb = path.join(dbDir, 'contact', 'contact.db')
  const messageDir = path.join(dbDir, 'message')
  return fs.existsSync(contactDb) && fs.existsSync(messageDir) && fs.statSync(messageDir).isDirectory()
}

/**
 * Detect multi-account container directories.
 * If dbDir itself has a valid layout, returns [dbDir].
 * Otherwise checks subdirectories for 4.x layout.
 * @param {string} dbDir
 * @returns {string[]}
 */
function findAccountDirs(dbDir) {
  if (detectV4Layout(dbDir)) return [dbDir]

  // Check for MicroMsg.db (3.x) — if found, this IS the right dir
  if (fs.existsSync(path.join(dbDir, 'MicroMsg.db'))) return [dbDir]

  // Check subdirectories for 4.x layout
  const acctDirs = []
  if (fs.existsSync(dbDir) && fs.statSync(dbDir).isDirectory()) {
    const children = fs.readdirSync(dbDir).sort()
    for (const child of children) {
      const childPath = path.join(dbDir, child)
      if (fs.statSync(childPath).isDirectory() && detectV4Layout(childPath)) {
        acctDirs.push(childPath)
      }
    }
  }
  return acctDirs.length > 0 ? acctDirs : [dbDir]
}

// ── DB file finders ────────────────────────────────────────────────────────

/**
 * Recursively search for a file by name under a directory.
 * Returns the first match or null.
 * @param {string} dir
 * @param {string} fileName
 * @returns {string|null}
 */
function _findFileRecursive(dir, fileName) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === fileName) return fullPath
    if (entry.isDirectory()) {
      const found = _findFileRecursive(fullPath, fileName)
      if (found) return found
    }
  }
  return null
}

/**
 * Recursively search for all files matching a name under a directory.
 * @param {string} dir
 * @param {string} fileName
 * @returns {string[]}
 */
function _findAllFilesRecursive(dir, fileName) {
  const results = []
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return results
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === fileName) {
      results.push(fullPath)
    } else if (entry.isDirectory()) {
      results.push(..._findAllFilesRecursive(fullPath, fileName))
    }
  }
  return results
}

/**
 * Find MicroMsg.db (3.x) or contact/contact.db (4.x), searching recursively.
 * @param {string} dbDir
 * @returns {string|null}
 */
function findMicroMsgDb(dbDir) {
  // 4.x layout
  const contactDb = path.join(dbDir, 'contact', 'contact.db')
  if (fs.existsSync(contactDb)) return contactDb

  // 3.x layout
  const microMsg = path.join(dbDir, 'MicroMsg.db')
  if (fs.existsSync(microMsg)) return microMsg

  // Recursive search
  const found = _findFileRecursive(dbDir, 'MicroMsg.db')
  if (found) return found

  return _findFileRecursive(dbDir, 'contact.db')
}

/**
 * Find message DB files (MSG*.db for 3.x, message/message_N.db for 4.x).
 * @param {string} dbDir
 * @returns {string[]}
 */
function findMsgDbs(dbDir) {
  // 4.x layout
  const msgDir = path.join(dbDir, 'message')
  if (fs.existsSync(msgDir) && fs.statSync(msgDir).isDirectory()) {
    const dbs = fs.readdirSync(msgDir)
      .filter(f => /^message_\d+\.db$/.test(f))
      .sort()
      .map(f => path.join(msgDir, f))
    if (dbs.length > 0) return dbs
  }

  // 3.x layout — direct children
  let dbs = fs.existsSync(dbDir) ? fs.readdirSync(dbDir)
    .filter(f => /^MSG\d*\.db$/.test(f))
    .sort()
    .map(f => path.join(dbDir, f)) : []

  // Also check Multi/ subdirectory
  const multiDir = path.join(dbDir, 'Multi')
  if (fs.existsSync(multiDir) && fs.statSync(multiDir).isDirectory()) {
    const multiDbs = fs.readdirSync(multiDir)
      .filter(f => /^MSG\d*\.db$/.test(f))
      .sort()
      .map(f => path.join(multiDir, f))
    dbs = dbs.concat(multiDbs)
  }

  // Fallback: recursive search
  if (dbs.length === 0) {
    dbs = _findAllFilesRecursive(dbDir, 'MSG0.db') // seed with known name
    // Also find MSG1.db, MSG2.db, etc.
    if (dbs.length === 0) {
      const allFiles = []
      const _walk = (dir) => {
        if (!fs.existsSync(dir)) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name)
          if (entry.isFile() && /^MSG\d*\.db$/.test(entry.name)) {
            allFiles.push(full)
          } else if (entry.isDirectory()) {
            _walk(full)
          }
        }
      }
      _walk(dbDir)
      dbs = allFiles.sort()
    }
  }

  return dbs
}

// ── Contact listing ────────────────────────────────────────────────────────

/**
 * List contacts from MicroMsg.db (3.x) or contact/contact.db (4.x).
 * Searches account subdirectories automatically.
 * @param {string} dbDir
 * @returns {Array<{wxid: string, alias: string, remark: string, nickname: string}>}
 */
function listContacts(dbDir) {
  const acctDirs = findAccountDirs(dbDir)
  let microDb = null
  for (const ad of acctDirs) {
    microDb = findMicroMsgDb(ad)
    if (microDb) break
  }
  if (!microDb) {
    console.error('[wechatParser] Contact database not found.')
    return []
  }

  const db = openDb(microDb)
  if (!db) return []

  try {
    const tables = getTables(db)
    let query
    if (tables.includes('contact')) {
      query = CONTACT_QUERY_V4
    } else if (tables.includes('Contact')) {
      query = CONTACT_QUERY
    } else {
      console.error(`[wechatParser] No contact table found in ${microDb}`)
      return []
    }

    const rows = db.prepare(query).all()
    return rows.map(row => ({
      wxid:     row.UserName || '',
      alias:    row.Alias || '',
      remark:   row.Remark || '',
      nickname: row.NickName || '',
    }))
  } catch (err) {
    console.error(`[wechatParser] Failed to read contacts: ${err.message}`)
    return []
  } finally {
    db.close()
  }
}

// ── Message counting ───────────────────────────────────────────────────────

/**
 * Count messages per contact wxid in a single directory.
 * @param {string} dbDir
 * @returns {Object<string, number>}
 */
function _countMessagesInDir(dbDir) {
  const counts = {}
  const isV4 = detectV4Layout(dbDir)
  const msgDbs = findMsgDbs(dbDir)

  for (const dbFile of msgDbs) {
    const db = openDb(dbFile)
    if (!db) continue

    try {
      const tables = getTables(db)

      if (isV4) {
        // 4.x: each wxid has Msg_<md5(wxid)> table, Name2Id maps wxid -> rowid
        const name2id = {}
        if (tables.includes('Name2Id')) {
          const rows = db.prepare('SELECT rowid, user_name FROM Name2Id').all()
          for (const row of rows) {
            name2id[row.rowid] = row.user_name
          }
        }

        for (const tbl of tables) {
          if (!tbl.startsWith('Msg_')) continue
          try {
            const row = db.prepare(`SELECT COUNT(*) AS cnt FROM [${tbl}] WHERE local_type = 1`).get()
            const cnt = row ? row.cnt : 0
            if (cnt > 0) {
              // Reverse-map: find wxid whose md5 matches this table
              const tblHash = tbl.slice(4) // strip "Msg_"
              let wxid = null
              for (const [, uname] of Object.entries(name2id)) {
                if (crypto.createHash('md5').update(uname).digest('hex') === tblHash) {
                  wxid = uname
                  break
                }
              }
              if (wxid) {
                counts[wxid] = (counts[wxid] || 0) + cnt
              }
            }
          } catch (_) {
            // Skip tables that don't match expected schema
          }
        }
      } else if (tables.includes('Name2ID') && tables.includes('MSG')) {
        // 3.x: single MSG table with TalkerId -> Name2ID
        const rows = db.prepare(`
          SELECT n.UsrName, COUNT(*) AS cnt
          FROM MSG m
          JOIN Name2ID n ON n._id = m.TalkerId
          WHERE m.Type = 1
          GROUP BY n.UsrName
        `).all()
        for (const row of rows) {
          const wxid = row.UsrName
          counts[wxid] = (counts[wxid] || 0) + row.cnt
        }
      }
    } catch (_) {
      // Skip unreadable DBs
    } finally {
      db.close()
    }
  }
  return counts
}

/**
 * Count messages per contact wxid across all MSG/message DBs.
 * Searches account subdirectories automatically.
 * @param {string} dbDir
 * @returns {Object<string, number>}
 */
function countMessagesByContact(dbDir) {
  const counts = {}
  const acctDirs = findAccountDirs(dbDir)
  for (const ad of acctDirs) {
    const subCounts = _countMessagesInDir(ad)
    for (const [wxid, cnt] of Object.entries(subCounts)) {
      counts[wxid] = (counts[wxid] || 0) + cnt
    }
  }
  return counts
}

// ── Contact lookup ─────────────────────────────────────────────────────────

/**
 * Find a contact's wxid by name (exact match first, then fuzzy).
 * @param {string} dbDir
 * @param {string} targetName
 * @returns {string|null}
 */
function findContactWxid(dbDir, targetName) {
  const contacts = listContacts(dbDir)
  const targetLower = targetName.toLowerCase()

  // Exact match
  for (const c of contacts) {
    if (targetLower === c.wxid.toLowerCase() ||
        targetLower === c.remark.toLowerCase() ||
        targetLower === c.nickname.toLowerCase() ||
        targetLower === c.alias.toLowerCase()) {
      return c.wxid
    }
  }

  // Fuzzy match
  for (const c of contacts) {
    if (targetLower && (
      c.wxid.toLowerCase().includes(targetLower) ||
      c.remark.toLowerCase().includes(targetLower) ||
      c.nickname.toLowerCase().includes(targetLower)
    )) {
      console.log(`[wechatParser] Fuzzy match: ${c.remark || c.nickname} (${c.wxid})`)
      return c.wxid
    }
  }

  return null
}

// ── XML text extraction ────────────────────────────────────────────────────

/**
 * Extract readable text from WeChat XML rich messages.
 * Looks for <title> or <des> tag content.
 * @param {string} xmlContent
 * @returns {string} Extracted text prefixed with "[Share] ", or empty string
 */
function extractTextFromXml(xmlContent) {
  // Extract <title> tag content
  let m = xmlContent.match(/<title[^>]*>([^<]+)<\/title>/)
  if (m) return `[Share] ${m[1].trim()}`

  // Extract <des> tag content
  m = xmlContent.match(/<des[^>]*>([^<]+)<\/des>/)
  if (m) return `[Share] ${m[1].trim()}`

  return ''
}

// ── Timestamp formatting ───────────────────────────────────────────────────

/**
 * Format a Unix timestamp (seconds) into "YYYY-MM-DD HH:mm:ss".
 * @param {number} ts - Unix timestamp in seconds
 * @returns {string}
 */
function _formatTimestamp(ts) {
  try {
    const d = new Date(Number(ts) * 1000)
    if (isNaN(d.getTime())) return String(ts)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch (_) {
    return String(ts)
  }
}

// ── Message extraction (4.x) ──────────────────────────────────────────────

/**
 * Extract text messages from a 4.x message_N.db for a specific target wxid.
 * Table name is Msg_<md5(wxid)>.
 * @param {string} dbPath
 * @param {string} targetWxid
 * @param {string|null} myWxid - Logged-in user's wxid (for sender detection)
 * @returns {Array<{sender: string, content: string, timestamp: string, talker_wxid: string}>}
 */
function extractMessagesV4(dbPath, targetWxid, myWxid) {
  const db = openDb(dbPath)
  if (!db) return []

  const tableHash = crypto.createHash('md5').update(targetWxid).digest('hex')
  const tableName = `Msg_${tableHash}`

  const tables = getTables(db)
  if (!tables.includes(tableName)) {
    db.close()
    return []
  }

  const messages = []
  try {
    // Build Name2Id reverse map to determine sender
    let myRowid = null
    if (tables.includes('Name2Id') && myWxid) {
      const rows = db.prepare('SELECT rowid, user_name FROM Name2Id').all()
      for (const row of rows) {
        if (row.user_name === myWxid) {
          myRowid = row.rowid
          break
        }
      }
    }

    const rows = db.prepare(`
      SELECT local_type, real_sender_id, create_time, message_content
      FROM [${tableName}]
      WHERE local_type = 1
      ORDER BY create_time ASC
    `).all()

    for (const row of rows) {
      let content = row.message_content || ''
      if (Buffer.isBuffer(content)) continue // Skip compressed/binary content
      if (!content.trim()) continue
      if (SKIP_CONTENT.has(content.trim())) continue
      if (content.trim().startsWith('<')) {
        content = extractTextFromXml(content)
        if (!content) continue
      }

      const ts = row.create_time || 0
      const timestamp = _formatTimestamp(ts)
      const senderId = row.real_sender_id
      const isMe = (myRowid !== null && senderId === myRowid)

      messages.push({
        sender: isMe ? 'me' : 'them',
        content: content.trim(),
        timestamp,
        talker_wxid: targetWxid,
      })
    }
  } catch (err) {
    console.error(`[wechatParser] Failed to read messages from ${tableName} (${dbPath}): ${err.message}`)
  } finally {
    db.close()
  }

  return messages
}

// ── Message extraction (3.x) ──────────────────────────────────────────────

/**
 * Extract text messages from a single 3.x MSG*.db.
 * @param {string} dbPath
 * @param {string|null} targetWxid - Filter by this wxid, or null for all
 * @returns {Array<{sender: string, content: string, timestamp: string, talker_wxid: string}>}
 */
function extractMessagesFromDb(dbPath, targetWxid) {
  const db = openDb(dbPath)
  if (!db) return []

  const tables = getTables(db)
  const messages = []

  try {
    if (!tables.includes('MSG')) return []

    let rows
    try {
      if (tables.includes('Name2ID')) {
        rows = db.prepare(`
          SELECT
              m.localId,
              m.Type,
              m.IsSender,
              m.CreateTime,
              m.StrContent,
              n.UsrName AS talker_wxid
          FROM MSG m
          LEFT JOIN Name2ID n ON n._id = m.TalkerId
          WHERE m.Type = 1
          ORDER BY m.CreateTime ASC
        `).all()
      } else {
        rows = db.prepare(MSG_QUERY_SIMPLE).all()
        rows = rows.map(r => ({ ...r, talker_wxid: null }))
      }
    } catch (_) {
      rows = db.prepare(MSG_QUERY_SIMPLE).all()
      rows = rows.map(r => ({ ...r, talker_wxid: null }))
    }

    for (const row of rows) {
      const talker = row.talker_wxid || ''
      if (targetWxid) {
        if (!talker) continue
        if (talker !== targetWxid) continue
      }

      let content = row.StrContent || ''
      if (!content.trim()) continue
      if (SKIP_CONTENT.has(content.trim())) continue
      if (content.trim().startsWith('<')) {
        content = extractTextFromXml(content)
        if (!content) continue
      }

      const ts = row.CreateTime || 0
      const timestamp = _formatTimestamp(ts)

      messages.push({
        sender: row.IsSender === 1 ? 'me' : 'them',
        content: content.trim(),
        timestamp,
        talker_wxid: talker,
      })
    }
  } catch (err) {
    console.error(`[wechatParser] Failed to read messages (${dbPath}): ${err.message}`)
  } finally {
    db.close()
  }

  return messages
}

// ── My wxid detection ──────────────────────────────────────────────────────

/**
 * Detect the logged-in user's wxid from the directory name or Name2Id table.
 * @param {string} dbDir
 * @returns {string|null}
 */
function detectMyWxid(dbDir) {
  const parsed = path.parse(dbDir)
  let acct

  // 4.x: directory name pattern — <wxid>_<hash>/db_storage
  if (parsed.base === 'db_storage') {
    acct = path.basename(path.dirname(dbDir))
  } else {
    acct = parsed.base
  }

  if (!acct) return null

  // Account dir name is wxid + "_" + short hash, but wxid may contain underscores.
  // Try to find it in Name2Id of the first message DB.
  const msgDbs = findMsgDbs(dbDir)
  if (msgDbs.length > 0) {
    const db = openDb(msgDbs[0])
    if (db) {
      try {
        const tables = getTables(db)
        if (tables.includes('Name2Id')) {
          const rows = db.prepare('SELECT user_name FROM Name2Id').all()
          for (const row of rows) {
            const uname = row.user_name || ''
            if (uname && acct.startsWith(uname)) {
              return uname
            }
          }
        }
      } catch (_) {
        // Ignore errors
      } finally {
        db.close()
      }
    }
  }
  return null
}

// ── Directory-level message extraction ─────────────────────────────────────

/**
 * Extract messages from all DB files in directory, merged and sorted by time.
 * Auto-detects multi-account containers and 4.x layout.
 * @param {string} dbDir
 * @param {string|null} targetWxid
 * @returns {Array<{sender: string, content: string, timestamp: string, talker_wxid: string}>}
 */
function extractMessagesFromDir(dbDir, targetWxid) {
  const allMessages = []
  const acctDirs = findAccountDirs(dbDir)

  for (const ad of acctDirs) {
    const isV4 = detectV4Layout(ad)
    const dbFiles = findMsgDbs(ad)
    if (dbFiles.length === 0) continue

    if (isV4 && targetWxid) {
      const myWxid = detectMyWxid(ad)
      for (const dbFile of dbFiles) {
        const msgs = extractMessagesV4(dbFile, targetWxid, myWxid)
        allMessages.push(...msgs)
        if (msgs.length > 0) {
          console.error(`  ${path.basename(dbFile)}: ${msgs.length} messages`)
        }
      }
    } else {
      for (const dbFile of dbFiles) {
        const msgs = extractMessagesFromDb(dbFile, targetWxid)
        allMessages.push(...msgs)
        if (msgs.length > 0) {
          console.error(`  ${path.basename(dbFile)}: ${msgs.length} messages`)
        }
      }
    }
  }

  if (allMessages.length === 0) {
    console.error(`[wechatParser] No message DB files found in ${dbDir}`)
  }

  allMessages.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
  return allMessages
}

// ── Avatar loading ─────────────────────────────────────────────────────────

/**
 * Load contact avatars from head_image.db.
 * @param {string} dbDir
 * @returns {Object<string, string>} Map of username -> "data:image/jpeg;base64,..."
 */
function loadAvatars(dbDir) {
  const avatars = {}
  const acctDirs = findAccountDirs(dbDir)

  for (const ad of acctDirs) {
    let headDbPath = path.join(ad, 'head_image', 'head_image.db')
    if (!fs.existsSync(headDbPath)) {
      headDbPath = _findFileRecursive(ad, 'head_image.db')
    }
    if (!headDbPath) continue

    const db = openDb(headDbPath)
    if (!db) continue

    try {
      const rows = db.prepare(
        'SELECT username, image_buffer FROM head_image WHERE length(image_buffer) > 0'
      ).all()
      for (const row of rows) {
        const uname = row.username
        const buf = row.image_buffer
        if (uname && buf && Buffer.isBuffer(buf) && buf.length > 100) {
          avatars[uname] = 'data:image/jpeg;base64,' + buf.toString('base64')
        }
      }
    } catch (_) {
      // Ignore errors from unexpected schema
    } finally {
      db.close()
    }
  }
  return avatars
}

// ── iMessage (macOS) ───────────────────────────────────────────────────────

const APPLE_EPOCH_OFFSET = 978307200 // Seconds between Unix epoch and Apple epoch (2001-01-01)

/**
 * List iMessage contacts from a macOS chat.db.
 * @param {string} dbPath - Path to ~/Library/Messages/chat.db
 * @returns {Array<{handle: string, count: number}>}
 */
function listImessageContacts(dbPath) {
  const db = openDb(dbPath)
  if (!db) return []

  try {
    const rows = db.prepare(`
      SELECT DISTINCT
          h.id AS handle_id,
          COUNT(m.ROWID) AS message_count
      FROM handle h
      LEFT JOIN message m ON m.handle_id = h.ROWID
      GROUP BY h.id
      ORDER BY message_count DESC
    `).all()
    return rows.map(r => ({ handle: r.handle_id, count: r.message_count }))
  } catch (err) {
    console.error(`[wechatParser] Failed to read iMessage contacts: ${err.message}`)
    return []
  } finally {
    db.close()
  }
}

/**
 * Extract iMessage messages for a specific contact handle.
 * Handles Apple epoch conversion (978307200s offset) and iOS 11+ nanosecond dates.
 * @param {string} dbPath - Path to ~/Library/Messages/chat.db
 * @param {string} targetHandle - Phone number or Apple ID to match (fuzzy)
 * @returns {Array<{sender: string, content: string, timestamp: string, talker_wxid: string}>}
 */
function extractImessageMessages(dbPath, targetHandle) {
  const db = openDb(dbPath)
  if (!db) return []

  const messages = []
  try {
    // Find target handle ROWIDs (fuzzy match via LIKE)
    let handleRows = db.prepare(
      'SELECT ROWID, id FROM handle WHERE id LIKE ?'
    ).all(`%${targetHandle}%`)

    if (handleRows.length === 0) {
      console.error(`[wechatParser] Contact '${targetHandle}' not found, trying fuzzy match...`)
      handleRows = db.prepare('SELECT ROWID, id FROM handle').all()
      handleRows = handleRows.filter(r => r.id.toLowerCase().includes(targetHandle.toLowerCase()))
    }

    if (handleRows.length === 0) {
      console.error(`[wechatParser] Contact '${targetHandle}' not found. Use listImessageContacts() to see all contacts.`)
      return []
    }

    const handleIds = handleRows.map(r => r.ROWID)
    const matchedHandle = handleRows[0].id
    console.log(`[wechatParser] Matched contact: ${matchedHandle} (${handleIds.length} handle(s))`)

    const placeholders = handleIds.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT
          m.ROWID,
          m.text,
          m.is_from_me,
          m.date,
          h.id AS handle_id
      FROM message m
      LEFT JOIN handle h ON h.ROWID = m.handle_id
      WHERE m.handle_id IN (${placeholders})
         OR (m.is_from_me = 1 AND m.ROWID IN (
             SELECT message_id FROM chat_message_join
             WHERE chat_id IN (
                 SELECT chat_id FROM chat_handle_join
                 WHERE handle_id IN (${placeholders})
             )
         ))
      ORDER BY m.date ASC
    `).all(...handleIds, ...handleIds)

    for (const row of rows) {
      const text = row.text || ''
      if (!text.trim()) continue

      // Filter attachment placeholder (Unicode object replacement char)
      if (text.startsWith('\ufffc')) continue

      // Convert Apple epoch date to Unix timestamp
      const rawDate = row.date || 0
      let unixTs
      // iMessage date in iOS 11+ is nanoseconds, earlier versions use seconds
      if (rawDate > 1e12) {
        unixTs = rawDate / 1e9 + APPLE_EPOCH_OFFSET
      } else {
        unixTs = rawDate + APPLE_EPOCH_OFFSET
      }

      const timestamp = _formatTimestamp(unixTs)

      messages.push({
        sender: row.is_from_me ? 'me' : 'them',
        content: text.trim(),
        timestamp,
        talker_wxid: row.handle_id || matchedHandle,
      })
    }
  } catch (err) {
    console.error(`[wechatParser] Failed to read iMessage messages: ${err.message}`)
  } finally {
    db.close()
  }

  return messages
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  openDb,
  getTables,
  detectV4Layout,
  findAccountDirs,
  findMicroMsgDb,
  findMsgDbs,
  listContacts,
  countMessagesByContact,
  findContactWxid,
  extractMessagesV4,
  extractMessagesFromDb,
  extractMessagesFromDir,
  detectMyWxid,
  loadAvatars,
  extractImessageMessages,
  listImessageContacts,
  extractTextFromXml,
}
