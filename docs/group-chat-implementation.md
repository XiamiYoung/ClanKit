# Group Chat with Multiple Personas — Implementation Plan

## Overview

Add the ability to assign **multiple system personas** to a single chat, creating a "group conversation" where the user can talk to several AI agents simultaneously. Agents respond individually, see each other's messages, and can optionally chime in to correct or supplement other agents' answers.

---

## Current Architecture Summary

| Component | File | Current Behavior |
|-----------|------|-----------------|
| Chat data model | `src/stores/chats.js` | `systemPersonaId: null` (single persona) |
| Persona model | `src/stores/personas.js` | Has `id`, `name`, `avatar`, `description`, `prompt`, `type` |
| Agent loop | `electron/agent/agentLoop.js` | Single `run()` call per message, one system prompt |
| IPC handler | `electron/main.js:635` | `agent:run` creates one `AgentLoop`, returns one result |
| Chat UI | `src/views/ChatsView.vue` | Single persona chip selector, one streaming placeholder per send |
| Message renderer | `src/components/chat/MessageRenderer.vue` | No persona label on assistant messages |

---

## Data Model Changes

### 1. Chat Store (`src/stores/chats.js`)

```js
// NEW fields on chat object
{
  // Existing (keep for backward compat)
  systemPersonaId: null,       // single persona mode

  // NEW
  groupPersonaIds: [],         // array of persona IDs for group mode
  isGroupChat: false,          // flag to enable group behavior
}
```

**Backfill** in `loadChats()`:
```js
if (chat.groupPersonaIds === undefined) chat.groupPersonaIds = []
if (chat.isGroupChat === undefined) chat.isGroupChat = false
```

**New actions:**
- `setGroupPersonas(chatId, personaIds[])` — set the group participants
- `toggleGroupMode(chatId, enabled)` — switch between single/group mode

### 2. Message Model

Assistant messages in group chat need a persona tag:

```js
{
  role: 'assistant',
  content: '...',
  personaId: 'uuid',       // NEW — which persona generated this
  personaName: 'DevOps',   // NEW — display name (denormalized for persistence)
  segments: [...],
  // ...existing fields
}
```

User messages may include @mentions:

```js
{
  role: 'user',
  content: '@DevOps how do I deploy this?',
  mentions: ['persona-uuid'],  // NEW — parsed @mention targets
  mentionAll: false,           // NEW — true if @all
}
```

---

## @Mention Parsing

### Parser Function (new utility)

```js
// src/utils/mentions.js
export function parseMentions(text, personas) {
  // personas = [{ id, name }, ...]
  const mentions = []
  let mentionAll = false

  // Check for @all
  if (/@all\b/i.test(text)) {
    mentionAll = true
  }

  // Check for @PersonaName (case-insensitive, supports multi-word with quotes)
  // Examples: @DevOps, @"Code Reviewer", @code-reviewer
  for (const p of personas) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`@${escaped}\\b`, 'i')
    if (regex.test(text)) {
      mentions.push(p.id)
    }
  }

  return { mentions, mentionAll }
}
```

### Routing Logic

When user sends a message:

| Condition | Who responds |
|-----------|-------------|
| `@PersonaName` mentioned | Only that persona |
| Multiple `@PersonaName` | Each mentioned persona, sequentially |
| `@all` | All group personas |
| No `@` mention | All group personas (default broadcast) |

---

## Agent Loop Changes

### Option A: Sequential Multi-Persona Execution (Recommended)

Each persona runs one after another within the same `agent:run` call. Later personas see earlier personas' responses in the conversation history.

**Modify `electron/main.js` IPC handler:**

```js
ipcMain.handle('agent:run', async (event, params) => {
  const { chatId, messages, config, personaRuns, ...rest } = params

  // personaRuns = [{ personaId, personaName, systemPrompt }]
  // If not group chat, personaRuns has one entry (backward compat)

  if (!personaRuns || personaRuns.length <= 1) {
    // Existing single-persona path (unchanged)
    return runSingleAgent(event, params)
  }

  // Group chat: run each persona sequentially
  const allMessages = [...messages]
  const results = []

  for (const persona of personaRuns) {
    // Signal UI: which persona is responding
    event.sender.send('agent:chunk', {
      chatId,
      chunk: { type: 'persona_start', personaId: persona.personaId, personaName: persona.personaName }
    })

    const loop = new AgentLoop(config)
    activeLoops.set(`${chatId}:${persona.personaId}`, loop)

    const personaPrompts = {
      systemPersonaPrompt: persona.systemPrompt,
      userPersonaPrompt: rest.personaPrompts?.userPersonaPrompt
    }

    try {
      const result = await loop.run(
        allMessages,
        rest.enabledAgents,
        rest.enabledSkills,
        (chunk) => {
          // Tag every chunk with personaId so UI knows who's talking
          if (!event.sender.isDestroyed()) {
            event.sender.send('agent:chunk', {
              chatId,
              chunk: { ...chunk, personaId: persona.personaId, personaName: persona.personaName }
            })
          }
        },
        rest.currentAttachments,
        personaPrompts,
        rest.mcpServers,
        rest.httpTools
      )

      // Add this persona's response to the running conversation
      // so the next persona can see it
      allMessages.push({
        role: 'assistant',
        content: `[${persona.personaName}]: ${result}`
      })

      results.push({ personaId: persona.personaId, result, success: true })

    } catch (err) {
      results.push({ personaId: persona.personaId, error: err.message, success: false })
    } finally {
      activeLoops.delete(`${chatId}:${persona.personaId}`)
    }

    // Signal UI: persona finished
    event.sender.send('agent:chunk', {
      chatId,
      chunk: { type: 'persona_end', personaId: persona.personaId }
    })
  }

  return { success: true, results }
})
```

