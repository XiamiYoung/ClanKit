/**
 * Scenario runner for the chunk recorder.
 *
 * Usage:
 *   node scripts/recorder/run.js <scenario.json>
 *   node scripts/recorder/run.js --all
 *
 * Loads a scenario, starts the mock Anthropic server, builds a minimal
 * loopConfig pointed at the mock, runs the real JS AgentLoop, captures every
 * chunk passed to onChunk, normalizes it, and writes the result to
 * core/testdata/golden/{name}.chunks.json.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// Silence the electron logger BEFORE requiring AgentLoop.
// The logger writes through console.log / console.info; replacing those
// early keeps recorder output clean.
const realLog = console.log.bind(console)
const realErr = console.error.bind(console)
const noop = () => {}
console.log = noop
console.info = noop
console.debug = noop
console.warn = noop

const { createMockAnthropic } = require('./mockAnthropic')
const { normalizeChunks } = require('./normalize')
const { installToolMocks } = require('./mockTools')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SCENARIOS_DIR = path.join(__dirname, 'scenarios')
const GOLDEN_DIR = path.join(REPO_ROOT, 'core', 'testdata', 'golden')
const MOCK_PORT = 9823

// Lazy require after console silence
const { AgentLoop } = require(path.join(REPO_ROOT, 'electron', 'agent', 'agentLoop'))

async function runScenario(scenarioPath) {
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
  const name = scenario.name || path.basename(scenarioPath, '.json')
  log(`\n▶ Running scenario: ${name}`)

  const mock = createMockAnthropic({ responses: scenario.llmResponses || [] })
  await mock.listen(MOCK_PORT)

  // Per-run empty fixture dirs (artifacts/memory/data are loaded by AgentLoop
  // but must not contain anything that leaks real user state).
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clank-recorder-'))
  const agentArtifactsDir = path.join(fixtureRoot, 'agent-artifacts')
  const memoryDir = path.join(fixtureRoot, 'memory')
  const dataPath = path.join(fixtureRoot, 'data')
  for (const d of [agentArtifactsDir, memoryDir, dataPath]) fs.mkdirSync(d, { recursive: true })

  const loopConfig = {
    provider: {
      type: 'anthropic',
      apiKey: 'mock-key',
      baseURL: `http://127.0.0.1:${MOCK_PORT}`,
      model: scenario.model || 'claude-haiku-4-5',
    },
    agentArtifactsDir,
    memoryDir,
    dataPath,
    chatId: 'recorder-chat',
    sandboxConfig: {
      defaultMode: 'all_permissions',
      sandboxAllowList: [],
      dangerBlockList: [],
    },
    chatPermissionMode: 'inherit',
    chatAllowList: [],
    providers: [],
    defaultProvider: 'anthropic',
    _scenario: `recorder:${name}`,
  }

  // Merge loopConfig overrides BEFORE construction so constructor-time
  // reads (e.g. sandboxConfig → permissionGate) see the overridden values.
  if (scenario.loopConfigOverrides) {
    Object.assign(loopConfig, scenario.loopConfigOverrides)
  }

  const loop = new AgentLoop(loopConfig)

  // Apply instance-level overrides AFTER construction (e.g. _compactionRequested)
  if (scenario.loopInstanceOverrides) {
    Object.assign(loop, scenario.loopInstanceOverrides)
  }

  // Wrap toolRegistry.execute to intercept mocked tools (wrapping is
  // persistent across loadForAgents re-population inside run()).
  if (scenario.toolMocks) {
    installToolMocks(loop, scenario.toolMocks)
  }

  const chunks = []
  let stopCalled = false
  const onChunk = (c) => {
    chunks.push(c)

    // Auto-answer permission requests
    if (scenario.autoAnswerPermission && c.type === 'permission_request') {
      const { decision, pattern } = scenario.autoAnswerPermission
      loop.resolvePermission(c.blockId, decision, pattern || c.command)
    }

    // Stop on matching chunk
    if (scenario.stopOnChunk && !stopCalled && chunkMatches(c, scenario.stopOnChunk)) {
      stopCalled = true
      loop.stop()
    }
  }

  let runError = null
  try {
    await loop.run(
      scenario.messages || [],
      scenario.enabledAgents || [],
      scenario.enabledSkills || [],
      onChunk,
      undefined,                 // currentAttachments
      scenario.agentPrompts || {},
      [],                        // mcpServers
      [],                        // httpTools
      null                       // ragContext
    )
  } catch (e) {
    runError = e
  }

  await mock.close()
  fs.rmSync(fixtureRoot, { recursive: true, force: true })

  const normalized = normalizeChunks(chunks)

  fs.mkdirSync(GOLDEN_DIR, { recursive: true })
  const outPath = path.join(GOLDEN_DIR, `${name}.chunks.json`)
  fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2) + '\n')

  log(`  chunks captured:       ${chunks.length}`)
  log(`  responses consumed:    ${mock.consumed()} / ${(scenario.llmResponses || []).length}`)
  log(`  golden file written:   ${path.relative(REPO_ROOT, outPath)}`)
  if (runError) {
    log(`  ⚠ run error: ${runError.message}`)
    log(runError.stack)
  }
  return { name, chunks: normalized, error: runError }
}

function chunkMatches(chunk, pattern) {
  for (const [k, v] of Object.entries(pattern)) {
    if (chunk[k] !== v) return false
  }
  return true
}

function log(...args) {
  realLog(...args)
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    realLog('Usage: node scripts/recorder/run.js <scenario.json|--all>')
    process.exit(1)
  }

  let files = []
  if (arg === '--all') {
    files = fs.readdirSync(SCENARIOS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => path.join(SCENARIOS_DIR, f))
  } else {
    const resolved = path.isAbsolute(arg) ? arg : path.resolve(arg)
    files = [resolved]
  }

  let hadError = false
  for (const f of files) {
    const { error } = await runScenario(f)
    if (error) hadError = true
  }
  process.exit(hadError ? 1 : 0)
}

main().catch((e) => {
  realLog('FATAL:', e)
  process.exit(1)
})
