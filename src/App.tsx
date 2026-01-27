import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type SyntheticEvent,
  type MouseEvent,
  type ComponentPropsWithoutRef,
  type ComponentType
} from 'react'
import { useMutation, useQueries, useQuery } from 'convex/react'
import { AnimatePresence, motion, type MotionProps } from 'framer-motion'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addTask,
  type TaskStatus,
  type Filter,
  type AddError
} from './domain/todo'
import type { Doc, Id } from '../convex/_generated/dataModel'
import { loadAuthorName, saveAuthorName } from './storage/localStorage'
import { api } from '../convex/_generated/api'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from './i18n'
import './App.css'

type MotionButtonProps = ComponentPropsWithoutRef<'button'> & MotionProps
type MotionDivProps = ComponentPropsWithoutRef<'div'> & MotionProps
type MotionUlProps = ComponentPropsWithoutRef<'ul'> & MotionProps

const MotionButton = motion.button as ComponentType<MotionButtonProps>
const MotionDiv = motion.div as ComponentType<MotionDivProps>
const MotionUl = motion.ul as ComponentType<MotionUlProps>
type TaskDoc = Doc<'tasks'>
type TaskEventDoc = Doc<'task_events'>
type MessageDoc = Doc<'messages'>
type NormalizedTaskDoc = Omit<TaskDoc, 'status'> & { status: TaskStatus }

type UndoState = {
  task: NormalizedTaskDoc
  index: number
}

const UNDO_TIMEOUT_MS = 6000
const TASK_ROUTE_PREFIX = '/task/'
const COLUMN_ORDER: TaskStatus[] = ['backlog', 'in_progress', 'done']
const COLUMN_ID_BY_STATUS: Record<TaskStatus, TaskStatus> = {
  backlog: 'backlog',
  in_progress: 'in_progress',
  done: 'done'
}

const isTaskStatusId = (value: string): value is TaskStatus =>
  value === 'backlog' || value === 'in_progress' || value === 'done'

const normalizeTaskStatus = (status?: string | null): TaskStatus => {
  if (status === 'backlog' || status === 'in_progress' || status === 'done') return status
  return 'backlog'
}

const isBelowOverItem = (active: DragEndEvent['active'], over: DragEndEvent['over']) => {
  if (!over) return false
  const overMiddle = over.rect.top + over.rect.height / 2
  const activeTop =
    active.rect.current?.translated?.top ?? active.rect.current?.initial?.top
  if (typeof activeTop !== 'number') return false
  return activeTop > overMiddle
}

const getTaskIdFromPath = (path: string) => {
  const match = path.match(/^\/task\/([^/]+)\/?$/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1]) as Id<'tasks'>
  } catch {
    return null
  }
}

const buildTaskPath = (id: Id<'tasks'>) => `${TASK_ROUTE_PREFIX}${encodeURIComponent(id)}`

type SortableTodoItemProps = {
  todo: NormalizedTaskDoc
  timeLabel: string
  onToggle: (id: Id<'tasks'>) => void
  onRemove: (id: Id<'tasks'>) => void
  onOpen: (id: Id<'tasks'>) => void
}

type TodoItemContentProps = {
  todo: NormalizedTaskDoc
  timeLabel: string
  onToggle?: (id: Id<'tasks'>) => void
  onRemove?: (id: Id<'tasks'>) => void
  onOpen?: (id: Id<'tasks'>) => void
  isDragging?: boolean
  isInteractive?: boolean
  isAnimated?: boolean
}

const TodoItemContent = ({
  todo,
  timeLabel,
  onToggle,
  onRemove,
  onOpen,
  isDragging = false,
  isInteractive = true,
  isAnimated = false
}: TodoItemContentProps) => {
  const { t } = useTranslation()
  const stopDragActivation = (event: SyntheticEvent) => {
    event.stopPropagation()
  }

  const handleOpen = () => {
    if (!isInteractive || !onOpen) return
    if (isDragging) return
    onOpen(todo._id)
  }

  const motionProps = isAnimated
    ? {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12 }
      }
    : undefined

  return (
    <>
      <MotionDiv {...motionProps} className="todo-main">
        <button
          className={todo.status === 'done' ? 'toggle checked' : 'toggle'}
          onPointerDown={isInteractive ? stopDragActivation : undefined}
          onKeyDown={isInteractive ? stopDragActivation : undefined}
          onClick={
            isInteractive
              ? (event) => {
                  event.stopPropagation()
                  onToggle?.(todo._id)
                }
              : undefined
          }
          aria-label={
            todo.status === 'done'
              ? t('todo.markBacklog', { title: todo.title })
              : t('todo.markDone', { title: todo.title })
          }
          aria-pressed={todo.status === 'done'}
          tabIndex={isInteractive ? 0 : -1}
          type="button"
        />
        <div
          className="todo-content"
          role={isInteractive ? 'button' : undefined}
          tabIndex={isInteractive ? 0 : -1}
          onKeyDown={
            isInteractive
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleOpen()
                  }
                }
              : undefined
            }
          aria-label={isInteractive ? t('todo.open', { title: todo.title }) : undefined}
        >
          <p>{todo.title}</p>
          <span>{t('todo.addedAt', { time: timeLabel })}</span>
        </div>
      </MotionDiv>
      <MotionDiv {...motionProps} className="todo-actions">
        <MotionButton
          whileHover={isInteractive ? { scale: 1.05 } : undefined}
          whileTap={isInteractive ? { scale: 0.95 } : undefined}
          className="ghost"
          onPointerDown={isInteractive ? stopDragActivation : undefined}
          onKeyDown={isInteractive ? stopDragActivation : undefined}
          onClick={
            isInteractive
              ? (event) => {
                  event.stopPropagation()
                  onRemove?.(todo._id)
                }
            : undefined
          }
          aria-label={isInteractive ? t('todo.deleteAria', { title: todo.title }) : undefined}
          tabIndex={isInteractive ? 0 : -1}
          type="button"
        >
          {t('todo.deleteButton')}
        </MotionButton>
      </MotionDiv>
    </>
  )
}