### System Prompt Enhancement

Each persona in a group chat gets additional context injected:

```
## GROUP CHAT CONTEXT
You are "${personaName}" in a group conversation with other AI personas.
Other participants: ${otherNames.join(', ')}
The user may address you with @${personaName} or speak to everyone.
- Only respond when addressed or when you have relevant expertise
- Reference other personas by name if you agree/disagree
- Keep responses focused — don't repeat what others already covered
- If another persona gave an incorrect answer, politely correct it
```

---

## Frontend Changes

### 1. Chat Header — Multi-Persona Selector (`ChatsView.vue`)

Replace the single system persona chip with a group-aware component:

```
┌─────────────────────────────────────────────────────┐
│ [👤 DevOps] [👤 Code Reviewer] [👤 Architect] [+ Add] │
│ [Toggle: Single ↔ Group]                             │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- When `isGroupChat` is true, show a row of persona chips (multi-select)
- Each chip is removable (X button)
- [+ Add] button opens the persona popover with multi-select checkboxes
- A toggle switch to flip between single and group mode
- When switching to group, migrate current `systemPersonaId` into `groupPersonaIds[]`

### 2. Input Area — @Mention Autocomplete (`ChatsView.vue`)

When user types `@` in the textarea:
- Show a floating autocomplete popup listing group personas
- Also include `@all` option
- On select, insert `@PersonaName` text
- Highlight @mentions with color styling (contenteditable or post-render)

**Implementation approach (simple):**
- Watch for `@` keystrokes in the textarea
- Show a small popover positioned near the cursor
- Filter persona list as user types
- Insert selected name, close popover
- Parse mentions on send using `parseMentions()`

### 3. Streaming — Per-Persona Message Blocks (`ChatsView.vue`)

Currently: one streaming placeholder per `sendMessage()`.
Group chat: one streaming placeholder **per persona** response.

```js
// In handleChunk:
if (chunk.type === 'persona_start') {
  // Create a new streaming message for this persona
  const msgId = uuidv4()
  perChatStreamingMsgId.set(`${cId}:${chunk.personaId}`, msgId)
  perChatStreamingSegments.set(`${cId}:${chunk.personaId}`, [])
  await chatsStore.addMessage(cId, {
    id: msgId,
    role: 'assistant',
    content: '',
    streaming: true,
    personaId: chunk.personaId,
    personaName: chunk.personaName,
    streamingStartedAt: Date.now()
  })
}

if (chunk.type === 'text' && chunk.personaId) {
  // Route text to the correct persona's streaming message
  const key = `${cId}:${chunk.personaId}`
  lastTextSeg(key).content += chunk.text
  flushSegments(key)
}

if (chunk.type === 'persona_end') {
  // Finalize this persona's message
  // ...
}
```

### 4. Message Renderer — Persona Badge (`MessageRenderer.vue`)

Add a persona header to assistant messages in group chat:

```html
<!-- Before existing assistant content -->
<div v-if="message.personaId" class="persona-badge">
  <img v-if="personaAvatar" :src="personaAvatar" class="persona-badge-avatar" />
  <span class="persona-badge-name">{{ message.personaName }}</span>
