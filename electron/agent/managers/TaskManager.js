/**
 * TaskManager — manages background tasks that run concurrently.
 *
 * Provides a `run_background_task` tool that lets the agent kick off
 * long-running operations (builds, test suites, data processing) without
 * blocking the main conversation. Tasks run as child processes and the
 * agent can check their status.
 */
const { execFile, spawn } = require('child_process')
const os = require('os')
const { logger } = require('../../logger')

class TaskManager {
  constructor() {
    this.tasks = new Map()
    this.nextId = 1
  }

  /** Get the tool definition for managing background tasks */
  getToolDefinition() {
    return {
      name: 'background_task',
      description: 'Run a command as a background task, check task status, or get task output. Use for long-running operations like builds, test suites, or data processing that should not block the conversation.',
      input_schema: {
        type: 'object',
        properties: {
          action:  { type: 'string', enum: ['start', 'status', 'output', 'stop', 'list'], description: 'Task action' },
          command: { type: 'string', description: 'Shell command to run (for start action)' },
          args:    { type: 'array', items: { type: 'string' }, description: 'Command arguments (for start action)' },
          cwd:     { type: 'string', description: 'Working directory (for start action)' },
          taskId:  { type: 'number', description: 'Task ID (for status/output/stop actions)' }
        },
        required: ['action']
      }
    }
  }

  /** Execute a task management action */
  async execute(input) {
    const { action, command, args = [], cwd, taskId } = input

    switch (action) {
      case 'start': {
        if (!command) return { error: 'Command is required for start action' }
        return this._start(command, args, cwd)
      }
      case 'status': {
        if (taskId == null) return { error: 'taskId is required' }
        return this._status(taskId)
      }
      case 'output': {
        if (taskId == null) return { error: 'taskId is required' }
        return this._output(taskId)
      }
      case 'stop': {
        if (taskId == null) return { error: 'taskId is required' }
        return this._stop(taskId)
      }
      case 'list': {
        return this._list()
      }
      default:
        return { error: `Unknown action: ${action}` }
    }
  }

  _start(command, args, cwd) {
    const id = this.nextId++
    const safeCwd = cwd || os.homedir()
    const safeArgs = Array.isArray(args) ? args : []

    const task = {
      id,
      command,
      args: safeArgs,
      cwd: safeCwd,
      status: 'running',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: Date.now(),
      finishedAt: null
    }

    try {
      const proc = spawn(command, safeArgs, {
        cwd: safeCwd,
        timeout: 300000,  // 5 minute max
        stdio: ['ignore', 'pipe', 'pipe']
      })

      proc.stdout.on('data', (data) => {
        task.stdout += data.toString()
        // Keep only last 10KB
        if (task.stdout.length > 10000) {
          task.stdout = '...(truncated)...\n' + task.stdout.slice(-8000)
        }
      })

      proc.stderr.on('data', (data) => {
        task.stderr += data.toString()
        if (task.stderr.length > 10000) {
          task.stderr = '...(truncated)...\n' + task.stderr.slice(-8000)
        }
      })

      proc.on('close', (code) => {
        task.status = code === 0 ? 'completed' : 'failed'
        task.exitCode = code
        task.finishedAt = Date.now()
      })

      proc.on('error', (err) => {
        task.status = 'failed'
        task.stderr += '\n' + err.message
        task.finishedAt = Date.now()
      })

      task.process = proc
      this.tasks.set(id, task)

      logger.agent('TaskManager: started', { id, command, args: safeArgs })
      return { success: true, taskId: id, message: `Task #${id} started: ${command} ${safeArgs.join(' ')}` }
    } catch (err) {
      return { error: err.message }
    }
  }

  _status(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return { error: `Task #${taskId} not found` }
    return {
      taskId:     task.id,
      command:    task.command,
      status:     task.status,
      exitCode:   task.exitCode,
      startedAt:  task.startedAt,
      finishedAt: task.finishedAt,
      duration:   task.finishedAt ? task.finishedAt - task.startedAt : Date.now() - task.startedAt
    }
  }

  _output(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return { error: `Task #${taskId} not found` }
    return {
      taskId:   task.id,
      status:   task.status,
      stdout:   task.stdout.slice(-5000),
      stderr:   task.stderr.slice(-2000),
      exitCode: task.exitCode
    }
  }

  _stop(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) return { error: `Task #${taskId} not found` }
    if (task.process && task.status === 'running') {
      task.process.kill('SIGTERM')
      task.status = 'stopped'
      task.finishedAt = Date.now()
      return { success: true, message: `Task #${taskId} stopped` }
    }
    return { message: `Task #${taskId} is already ${task.status}` }
  }

  _list() {
    const tasks = []
    for (const [, task] of this.tasks) {
      tasks.push({
        taskId:    task.id,
        command:   task.command,
        status:    task.status,
        exitCode:  task.exitCode,
        startedAt: task.startedAt,
        duration:  task.finishedAt ? task.finishedAt - task.startedAt : Date.now() - task.startedAt
      })
    }
    return { tasks }
  }
}

module.exports = { TaskManager }
