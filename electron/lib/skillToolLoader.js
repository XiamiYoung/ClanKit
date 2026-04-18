/**
 * Skill-tool loader.
 *
 * A skill can ship code alongside its docs/assets. When `manifest.json`
 * declares `tools: [{ id, file, class }]`, the framework loads that class from
 * the user's AppData skill directory when the skill is enabled, instantiates
 * it with the current runtime context, and registers it into the ToolRegistry.
 *
 * Tool classes MUST:
 *   - extend BaseTool
 *   - accept a single `context` object in the constructor
 *     context = { dataPath, agentId, agentName, agentType, language }
 *
 * Tool files live in the user AppData skill directory (same place as SKILL.md,
 * template.html, strings.json — the whole skill is one folder). For built-in
 * skills the source tree copy is the canonical version; ensureBuiltinSkills
 * bumps user files to the shipped version when the manifest version changes.
 */
const fs = require('fs')
const path = require('path')
const { logger } = require('../logger')

/**
 * Scan enabled skills for declared tools and register them into the given
 * ToolRegistry.
 *
 * @param {Array<string|object>} enabledSkills Skill ids or skill objects with `id`
 * @param {object} context Runtime context passed to each tool constructor
 *                         Must include `dataPath` so we can locate skills/
 * @param {object} toolRegistry ToolRegistry instance (must have registerTool(name, instance))
 * @returns {{ loaded: string[], skipped: string[], errors: Array<{id,message}> }}
 */
function loadSkillTools(enabledSkills, context, toolRegistry) {
  const loaded = []
  const skipped = []
  const errors = []
  // Merged across all skills: { [action]: hint }. Used by core tools
  // (e.g. AnalyzeAgentTool) to decide which LLM config to use for internal
  // sub-tasks. Later-loaded skills overwrite earlier ones on conflict (with a
  // warning) — realistically only one skill should declare each action.
  const modelHints = {}

  if (!Array.isArray(enabledSkills) || enabledSkills.length === 0 || !toolRegistry) {
    return { loaded, skipped, errors, modelHints }
  }
  if (!context?.dataPath) {
    logger.warn('[skillToolLoader] missing context.dataPath — cannot locate skills')
    return { loaded, skipped, errors, modelHints }
  }

  const skillsRoot = path.join(context.dataPath, 'skills')

  const ids = enabledSkills
    .map(s => (typeof s === 'string' ? s : s?.id))
    .filter(Boolean)

  for (const skillId of ids) {
    const skillDir = path.join(skillsRoot, skillId)
    const manifestPath = path.join(skillDir, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      // Not a built-in skill, or has no manifest — skip silently
      skipped.push(skillId)
      continue
    }

    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (err) {
      errors.push({ id: skillId, message: `manifest parse: ${err.message}` })
      continue
    }

    // Collect modelHints even if the skill has no tool class — hints describe
    // preferences for CORE tools that happen to be triggered by this skill.
    if (manifest.modelHints && typeof manifest.modelHints === 'object') {
      for (const [action, hint] of Object.entries(manifest.modelHints)) {
        if (modelHints[action] && modelHints[action]._skill !== skillId) {
          logger.warn(`[skillToolLoader] modelHint conflict on "${action}": ${modelHints[action]._skill} vs ${skillId} — using ${skillId}`)
        }
        modelHints[action] = { ...hint, _skill: skillId }
      }
    }

    const toolDecls = Array.isArray(manifest.tools) ? manifest.tools : []
    if (toolDecls.length === 0) {
      skipped.push(skillId)
      continue
    }

    for (const decl of toolDecls) {
      if (!decl || !decl.id || !decl.file || !decl.class) {
        errors.push({ id: skillId, message: `invalid tool decl: ${JSON.stringify(decl)}` })
        continue
      }
      const toolFilePath = path.join(skillDir, decl.file)
      if (!fs.existsSync(toolFilePath)) {
        errors.push({ id: skillId, message: `tool file not found: ${toolFilePath}` })
        continue
      }

      try {
        // Clear require cache so hot-reload on manifest version bump picks up
        // latest code if the dev edited tool.js since last load.
        delete require.cache[require.resolve(toolFilePath)]
        const mod = require(toolFilePath)
        const ToolClass = mod[decl.class]
        if (typeof ToolClass !== 'function') {
          errors.push({ id: skillId, message: `class "${decl.class}" not exported from ${decl.file}` })
          continue
        }

        const instance = new ToolClass(context)
        toolRegistry.registerTool(decl.id, instance)
        loaded.push(`${skillId}:${decl.id}`)
      } catch (err) {
        errors.push({ id: skillId, message: `load failed: ${err.message}` })
        logger.error(`[skillToolLoader] ${skillId}/${decl.id} failed:`, err.stack || err.message)
      }
    }
  }

  if (loaded.length > 0 || errors.length > 0) {
    logger.agent('[skillToolLoader] loaded', {
      loaded, skipped, errors: errors.length > 0 ? errors : undefined,
      modelHints: Object.keys(modelHints).length > 0 ? modelHints : undefined,
    })
  }

  return { loaded, skipped, errors, modelHints }
}

module.exports = { loadSkillTools }
