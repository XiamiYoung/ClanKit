/**
 * IPC handler registry — imports all handler modules and registers them.
 * Called once from main.js after dataStore.init() and createWindow().
 */

function registerAll({ DEFAULT_CONFIG, imBridge, mcpManager } = {}) {
  // Order matters: store must register before agent (agent imports accumulateUsage from store)
  require('./store').register({ DEFAULT_CONFIG })
  require('./tasks').register()
  require('./plaza').register()
  require('./souls').register()
  require('./mcp').register({ mcpManager })
  require('./knowledge').register()
  require('./models').register()
  require('./news').register()
  require('./skills').register()
  require('./claude').register()
  require('./shell').register()
  require('./im').register({ imBridge })
  require('./files').register()
  require('./obsidian').register()
  require('./window').register()
  require('./voice').register()

  // Agent must be last — it depends on store.accumulateUsage and knowledge.queryRAG
  const ipcAgent = require('./agent')
  ipcAgent.register()

  // Memory needs agent's shared state
  require('./memory').register({
    lastExtractedMsgCount: ipcAgent.lastExtractedMsgCount,
    pendingMemoryFacts: ipcAgent.pendingMemoryFacts,
    runMemoryExtraction: ipcAgent.runMemoryExtraction,
  })

  return { ipcAgent }
}

module.exports = { registerAll }