const SortableTodoItem = ({ todo, timeLabel, onToggle, onRemove, onOpen }: SortableTodoItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo._id,
    data: { type: 'task', status: todo.status },
    animateLayoutChanges: defaultAnimateLayoutChanges
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const handleCardClick = (event: MouseEvent<HTMLLIElement>) => {
    if (isDragging) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    onOpen(todo._id)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleCardClick}
      className={[
        'todo-item',
        todo.status === 'done' ? 'done' : null,
        isDragging ? 'is-dragging' : null
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <TodoItemContent
        todo={todo}
        timeLabel={timeLabel}
        onToggle={onToggle}
        onRemove={onRemove}
        onOpen={onOpen}
        isDragging={isDragging}
        isAnimated
      />
    </li>
  )
}

type KanbanColumnProps = {
  status: TaskStatus
  tasks: NormalizedTaskDoc[]
  onToggle: (id: Id<'tasks'>) => void
  onRemove: (id: Id<'tasks'>) => void
  onOpen: (id: Id<'tasks'>) => void
  timeFormatter: Intl.DateTimeFormat
  isDragging: boolean
}

const KanbanColumn = ({
  status,
  tasks,
  onToggle,
  onRemove,
  onOpen,
  timeFormatter,
  isDragging
}: KanbanColumnProps) => {
  const { t } = useTranslation()
  const columnId = COLUMN_ID_BY_STATUS[status]
  const { setNodeRef, isOver } = useDroppable({ id: columnId, data: { type: 'column', status } })

  return (
    <section
      ref={setNodeRef}
      className={['kanban-column', isOver ? 'is-over' : null].filter(Boolean).join(' ')}
      aria-label={t(`columns.${status}`)}
      data-status={status}
    >
      <div className="column-header">
        <h3>{t(`columns.${status}`)}</h3>
        <span className="column-count">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((todo) => todo._id)} strategy={verticalListSortingStrategy}>
        <MotionUl
          className="todo-list column-list"
          data-dragging={isDragging ? 'true' : 'false'}
          data-empty={tasks.length === 0 ? 'true' : 'false'}
        >
          <AnimatePresence mode="popLayout">
            {tasks.map((todo) => (
              <SortableTodoItem
                key={todo._id}
                todo={todo}
                timeLabel={timeFormatter.format(todo.createdAt)}
                onToggle={onToggle}
                onRemove={onRemove}
                onOpen={onOpen}
              />
            ))}
          </AnimatePresence>
        </MotionUl>
      </SortableContext>
    </section>
  )
}

