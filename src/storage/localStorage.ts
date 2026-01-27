import type { Filter, State, Task, TaskStatus } from '../domain/todo'

const STORAGE_KEY = 'todo-state:v1'
const AUTHOR_KEY = 'todo-state:author'

const normalizeTaskStatus = (value: unknown, legacyDone?: unknown): TaskStatus | null => {
  if (value === 'backlog' || value === 'in_progress' || value === 'done') return value
  if (value === 'active') return 'backlog'
  if (typeof legacyDone === 'boolean') return legacyDone ? 'done' : 'backlog'
  return null
}

const normalizeFilter = (value: unknown): Filter => {
  if (value === 'all' || value === 'active' || value === 'completed') return value
  if (value === 'done') return 'completed'
  return 'all'
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const normalizeTask = (raw: unknown): Task | null => {
  if (!raw || typeof raw !== 'object') return null
  const task = raw as {
    id?: unknown
    title?: unknown
    description?: unknown
    status?: unknown
    createdAt?: unknown
    updatedAt?: unknown
    done?: unknown
  }
  if (typeof task.id !== 'string' || typeof task.title !== 'string') return null

  const nextStatus = normalizeTaskStatus(task.status, task.done)

  if (!nextStatus) return null

  const createdAt = isNumber(task.createdAt) ? task.createdAt : Date.now()
  const updatedAt = isNumber(task.updatedAt) ? task.updatedAt : createdAt
  const description = typeof task.description === 'string' ? task.description : ''

  return {
    id: task.id,
    title: task.title,
    description,
    status: nextStatus,
    createdAt,
    updatedAt
  }
}

const loadState = (): State | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as { tasks?: unknown; filter?: unknown }
    if (!parsed || !Array.isArray(parsed.tasks)) return null

    const tasks: Task[] = []
    for (const raw of parsed.tasks) {
      const normalized = normalizeTask(raw)
      if (!normalized) return null
      tasks.push(normalized)
    }

    const filter = normalizeFilter(parsed.filter)

    return { tasks, filter }
  } catch {
    return null
  }
}

const saveState = (state: State): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore write errors (quota, privacy mode)
  }
}

const loadAuthorName = (): string => {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(AUTHOR_KEY) ?? ''
  } catch {
    return ''
  }
}

const saveAuthorName = (name: string): void => {
  if (typeof window === 'undefined') return
  try {
    if (!name) {
      window.localStorage.removeItem(AUTHOR_KEY)
      return
    }
    window.localStorage.setItem(AUTHOR_KEY, name)
  } catch {
    // ignore write errors (quota, privacy mode)
  }
}

export { loadState, saveState, loadAuthorName, saveAuthorName }
