import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addTask,
  reducer,
  reorderTasks,
  removeTask,
  restoreTask,
  rehydrate,
  setFilter,
  cycleStatus,
  setStatus,
  updateDescription,
  isActiveStatus,
  isCompletedStatus,
} from './todo'
import type { State, Task } from './todo'

describe('todo reducer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })
  it('add: trim and forbid empty strings in addTask', () => {
    const result = addTask('   ')
    expect(result.action).toBeNull()
    expect(result.errorKey).toBe('titleRequired')
    expect(result.trimmed).toBe('')

    const ok = addTask('  Пример  ')
    expect(ok.action?.payload.title).toBe('Пример')
    expect(ok.trimmed).toBe('Пример')
    expect(ok.errorKey).toBeNull()
  })

  it('add: creates backlog task with correct timestamps', () => {
    const baseState: State = { tasks: [], filter: 'all' }
    const now = 1730000000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const next = reducer(baseState, { type: 'add', payload: { title: '  Новая  ' } })

    expect(next.tasks).toHaveLength(1)
    const task = next.tasks[0]
    expect(task.title).toBe('Новая')
    expect(task.description).toBe('')
    expect(task.status).toBe('backlog')
    expect(task.createdAt).toBe(now)
    expect(task.updatedAt).toBe(now)
    expect(task.id).toBe(`t-${now}`)
  })

  it('add: ignores empty string in reducer', () => {
    const baseTask: Task = {
      id: 't-1',
      title: 'Существующая',
      description: '',
      status: 'backlog',
      createdAt: 10,
      updatedAt: 10,
    }
    const baseState: State = { tasks: [baseTask], filter: 'all' }

    const next = reducer(baseState, { type: 'add', payload: { title: '   ' } })
    expect(next).toBe(baseState)
  })

  it('cycleStatus: moves to next status and updates updatedAt', () => {
    const baseTask: Task = {
      id: 't-1',
      title: 'Проверить',
      description: '',
      status: 'backlog',
      createdAt: 10,
      updatedAt: 10,
    }
    const baseState: State = { tasks: [baseTask], filter: 'all' }
    const now = 1730000001234
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const next = reducer(baseState, cycleStatus('t-1'))
    expect(next.tasks[0].status).toBe('in_progress')
    expect(next.tasks[0].updatedAt).toBe(now)
  })

  it('setStatus: updates status when different', () => {
    const baseTask: Task = {
      id: 't-1',
      title: 'Проверить',
      description: '',
      status: 'backlog',
      createdAt: 10,
      updatedAt: 10,
    }
    const baseState: State = { tasks: [baseTask], filter: 'all' }
    const now = 1730000001234
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const next = reducer(baseState, setStatus('t-1', 'done'))
    expect(next.tasks[0].status).toBe('done')
    expect(next.tasks[0].updatedAt).toBe(now)
  })

  it('remove: deletes task by id', () => {
    const baseState: State = {
      tasks: [
        { id: 't-1', title: 'A', description: '', status: 'backlog', createdAt: 1, updatedAt: 1 },
        { id: 't-2', title: 'B', description: '', status: 'done', createdAt: 2, updatedAt: 2 },
      ],
      filter: 'all',
    }

    const next = reducer(baseState, removeTask('t-1'))
    expect(next.tasks).toHaveLength(1)
    expect(next.tasks[0].id).toBe('t-2')
  })

  it('restore: inserts task at original index', () => {
    const restored: Task = {
      id: 't-1',
      title: 'Вернуть',
      description: '',
      status: 'backlog',
      createdAt: 1,
      updatedAt: 1,
    }
    const baseState: State = {
      tasks: [
        { id: 't-2', title: 'B', description: '', status: 'done', createdAt: 2, updatedAt: 2 },
        { id: 't-3', title: 'C', description: '', status: 'in_progress', createdAt: 3, updatedAt: 3 },
      ],
      filter: 'all',
    }

    const next = reducer(baseState, restoreTask(restored, 1))
    expect(next.tasks).toHaveLength(3)
    expect(next.tasks[1].id).toBe('t-1')
  })

  it('setFilter: updates filter', () => {
    const baseState: State = { tasks: [], filter: 'all' }
    const next = reducer(baseState, setFilter('completed'))
    expect(next.filter).toBe('completed')
  })

  it('reorder: updates order and keeps missing tasks at the end', () => {
    const baseState: State = {
      tasks: [
        { id: 't-1', title: 'A', description: '', status: 'backlog', createdAt: 1, updatedAt: 1 },
        { id: 't-2', title: 'B', description: '', status: 'done', createdAt: 2, updatedAt: 2 },
        { id: 't-3', title: 'C', description: '', status: 'in_progress', createdAt: 3, updatedAt: 3 },
      ],
      filter: 'all',
    }

    const next = reducer(baseState, reorderTasks(['t-3', 't-1']))
    expect(next.tasks.map((task) => task.id)).toEqual(['t-3', 't-1', 't-2'])
  })

  it('rehydrate: restores state', () => {
    const state: State = {
      tasks: [
        { id: 't-9', title: 'X', description: '', status: 'done', createdAt: 9, updatedAt: 9 },
      ],
      filter: 'completed',
    }

    const next = reducer({ tasks: [], filter: 'all' }, rehydrate(state))
    expect(next).toBe(state)
  })

  it('updateDescription: updates description and updatedAt', () => {
    const baseTask: Task = {
      id: 't-1',
      title: 'Описание',
      description: 'Старое',
      status: 'backlog',
      createdAt: 10,
      updatedAt: 10,
    }
    const baseState: State = { tasks: [baseTask], filter: 'all' }
    const now = 1730000009999
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const next = reducer(baseState, updateDescription('t-1', 'Новое'))
    expect(next.tasks[0].description).toBe('Новое')
    expect(next.tasks[0].updatedAt).toBe(now)
  })

  it('derived filters: active vs completed status', () => {
    expect(isActiveStatus('backlog')).toBe(true)
    expect(isActiveStatus('in_progress')).toBe(true)
    expect(isActiveStatus('done')).toBe(false)
    expect(isCompletedStatus('done')).toBe(true)
    expect(isCompletedStatus('backlog')).toBe(false)
  })
})
