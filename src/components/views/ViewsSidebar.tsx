// landr-c58d / landr-45pb — Views sub-list in the app sidebar.
//
// Gmail-style three-bucket IA:
//
//   ───── Primary ─────              ← always visible
//   📌 Pinned view A                  (DnD-ordered, user_state.sort_order)
//   📌 Pinned view B
//   📌 Pinned view C
//   ───── More ⌄ (collapsible) ─────  (persisted in localStorage)
//   Unpinned view D
//   Unpinned view E
//     ↳ Hidden ⌄ (sub-expander)       (persisted in localStorage)
//       Hidden view F                 (dim, NOT draggable)
//       Hidden view G
//
// DnD semantics (@dnd-kit/core + sortable):
//   * Drag within Primary → reorders. The new order is persisted via the
//     bulk PATCH .../saved-views/reorder endpoint (one round-trip).
//   * Drag from More → Primary → sets pinned=true + appends to the
//     user's per-user sort_order (last slot in Primary).
//   * Drag from Primary → More → sets pinned=false.
//   * Hidden views are not draggable until unhidden via the row menu.
//
// Per-row affordances:
//   * Inline PinButton (always on for pinned rows; hover-revealed otherwise).
//   * Overflow menu carries Hide/Unhide; Hidden rows expose Unhide only.
//
// Renames from landr-c58d:
//   * `starred` → `pinned` everywhere (column rename in migration
//     20260521090000_view_user_state_pinned_and_sort_order.sql).
//   * StarButton → PinButton; StarIcon → PinIcon (lucide-react).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, MoreHorizontalIcon, PinIcon } from 'lucide-react'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { useOperator } from '@/lib/operator'
import {
  listSavedViews,
  reorderSavedViews,
  setViewUserState,
  type SavedViewWithState,
  type ViewReorderItem,
} from '@/lib/saved-views'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { PinButton } from './PinButton'
import { bucketViewsForSidebar } from './sidebar-sort'

const MORE_EXPANDER_KEY = 'landr.dashboard.viewsMoreOpen'
const HIDDEN_EXPANDER_KEY = 'landr.dashboard.viewsHiddenOpen'

// localStorage is touched lazily inside an initializer so SSR / jsdom-without-
// storage paths fall back to the default cleanly. JSON parse is wrapped in
// try/catch because a hand-edited value should never crash the sidebar.
function readPersistedBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === 'true'
  } catch {
    return fallback
  }
}

function writePersistedBool(key: string, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    /* localStorage may throw in privacy modes — silently ignore */
  }
}

// ---- one view row (sortable + non-sortable variants) ----------------------

type RowChromeProps = {
  view: SavedViewWithState
  operatorId: string
  /** dim the row (used for the Hidden bucket). */
  dimmed?: boolean
  /** show a 🚫 prefix to make hidden state obvious at a glance. */
  hiddenIndicator?: boolean
  /** dnd attach point + handle props (only set for the Primary bucket). */
  dragRef?: (node: HTMLLIElement | null) => void
  dragAttributes?: Record<string, unknown>
  dragListeners?: Record<string, unknown>
  dragStyle?: React.CSSProperties
  isDragging?: boolean
}

