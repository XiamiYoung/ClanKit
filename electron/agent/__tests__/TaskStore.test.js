import { describe, it, expect } from 'vitest'
import {
  rowToPlan, planToRow,
  rowToTask, taskToRow,
  rowToRun, runToRow,
  serializeJsonArray, deserializeJsonArray,
} from '../TaskStore.js'

describe('serializeJsonArray / deserializeJsonArray', () => {
  it('round-trips arrays', () => {
    expect(deserializeJsonArray(serializeJsonArray(['a', 'b']))).toEqual(['a', 'b'])
  })
  it('serializeJsonArray returns "[]" for null/non-array', () => {
    expect(serializeJsonArray(null)).toBe('[]')
    expect(serializeJsonArray(undefined)).toBe('[]')
    expect(serializeJsonArray('x')).toBe('[]')
  })
  it('deserializeJsonArray returns [] for null/empty/invalid', () => {
    expect(deserializeJsonArray(null)).toEqual([])
    expect(deserializeJsonArray('')).toEqual([])
    expect(deserializeJsonArray('not json')).toEqual([])
    expect(deserializeJsonArray('"a string"')).toEqual([])
  })
})

describe('plan round-trip', () => {
  it('preserves all fields with legacy string schedule', () => {
    const plan = {
      id: 'plan-1',
      name: 'Daily digest',
      description: 'Morning summary',
      prompt: 'Run the news fetch',
      agentId: 'agent-x',
      schedule: '0 9 * * *',
      enabled: true,
      categoryId: 'cat-1',
      steps: [
        { taskId: 'task-a', runCondition: 'always' },
        { taskId: 'task-b', runCondition: 'on-success' },
      ],
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      lastRunAt: 1700000002000,
      deletedAt: null,
    }
    expect(rowToPlan(planToRow(plan))).toMatchObject(plan)
  })
  it('plan without steps round-trips with empty array', () => {
    const plan = { id: 'p', name: 'P', enabled: true, createdAt: 0, updatedAt: 0 }
    const back = rowToPlan(planToRow(plan))
    expect(back.steps).toEqual([])
  })
  it('round-trips object schedule via JSON serialization', () => {
    const plan = {
      id: 'plan-2',
      name: 'Cron plan',
      schedule: { type: 'cron', cron: '0 * * * *', timezone: 'UTC', enabled: true },
      enabled: true,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      deletedAt: null,
    }
    const back = rowToPlan(planToRow(plan))
    expect(back.schedule).toEqual(plan.schedule)
  })
  it('planToRow serializes object schedule to JSON string', () => {
    const sched = { type: 'once', runAt: '2026-06-01T09:00:00Z', enabled: true }
    const row = planToRow({ id: 'p', name: 'X', schedule: sched, createdAt: 0, updatedAt: 0 })
    expect(typeof row.schedule).toBe('string')
    expect(JSON.parse(row.schedule)).toEqual(sched)
  })
  it('rowToPlan passes through legacy cron string schedule as-is', () => {
    const row = { id: 'p', name: 'X', schedule: '0 9 * * *', enabled: 1, created_at: 0, updated_at: 0 }
    expect(rowToPlan(row).schedule).toBe('0 9 * * *')
  })
  it('coerces enabled INTEGER to boolean', () => {
    expect(rowToPlan({ id: 'x', name: 'P', enabled: 1, created_at: 0, updated_at: 0 }).enabled).toBe(true)
    expect(rowToPlan({ id: 'x', name: 'P', enabled: 0, created_at: 0, updated_at: 0 }).enabled).toBe(false)
  })
  it('rowToPlan returns null for null input', () => {
    expect(rowToPlan(null)).toBeNull()
  })
  it('treats deletedAt 0/null/undefined uniformly as null', () => {
    expect(rowToPlan({ id: 'x', name: 'P', enabled: 1, created_at: 0, updated_at: 0, deleted_at: 0 }).deletedAt).toBeNull()
    expect(rowToPlan({ id: 'x', name: 'P', enabled: 1, created_at: 0, updated_at: 0, deleted_at: null }).deletedAt).toBeNull()
    expect(rowToPlan({ id: 'x', name: 'P', enabled: 1, created_at: 0, updated_at: 0, deleted_at: 1700000000000 }).deletedAt).toBe(1700000000000)
  })
})

describe('task round-trip', () => {
  it('preserves all fields including dependsOn array', () => {
    const task = {
      id: 'task-1',
      planId: 'plan-1',
      stepIndex: 0,
      type: 'cron',
      description: 'Fetch news',
      cronExpr: '0 9 * * *',
      prompt: 'go',
      agentId: 'a-1',
      dependsOn: ['task-0'],
      createdAt: 1700000000000,
      deletedAt: null,
    }
    expect(rowToTask(taskToRow(task))).toMatchObject(task)
  })
  it('handles standalone task (planId null, stepIndex null)', () => {
    const task = {
      id: 'task-2',
      planId: null,
      stepIndex: null,
      type: 'oneshot',
      description: 'Standalone',
      prompt: 'run',
      agentId: 'a-1',
      dependsOn: [],
      createdAt: 1700000000000,
      deletedAt: null,
    }
    const back = rowToTask(taskToRow(task))
    expect(back.planId).toBeNull()
    expect(back.stepIndex).toBeNull()
    expect(back.dependsOn).toEqual([])
  })
})

describe('run round-trip', () => {
  it('preserves output (potentially large) and step_results JSON', () => {
    const run = {
      id: 'run-1',
      planId: 'plan-1',
      itemId: null,
      planName: 'Daily digest',
      triggeredBy: 'cron',
      startedAt: 1700000000000,
      completedAt: 1700000001000,
      status: 'done',
      durationMs: 1000,
      output: 'A'.repeat(50000),
      stepResults: [{ stepIndex: 0, status: 'done', output: 'foo' }],
      error: null,
    }
    expect(rowToRun(runToRow(run))).toMatchObject(run)
  })
  it('handles error status with message', () => {
    const run = {
      id: 'run-2',
      planId: 'plan-1',
      itemId: null,
      planName: 'X',
      triggeredBy: 'manual',
      startedAt: 1700000000000,
      completedAt: 1700000001000,
      status: 'error',
      durationMs: 1000,
      output: null,
      stepResults: [],
      error: 'tool blew up',
    }
    expect(rowToRun(runToRow(run)).error).toBe('tool blew up')
  })
})
