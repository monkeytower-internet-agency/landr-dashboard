// landr-c58d / landr-45pb / landr-79f5 — Views sub-list in the app sidebar.
//
// Pin-or-nothing IA (landr-79f5):
//
//   ───── Pinned views (DnD-ordered) ─────
//   📌 Pinned view A                  (user_state.sort_order ASC)
//   📌 Pinned view B
//   📌 Pinned view C
//   ───── + New view ─────────────────────  (links to /views)
//
// Sidebar shows ONLY pinned views, in their per-user sort_order. Unpinned
// views (and views with user_state.hidden === true) are absent entirely.
// The `hidden` schema column is preserved for back-compat but is a no-op
// in this surface — visibility is driven entirely by Pin.
//
// DnD semantics (@dnd-kit/core + sortable):
//   * Drag within the pinned list → reorders. New order is persisted via
//     the bulk PATCH .../saved-views/reorder endpoint (one round-trip).
//   * No cross-bucket drags (there is only one bucket now).
//
// Per-row affordances:
//   * Inline PinButton (always visible on pinned rows — click to unpin).
//
// Renames from landr-c58d:
//   * `starred` → `pinned` everywhere (column rename in migration
//     20260521090000_view_user_state_pinned_and_sort_order.sql).
//   * StarButton → PinButton; StarIcon → PinIcon (lucide-react).
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PinIcon, PlusIcon } from 'lucide-react'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import { useOperator } from '@/lib/operator'
import {
  listSavedViews,
  reorderSavedViews,
  type SavedViewWithState,
  type ViewReorderItem,
} from '@/lib/saved-views'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { PinButton } from './PinButton'
import { bucketViewsForSidebar } from './sidebar-sort'

// ---- one view row (sortable) ----------------------------------------------

type RowChromeProps = {
  view: SavedViewWithState
  operatorId: string
  /** dnd attach point + handle props. */
  dragRef?: (node: HTMLLIElement | null) => void
  dragAttributes?: Record<string, unknown>
  dragListeners?: Record<string, unknown>
  dragStyle?: React.CSSProperties
  isDragging?: boolean
}

function ViewRowChrome({
  view,
  operatorId,
  dragRef,
  dragAttributes,
  dragListeners,
  dragStyle,
  isDragging = false,
}: RowChromeProps) {
  return (
    <SidebarMenuSubItem
      ref={dragRef}
      style={dragStyle}
      className={cn(isDragging && 'opacity-40')}
    >
      <div
        className="group/view-row relative flex w-full items-center"
        {...(dragAttributes ?? {})}
        {...(dragListeners ?? {})}
      >
        <SidebarMenuSubButton asChild className="pr-8">
          <Link to={`/views/${view.id}`}>
            <PinIcon
              className="size-3 shrink-0 fill-current text-amber-500"
              aria-hidden
            />
            <span className="truncate">{view.name}</span>
          </Link>
        </SidebarMenuSubButton>
        {/* Pin button: always shown on pinned rows so the user can unpin
            in one click without first hovering. Sits absolutely on the
            right so it doesn't disturb the row's flex layout. */}
        <div
          className={cn(
            'absolute top-1/2 right-1 -translate-y-1/2 flex items-center',
          )}
        >
          <PinButton
            viewId={view.id}
            pinned={true}
            operatorId={operatorId}
            size="sm"
          />
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

// ---- main component --------------------------------------------------------

export function ViewsSidebar() {
  const qc = useQueryClient()
  const { currentOperatorId } = useOperator()

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

  const query = useQuery({
    queryKey: ['saved-views', currentOperatorId ?? 'none'],
    queryFn: () => listSavedViews(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const views = useMemo(() => query.data ?? [], [query.data])
  // landr-79f5 — Sidebar now consumes only `primary` (the pinned bucket).
  // `more` + `hidden` are intentionally discarded — they are no longer
  // surfaced anywhere in this component.
  const { primary } = useMemo(() => bucketViewsForSidebar(views), [views])

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

  // landr-79f5 — Unpin / pin actions flow through the PinButton's own
  // mutation (it lives on every row + on the ViewPage header). The
  // sidebar's own state changes are limited to reorder-within-pinned.

  // --- DnD handlers --------------------------------------------------------

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !currentOperatorId || !listKey) return

    const activeId = String(active.id)
    const overId = String(over.id)

    // Only reorder-within-pinned is supported now.
    const overInPrimary = primary.some((v) => v.id === overId)
    if (!overInPrimary) return

    const currentIds = primary.map((v) => v.id)
    const oldIndex = currentIds.indexOf(activeId)
    const newIndex = currentIds.indexOf(overId)
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
  }

  // --- early returns -------------------------------------------------------

  if (!currentOperatorId) {
    // Top-level "Views" link still renders in the parent sidebar.
    return null
  }

  // --- render --------------------------------------------------------------

  return (
    <SidebarMenuSub>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
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

        {/* ---- Empty state (no pinned views) ---- */}
        {!query.isPending && primary.length === 0 ? (
          <SidebarMenuSubItem>
            <div
              className="px-2 py-1.5 text-xs italic text-muted-foreground"
              data-testid="views-sidebar-empty"
            >
              No views pinned.{' '}
              <Link
                to="/views"
                className="not-italic underline underline-offset-2 hover:text-foreground"
              >
                {t.viewsSidebar.emptyHintLinkLabel}
              </Link>
              {' '}— pin views to add them here.
            </div>
          </SidebarMenuSubItem>
        ) : null}

        {/* ---- "+ New view" button (always present) ---- */}
        <SidebarMenuSubItem>
          <SidebarMenuSubButton
            asChild
            className="text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
            data-testid="views-sidebar-new-view"
          >
            <Link to="/views">
              <PlusIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{t.viewsSidebar.newViewButton}</span>
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </DndContext>
    </SidebarMenuSub>
  )
}