function ViewRowChrome({
  view,
  operatorId,
  dimmed = false,
  hiddenIndicator = false,
  dragRef,
  dragAttributes,
  dragListeners,
  dragStyle,
  isDragging = false,
}: RowChromeProps) {
  const qc = useQueryClient()
  const listKey = ['saved-views', operatorId] as const

  const hideMutation = useMutation({
    mutationFn: async (nextHidden: boolean) => {
      await setViewUserState(operatorId, view.id, { hidden: nextHidden })
      return nextHidden
    },
    onMutate: async (nextHidden) => {
      await qc.cancelQueries({ queryKey: listKey })
      const previous = qc.getQueryData<SavedViewWithState[]>(listKey)
      if (previous) {
        qc.setQueryData<SavedViewWithState[]>(
          listKey,
          previous.map((v) =>
            v.id === view.id
              ? { ...v, user_state: { ...v.user_state, hidden: nextHidden } }
              : v,
          ),
        )
      }
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(listKey, ctx.previous)
      }
      toast.error(t.viewsSidebar.hideError)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const isHidden = view.user_state.hidden
  const isPinned = view.user_state.pinned

  return (
    <SidebarMenuSubItem
      ref={dragRef}
      style={dragStyle}
      className={cn(
        dimmed && 'opacity-60',
        isDragging && 'opacity-40',
      )}
    >
      <div
        className="group/view-row relative flex w-full items-center"
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
      >
        <SidebarMenuSubButton asChild className="pr-12">
          <Link to={`/views/${view.id}`}>
            {hiddenIndicator ? (
              <span aria-hidden className="text-xs opacity-60">
                🚫
              </span>
            ) : isPinned ? (
              <PinIcon
                className="size-3 shrink-0 fill-current text-amber-500"
                aria-hidden
              />
            ) : null}
            <span className="truncate">{view.name}</span>
          </Link>
        </SidebarMenuSubButton>
        {/* Row affordances: inline pin + overflow menu. Both sit
            absolutely on the right; opacity-0 → opacity-100 on hover
            so they don't clutter the sidebar at rest. */}
        <div
          className={cn(
            'absolute top-1/2 right-1 -translate-y-1/2 flex items-center gap-0.5',
            'opacity-0 transition-opacity',
            'group-hover/view-row:opacity-100 group-focus-within/view-row:opacity-100',
            // Always show the pin button when the view is pinned so the
            // user can unpin via click without first hovering — mirrors
            // common UI conventions for "lit" pin affordances.
            isPinned && 'opacity-100',
          )}
        >
          <PinButton
            viewId={view.id}
            pinned={isPinned}
            operatorId={operatorId}
            size="sm"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.viewsSidebar.rowMenuLabel(view.name)}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                className={cn(
                  'inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-md p-0.5',
                  'text-sidebar-foreground/70 transition-colors',
                  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                )}
              >
                <MoreHorizontalIcon className="size-3.5" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  hideMutation.mutate(!isHidden)
                }}
              >
                {isHidden
                  ? t.viewsSidebar.unhide
                  : t.viewsSidebar.hideFromSidebar}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </SidebarMenuSubItem>
  )
}

function SortableViewRow({
  view,
  operatorId,
}: { view: SavedViewWithState; operatorId: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <ViewRowChrome
      view={view}
      operatorId={operatorId}
      dragRef={setNodeRef}
      dragAttributes={attributes as unknown as Record<string, unknown>}
      dragListeners={listeners as unknown as Record<string, unknown>}
      dragStyle={style}
      isDragging={isDragging}
    />
  )
}

// ---- bucket-level "drop zones" for cross-bucket drags ----------------------
//
// The Primary bucket is also a droppable target so dragging an unpinned view
// from More onto it pins the view. We rely on `useDroppable` (not Sortable)
// because the target itself doesn't reorder — pin-on-drop is the side effect.

function MoreDropTarget({
  children,
  isOver,
}: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: 'bucket-more' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md transition-colors',
        isOver && 'bg-sidebar-accent/40',
      )}
    >
      {children}
    </div>
  )
}

function PrimaryDropTarget({
  children,
  isOver,
}: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: 'bucket-primary' })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md transition-colors',
        isOver && 'bg-sidebar-accent/40',
      )}
    >
      {children}
    </div>
  )
}

// ---- main component --------------------------------------------------------

