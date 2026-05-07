/**
 * TodoTool — allows the agent to manage a task list for complex, multi-step work.
 *
 * The agent can create, update, and complete todo items. This is always available
 * so the agent can plan and track progress on large tasks without the user having
 * to enable it explicitly.
 */
const { BaseTool } = require('./BaseTool')

class TodoTool extends BaseTool {
  constructor() {
    super(
      'todo_manager',
      'Manage a task list for complex, multi-step work. Create, update, and track progress on todos. Use this to plan before executing large tasks.\n\nCRITICAL DISCIPLINE — do NOT batch status updates:\n- The MOMENT you finish a task (the corresponding action just completed successfully), call action="complete" with that task\'s id BEFORE doing anything else, including before announcing progress to the user.\n- The MOMENT you start working on the next task, call action="update" with status="in_progress".\n- Setup tasks like "load tools" or "list teams" still need to be marked complete — they are not "free" because they finished quickly. The user reads the live todo list to know what state the work is in; a task that stays "pending" while you have moved past it makes the whole list misleading.\n- ONE task should be in_progress at a time. If you are about to start a new task while another is still in_progress, complete the previous one first.',
      'todo_manager'
    )
    // In-memory todos per chat — keyed by chatId
    this.todosPerChat = new Map()
  }

  schema() {
    return {
      type: 'object',
      properties: {
        action:  { type: 'string', enum: ['add', 'update', 'complete', 'remove', 'list', 'clear'], description: 'Todo action' },
        chatId:  { type: 'string', description: 'Chat ID to scope todos' },
        id:      { type: 'number', description: 'Todo item ID (for update/complete/remove)' },
        title:   { type: 'string', description: 'Todo title (for add/update)' },
        status:  { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'], description: 'Status (for update)' },
        details: { type: 'string', description: 'Additional details or notes' }
      },
      required: ['action']
    }
  }

  _getTodos(chatId) {
    if (!this.todosPerChat.has(chatId)) {
      this.todosPerChat.set(chatId, [])
    }
    return this.todosPerChat.get(chatId)
  }

  // Build a "live state" tail that's appended to every successful tool result.
  // The LLM reads tool results — this is the most reliable place to nudge it
  // back to the panel. Every interaction with todo_manager surfaces the current
  // state so stale/forgotten items can't hide.
  _stateTail(todos) {
    const pending     = todos.filter(t => t.status === 'pending')
    const in_progress = todos.filter(t => t.status === 'in_progress')
    const completed   = todos.filter(t => t.status === 'completed').length
    const blocked     = todos.filter(t => t.status === 'blocked').length
    const lines = [
      `\n— Current state: ${completed} completed, ${in_progress.length} in_progress, ${pending.length} pending${blocked ? `, ${blocked} blocked` : ''}.`,
    ]
    if (pending.length > 0) {
      lines.push(`Pending: ${pending.map(t => `#${t.id} "${t.title}"`).join(', ')}`)
    }
    if (in_progress.length > 0) {
      lines.push(`In progress: ${in_progress.map(t => `#${t.id} "${t.title}"`).join(', ')}`)
    }
    if (in_progress.length > 1) {
      lines.push(`⚠ More than one task in_progress — finish or revert the older one before continuing.`)
    }
    if (pending.length > 0 || in_progress.length > 0) {
      lines.push(`REMINDER: mark each task complete the MOMENT it finishes, BEFORE narrating progress to the user. Setup tasks count too.`)
    }
    return lines.join('\n')
  }

  async execute(toolCallId, params, signal, onUpdate) {
    const { action, chatId = 'default', id, title, status, details } = params
    const todos = this._getTodos(chatId)

    switch (action) {
      case 'add': {
        const newId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1
        const item = { id: newId, title: title || 'Untitled', status: 'pending', details: details || '', createdAt: Date.now() }
        todos.push(item)
        return this._ok(`Added todo #${item.id}: ${item.title}${this._stateTail(todos)}`, { todo: item, totalTodos: todos.length })
      }
      case 'update': {
        const item = todos.find(t => t.id === id)
        if (!item) return this._err(`Todo #${id} not found`)
        if (title)   item.title   = title
        if (status)  item.status  = status
        if (details) item.details = details
        return this._ok(`Updated todo #${item.id}: ${item.title} [${item.status}]${this._stateTail(todos)}`, { todo: item })
      }
      case 'complete': {
        const item = todos.find(t => t.id === id)
        if (!item) return this._err(`Todo #${id} not found`)
        item.status = 'completed'
        return this._ok(`Completed todo #${item.id}: ${item.title}${this._stateTail(todos)}`, { todo: item })
      }
      case 'remove': {
        const idx = todos.findIndex(t => t.id === id)
        if (idx === -1) return this._err(`Todo #${id} not found`)
        const removed = todos.splice(idx, 1)[0]
        return this._ok(`Removed todo #${removed.id}: ${removed.title}${this._stateTail(todos)}`, { removed })
      }
      case 'list': {
        const summary = {
          total:       todos.length,
          pending:     todos.filter(t => t.status === 'pending').length,
          in_progress: todos.filter(t => t.status === 'in_progress').length,
          completed:   todos.filter(t => t.status === 'completed').length,
          blocked:     todos.filter(t => t.status === 'blocked').length
        }
        const lines = todos.map(t => `[${t.status}] #${t.id}: ${t.title}${t.details ? ` — ${t.details}` : ''}`)
        const text = lines.length ? lines.join('\n') : 'No todos.'
        return this._ok(text, { summary, todos: todos.map(t => ({ ...t })) })
      }
      case 'clear': {
        this.todosPerChat.set(chatId, [])
        return this._ok('All todos cleared.')
      }
      default:
        return this._err(`Unknown action: ${action}`)
    }
  }

  /** Get current todos for a chat (used by the UI) */
  getTodos(chatId) {
    return this._getTodos(chatId).map(t => ({ ...t }))
  }

  /** Find which chatId a todo belongs to, by scanning all stores */
  findChatIdForTodo(todoId) {
    for (const [chatId, todos] of this.todosPerChat) {
      if (todos.some(t => t.id === todoId)) return chatId
    }
    return null
  }
}

module.exports = { TodoTool }
