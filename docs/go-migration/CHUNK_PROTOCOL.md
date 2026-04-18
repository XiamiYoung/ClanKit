# Chunk Protocol Specification

This document defines the exact chunk types emitted by the AgentLoop engine.
The Go implementation MUST produce identical chunk sequences to the JS implementation
for the same inputs. This is verified by golden file tests.

All chunks are JSON objects with a required `type` field.

---

## Chunk Types Reference

### `text`
Streaming text delta from the LLM.

```json
{ "type": "text", "text": "Hello, how can I help?" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | Partial text content. Accumulate to get full response. **Must use `chunk.text`, NOT `chunk.content`** |

---

### `thinking`
Streaming thinking/reasoning delta (Anthropic extended thinking models only).

```json
{ "type": "thinking", "text": "Let me consider this..." }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `text` | string | yes | Partial thinking text |

---

### `thinking_start`
Signals that the model has begun extended thinking.

```json
{ "type": "thinking_start" }
```

No additional fields.

---

### `tool_call`
A tool is about to be executed.

```json
{
  "type": "tool_call",
  "name": "execute_shell",
  "input": { "command": "ls -la" },
  "toolCallId": "toolu_01abc123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Tool name |
| `input` | object | yes | Tool input parameters |
| `toolCallId` | string | yes | Unique ID for this tool call, used to correlate with `tool_result` |

---

### `tool_result`
A tool has finished executing.

```json
{
  "type": "tool_result",
  "name": "execute_shell",
  "result": "total 48\ndrwxr-xr-x ...",
  "toolCallId": "toolu_01abc123"
}
```

```json
{
  "type": "tool_result",
  "name": "mcp_abc12345_fetch",
  "result": "...",
  "toolCallId": "toolu_01abc123",
  "images": [{ "type": "base64", "media_type": "image/png", "data": "..." }]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Tool name |
| `result` | string | yes | Serialized result (may be JSON string) |
| `toolCallId` | string | yes | Matches the `tool_call` that triggered this |
| `images` | array | no | MCP tools may return images |

---

### `tool_output`
Live streaming output from a running tool (e.g. shell stdout/stderr).
Emitted before `tool_result`.

```json
{
  "type": "tool_output",
  "name": "execute_shell",
  "text": "Building project...\n",
  "stream": "stdout"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Tool name |
| `text` | string | yes | Live output chunk |
| `stream` | string | yes | `"stdout"` or `"stderr"` |

---

### `agent_step`
Agent progress markers. Emitted at four distinct points per run.

| `id` | When emitted | Status |
|---|---|---|
| `step-init` | Once, at the start of `run()` | `in_progress` |
| `step-llm-{iteration}` | Before each LLM streaming call | `in_progress` |
| `step-tools-{iteration}` | Before executing tool calls (only when `stop_reason === 'tool_use'`) | `in_progress` |
| `step-complete` | Once, at the very end of `run()` | `completed` |

```json
{
  "type": "agent_step",
  "id": "step-init",
  "title": "🤖 Initializing Agent...",
  "status": "in_progress",
  "details": {
    "iteration": 0,
    "model": "claude-opus-4-6",
    "provider": "anthropic",
    "tools": 5,
    "thinking": false,
    "msgs": 12,
    "inputTokens": 4200,
    "outputTokens": 0
  }
}
```

```json
{
  "type": "agent_step",
  "id": "step-complete",
  "title": "✅ Agent Complete",
  "status": "completed",
  "details": {
    "iteration": 3,
    "model": "claude-opus-4-6",
    "provider": "anthropic",
    "msgs": 8,
    "totalTokens": 4512,
    "inputTokens": 4200,
    "outputTokens": 312
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | See table above for the four id forms |
| `title` | string | yes | Human-readable step description (includes emoji) |
| `status` | string | yes | `"in_progress"` or `"completed"` |
| `details` | object | yes | Metrics snapshot; shape varies by step id |

---

### `context_update`
Token usage snapshot. Emitted at the start, after each LLM response,
and at the end of the run.

> **Note (2026-04-15, recorder finding):** The JS implementation has **two
> distinct emit sites** for `context_update` at the end of a run — one inside
> the stream completion path (line 1828 in `agentLoop.js`), one in the outer
> "final metrics" emit (line 2009). When the iteration loop exits directly
> after a stream (e.g. normal `end_turn` with no tools), the two emits land
> adjacent with identical metrics — Go must preserve both. When the loop
> breaks mid-iteration (e.g. `plan_submitted`), the two emits are separated by
> `tool_call`/`plan_submitted`/`tool_result` chunks. Both emits always occur
> regardless of exit path. Do not de-duplicate.

```json
{
  "type": "context_update",
  "metrics": {
    "inputTokens": 4200,
    "outputTokens": 312,
    "totalTokens": 4512,
    "maxTokens": 200000,
    "percentage": 2,
    "cacheCreationInputTokens": 0,
    "cacheReadInputTokens": 1800,
    "compactionCount": 0
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `metrics` | object | yes | |
| `metrics.inputTokens` | number | yes | |
| `metrics.outputTokens` | number | yes | |
| `metrics.totalTokens` | number | yes | inputTokens + outputTokens |
| `metrics.maxTokens` | number | yes | Model context window (was `contextWindow` in the earlier draft) |
| `metrics.percentage` | number | yes | Rounded percentage of context window consumed |
| `metrics.cacheCreationInputTokens` | number | yes | |
| `metrics.cacheReadInputTokens` | number | yes | |
| `metrics.compactionCount` | number | yes | Number of compactions applied so far in this run |

---

### `permission_request`
The agent needs user approval before executing a tool.
The loop is suspended until a response is received via
`POST /v1/sessions/{id}/permission`.

```json
{
  "type": "permission_request",
  "blockId": "uuid-v4",
  "toolName": "execute_shell",
  "command": "rm -rf /tmp/build",
  "toolInput": { "command": "rm -rf /tmp/build" }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `blockId` | string | yes | UUID; must be sent back in permission response |
| `toolName` | string | yes | Tool that triggered the permission check |
| `command` | string | yes | Human-readable command string for display |
| `toolInput` | object | yes | Full tool input |

---

### `plan_submitted`
The agent called `submit_plan` to show a structured plan to the user.

```json
{
  "type": "plan_submitted",
  "plan": {
    "title": "Refactor authentication module",
    "steps": [
      { "label": "Extract JWT validation into separate service" },
      { "label": "Update all route handlers to use new service" },
      { "label": "Write unit tests for JWT service" }
    ]
  }
}
```

| Field | Type | Required |
|---|---|---|
| `plan` | object | yes |
| `plan.title` | string | yes |
| `plan.steps` | array | yes |
| `plan.steps[].label` | string | yes |

---

### `compaction`
Context compaction was applied to continue the conversation.

```json
{ "type": "compaction", "message": "Context compacted to continue conversation" }
```

| Field | Type | Required |
|---|---|---|
| `message` | string | yes |

---

### `warning`
A non-fatal warning condition.

```json
{ "type": "warning", "code": "max_tokens_capped", "from": 65536, "to": 32768 }
{ "type": "warning", "code": "context_trimmed" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | `"max_tokens_capped"`, `"context_trimmed"` |
| `from` | number | no | Original value (for `max_tokens_capped`) |
| `to` | number | no | Capped value (for `max_tokens_capped`) |

---

### `max_tokens_reached`
The configured max output token limit was reached.

```json
{ "type": "max_tokens_reached", "limit": 32768 }
```

| Field | Type | Required |
|---|---|---|
| `limit` | number | yes |

---

### `subagent_progress`
Progress update from a dispatched sub-agent.

```json
{
  "type": "subagent_progress",
  "agentIndex": 0,
  "status": "running",
  "result": "..."
}
```

---

## IPC Wrapper Chunks

These chunks are added by `electron/ipc/agent.js` (the IPC bridge layer),
NOT by `AgentLoop` itself. In the Go architecture, these are added by the
orchestration layer before streaming to the client.

### `agent_start`
Signals that a specific agent has started responding (group chat).

```json
{
  "type": "agent_start",
  "agentId": "agent-uuid",
  "agentName": "Reviewer"
}
```

### `agent_end`
Signals that a specific agent has finished responding (group chat).

```json
{
  "type": "agent_end",
  "agentId": "agent-uuid",
  "agentName": "Reviewer"
}
```

---

## Group Chat Envelope

When running in group chat mode, **every chunk** from an agent is tagged with
`agentId` and `agentName`. The Electron frontend uses these to route chunks
to the correct message bubble.

```json
{
  "type": "text",
  "text": "I reviewed the code and found...",
  "agentId": "agent-uuid-reviewer",
  "agentName": "Reviewer"
}
```

This tagging is applied by the orchestration layer, not the AgentLoop itself.

---

## Orchestration-Level Chunks

These are emitted by the multi-agent orchestrator, not the AgentLoop.

### `send_message_complete`
All agents have finished. Sent at the very end.

```json
{
  "type": "send_message_complete",
  "stickyTargetIds": ["agent-uuid-1"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `stickyTargetIds` | array | yes | Agent IDs that should remain selected for next message |

### `send_message_error`
A fatal orchestration error occurred.

```json
{
  "type": "send_message_error",
  "error": "Provider 'anthropic' is missing apiKey"
}
```

### `collaboration_round_done`
One sequential collaboration round completed.

```json
{ "type": "collaboration_round_done", "round": 2 }
```

### `collaboration_summary`
Maximum collaboration iterations reached; loop terminated.

```json
{ "type": "collaboration_summary", "message": "..." }
```

---

## Chunk Ordering Invariants

These ordering rules MUST be preserved by the Go implementation:

1. `context_update` is always the first chunk emitted per agent run
2. `agent_step` (step-init) is emitted immediately after the first `context_update`
3. `agent_step` (step-llm-{iteration}) is emitted immediately before each LLM streaming call
4. `agent_step` (step-tools-{iteration}) is emitted only when `stop_reason === 'tool_use'`, before any tool executes
5. `agent_step` (step-complete) is always the last AgentLoop-native chunk before orchestration wrapping
6. A `context_update` is always emitted immediately before the final `step-complete` (final-metrics emit)
7. A separate `context_update` is also emitted immediately after each stream completes (stream-end emit). When the iteration loop exits directly after that stream (normal `end_turn` with no tools, or `max_tokens`), the stream-end and final-metrics `context_update` chunks appear **adjacent with identical metrics** — Go must emit both. When the loop exits via other paths (e.g. `plan_submitted` breaks mid-iteration after `tool_call`/`tool_result`), the two `context_update` emits are **not adjacent** — a `tool_call` / `plan_submitted` / `tool_result` sequence sits between them. Both emits always happen regardless of path.
8. Config-level `warning` chunks (e.g. `max_tokens_capped`) are emitted **between `step-init` and `step-llm-1`**, before the iteration loop starts — not adjacent to the LLM call they apply to.
9. `tool_call` always precedes its corresponding `tool_result` (same `toolCallId`)
10. `tool_output` chunks (if any) always appear between `tool_call` and `tool_result`
11. For `submit_plan`, the sequence inside `step-tools-{n}` is exactly `tool_call` → `plan_submitted` → `tool_result`, then the iteration loop breaks — no `step-llm-{n+1}` follows
12. `agent_start` precedes all other chunks for that agent (IPC wrapper, group chat only)
13. `agent_end` is always the last chunk for that agent, even on error (IPC wrapper, group chat only)
14. `send_message_complete` is always the very last chunk in an entire run (orchestration layer)
15. `permission_request` suspends all further chunks until permission is resolved

---

## Critical Implementation Note

**`chunk.text` not `chunk.content`**

Text chunks use the field name `text`, not `content`.
This is enforced by `chunkAccumulator.js` in the JS implementation.
Using the wrong field name silently breaks multi-agent collaboration
(the accumulator fails to collect text, so @mention scanning finds nothing).

The Go implementation MUST emit `{ "type": "text", "text": "..." }`,
never `{ "type": "text", "content": "..." }`.