export function ViewsSidebar() {
  const qc = useQueryClient()
  const { currentOperatorId } = useOperator()
  const [moreOpen, setMoreOpen] = useState<boolean>(() =>
    readPersistedBool(MORE_EXPANDER_KEY, true),
  )
  const [hiddenOpen, setHiddenOpen] = useState<boolean>(() =>
    readPersistedBool(HIDDEN_EXPANDER_KEY, false),
  )
  const [activeBucket, setActiveBucket] = useState<
    'bucket-primary' | 'bucket-more' | null
  >(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 5px activation threshold so a click on the row still navigates and
      // only a deliberate drag begins the DnD pipeline.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function setMoreOpenPersisted(next: boolean) {
    setMoreOpen(next)
    writePersistedBool(MORE_EXPANDER_KEY, next)
  }
  function setHiddenOpenPersisted(next: boolean) {
    setHiddenOpen(next)
    writePersistedBool(HIDDEN_EXPANDER_KEY, next)
  }

  const query = useQuery({
    queryKey: ['saved-views', currentOperatorId ?? 'none'],
    queryFn: () => listSavedViews(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const views = useMemo(() => query.data ?? [], [query.data])
  const { primary, more, hidden } = useMemo(
    () => bucketViewsForSidebar(views),
    [views],
  )

  const listKey = currentOperatorId
    ? (['saved-views', currentOperatorId] as const)
    : null

  // --- mutations -----------------------------------------------------------

  const reorderMutation = useMutation({
    mutationFn: async (items: ReadonlyArray<ViewReorderItem>) => {
      if (!currentOperatorId) return { updated: 0 }
      return reorderSavedViews(currentOperatorId, items)
    },
    onError: () => {
      toast.error(t.viewsSidebar.reorderError)
      if (listKey) void qc.invalidateQueries({ queryKey: listKey })
    },
    onSettled: () => {
      if (listKey) void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  const pinMutation = useMutation({
    mutationFn: async (args: {
      viewId: string
      pinned: boolean
      sortOrder?: number
    }) => {
      if (!currentOperatorId) return
      const payload: Record<string, boolean | number> = { pinned: args.pinned }
      if (args.sortOrder !== undefined) {
        payload.sort_order = args.sortOrder
      }
      await setViewUserState(currentOperatorId, args.viewId, payload)
    },
    onError: () => {
      toast.error(t.viewsSidebar.pinError)
      if (listKey) void qc.invalidateQueries({ queryKey: listKey })
    },
    onSettled: () => {
      if (listKey) void qc.invalidateQueries({ queryKey: listKey })
    },
  })

  // --- DnD handlers --------------------------------------------------------

  function handleDragOver(event: { over: { id: string | number } | null }) {
    const overId = event.over?.id
    if (overId === 'bucket-primary' || overId === 'bucket-more') {
      setActiveBucket(overId)
    } else {
      setActiveBucket(null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveBucket(null)
    const { active, over } = event
    if (!over || !currentOperatorId || !listKey) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Snapshot current views by id for lookups.
    const byId = new Map(views.map((v) => [v.id, v]))
    const draggedView = byId.get(activeId)
    if (!draggedView) return

    // --- Case 1: reorder within Primary --------------------------------
    const overInPrimary = primary.some((v) => v.id === overId)
    if (
      draggedView.user_state.pinned &&
      (overInPrimary || overId === 'bucket-primary')
    ) {
      const currentIds = primary.map((v) => v.id)
      const oldIndex = currentIds.indexOf(activeId)
      const newIndex = overInPrimary
        ? currentIds.indexOf(overId)
        : currentIds.length - 1
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

      const nextIds = arrayMove(currentIds, oldIndex, newIndex)
      // Optimistic local update: re-stamp sort_order on the cached rows.
      const newOrderById = new Map(nextIds.map((id, idx) => [id, idx]))
      qc.setQueryData<SavedViewWithState[]>(listKey, (prev) =>
        (prev ?? []).map((v) =>
          newOrderById.has(v.id)
            ? {
                ...v,
                user_state: {
                  ...v.user_state,
                  sort_order: newOrderById.get(v.id) ?? v.user_state.sort_order,
                },
              }
            : v,
        ),
      )
      reorderMutation.mutate(
        nextIds.map((id, idx) => ({ view_id: id, sort_order: idx })),
      )
      return
    }

    // --- Case 2: drag from More → Primary (pin) ------------------------
    if (
      !draggedView.user_state.pinned &&
      !draggedView.user_state.hidden &&
      (primary.some((v) => v.id === overId) || overId === 'bucket-primary')
    ) {
      // Append to the end of Primary's user-specific sort_order.
      const nextSortOrder = primary.length
      // Optimistic flip.
      qc.setQueryData<SavedViewWithState[]>(listKey, (prev) =>
        (prev ?? []).map((v) =>
          v.id === activeId
            ? {
                ...v,
                user_state: {
                  ...v.user_state,
                  pinned: true,
                  sort_order: nextSortOrder,
                },
              }
            : v,
        ),
      )
      pinMutation.mutate({
        viewId: activeId,
        pinned: true,
        sortOrder: nextSortOrder,
      })
      return
    }

    // --- Case 3: drag from Primary → More (unpin) ----------------------
    if (
      draggedView.user_state.pinned &&
      (overId === 'bucket-more' || more.some((v) => v.id === overId))
    ) {
      qc.setQueryData<SavedViewWithState[]>(listKey, (prev) =>
        (prev ?? []).map((v) =>
          v.id === activeId
            ? {
                ...v,
                user_state: { ...v.user_state, pinned: false },
              }
            : v,
        ),
      )
      pinMutation.mutate({ viewId: activeId, pinned: false })
      return
    }
  }

  // --- early returns -------------------------------------------------------

  if (!currentOperatorId) {
    // Top-level "Views" link still renders in the parent sidebar.
    return null
  }

  const isEmpty =
    !query.isPending &&
    primary.length === 0 &&
    more.length === 0 &&
    hidden.length === 0

  // --- render --------------------------------------------------------------

  return (
    <SidebarMenuSub>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {/* ---- Primary (always visible) ---- */}
        <PrimaryDropTarget isOver={activeBucket === 'bucket-primary'}>
          <SortableContext
            items={primary.map((v) => v.id)}
            strategy={verticalListSortingStrategy}
          >
            {primary.map((view) => (
              <SortableViewRow
                key={view.id}
                view={view}
                operatorId={currentOperatorId}
              />
            ))}
          </SortableContext>
          {primary.length === 0 && !isEmpty ? (
            <SidebarMenuSubItem>
              <div className="px-2 py-1 text-xs italic text-muted-foreground">
                {t.viewsSidebar.primaryEmptyHint}
              </div>
            </SidebarMenuSubItem>
          ) : null}
        </PrimaryDropTarget>

        {/* ---- More expander ---- */}
        {more.length > 0 || primary.length > 0 ? (
          <SidebarMenuSubItem>
            <button
              type="button"
              aria-pressed={moreOpen}
              aria-expanded={moreOpen}
              onClick={() => setMoreOpenPersisted(!moreOpen)}
              className={cn(
                'flex h-6 w-full cursor-pointer items-center gap-1 rounded-md px-2 text-xs',
                'text-sidebar-foreground/60 transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
              )}
            >
              {moreOpen ? (
                <ChevronDown className="size-3" aria-hidden />
              ) : (
                <ChevronRight className="size-3" aria-hidden />
              )}
              <span className="truncate">{t.viewsSidebar.moreLabel}</span>
              <span className="ml-auto tabular-nums">({more.length})</span>
            </button>
          </SidebarMenuSubItem>
        ) : null}

        {moreOpen ? (
          <MoreDropTarget isOver={activeBucket === 'bucket-more'}>
            {more.map((view) => (
              <ViewRowChrome
                key={view.id}
                view={view}
                operatorId={currentOperatorId}
              />
            ))}
          </MoreDropTarget>
        ) : null}

        {/* ---- Hidden sub-expander (only when there ARE hidden views) ---- */}
        {hidden.length > 0 ? (
          <SidebarMenuSubItem>
            <button
              type="button"
              aria-pressed={hiddenOpen}
              aria-expanded={hiddenOpen}
              onClick={() => setHiddenOpenPersisted(!hiddenOpen)}
              className={cn(
                'flex h-6 w-full cursor-pointer items-center gap-1 rounded-md pl-5 pr-2 text-xs',
                'text-sidebar-foreground/60 transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
              )}
            >
              {hiddenOpen ? (
                <ChevronDown className="size-3" aria-hidden />
              ) : (
                <ChevronRight className="size-3" aria-hidden />
              )}
              <span className="truncate">{t.viewsSidebar.hiddenLabel}</span>
              <span className="ml-auto tabular-nums">({hidden.length})</span>
            </button>
          </SidebarMenuSubItem>
        ) : null}

        {hiddenOpen
          ? hidden.map((view) => (
              <ViewRowChrome
                key={view.id}
                view={view}
                operatorId={currentOperatorId}
                dimmed
                hiddenIndicator
              />
            ))
          : null}

        {/* ---- Empty state ---- */}
        {isEmpty ? (
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild className="text-muted-foreground italic">
              <Link to="/views">{t.viewsSidebar.emptyHint}</Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        ) : null}
      </DndContext>
    </SidebarMenuSub>
  )
}
