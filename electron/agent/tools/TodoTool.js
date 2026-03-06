/**
 * TodoTool — allows the agent to manage a task list for complex, multi-step work.
 *
 * The agent can create, update, and complete todo items. This is always available
 * so the agent can plan and track progress on large tasks without the user having
 * to enable it explicitly.
 */
const { BaseTool } = require('./BaseTool')
const { logger } = require('../../logger')

class TodoTool extends BaseTool {
  constructor() {
    super(
      'todo_manager',
      'Manage a task list for complex, multi-step work. Create, update, and track progress on todos. Use this to plan before executing large tasks.'
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

  async execute(input) {
    const { action, chatId = 'default', id, title, status, details } = input
    const todos = this._getTodos(chatId)

    switch (action) {
      case 'add': {
        const newId = todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1
        const item = { id: newId, title: title || 'Untitled', status: 'pending', details: details || '', createdAt: Date.now() }
        todos.push(item)
        logger.agent('TodoTool: added', { chatId, item })
        return { success: true, todo: item, totalTodos: todos.length }
      }
      case 'update': {
        const item = todos.find(t => t.id === id)
        if (!item) return { error: `Todo #${id} not found` }
        if (title)   item.title   = title
        if (status)  item.status  = status
        if (details) item.details = details
        return { success: true, todo: item }
      }
      case 'complete': {
        const item = todos.find(t => t.id === id)
        if (!item) return { error: `Todo #${id} not found` }
        item.status = 'completed'
        return { success: true, todo: item }
      }
      case 'remove': {
        const idx = todos.findIndex(t => t.id === id)
        if (idx === -1) return { error: `Todo #${id} not found` }
        const removed = todos.splice(idx, 1)[0]
        return { success: true, removed }
      }
      case 'list': {
        return {
          todos: todos.map(t => ({ ...t })),
          summary: {
            total: todos.length,
            pending:     todos.filter(t => t.status === 'pending').length,
            in_progress: todos.filter(t => t.status === 'in_progress').length,
            completed:   todos.filter(t => t.status === 'completed').length,
            blocked:     todos.filter(t => t.status === 'blocked').length
          }
        }
      }
      case 'clear': {
        this.todosPerChat.set(chatId, [])
        return { success: true, message: 'All todos cleared' }
      }
      default:
        return { error: `Unknown action: ${action}` }
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
