type TaskStatus = 'backlog' | 'in_progress' | 'done'

type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  createdAt: number
  updatedAt: number
}

type Filter = 'all' | 'active' | 'completed'

type State = {
  tasks: Task[]
  filter: Filter
}

type AddAction = { type: 'add'; payload: { title: string } }
type SetStatusAction = { type: 'setStatus'; payload: { id: string; status: TaskStatus } }
type CycleStatusAction = { type: 'cycleStatus'; payload: { id: string } }
type RemoveAction = { type: 'remove'; payload: { id: string } }
type RestoreAction = { type: 'restore'; payload: { task: Task; index: number } }
type SetFilterAction = { type: 'setFilter'; payload: { filter: Filter } }
type ReorderAction = { type: 'reorder'; payload: { orderedIds: string[] } }
type RehydrateAction = { type: 'rehydrate'; payload: { state: State } }
type UpdateDescriptionAction = { type: 'updateDescription'; payload: { id: string; description: string } }
type AddError = 'titleRequired'

type Action =
  | AddAction
  | SetStatusAction
  | CycleStatusAction
  | RemoveAction
  | RestoreAction
  | SetFilterAction
  | ReorderAction
  | RehydrateAction
  | UpdateDescriptionAction

type AddResult = {
  action: AddAction | null
  errorKey: AddError | null
  trimmed: string
}

const now = () => Date.now()

const nextStatus = (status: TaskStatus): TaskStatus => {
  if (status === 'backlog') return 'in_progress'
  if (status === 'in_progress') return 'done'
  return 'backlog'
}

const isActiveStatus = (status: TaskStatus): boolean => status !== 'done'
const isCompletedStatus = (status: TaskStatus): boolean => status === 'done'

const seedTasks = (): Task[] => {
  const base = now()
  return [
    {
      id: 't-1',
      title: 'Просмотреть заметки со стартовой встречи с клиентом',
      description: 'Собрать основные тезисы и выгрузить их в карточку проекта.',
      status: 'backlog',
      createdAt: base - 100000,
      updatedAt: base - 100000
    },
    {
      id: 't-2',
      title: 'Набросать флоу фокуса для новой функции',
      description: 'Быстрый скетч: вход, удержание внимания, мягкое закрытие.',
      status: 'done',
      createdAt: base - 90000,
      updatedAt: base - 90000
    },
    {
      id: 't-3',
      title: 'Отправить дизайн на финальную полировку',
      description: 'Перед отправкой сверить типографику и сетку.',
      status: 'in_progress',
      createdAt: base - 80000,
      updatedAt: base - 80000
    }
  ]
}

const initialState: State = {
  tasks: seedTasks(),
  filter: 'all'
}

const addTask = (title: string): AddResult => {
  const trimmed = title.trim()
  if (!trimmed) {
    return {
      action: null,
      errorKey: 'titleRequired',
      trimmed
    }
  }
  return {
    action: { type: 'add', payload: { title: trimmed } },
    errorKey: null,
    trimmed
  }
}

const setStatus = (id: string, status: TaskStatus): SetStatusAction => ({
  type: 'setStatus',
  payload: { id, status }
})

const cycleStatus = (id: string): CycleStatusAction => ({
  type: 'cycleStatus',
  payload: { id }
})

const removeTask = (id: string): RemoveAction => ({
  type: 'remove',
  payload: { id }
})

const restoreTask = (task: Task, index: number): RestoreAction => ({
  type: 'restore',
  payload: { task, index }
})

const setFilter = (filter: Filter): SetFilterAction => ({
  type: 'setFilter',
  payload: { filter }
})

const reorderTasks = (orderedIds: string[]): ReorderAction => ({
  type: 'reorder',
  payload: { orderedIds }
})

const rehydrate = (state: State): RehydrateAction => ({
  type: 'rehydrate',
  payload: { state }
})

const updateDescription = (id: string, description: string): UpdateDescriptionAction => ({
  type: 'updateDescription',
  payload: { id, description }
})

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'add': {
      const trimmed = action.payload.title.trim()
      if (!trimmed) return state
      const timestamp = now()
      const next: Task = {
        id: `t-${timestamp}`,
        title: trimmed,
        description: '',
        status: 'backlog',
        createdAt: timestamp,
        updatedAt: timestamp
      }
      return {
        ...state,
        tasks: [next, ...state.tasks]
      }
    }
    case 'setStatus': {
      const timestamp = now()
      let changed = false
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== action.payload.id) return task
        if (task.status === action.payload.status) return task
        changed = true
        return {
          ...task,
          status: action.payload.status,
          updatedAt: timestamp
        }
      })
      if (!changed) return state
      return {
        ...state,
        tasks: nextTasks
      }
    }
    case 'cycleStatus': {
      const timestamp = now()
      let changed = false
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== action.payload.id) return task
        const next = nextStatus(task.status)
        changed = true
        return {
          ...task,
          status: next,
          updatedAt: timestamp
        }
      })
      if (!changed) return state
      return {
        ...state,
        tasks: nextTasks
      }
    }
    case 'remove':
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.payload.id)
      }
    case 'restore': {
      const nextTasks = [...state.tasks]
      const safeIndex = Number.isFinite(action.payload.index)
        ? Math.min(Math.max(0, action.payload.index), nextTasks.length)
        : 0
      nextTasks.splice(safeIndex, 0, action.payload.task)
      return {
        ...state,
        tasks: nextTasks
      }
    }
    case 'setFilter':
      return {
        ...state,
        filter: action.payload.filter
      }
    case 'reorder': {
      const orderedIds = action.payload.orderedIds
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) return state
      const taskMap = new Map(state.tasks.map((task) => [task.id, task]))
      const used = new Set<string>()
      const nextTasks: Task[] = []
      for (const id of orderedIds) {
        const task = taskMap.get(id)
        if (!task) continue
        nextTasks.push(task)
        used.add(id)
      }
      if (nextTasks.length === 0) return state
      for (const task of state.tasks) {
        if (!used.has(task.id)) {
          nextTasks.push(task)
        }
      }
      return {
        ...state,
        tasks: nextTasks
      }
    }
    case 'rehydrate':
      return action.payload.state
    case 'updateDescription': {
      const timestamp = now()
      let changed = false
      const nextTasks = state.tasks.map((task) => {
        if (task.id !== action.payload.id) return task
        if (task.description === action.payload.description) return task
        changed = true
        return {
          ...task,
          description: action.payload.description,
          updatedAt: timestamp
        }
      })
      if (!changed) return state
      return {
        ...state,
        tasks: nextTasks
      }
    }
    default:
      return state
  }
}

export type { TaskStatus, Task, Filter, State, Action, AddResult, AddError }
export {
  initialState,
  addTask,
  setStatus,
  cycleStatus,
  removeTask,
  restoreTask,
  setFilter,
  reorderTasks,
  rehydrate,
  updateDescription,
  reducer,
  isActiveStatus,
  isCompletedStatus
}