function App() {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<AddError | null>(null)
  const [undoState, setUndoState] = useState<UndoState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [routeTaskId, setRouteTaskId] = useState<Id<'tasks'> | null>(() => {
    if (typeof window === 'undefined') return null
    return getTaskIdFromPath(window.location.pathname)
  })
  const [panelDescription, setPanelDescription] = useState('')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [authorName, setAuthorName] = useState(loadAuthorName)
  const [messageDraft, setMessageDraft] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [sttError, setSttError] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<'chat' | 'activity'>('chat')
  const [panelRetryToken, setPanelRetryToken] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [demoToast, setDemoToast] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const undoTimeoutRef = useRef<number | null>(null)
  const demoToastTimeoutRef = useRef<number | null>(null)
  const lastPanelSyncRef = useRef<{ id: Id<'tasks'>; description: string } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const tasksQueryKey = useMemo(() => `tasks-${panelRetryToken}`, [panelRetryToken])
  const seedStatusKey = useMemo(() => `seed-status-${panelRetryToken}`, [panelRetryToken])
  const tasksQueries = useMemo(
    () => ({
      [tasksQueryKey]: { query: api.tasks.list, args: {} },
      [seedStatusKey]: { query: api.tasks.seedStatus, args: {} }
    }),
    [seedStatusKey, tasksQueryKey]
  )
  const taskResults = useQueries(tasksQueries)
  const tasksResult = taskResults[tasksQueryKey] as TaskDoc[] | Error | undefined
  const seedStatusResult = taskResults[seedStatusKey] as
    | {
        seeded: boolean
      }
    | Error
    | undefined
  const tasksError = tasksResult instanceof Error ? tasksResult : null
  const tasksQuery = tasksResult instanceof Error ? undefined : tasksResult
  const seedStatus = seedStatusResult instanceof Error ? undefined : seedStatusResult
  const tasks = useMemo<TaskDoc[]>(() => tasksQuery ?? [], [tasksQuery])
  const isSeeded = seedStatus?.seeded ?? false
  const isTasksLoaded = tasksQuery !== undefined && !tasksError
  const trimmedAuthorName = useMemo(() => authorName.trim(), [authorName])
  const actorName = useMemo(
    () => (trimmedAuthorName ? trimmedAuthorName : 'anonymous'),
    [trimmedAuthorName]
  )
  const normalizedTasks = useMemo<NormalizedTaskDoc[]>(() => {
    if (tasks.length === 0) return tasks as NormalizedTaskDoc[]
    let hasChanges = false
    const next = tasks.map((task) => {
      const safeStatus = normalizeTaskStatus(task.status as string | undefined)
      if (safeStatus === task.status) return task as NormalizedTaskDoc
      hasChanges = true
      return { ...task, status: safeStatus }
    })
    return hasChanges ? next : (tasks as NormalizedTaskDoc[])
  }, [tasks])
  const createTask = useMutation(api.tasks.create)
  const removeTask = useMutation(api.tasks.remove)
  const setTaskStatus = useMutation(api.tasks.setStatus)
  const updateTaskDescription = useMutation(api.tasks.updateDescription)
  const reorderTaskList = useMutation(api.tasks.reorder)
  const seedDemoData = useMutation(api.tasks.seedDemoData)
  const panelQueryKeyBase = useMemo(
    () => (routeTaskId ? `${routeTaskId}-${panelRetryToken}` : null),
    [panelRetryToken, routeTaskId]
  )
  const panelQueries = useMemo(() => {
    if (!routeTaskId || !panelQueryKeyBase) return {}
    return {
      [`messages-${panelQueryKeyBase}`]: { query: api.messages.listByTask, args: { taskId: routeTaskId } }
    }
  }, [panelQueryKeyBase, routeTaskId])
  const panelResults = useQueries(panelQueries)
  const messagesKey = panelQueryKeyBase ? `messages-${panelQueryKeyBase}` : null
  const messagesResult = (messagesKey ? panelResults[messagesKey] : undefined) as
    | MessageDoc[]
    | Error
    | undefined
  const messagesError = messagesResult instanceof Error ? messagesResult : null
  const messages = messagesResult instanceof Error ? undefined : messagesResult
  const eventsQueryArgs = useMemo(
    () => (routeTaskId ? { taskId: routeTaskId } : 'skip'),
    [routeTaskId]
  )
  const taskEventsResult = useQuery(api.events.listByTask, eventsQueryArgs)
  const taskEvents = taskEventsResult ?? undefined
  const sendMessage = useMutation(api.messages.send)

  const activeLanguage = useMemo<SupportedLanguage>(() => {
    return SUPPORTED_LANGUAGES.includes(i18n.language as SupportedLanguage)
      ? (i18n.language as SupportedLanguage)
      : 'en'
  }, [i18n.language])
  const activeLocale = useMemo(() => {
    if (activeLanguage === 'ru') return 'ru-RU'
    if (activeLanguage === 'es') return 'es-ES'
    return 'en-US'
  }, [activeLanguage])
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(activeLocale, {
        hour: '2-digit',
        minute: '2-digit'
      }),
    [activeLocale]
  )
  const relativeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(activeLocale, { numeric: 'auto' }),
    [activeLocale]
  )

  const formatEventTime = useCallback(
    (timestamp: number) => {
      const diffMs = Date.now() - timestamp
      const diffMinutes = Math.round(diffMs / 60000)
      if (diffMinutes < 1) return t('time.justNow')
      if (diffMinutes < 60) return relativeFormatter.format(-diffMinutes, 'minute')
      return timeFormatter.format(timestamp)
    },
    [relativeFormatter, t, timeFormatter]
  )

  const formatStatus = useCallback(
    (status: string | undefined) => {
      if (status === 'backlog') return t('status.backlog')
      if (status === 'in_progress') return t('status.in_progress')
      if (status === 'done') return t('status.done')
      return t('status.unknown')
    },
    [t]
  )

  const formatEventText = useCallback(
    (event: TaskEventDoc) => {
      const actor = event.actor || t('events.actorFallback')
      switch (event.type) {
        case 'task_created':
          return t('events.taskCreated', { actor })
        case 'task_status_changed': {
          const from = formatStatus(event.payload?.from)
          const to = formatStatus(event.payload?.to)
          return t('events.taskStatusChanged', { actor, from, to })
        }
        case 'task_description_updated': {
          const preview = event.payload?.textPreview?.trim()
          if (preview) {
            return t('events.descriptionUpdatedWithPreview', { actor, preview })
          }
          return t('events.descriptionUpdated', { actor })
        }
        case 'task_reordered': {
          const fromIndex = event.payload?.fromIndex
          const toIndex = event.payload?.toIndex
          if (typeof fromIndex === 'number' && typeof toIndex === 'number') {
            return t('events.taskReorderedWithIndex', {
              actor,
              from: fromIndex + 1,
              to: toIndex + 1
            })
          }
          return t('events.taskReordered', { actor })
        }
        case 'message_sent': {
          const preview = event.payload?.textPreview?.trim()
          if (preview) {
            return t('events.messageSentWithPreview', { actor, preview })
          }
          return t('events.messageSent', { actor })
        }
        default:
          return t('events.taskUpdated', { actor })
      }
    },
    [formatStatus, t]
  )

  useEffect(() => {
    saveAuthorName(authorName)
  }, [authorName])

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current)
      }
      if (demoToastTimeoutRef.current !== null) {
        window.clearTimeout(demoToastTimeoutRef.current)
      }
    }
  }, [])

  const stats = useMemo(() => {
    const total = normalizedTasks.length
    const done = normalizedTasks.filter((todo) => todo.status === 'done').length
    return { total, done, active: total - done }
  }, [normalizedTasks])

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, NormalizedTaskDoc[]> = {
      backlog: [],
      in_progress: [],
      done: []
    }
    for (const task of normalizedTasks) {
      grouped[task.status].push(task)
    }
    const orderValue = (task: NormalizedTaskDoc) => (typeof task.order === 'number' ? task.order : 0)
    for (const status of COLUMN_ORDER) {
      grouped[status].sort((a, b) => orderValue(a) - orderValue(b))
    }
    return grouped
  }, [normalizedTasks])

  const tasksCount = isTasksLoaded ? tasks.length : 0
  const isDemoSeeded = isSeeded && tasksCount > 0
  const disableDemoSeed = false

  const triggerDemoToast = useCallback(() => {
    setDemoToast(true)
    if (demoToastTimeoutRef.current !== null) {
      window.clearTimeout(demoToastTimeoutRef.current)
    }
    demoToastTimeoutRef.current = window.setTimeout(() => {
      setDemoToast(false)
      demoToastTimeoutRef.current = null
    }, 2800)
  }, [])

  const handleSeedDemo = useCallback(async () => {
    const result = await seedDemoData({ language: activeLanguage })
    if (result === 'created') {
      triggerDemoToast()
    }
  }, [activeLanguage, seedDemoData, triggerDemoToast])

  const visibleStatuses = useMemo<TaskStatus[]>(() => {
    if (filter === 'completed') return ['done']
    if (filter === 'active') return ['backlog', 'in_progress']
    return COLUMN_ORDER
  }, [filter])

  const visibleColumns = useMemo(
    () => visibleStatuses.map((status) => ({ status, tasks: tasksByStatus[status] })),
    [tasksByStatus, visibleStatuses]
  )
  const visibleTaskCount = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + column.tasks.length, 0),
    [visibleColumns]
  )

  const panelTask = useMemo(
    () => (routeTaskId ? normalizedTasks.find((task) => task._id === routeTaskId) ?? null : null),
    [routeTaskId, normalizedTasks]
  )
  const visibleMessages = useMemo<MessageDoc[]>(() => messages ?? [], [messages])
  const visibleEvents = useMemo<TaskEventDoc[]>(() => taskEvents ?? [], [taskEvents])
  const isEventsLoading = routeTaskId !== null && taskEventsResult === undefined
  const activeTask = useMemo(
    () => (activeId ? normalizedTasks.find((task) => task._id === activeId) ?? null : null),
    [activeId, normalizedTasks]
  )
  const taskById = useMemo(() => {
    const map = new Map<string, NormalizedTaskDoc>()
    for (const task of normalizedTasks) {
      map.set(task._id, task)
    }
    return map
  }, [normalizedTasks])
  const statusToIds = useMemo<Record<TaskStatus, Id<'tasks'>[]>>(
    () => ({
      backlog: tasksByStatus.backlog.map((task) => task._id),
      in_progress: tasksByStatus.in_progress.map((task) => task._id),
      done: tasksByStatus.done.map((task) => task._id)
    }),
    [tasksByStatus]
  )

  const draftResult = useMemo(() => addTask(draft), [draft])
  const isDraftValid = Boolean(draftResult.action)

  const clearUndo = useCallback(() => {
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current)
      undoTimeoutRef.current = null
    }
    setUndoState(null)
  }, [])

  const handleAdd = () => {
    setDraft(draftResult.trimmed)
    if (!draftResult.action) {
      setError(draftResult.errorKey)
      return
    }
    void createTask({ title: draftResult.action.payload.title, actor: actorName })
    setError(null)
    setDraft('')
  }

  const handleToggle = (id: Id<'tasks'>) => {
    const task = normalizedTasks.find((item) => item._id === id)
    if (!task) return
    const nextStatus: TaskStatus = task.status === 'done' ? 'backlog' : 'done'
    void setTaskStatus({ id, status: nextStatus, actor: actorName })
  }

  const handleOpenTask = (id: Id<'tasks'>) => {
    if (routeTaskId !== id) {
      setPanelDescription('')
      lastPanelSyncRef.current = null
      setMessageDraft('')
    }
    setPanelTab('chat')
    setIsDescriptionExpanded(false)
    setRouteTaskId(id)
    const nextPath = buildTaskPath(id)
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath)
    }
  }

  const handleDescriptionSave = useCallback(() => {
    if (!panelTask) return
    if (panelDescription === panelTask.description) return
    void updateTaskDescription({ id: panelTask._id, description: panelDescription, actor: actorName })
  }, [actorName, panelDescription, panelTask, updateTaskDescription])

  const sendChatText = useCallback(
    async (text: string) => {
      if (!panelTask) return
      const trimmedText = text.trim()
      if (!trimmedText) return
      await sendMessage({
        taskId: panelTask._id,
        text: trimmedText,
        author: actorName
      })
    },
    [actorName, panelTask, sendMessage]
  )

  const handleSendMessage = useCallback(async () => {
    if (!panelTask) return
    await sendChatText(messageDraft)
    setMessageDraft('')
  }, [messageDraft, panelTask, sendChatText])

  const stopAudioStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  const handleTranscribe = useCallback(
    async (blob: Blob) => {
      setIsTranscribing(true)
      setSttError(null)
      try {
        const formData = new FormData()
        formData.append('file', blob, 'recording.webm')
        const response = await fetch('/api/stt', {
          method: 'POST',
          body: formData
        })
        const data = (await response.json().catch(() => ({}))) as {
          text?: string
          error?: string
          message?: string
        }
        if (!response.ok) {
          throw new Error(data.error || data.message || 'Ошибка распознавания')
        }
        const text = typeof data.text === 'string' ? data.text : ''
        if (!text.trim()) {
          throw new Error('Речь не распознана')
        }
        setMessageDraft((prev) => (prev.trim() ? `${prev} ${text}` : text))
      } catch (err) {
        setSttError(err instanceof Error ? err.message : 'Ошибка распознавания')
      } finally {
        setIsTranscribing(false)
        setIsRecording(false)
        stopAudioStream()
      }
    },
    [stopAudioStream]
  )

  const handleStartRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return
    setSttError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setSttError('Браузер не поддерживает запись')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        setSttError('Ошибка записи')
      }
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mime })
        void handleTranscribe(blob)
      }
      mediaRecorderRef.current = recorder
      mediaStreamRef.current = stream
      recorder.start()
      setIsRecording(true)
    } catch {
      setSttError('Не удалось получить доступ к микрофону')
      stopAudioStream()
      setIsRecording(false)
    }
  }, [handleTranscribe, isRecording, isTranscribing, stopAudioStream])

  const handleStopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false)
      stopAudioStream()
      return
    }
    recorder.stop()
    setIsRecording(false)
  }, [stopAudioStream])

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      stopAudioStream()
    }
  }, [stopAudioStream])

  const isVoiceIdle = !isRecording && !isTranscribing
  const voiceButtonLabel = isTranscribing
    ? t('chat.voiceTranscribing')
    : isRecording
      ? t('chat.voiceRecording')
      : t('chat.voiceButton')

  const closePanel = useCallback((reason: string) => {
    void reason
    handleDescriptionSave()
    setPanelDescription('')
    lastPanelSyncRef.current = null
    setMessageDraft('')
    setPanelTab('chat')
    setIsDescriptionExpanded(false)
    setRouteTaskId(null)
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/')
    }
  }, [handleDescriptionSave])

  const handlePanelRetry = useCallback(() => {
    setPanelRetryToken((token) => token + 1)
  }, [])

  const handleRemove = (id: Id<'tasks'>) => {
    const index = normalizedTasks.findIndex((task) => task._id === id)
    const task = normalizedTasks[index]
    if (!task) return
    void removeTask({ id })
    setUndoState({ task, index })
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current)
    }
    undoTimeoutRef.current = window.setTimeout(() => {
      setUndoState(null)
      undoTimeoutRef.current = null
    }, UNDO_TIMEOUT_MS)
  }

  const handleUndo = useCallback(() => {
    if (!undoState) return
    void createTask({
      title: undoState.task.title,
      description: undoState.task.description,
      status: undoState.task.status,
      order: undoState.task.order,
      actor: actorName
    })
    clearUndo()
  }, [actorName, clearUndo, createTask, undoState])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
  }

  const handleDragCancel = () => {
    setActiveId(null)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over) return
    const activeTaskId = active.id as Id<'tasks'>
    const activeTask = taskById.get(String(activeTaskId))
    if (!activeTask) return
    const overId = over.id as string
    if (String(activeTaskId) === String(overId)) return

    const fromStatus = activeTask.status
    const overColumnStatus = isTaskStatusId(String(overId)) ? (String(overId) as TaskStatus) : null
    const overTask = taskById.get(String(overId))
    const toStatus = overColumnStatus ?? overTask?.status
    if (!fromStatus || !toStatus) {
      console.warn('Не удалось определить статус для drag-and-drop.', {
        activeId: activeTaskId,
        overId
      })
      return
    }

    const fromIds = statusToIds[fromStatus] ?? []
    const fromIndex = fromIds.indexOf(activeTaskId)
    if (fromIndex === -1) return

    const isOverColumn = Boolean(overColumnStatus)
    const buildColumns = (overrides: Partial<Record<TaskStatus, Id<'tasks'>[]>>) =>
      COLUMN_ORDER.map((status) => ({
        status,
        orderedIds: overrides[status] ?? statusToIds[status]
      }))

    if (fromStatus === toStatus) {
      if (isOverColumn) {
        const toIndex = fromIds.length - 1
        if (fromIndex === toIndex) return
        const nextIds = arrayMove(fromIds, fromIndex, toIndex)
        void reorderTaskList({
          columns: buildColumns({ [fromStatus]: nextIds }),
          movedTaskId: activeTaskId,
          fromStatus,
          toStatus,
          fromIndex,
          toIndex,
          actor: actorName
        })
        return
      }
      if (!overTask) return
      const overIndex = fromIds.indexOf(overTask._id)
      if (overIndex === -1) return
      const insertAfter = isBelowOverItem(active, over)
      const nextIds = [...fromIds]
      nextIds.splice(fromIndex, 1)
      let toIndex = overIndex
      if (fromIndex < overIndex) toIndex -= 1
      if (insertAfter) toIndex += 1
      if (toIndex === fromIndex) return
      nextIds.splice(toIndex, 0, activeTaskId)
      void reorderTaskList({
        columns: buildColumns({ [fromStatus]: nextIds }),
        movedTaskId: activeTaskId,
        fromStatus,
        toStatus,
        fromIndex,
        toIndex,
        actor: actorName
      })
      return
    }

    const targetIds = statusToIds[toStatus] ?? []
    const baseIndex = isOverColumn ? targetIds.length : targetIds.indexOf(overId as Id<'tasks'>)
    const insertAfter = !isOverColumn && overTask ? isBelowOverItem(active, over) : false
    let safeInsertIndex = baseIndex
    if (safeInsertIndex === -1) safeInsertIndex = targetIds.length
    if (!isOverColumn && insertAfter) safeInsertIndex += 1
    if (safeInsertIndex > targetIds.length) safeInsertIndex = targetIds.length
    const nextFromIds = fromIds.filter((id) => id !== activeTaskId)
    const nextTargetIds = targetIds.filter((id) => id !== activeTaskId)
    nextTargetIds.splice(safeInsertIndex, 0, activeTaskId)

    void reorderTaskList({
      columns: buildColumns({ [fromStatus]: nextFromIds, [toStatus]: nextTargetIds }),
      movedTaskId: activeTaskId,
      fromStatus,
      toStatus,
      fromIndex,
      toIndex: safeInsertIndex,
      actor: actorName
    })
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!undoState) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndo()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleUndo, undoState])

  useEffect(() => {
    const handlePopState = () => {
      const nextTaskId = getTaskIdFromPath(window.location.pathname)
      const isChangingTask = routeTaskId !== nextTaskId
      if (routeTaskId && !nextTaskId) {
        handleDescriptionSave()
      }
      if (isChangingTask) {
        setPanelDescription('')
        lastPanelSyncRef.current = null
        setMessageDraft('')
        setPanelTab('chat')
        setIsDescriptionExpanded(false)
      }
      setRouteTaskId((prev) => (prev === nextTaskId ? prev : nextTaskId))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [handleDescriptionSave, routeTaskId])

  useEffect(() => {
    if (!routeTaskId) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closePanel('user:esc')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [closePanel, routeTaskId])

  useEffect(() => {
    if (!panelTask) return
    const nextDescription = panelTask.description ?? ''
    const lastSync = lastPanelSyncRef.current
    if (!lastSync || lastSync.id !== panelTask._id || lastSync.description !== nextDescription) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelDescription(nextDescription)
      lastPanelSyncRef.current = { id: panelTask._id, description: nextDescription }
    }
  }, [panelTask])

  useEffect(() => {
    if (!panelTask) return
    const focusTarget = descriptionRef.current ?? document.querySelector<HTMLDivElement>('.task-panel')
    if (focusTarget) {
      focusTarget.focus()
    }
  }, [panelTask])

  const isPanelOpen = Boolean(routeTaskId)
  const isTaskMissing = Boolean(routeTaskId && isTasksLoaded && !panelTask)
  const panelError = Boolean(tasksError || messagesError)
  const panelState = panelError
    ? 'error'
    : !isTasksLoaded
      ? 'loading'
      : isTaskMissing
        ? 'not-found'
        : panelTask
          ? 'ready'
          : 'loading'
  const panelTitle =
    panelState === 'error'
      ? t('panel.title.error')
      : panelState === 'not-found'
        ? t('panel.title.notFound')
        : panelTask?.title ?? t('panel.title.loading')

  useEffect(() => {
    document.documentElement.lang = activeLanguage
    document.title = t('app.title')
  }, [activeLanguage, t])

  return (
    <div className={isPanelOpen ? 'app is-focus' : 'app'}>
      <div className="app-shell">
        <header className="hero">
          <div>
            <span className="eyebrow">{t('app.eyebrow')}</span>
            <h1>{t('app.title')}</h1>
            <p className="subtitle">{t('app.subtitle')}</p>
          </div>
          <div className="hero-side">
            <div className="lang-switcher" role="group" aria-label={t('language.label')}>
              {SUPPORTED_LANGUAGES.map((lang, index) => (
                <span key={lang} className="lang-option">
                  <button
                    type="button"
                    className={activeLanguage === lang ? 'lang active' : 'lang'}
                    aria-pressed={activeLanguage === lang}
                    aria-label={t('language.set', { language: t(`language.${lang}`) })}
                    onClick={() => i18n.changeLanguage(lang)}
                  >
                    {lang.toUpperCase()}
                  </button>
                  {index < SUPPORTED_LANGUAGES.length - 1 ? (
                    <span className="lang-divider" aria-hidden="true">
                      |
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
            <div className="demo-seed">
              <MotionButton
                whileHover={!disableDemoSeed ? { scale: 1.02 } : undefined}
                whileTap={!disableDemoSeed ? { scale: 0.98 } : undefined}
                type="button"
                className="demo-seed-button"
                onClick={!disableDemoSeed ? handleSeedDemo : undefined}
                disabled={disableDemoSeed}
              >
                {isDemoSeeded ? t('demo.alreadySeeded') : t('demo.seedButton')}
              </MotionButton>
            </div>
            <div className="hero-card" aria-hidden="true">
              <span className="hero-dot" />
              <div>
                <p className="hero-label">{t('app.today')}</p>
                <p className="hero-value">{t('stats.activeCount', { count: stats.active })}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="panel input-panel" aria-label={t('input.panelLabel')}>
          <form
            className="input-row"
            onSubmit={(event) => {
              event.preventDefault()
              handleAdd()
            }}
          >
            <label className="sr-only" htmlFor="todo-input">
              {t('input.srLabel')}
            </label>
            <input
              id="todo-input"
              type="text"
              ref={inputRef}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setDraft('')
                  setError(null)
                  inputRef.current?.blur()
                }
              }}
              placeholder={t('input.placeholder')}
              aria-label={t('input.nameAria')}
            />
            <MotionButton
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="primary"
              aria-label={t('input.panelLabel')}
              disabled={!isDraftValid}
            >
              {t('input.button')}
            </MotionButton>
          </form>
          {error ? <p className="input-error">{t(`errors.${error}`)}</p> : null}
        </section>

        <section className="stats" aria-label={t('stats.panelLabel')}>
          <div className="stat-card">
            <p>{t('stats.total')}</p>
            <strong>{stats.total}</strong>
          </div>
          <div className="stat-card">
            <p>{t('stats.active')}</p>
            <strong>{stats.active}</strong>
          </div>
          <div className="stat-card">
            <p>{t('stats.done')}</p>
            <strong>{stats.done}</strong>
          </div>
        </section>

        <section className="panel filters" aria-label={t('filters.panelLabel')}>
          {(['all', 'active', 'completed'] as Filter[]).map((tab) => (
            <MotionButton
              key={tab}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              className={filter === tab ? 'filter active' : 'filter'}
              onClick={() => setFilter(tab)}
              aria-pressed={filter === tab}
              aria-label={t(`filters.${tab}Label`)}
              type="button"
            >
              {t(`filters.${tab}`)}
            </MotionButton>
          ))}
        </section>

        <section className="panel list-panel" aria-label={t('list.panelLabel')}>
          <AnimatePresence mode="popLayout">
            {visibleTaskCount === 0 ? (
              <MotionDiv
                key="empty"
                className="empty kanban-empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p>{t('list.emptyTitle')}</p>
                <span>{t('list.emptySubtitle')}</span>
              </MotionDiv>
            ) : null}
          </AnimatePresence>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
          >
            <div className="kanban-board" data-dragging={activeId ? 'true' : 'false'}>
              {visibleColumns.map((column) => (
                <KanbanColumn
                  key={column.status}
                  status={column.status}
                  tasks={column.tasks}
                  onToggle={handleToggle}
                  onRemove={handleRemove}
                  onOpen={handleOpenTask}
                  timeFormatter={timeFormatter}
                  isDragging={Boolean(activeId)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="todo-item drag-overlay" aria-hidden="true">
                  <TodoItemContent
                    todo={activeTask}
                    timeLabel={timeFormatter.format(activeTask.createdAt)}
                    isInteractive={false}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </section>
      </div>
      <AnimatePresence>
        {isPanelOpen ? (
          <MotionDiv
            key="task-panel-overlay"
            className="task-panel-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => closePanel('user:backdrop')}
          >
            <MotionDiv
              className="task-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-panel-title"
              tabIndex={-1}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="task-panel-header">
                <div className="task-panel-header-text" data-task-id={routeTaskId ?? undefined}>
                  <p className="task-panel-eyebrow">{t('panel.details')}</p>
                  <h2 id="task-panel-title">{panelTitle}</h2>
                </div>
                <MotionButton
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  className="task-panel-close"
                  onClick={() => closePanel('user:button')}
                  aria-label={t('panel.closeAria')}
                >
                  {t('panel.close')}
                </MotionButton>
              </header>
              <div className="task-panel-body">
                {panelState === 'error' ? (
                  <div className="task-panel-loading" role="status" aria-live="polite">
                    <p>{t('panel.errorMessage')}</p>
                    <MotionButton
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      className="primary"
                      onClick={handlePanelRetry}
                    >
                      {t('panel.retry')}
                    </MotionButton>
                  </div>
                ) : panelState === 'not-found' ? (
                  <div className="task-panel-loading" role="status" aria-live="polite">
                    <p>{t('panel.notFoundMessage')}</p>
                    <MotionButton
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      className="primary"
                      onClick={() => closePanel('user:back')}
                    >
                      {t('panel.back')}
                    </MotionButton>
                  </div>
                ) : panelState === 'loading' ? (
                  <div className="task-panel-loading" role="status" aria-live="polite">
                    <p>{t('panel.loadingMessage')}</p>
                    <div className="task-panel-skeleton">
                      <div className="skeleton-line wide" />
                      <div className="skeleton-line" />
                      <div className="skeleton-line medium" />
                      <div className="skeleton-line wide" />
                      <div className="skeleton-line" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="task-description">
                      <div className="task-section-header">
                        <label className="task-section-label" htmlFor="task-description">
                          {t('description.label')}
                        </label>
                        <button
                          type="button"
                          className="task-section-toggle"
                          onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                          aria-pressed={isDescriptionExpanded}
                        >
                          {isDescriptionExpanded ? t('description.collapse') : t('description.expand')}
                        </button>
                      </div>
                      <textarea
                        id="task-description"
                        ref={descriptionRef}
                        rows={4}
                        value={panelDescription}
                        onChange={(event) => setPanelDescription(event.target.value)}
                        onBlur={handleDescriptionSave}
                        placeholder={t('description.placeholder')}
                        className={isDescriptionExpanded ? 'task-description-textarea expanded' : 'task-description-textarea'}
                      />
                    </div>
                    <div className="task-panel-tabs" role="tablist" aria-label={t('panel.details')}>
                      <button
                        type="button"
                        id="task-panel-tab-chat"
                        role="tab"
                        className={panelTab === 'chat' ? 'task-panel-tab is-active' : 'task-panel-tab'}
                        aria-selected={panelTab === 'chat'}
                        aria-controls="task-panel-chat"
                        onClick={() => setPanelTab('chat')}
                      >
                        {t('chat.label')}
                      </button>
                      <button
                        type="button"
                        id="task-panel-tab-activity"
                        role="tab"
                        className={panelTab === 'activity' ? 'task-panel-tab is-active' : 'task-panel-tab'}
                        aria-selected={panelTab === 'activity'}
                        aria-controls="task-panel-activity"
                        onClick={() => setPanelTab('activity')}
                      >
                        {t('activity.label')}
                      </button>
                    </div>
                    <div className="task-panel-tab-body">
                      {panelTab === 'chat' ? (
                        <section
                          id="task-panel-chat"
                          className="task-chat"
                          role="tabpanel"
                          aria-labelledby="task-panel-tab-chat"
                          aria-label={t('chat.label')}
                          data-task-id={routeTaskId ?? undefined}
                        >
                          <div className="task-chat-header">
                            <h3 className="task-chat-title">{t('chat.title')}</h3>
                            <span className="task-chat-caption">{t('chat.caption')}</span>
                          </div>
                          <label className="task-field">
                            <span>{t('chat.nameLabel')}</span>
                            <input
                              type="text"
                              value={authorName}
                              onChange={(event) => {
                                setAuthorName(event.target.value)
                              }}
                              placeholder={t('chat.namePlaceholder')}
                            />
                          </label>
                          <div className="chat-messages" role="log" aria-live="polite">
                            {visibleMessages.length === 0 ? (
                              <p className="chat-empty">{t('chat.empty')}</p>
                            ) : (
                              <ul className="chat-list">
                                {visibleMessages.map((message) => (
                                  <li key={message._id} className="chat-message">
                                    <div className="chat-message-meta">
                                      <strong>{message.author}</strong>
                                      <span>{timeFormatter.format(message.createdAt)}</span>
                                    </div>
                                    <p className="chat-message-text">{message.text}</p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <form
                            className="chat-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              handleSendMessage()
                            }}
                          >
                            <label className="sr-only" htmlFor="chat-input">
                              {t('chat.messageLabel')}
                            </label>
                            <textarea
                              id="chat-input"
                              rows={3}
                              value={messageDraft}
                              onChange={(event) => {
                                setMessageDraft(event.target.value)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault()
                                  handleSendMessage()
                                }
                              }}
                              placeholder={t('chat.messagePlaceholder')}
                            />
                            <div className="chat-form-actions">
                              <button
                                type="button"
                                className="ghost chat-voice-button"
                                onClick={() => {
                                  if (isRecording) {
                                    handleStopRecording()
                                    return
                                  }
                                  void handleStartRecording()
                                }}
                                disabled={isTranscribing}
                                aria-pressed={isRecording}
                              >
                                {isVoiceIdle ? (
                                  <>
                                    <span className="chat-voice-emoji" aria-hidden="true">
                                      🎙
                                    </span>
                                    <span className="chat-voice-text">{voiceButtonLabel}</span>
                                  </>
                                ) : (
                                  <span className="chat-voice-status">{voiceButtonLabel}</span>
                                )}
                              </button>
                              <MotionButton
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                className="primary"
                                disabled={!messageDraft.trim()}
                              >
                                {t('chat.send')}
                              </MotionButton>
                            </div>
                          </form>
                          {sttError ? (
                            <p className="chat-error" role="alert">
                              {sttError}
                            </p>
                          ) : null}
                        </section>
                      ) : (
                        <section
                          id="task-panel-activity"
                          className="task-activity"
                          role="tabpanel"
                          aria-labelledby="task-panel-tab-activity"
                          aria-label={t('activity.label')}
                          data-task-id={routeTaskId ?? undefined}
                        >
                          <div className="task-activity-header">
                            <div>
                              <h3 className="task-activity-title">{t('activity.title')}</h3>
                              <span className="task-activity-caption">{t('activity.caption')}</span>
                            </div>
                          </div>
                          <div id="task-activity-list" className="task-activity-body">
                            <div className="activity-list" role="log" aria-live="polite">
                              {!routeTaskId || isEventsLoading ? (
                                <p className="activity-loading">Загрузка…</p>
                              ) : visibleEvents.length === 0 ? (
                                <p className="activity-empty">Событий пока нет</p>
                              ) : (
                                <ul className="activity-items">
                                  {visibleEvents.map((event) => (
                                    <li key={event._id} className="activity-item">
                                      <p className="activity-text">{formatEventText(event)}</p>
                                      <span className="activity-time">{formatEventTime(event.createdAt)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </section>
                      )}
                    </div>
                  </>
                )}
              </div>
            </MotionDiv>
          </MotionDiv>
        ) : null}
      </AnimatePresence>
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {demoToast ? (
            <MotionDiv
              key="demo-toast"
              className="demo-toast"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
            >
              <span>{t('toast.demoSeeded')}</span>
            </MotionDiv>
          ) : null}
          {undoState ? (
            <MotionDiv
              key="undo-toast"
              className="undo-toast"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.22 }}
            >
              <span>{t('toast.taskDeleted')}</span>
              <MotionButton
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                className="undo-action"
                onClick={handleUndo}
                aria-label={t('toast.undoAria')}
              >
                {t('toast.undo')}
              </MotionButton>
            </MotionDiv>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default App
