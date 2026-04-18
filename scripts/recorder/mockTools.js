/**
 * Mock tool implementations for the recorder.
 *
 * A scenario may declare `toolMocks: { [toolName]: { output?, result? } }`.
 *
 * Installation strategy: wrap `loop.toolRegistry.execute` instead of mutating
 * `toolRegistry.tools` directly. The reason is that `AgentLoop.run()` calls
 * `toolRegistry.loadForAgents()` at the top, which re-populates the `tools`
 * map — a `set()` done before `run()` would get clobbered. Wrapping the
 * `execute` function is persistent across loadForAgents calls.
 *
 * Result shape: to mimic a real ToolRegistry tool (like ShellTool), return
 * `{ content: [{ type: 'text', text: '...' }], details: { ... } }`. AgentLoop
 * passes this through `uiResult()` which flattens it to `{ text, ...details }`
 * before putting it in the `tool_result` chunk.
 */

function installToolMocks(loop, toolMocks) {
  if (!toolMocks || typeof toolMocks !== 'object' || Object.keys(toolMocks).length === 0) {
    return
  }
  const registry = loop.toolRegistry
  if (!registry || typeof registry.execute !== 'function') {
    throw new Error('installToolMocks: loop.toolRegistry.execute is not a function')
  }

  const origExecute = registry.execute.bind(registry)

  registry.execute = async function (toolName, toolInput, toolCallId, onUpdate, signal) {
    const cfg = toolMocks[toolName]
    if (!cfg) {
      return origExecute(toolName, toolInput, toolCallId, onUpdate, signal)
    }

    // Stream any pre-baked output chunks
    for (const line of cfg.output || []) {
      if (onUpdate) {
        onUpdate({
          type: line.stream || 'stdout',
          text: line.text || '',
        })
      }
    }

    if (cfg.result !== undefined) {
      return cfg.result
    }
    return {
      content: [{ type: 'text', text: `[mock ${toolName} executed]` }],
    }
  }
}

module.exports = { installToolMocks }
