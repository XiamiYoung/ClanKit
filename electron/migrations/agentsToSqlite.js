/**
 * One-shot migration from agents.json (+ souls/system + agent-artifacts/{type}
 * sidecar JSONs) to agents.db.
 *
 * Triggered on app start by main.js if agents.db doesn't exist yet (or has
 * empty agents/categories tables). Idempotent: if agents.db already has rows,
 * the migration is a no-op.
 *
 * Sources read:
 *   - {DATA_DIR}/agents.json       (the canonical legacy file)
 *   - {DATA_DIR}/souls/{system,users}/*.{speech,evidence,harness}.json
 *     (orphaned pre-rename location — 16 .speech.json on dev box)
 *   - {DATA_DIR}/agent-artifacts/{system,users}/*.{speech,evidence,harness}.json
 *     (the official post-rename location; usually empty on dev boxes)
 *
 * After successful migration, source files are kept on disk; the main app
 * is responsible for deleting them after Phase 6 verification.
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')
const { getInstance: getAgentStore } = require('../agent/AgentStore')

function _readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function _readArtifactDir(dir, suffix) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(suffix))
    .map(f => {
      const id = f.slice(0, -suffix.length)
      const data = _readJsonSafe(path.join(dir, f))
      return data ? { id, data } : null
    })
    .filter(Boolean)
}

/** Strip duplicate skill IDs — fixes the clankai-config-admin /
 *  clankit-config-admin overlap on Clank. */
function _dedupSkillIds(arr) {
  if (!Array.isArray(arr)) return arr
  return [...new Set(arr)]
}

function _normalizeAgentForMigration(a) {
  // Strip dead fields. mcpServerIds / enabledSkillIds were null on every row
  // observed on the dev machine — confirmed legacy.
  const { mcpServerIds: _drop1, enabledSkillIds: _drop2, ...clean } = a
  return {
    ...clean,
    requiredSkillIds: _dedupSkillIds(clean.requiredSkillIds),
  }
}

function migrate(dataDir) {
  const store = getAgentStore(dataDir)

  // Idempotency gate: if either kind already has rows, this is a re-run.
  const sysCount  = store.countByKind('system')
  const userCount = store.countByKind('user')
  if (sysCount > 0 || userCount > 0) {
    logger.info(`[agentsToSqlite] already migrated (${sysCount} system + ${userCount} user)`)
    return { migrated: 0, artifactsRecovered: 0, skipped: true }
  }

  // ── Step 1: read agents.json ──────────────────────────────────────────
  const agentsFile = path.join(dataDir, 'agents.json')
  const json = _readJsonSafe(agentsFile)

  let migratedCount = 0
  if (json && typeof json === 'object') {
    const sysItems  = (json.agents?.items || []).map(_normalizeAgentForMigration)
    const sysCats   = json.agents?.categories || []
    const userItems = (json.personas?.items || []).map(_normalizeAgentForMigration)
    const userCats  = json.personas?.categories || []

    store.replaceKind('system', sysItems, sysCats)
    store.replaceKind('user',   userItems, userCats)
    migratedCount = sysItems.length + userItems.length
    logger.info(
      `[agentsToSqlite] migrated ${migratedCount} agents ` +
      `(${sysItems.length} system + ${userItems.length} user) ` +
      `and ${sysCats.length + userCats.length} categories`,
    )
  } else {
    logger.info('[agentsToSqlite] no agents.json found — fresh install, nothing to migrate')
  }

  // ── Step 2: salvage import artifacts ──────────────────────────────────
  let artifactsRecovered = 0
  for (const kind of ['system', 'users']) {
    // souls/{kind}/ — pre-rename location (16 .speech.json on dev box)
    const soulsDir    = path.join(dataDir, 'souls', kind)
    // agent-artifacts/{kind}/ — official post-rename location
    const officialDir = path.join(dataDir, 'agent-artifacts', kind)

    const speechSouls      = _readArtifactDir(soulsDir, '.speech.json')
    const evidenceSouls    = _readArtifactDir(soulsDir, '.evidence.json')
    const harnessSouls     = _readArtifactDir(soulsDir, '.harness.json')
    const speechOfficial   = _readArtifactDir(officialDir, '.speech.json')
    const evidenceOfficial = _readArtifactDir(officialDir, '.evidence.json')
    const harnessOfficial  = _readArtifactDir(officialDir, '.harness.json')

    // Group by agentId. Official location wins over souls (later overrides
    // earlier in the merged map).
    const merged = new Map()
    function _add(list, key) {
      for (const { id, data } of list) {
        if (!merged.has(id)) merged.set(id, {})
        merged.get(id)[key] = data
      }
    }
    _add(speechSouls,      'speechDna')
    _add(evidenceSouls,    'evidence')
    _add(harnessSouls,     'harness')
    _add(speechOfficial,   'speechDna')
    _add(evidenceOfficial, 'evidence')
    _add(harnessOfficial,  'harness')

    for (const [agentId, patch] of merged) {
      // Only insert if the agent actually exists in the agents table.
      // Orphan artifacts (agent was deleted before this migration) are dropped.
      if (!store.getById(agentId)) {
        logger.warn(`[agentsToSqlite] skipping orphan artifact for missing agent ${agentId}`)
        continue
      }
      store.upsertImportArtifacts(agentId, {
        ...patch,
        importedAt: Date.now(),
      })
      artifactsRecovered++
    }
  }
  logger.info(`[agentsToSqlite] recovered ${artifactsRecovered} import_artifacts row(s)`)

  return { migrated: migratedCount, artifactsRecovered, skipped: false }
}

module.exports = { migrate }
