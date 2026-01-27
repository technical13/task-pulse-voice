import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAuthorName, loadState, saveAuthorName, saveState } from './localStorage'
import type { State } from '../domain/todo'

describe('localStorage adapter', () => {
  const makeLocalStorage = () => {
    const store = new Map<string, string>()
    return {
      get length() {
        return store.size
      },
      clear() {
        store.clear()
      },
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null
      },
      removeItem(key: string) {
        store.delete(key)
      },
      setItem(key: string, value: string) {
        store.set(key, value)
      },
    } satisfies Storage
  }

  beforeEach(() => {
    const localStorage = makeLocalStorage()
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage },
      configurable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    // @ts-expect-error - cleanup test window
    delete globalThis.window
  })

  it('saveState stores serialized state', () => {
    const state: State = {
      tasks: [
        { id: 't-1', title: 'A', description: '', status: 'backlog', createdAt: 1, updatedAt: 1 },
      ],
      filter: 'all',
    }

    saveState(state)

    expect(window.localStorage.length).toBe(1)
    const key = window.localStorage.key(0)
    expect(key).not.toBeNull()
    const stored = key ? window.localStorage.getItem(key) : null
    expect(stored).toBe(JSON.stringify(state))
  })

  it('loadState returns state or null', () => {
    const state: State = {
      tasks: [
        { id: 't-2', title: 'B', description: '', status: 'done', createdAt: 2, updatedAt: 2 },
      ],
      filter: 'completed',
    }

    expect(loadState()).toBeNull()

    saveState(state)
    expect(loadState()).toEqual(state)
  })

  it('loadState returns null on broken JSON without throw', () => {
    const state: State = {
      tasks: [
        { id: 't-3', title: 'C', description: '', status: 'backlog', createdAt: 3, updatedAt: 3 },
      ],
      filter: 'all',
    }

    saveState(state)
    const key = window.localStorage.key(0)
    expect(key).not.toBeNull()
    if (key) window.localStorage.setItem(key, '{bad json')

    expect(() => loadState()).not.toThrow()
    expect(loadState()).toBeNull()
  })

  it('stores and loads author name', () => {
    expect(loadAuthorName()).toBe('')
    saveAuthorName('Анна')
    expect(loadAuthorName()).toBe('Анна')
  })

  it('clears author name when empty', () => {
    saveAuthorName('Игорь')
    saveAuthorName('')
    expect(loadAuthorName()).toBe('')
  })
})