</div>
```

Style: small colored badge with avatar + name above the message content, similar to how Slack/Discord shows usernames.

### 5. @Mention Highlighting

In `renderMarkdown()`, replace `@PersonaName` with styled spans:

```js
// After DOMPurify sanitization, before return
result = result.replace(/@(\w+)/g, '<span class="mention">@$1</span>')
```

CSS:
```css
.mention {
  background: rgba(99, 102, 241, 0.15);
  color: #6366F1;
  padding: 1px 4px;
  border-radius: 4px;
  font-weight: 600;
}
```

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/stores/chats.js` | Add `groupPersonaIds`, `isGroupChat` fields; add `setGroupPersonas()`, `toggleGroupMode()` actions; backfill in `loadChats()` |
| `src/utils/mentions.js` | **NEW** — `parseMentions()` utility |
| `electron/main.js` | Modify `agent:run` handler to support `personaRuns[]` array; sequential multi-loop execution with persona-tagged chunks |
| `electron/agent/agentLoop.js` | Add group chat context to `buildSystemPrompt()` when group metadata is present |
| `src/views/ChatsView.vue` | Multi-persona chip row; @mention autocomplete in textarea; per-persona streaming message handling; build `personaRuns[]` in sendMessage |
| `src/components/chat/MessageRenderer.vue` | Persona badge on assistant messages; @mention highlighting in markdown |
| `src/stores/personas.js` | No changes needed (existing model sufficient) |

---

## Implementation Phases

### Phase 1 — Data Model & Backend (Foundation)
1. Add `groupPersonaIds`, `isGroupChat` to chat store with backfill
2. Create `src/utils/mentions.js` with `parseMentions()`
3. Modify `electron/main.js` `agent:run` to handle `personaRuns[]`
4. Add group context injection in `agentLoop.js` `buildSystemPrompt()`

### Phase 2 — UI: Group Mode Toggle & Multi-Select
5. Add group mode toggle in chat header
6. Convert persona selector to multi-select when group mode active
7. Show persona chip row for group participants

### Phase 3 — Streaming & Message Display
8. Handle `persona_start`/`persona_end` chunks in `handleChunk()`
9. Create per-persona streaming message placeholders
10. Add persona badge to `MessageRenderer.vue`
11. Store `personaId`/`personaName` on finalized assistant messages

### Phase 4 — @Mentions
12. Add @mention autocomplete popup in textarea
13. Parse mentions on send, route to specific personas
14. Highlight @mentions in rendered markdown

### Phase 5 — Polish
15. "Voluntary response" mode — lightweight pre-check where non-addressed personas decide whether to respond
16. Parallel execution option (personas respond simultaneously, no cross-visibility within same turn)
17. Per-persona stop button (stop one agent without stopping others)

---

## UX Mockup

### Chat Header (Group Mode)
```
┌──────────────────────────────────────────────────────────────────┐
│ [🤖 DevOps Expert] [🤖 Code Reviewer] [✕] [+ Add Persona]     │
│ ─────────────────────────────────────────────                    │
│ [📡 Anthropic] [🧠 claude-sonnet-4-5]  Context ████░░ 42%      │
└──────────────────────────────────────────────────────────────────┘
```

### Chat Messages (Group Mode)
```
┌──────────────────────────────────────────────────────┐
│ You:                                                  │
│ @DevOps how should I set up the CI pipeline?         │
│                                                       │
│ ┌─ 🤖 DevOps Expert ─────────────────────────────┐  │
│ │ I'd recommend GitHub Actions with these stages: │  │
│ │ 1. Lint → 2. Test → 3. Build → 4. Deploy       │  │
│ └─────────────────────────────────────────────────┘  │
│                                                       │
│ ┌─ 🤖 Code Reviewer ─────────────────────────────┐  │
│ │ I'd add to what DevOps Expert said — make sure  │  │
│ │ to include a code quality gate between steps    │  │
│ │ 2 and 3. SonarQube or similar works well.       │  │
│ └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### @Mention Autocomplete
```
┌──────────────────────────────────────────────────────┐
│ @dev│                                                │
│ ┌────────────────────────────┐                       │
│ │ 🤖 DevOps Expert           │                       │
│ │ 👥 @all (all personas)     │                       │
│ └────────────────────────────┘                       │
└──────────────────────────────────────────────────────┘
```

---

## Edge Cases

| Case | Handling |
|------|---------|
| Group chat with 1 persona | Works like single mode, just with persona badge |
| @mention a persona not in the group | Ignore, treat as plain text |
| Persona removed mid-chat | Old messages keep `personaName`; future turns skip removed persona |
| Context window overflow with many personas | Each persona run shares the same context; compaction works per-run |
| User sends while agents are still responding | Queue the message, wait for current round to finish |
| All personas in a round produce empty responses | Show a "No agents responded" indicator |
| Stop button during group chat | Stop all active persona loops for that chat |

---

## Notes

- **Backward compatible**: chats without `isGroupChat` work exactly as before
- **Sequential execution is recommended for v1**: simpler, allows agents to build on each other's answers
- **Parallel execution** can be added later as an option (faster but agents can't react to each other in the same round)
- **No new dependencies** required — uses existing marked, DOMPurify, Pinia, uuid
- **Persona prompts remain the primary differentiator** — the same LLM model serves all personas, just with different system prompts
