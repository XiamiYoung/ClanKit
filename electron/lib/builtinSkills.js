/**
 * Built-in skill bootstrapping.
 *
 * A "built-in" skill is one that ships with the ClanKit source tree under
 * electron/agent/builtin-skills/<id>/. On startup we copy any missing built-in
 * skill folders into the user's skills directory so they appear just like any
 * other skill, but with an isBuiltin flag that prevents the UI from deleting
 * them and ensures they are auto-installed for every new agent.
 *
 * Each built-in skill folder contains:
 *   manifest.json            — { id, version, builtin: true, ... }
 *   SKILL.md.en              — English template
 *   SKILL.md.zh              — Chinese template
 *   (plus any other files/subfolders the skill needs)
 *
 * At install time we pick SKILL.md.<lang> based on config.language and copy it
 * as SKILL.md in the target folder. Switching language later does not re-seed
 * (skills are user-owned files after install — a reset option can be exposed
 * separately if needed).
 */
const fs   = require('fs')
const path = require('path')
const { logger } = require('../logger')

const BUILTIN_SKILLS_SOURCE = path.join(__dirname, '..', 'agent', 'builtin-skills')

function listBuiltinSkillIds() {
  try {
    return fs.readdirSync(BUILTIN_SKILLS_SOURCE, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
  } catch {
    return []
  }
}

/**
 * Recursively copy a built-in skill source folder to the target, picking the
 * correct SKILL.md.<lang> file as SKILL.md and skipping the other language.
 */
function copyBuiltinSkillFolder(sourceDir, targetDir, lang) {
  fs.mkdirSync(targetDir, { recursive: true })
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name)
    if (entry.isDirectory()) {
      copyBuiltinSkillFolder(srcPath, path.join(targetDir, entry.name), lang)
      continue
    }
    // Language-specific SKILL.md — pick matching locale, drop the other.
    const skillMdMatch = entry.name.match(/^SKILL\.md\.(\w+)$/)
    if (skillMdMatch) {
      if (skillMdMatch[1] === lang) {
        fs.copyFileSync(srcPath, path.join(targetDir, 'SKILL.md'))
      }
      continue
    }
    // Plain file — copy as-is (includes tool.js and other skill code).
    fs.copyFileSync(srcPath, path.join(targetDir, entry.name))
  }
}

/**
 * Ensure all built-in skills exist in the user's skills directory. Missing
 * ones are copied from the source tree using the language-appropriate template.
 *
 * @param {string} skillsDir Absolute path to the user's skills directory.
 * @param {string} language  'en' | 'zh' (or a value starting with 'zh').
 * @returns {{ seeded: string[], existed: string[], builtinIds: string[] }}
 */
function ensureBuiltinSkills(skillsDir, language) {
  if (!skillsDir) return { seeded: [], existed: [], builtinIds: [] }
  const builtinIds = listBuiltinSkillIds()
  if (builtinIds.length === 0) return { seeded: [], existed: [], builtinIds: [] }

  try {
    fs.mkdirSync(skillsDir, { recursive: true })
  } catch (err) {
    logger.error('[builtinSkills] mkdir failed', skillsDir, err.message)
    return { seeded: [], existed: [], builtinIds }
  }

  const lang = String(language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const seeded = []
  const existed = []
  const upgraded = []

  for (const id of builtinIds) {
    const sourceDir = path.join(BUILTIN_SKILLS_SOURCE, id)
    const targetDir = path.join(skillsDir, id)
    const existsLocally = fs.existsSync(targetDir)

    // Version-based upgrade: if the shipped manifest.version is higher than
    // what's on disk, wipe and re-seed so template.html / strings.json / etc
    // get refreshed. Users' own customizations to SKILL.md are preserved
    // unless the built-in manifest explicitly bumps the version.
    if (existsLocally) {
      const srcVer = readManifestVersion(path.join(sourceDir, 'manifest.json'))
      const dstVer = readManifestVersion(path.join(targetDir, 'manifest.json'))
      if (srcVer != null && srcVer > dstVer) {
        try {
          fs.rmSync(targetDir, { recursive: true, force: true })
          copyBuiltinSkillFolder(sourceDir, targetDir, lang)
          upgraded.push({ id, from: dstVer, to: srcVer })
          logger.info(`[builtinSkills] upgraded ${id}: v${dstVer} -> v${srcVer}`)
        } catch (err) {
          logger.error(`[builtinSkills] failed to upgrade ${id}:`, err.message)
        }
      } else {
        existed.push(id)
      }
      continue
    }

    try {
      copyBuiltinSkillFolder(sourceDir, targetDir, lang)
      seeded.push(id)
    } catch (err) {
      logger.error(`[builtinSkills] failed to seed ${id}:`, err.message)
    }
  }

  return { seeded, existed, upgraded, builtinIds }
}

function readManifestVersion(manifestPath) {
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    const v = JSON.parse(raw).version
    return typeof v === 'number' ? v : 0
  } catch {
    return 0
  }
}

/**
 * On first install of built-in skills, add their ids to every existing agent's
 * requiredSkillIds so they are enabled by default. Only called when the caller
 * has determined this is the first run (via a config flag) — we do NOT re-add
 * on subsequent startups, otherwise users who intentionally removed the skill
 * from some agents would see it come back.
 *
 * @param {object}   agentStore AgentStore instance.
 * @param {string[]} builtinIds Ids to seed.
 * @returns {{ updated: number }}
 */
function seedBuiltinSkillsIntoAgents(agentStore, builtinIds) {
  if (!builtinIds || builtinIds.length === 0) return { updated: 0 }
  if (!agentStore) return { updated: 0 }

  const allAgents = agentStore.getAll()
  let updated = 0
  for (const agent of allAgents) {
    const current = Array.isArray(agent.requiredSkillIds) ? agent.requiredSkillIds : []
    const missing = builtinIds.filter(id => !current.includes(id))
    if (missing.length > 0) {
      agent.requiredSkillIds = [...current, ...missing]
      agentStore.saveAgent(agent)
      updated++
    }
  }

  if (updated > 0) {
    logger.info(`[builtinSkills] assigned ${builtinIds.join(', ')} to ${updated} existing agent(s)`)
  }

  return { updated }
}

/**
 * Whether a given skill id is built-in. Used by the scan handler to mark
 * skills and by the UI to disable deletion.
 */
function isBuiltinSkillId(id) {
  return listBuiltinSkillIds().includes(id)
}

module.exports = {
  ensureBuiltinSkills,
  seedBuiltinSkillsIntoAgents,
  isBuiltinSkillId,
  listBuiltinSkillIds,
  BUILTIN_SKILLS_SOURCE,
}
