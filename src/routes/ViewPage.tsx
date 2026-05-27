// landr-hgtv — per-view ViewPage shell.
//
// Replaces the landr-v0xg stub. Phase 2 ships:
//   - Header: inline-editable name (creator / owner-only — see permission
//     gate below), Pin toggle (PinButton from landr-45pb), layout
//     switcher, "Set as default layout" affordance, Duplicate, Delete,
//     Hide/Unhide overflow menu (landr-c58d), and dirty-state indicator
//     with Save / Discard.
//   - Body: a LayoutStub keyed off the effective layout (URL ?layout=
//     override OR config.layout). The three real layouts (Table / Board
//     / Calendar) plug in via the Layouts registry — landr-7w3s / -kjls
//     / -9kbl will mount their renderers here without further ViewPage
//     edits.
//   - Toolbar (ViewToolbar): filter chips, sort dropdown, column picker
//     placeholder.
//   - Dirty-state machinery (useViewDirtyState):
//       Personal → auto-save (debounced 500ms).
//       Shared   → stage + explicit Save / Discard + navigation guard.
//
// Owner / editor check is intentionally permissive in v1 because the
// dashboard doesn't currently resolve public.users.id from the session in
// every page. The FastAPI / RLS layer re-enforces every write, so the worst
// case is a hopeful click that returns 403 (surfaced as a toast). Tightening
// the gate locally lands alongside the public.users.id bridge in a later
// slice.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Copy, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { trackView } from '@/lib/recently-viewed'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  deleteSavedView,
  duplicateSavedView,
  getSavedView,
  patchSavedView,
  type SavedViewWithState,
} from '@/lib/saved-views'
import { t } from '@/lib/strings'
import {
  LayoutSwitcher,
  isViewLayout,
  type ViewLayout,
} from '@/components/views/LayoutSwitcher'
import { ViewToolbar } from '@/components/views/ViewToolbar'
import { useViewDirtyState } from '@/components/views/useViewDirtyState'
import { PinButton } from '@/components/views/PinButton'
import { CalendarLayout } from '@/components/views/layouts/CalendarLayout'
import { useDragReschedule } from '@/lib/calendar-reschedule'
import { TableLayout } from '@/components/views/layouts/TableLayout'
import {
  BoardLayout,
  type BoardItemMutate,
} from '@/components/views/layouts/BoardLayout'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import {
  applyView,
  useViewBookings,
  type BookingItem,
} from '@/lib/views-bookings-data'
import {
  postGeneralApprovalDecision,
  postHotelApprovalDecision,
  stageCode,
} from '@/lib/bookings'
// landr-wwhn.17 — ticket board as a view type.
import { TicketBoardLayout } from '@/components/views/layouts/TicketBoardLayout'
import {
  applyTicketViewFilters,
  readTicketConfigOperatorId,
  useViewTickets,
} from '@/lib/tickets-views-data'

const LAYOUT_PARAM = 'layout'

// ----------------------------------------------------------------------------
// Layouts registry — downstream tickets D / E / F mount real renderers here.
// landr-9kbl wired the calendar branch; landr-7w3s / -kjls replaced the
// table / board stubs with their real renderers. landr-lx7s removed the
// LayoutStub fallback because `effectiveLayout: ViewLayout` is a closed
// union ('table' | 'board' | 'calendar') — every case is covered by the
// switch in LayoutBody and the TS exhaustiveness check guards future
// additions.

// ----------------------------------------------------------------------------

export function ViewPage() {
  const { viewId } = useParams<{ viewId: string }>()
  const { currentOperatorId } = useOperator()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['saved-view', currentOperatorId ?? 'none', viewId ?? 'none'],
    queryFn: () =>
      getSavedView(currentOperatorId as string, viewId as string),
    enabled: !!currentOperatorId && !!viewId,
  })

  const view = query.data ?? null

  // landr-ne58 — record this open in the sidebar "Recently viewed" trail.
  // Fires once per (user, view.id, view.name) tuple — rename triggers a
  // re-track so the trail label stays current. trackView() de-duplicates
  // by (type, id) so the entry bumps to the top instead of cluttering.
  const { user } = useAuth()
  const trackedViewName = view?.name ?? null
  useEffect(() => {
    if (!viewId || !trackedViewName) return
    trackView(
      user?.id ?? null,
      'view',
      viewId,
      trackedViewName,
      `/views/${viewId}`,
    )
  }, [user?.id, viewId, trackedViewName])

  const dirty = useViewDirtyState({
    operatorId: currentOperatorId,
    view,
    onSaved: () => {
      void qc.invalidateQueries({
        queryKey: ['saved-views', currentOperatorId ?? 'none'],
      })
      void qc.invalidateQueries({
        queryKey: ['saved-view', currentOperatorId ?? 'none', viewId ?? 'none'],
      })
    },
  })

  // ------------------------ layout resolution -----------------------------

  const configLayout = readConfigLayout(dirty.config)
  const urlLayoutRaw = searchParams.get(LAYOUT_PARAM)
  const urlLayout = isViewLayout(urlLayoutRaw) ? urlLayoutRaw : null
  const effectiveLayout: ViewLayout = urlLayout ?? configLayout
  const layoutOverrideActive = urlLayout !== null && urlLayout !== configLayout

  function handleLayoutChange(next: ViewLayout) {
    const params = new URLSearchParams(searchParams)
    if (next === configLayout) {
      params.delete(LAYOUT_PARAM)
    } else {
      params.set(LAYOUT_PARAM, next)
    }
    setSearchParams(params, { replace: true })
  }

  function setLayoutAsDefault() {
    if (!urlLayout) return
    dirty.setConfig({ ...dirty.config, layout: urlLayout })
    const params = new URLSearchParams(searchParams)
    params.delete(LAYOUT_PARAM)
    setSearchParams(params, { replace: true })
  }

  // ------------------------ save status toast ------------------------------

  // Personal Views auto-save — flash a subtle toast on success so the
  // operator gets feedback without a permanent banner.
  useEffect(() => {
    if (dirty.mode !== 'personal') return
    if (dirty.status !== 'saved') return
    toast.success(t.views.saved, { duration: 1500 })
  }, [dirty.status, dirty.mode])

  useEffect(() => {
    if (dirty.status !== 'error') return
    toast.error(dirty.errorMessage ?? t.views.saveError)
  }, [dirty.status, dirty.errorMessage])

  // ------------------------ navigation guard ------------------------------
  //
  // We use the browser-level beforeunload event to warn about tab close /
  // hard reload when a Shared View has unsaved changes. react-router's
  // useBlocker is unavailable here because the app boots with the legacy
  // BrowserRouter (vs createBrowserRouter); upgrading to a data router is a
  // larger refactor we don't need for v1. In-app navigation away from a
  // dirty Shared View is non-destructive — the local state is dropped, the
  // server config is unchanged, and the user can navigate back to re-stage.
  // The dirty banner already nags them not to leave without saving.
  useEffect(() => {
    if (dirty.mode !== 'shared' || !dirty.dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Modern browsers ignore custom strings but require preventDefault +
      // returnValue assignment to trigger the native prompt.
      e.returnValue = t.views.leaveConfirm
      return t.views.leaveConfirm
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty.mode, dirty.dirty])

  // ------------------------ rename ----------------------------------------

  const [renaming, setRenaming] = useState(false)
  const [pendingName, setPendingName] = useState('')

  function beginRename() {
    setPendingName(view?.name ?? '')
    setRenaming(true)
  }

  function cancelRename() {
    setRenaming(false)
    setPendingName(view?.name ?? '')
  }

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!currentOperatorId || !view) throw new Error('No view loaded')
      return patchSavedView(currentOperatorId, view.id, { name })
    },
    onSuccess: () => {
      setRenaming(false)
      void qc.invalidateQueries({
        queryKey: ['saved-view', currentOperatorId ?? 'none', viewId ?? 'none'],
      })
      void qc.invalidateQueries({
        queryKey: ['saved-views', currentOperatorId ?? 'none'],
      })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.views.saveError)
    },
  })

  // ------------------------ duplicate -------------------------------------

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId || !view) throw new Error('No view loaded')
      return duplicateSavedView(currentOperatorId, view.id)
    },
    onSuccess: (created) => {
      void qc.invalidateQueries({
        queryKey: ['saved-views', currentOperatorId ?? 'none'],
      })
      navigate(`/views/${created.id}`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.views.duplicateError)
    },
  })

  // ------------------------ delete ----------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId || !view) throw new Error('No view loaded')
      await deleteSavedView(currentOperatorId, view.id)
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['saved-views', currentOperatorId ?? 'none'],
      })
      navigate('/views')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.views.deleteError)
    },
  })

  function handleDelete() {
    if (!view) return
    if (!window.confirm(t.views.deleteConfirm)) return
    deleteMutation.mutate()
  }

  // landr-79f5 — The hide / unhide mutation was removed alongside the
  // overflow menu. The `hidden` schema column is preserved (other surfaces
  // may still set it) but the ViewPage no longer offers a toggle since
  // sidebar visibility is now driven entirely by Pin.

  // ------------------------ permission gate -------------------------------
  //
  // v1: every signed-in member can attempt edits — the FastAPI / RLS layer
  // is the source of truth and will 403 if the user lacks the right. We
  // surface the controls so the common case (creator on a Personal View) is
  // always available; permission-gating the inline rename / delete affordance
  // properly will land alongside the public.users.id bridge in a later slice.
  const mayEdit = !!view

  // ------------------------ render ----------------------------------------

  const title = view?.name ?? t.viewsIndex.title

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={title} />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {renaming && mayEdit ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const trimmed = pendingName.trim()
                if (!trimmed || trimmed === view?.name) {
                  setRenaming(false)
                  return
                }
                renameMutation.mutate(trimmed)
              }}
            >
              <Input
                autoFocus
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                aria-label={t.views.rename}
                data-testid="view-rename-input"
                className="h-9 w-64"
              />
              <Button
                type="submit"
                size="sm"
                disabled={renameMutation.isPending}
                data-testid="view-rename-save"
              >
                {t.views.renameSave}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={cancelRename}
                data-testid="view-rename-cancel"
              >
                {t.views.renameCancel}
              </Button>
            </form>
          ) : (
            <h1 className="text-xl font-semibold" data-testid="view-name">
              {title}
            </h1>
          )}
          {!renaming && mayEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={beginRename}
              aria-label={t.views.rename}
              data-testid="view-rename-trigger"
              className="h-7 px-2"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}

          {/* Pin toggle (landr-45pb PinButton) — md size for the page header. */}
          {view && currentOperatorId ? (
            <PinButton
              viewId={view.id}
              pinned={view.user_state.pinned}
              operatorId={currentOperatorId}
              size="md"
              className="text-foreground/70 hover:bg-accent hover:text-foreground"
            />
          ) : null}

          {/* landr-a8fg — shareable deep-link to this saved view. The current
              URL (/views/<id>) already deep-links straight to this surface,
              so the path here is computed from viewId rather than the URL
              search params — a copied link should not carry the operator's
              transient ?layout= override. */}
          {view ? (
            <CopyLinkButton
              path={`/views/${view.id}`}
              testId="view-copy-link"
            />
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {/* landr-wwhn.17 — ticket views only support board layout in v1;
                hide the layout switcher so the operator can't switch to a
                table/calendar that has no ticket renderer yet. */}
            {view?.entity_type !== 'ticket' ? (
              <>
                <LayoutSwitcher
                  value={effectiveLayout}
                  onChange={handleLayoutChange}
                />
                {layoutOverrideActive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={setLayoutAsDefault}
                    data-testid="view-set-default-layout"
                    className="h-7 px-2 text-xs"
                  >
                    {t.views.setDefaultLayout}
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
              data-testid="view-duplicate"
              className="h-7 px-2"
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {duplicateMutation.isPending
                ? t.views.duplicating
                : t.views.duplicate}
            </Button>
            {mayEdit ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                aria-label={t.views.delete}
                data-testid="view-delete"
                className="text-destructive h-7 px-2"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {deleteMutation.isPending ? t.views.deleting : null}
              </Button>
            ) : null}
            {/* landr-79f5 — the Hide/Unhide overflow menu was removed.
                Pin is now the only sidebar control (Pin = appears in
                sidebar; Unpin = does not). The `hidden` schema column
                still exists but is a no-op in the sidebar UI. */}
          </div>
        </div>

        {dirty.mode === 'shared' && dirty.dirty ? (
          <div
            className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs"
            role="status"
            data-testid="view-dirty-banner"
          >
            <span className="font-medium">{t.views.unsavedTitle}</span>
            <span className="opacity-80">{t.views.unsavedBody}</span>
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={dirty.discard}
                data-testid="view-dirty-discard"
                className="h-7 px-2 text-xs"
              >
                {t.views.discard}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void dirty.save()}
                disabled={dirty.status === 'saving'}
                data-testid="view-dirty-save"
                className="h-7 px-2 text-xs"
              >
                {dirty.status === 'saving' ? t.views.saving : t.views.save}
              </Button>
            </div>
          </div>
        ) : null}
      </header>

      {query.isPending ? (
        <p className="text-muted-foreground text-sm">{t.views.loading}</p>
      ) : query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.views.loadError}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error instanceof Error ? query.error.message : ''}
            </p>
          </CardContent>
        </Card>
      ) : !view ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.views.notFoundTitle}</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* landr-wwhn.17 — ticket views own their own area filter bar inside
              TicketBoardLayout; the booking-specific ViewToolbar is hidden. */}
          {view.entity_type !== 'ticket' ? (
            <ViewToolbar
              entityType={view.entity_type}
              config={dirty.config}
              onChange={dirty.setConfig}
              layout={effectiveLayout}
            />
          ) : null}
          <LayoutBody
            layout={effectiveLayout}
            view={{ ...view, config: dirty.config }}
            setConfig={dirty.setConfig}
          />
        </>
      )}
    </div>
  )
}

type LayoutBodyProps = {
  layout: ViewLayout
  view: SavedViewWithState
  setConfig: (config: Record<string, unknown>) => void
}

function LayoutBody({ layout, view, setConfig }: LayoutBodyProps) {
  // landr-wwhn.17 — ticket views always render the TicketBoardLayout
  // regardless of the layout switcher (they have no table or calendar
  // rendering for the ticket entity type yet; the layout switcher is
  // hidden on the toolbar for ticket views).
  if (view.entity_type === 'ticket') {
    return <TicketBoardLayoutBranch view={view} setConfig={setConfig} />
  }

  switch (layout) {
    case 'calendar':
      return <CalendarLayoutBranch view={view} setConfig={setConfig} />
    case 'table':
      return <TableLayoutBranch view={view} setConfig={setConfig} />
    case 'board':
      return <BoardLayoutBranch view={view} />
    default: {
      // landr-lx7s — exhaustiveness check. `ViewLayout` is a closed union
      // ('table' | 'board' | 'calendar'); adding a new variant without
      // handling it here is a compile error.
      const _exhaustive: never = layout
      return _exhaustive
    }
  }
}

// landr-9kbl — calendar branch owns its data fetch + view-pipe application.
// Kept in ViewPage (vs inside CalendarLayout) so the layout component stays
// pure (props in, render out) and the sibling Table / Board branches can
// follow the same shape without each layout reinventing the fetch.
//
// landr-mofm — `setConfig` is threaded so the layout's month/week/day
// switcher can persist into `calendarConfig.view`.
function CalendarLayoutBranch({
  view,
  setConfig,
}: {
  view: SavedViewWithState
  setConfig: (config: Record<string, unknown>) => void
}) {
  const { currentOperatorId } = useOperator()
  // landr-m4zq — thread the operator's first_day_of_week into both the
  // resolver (for start_of_week / end_of_week tokens in filters) and the
  // FullCalendar layout (firstDay column header).
  const { firstDayOfWeek } = useOperatorCalendarPrefs()
  const bookings = useViewBookings(currentOperatorId)
  // landr-nnbm — drag-to-reschedule shares the BookingsCalendar hook.
  // Optimistically patch BOTH caches so a row dragged on a saved View
  // also moves on the main /calendar if the operator switches tabs.
  const { reschedule } = useDragReschedule({
    queryKeys: [
      ['views-bookings', currentOperatorId ?? 'none'],
      ['bookings', currentOperatorId ?? 'none'],
    ],
  })
  const items = useMemo(
    () =>
      applyView(
        bookings.data ?? [],
        view.config,
        view.entity_type,
        new Date(),
        firstDayOfWeek,
      ),
    [bookings.data, view.config, view.entity_type, firstDayOfWeek],
  )
  if (bookings.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        {t.views.body.loading}
      </p>
    )
  }
  if (bookings.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.views.body.loadError}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {bookings.error instanceof Error ? bookings.error.message : ''}
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <CalendarLayout
      view={view}
      items={items}
      firstDayOfWeek={firstDayOfWeek}
      onConfigChange={setConfig}
      onReschedule={reschedule}
    />
  )
}

// landr-7w3s — Table branch owns its data fetch + view-pipe application.
// Mirrors CalendarLayoutBranch shape; layout component stays pure (props in,
// render out). Row click opens BookingDetailSheet via local state.
function TableLayoutBranch({
  view,
  setConfig,
}: {
  view: SavedViewWithState
  setConfig: (config: Record<string, unknown>) => void
}) {
  const { currentOperatorId } = useOperator()
  // landr-m4zq — filter resolver must honour the operator's first-day-of-week
  // so 'This week' chips behave consistently across Table / Board / Calendar.
  const { firstDayOfWeek } = useOperatorCalendarPrefs()
  const bookings = useViewBookings(currentOperatorId)
  const items = useMemo(
    () =>
      applyView(
        bookings.data ?? [],
        view.config,
        view.entity_type,
        new Date(),
        firstDayOfWeek,
      ),
    [bookings.data, view.config, view.entity_type, firstDayOfWeek],
  )
  const [openItem, setOpenItem] = useState<BookingItem | null>(null)
  if (bookings.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        {t.views.body.loading}
      </p>
    )
  }
  if (bookings.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.views.body.loadError}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {bookings.error instanceof Error ? bookings.error.message : ''}
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <>
      <TableLayout
        entityType={view.entity_type}
        config={view.config}
        items={items}
        onConfigChange={setConfig}
        onRowClick={(item) => setOpenItem(item)}
        viewId={view.id}
      />
      <BookingDetailSheet
        row={openItem}
        onOpenChange={(open) => {
          if (!open) setOpenItem(null)
        }}
      />
    </>
  )
}

// landr-kjls — board branch mirrors CalendarLayoutBranch: own the fetch +
// the apply-view pipe + the onItemMutate wiring, then hand a pure props
// payload to <BoardLayout>. Keeping the mutation glue here means the
// layout component itself stays renderer-only.
function BoardLayoutBranch({ view }: { view: SavedViewWithState }) {
  const { currentOperatorId } = useOperator()
  // landr-m4zq — see comment in TableLayoutBranch.
  const { firstDayOfWeek } = useOperatorCalendarPrefs()
  const qc = useQueryClient()
  const bookings = useViewBookings(currentOperatorId)
  const items = useMemo(
    () =>
      applyView(
        bookings.data ?? [],
        view.config,
        view.entity_type,
        new Date(),
        firstDayOfWeek,
      ),
    [bookings.data, view.config, view.entity_type, firstDayOfWeek],
  )
  const onItemMutate = useMemo<BoardItemMutate>(
    () =>
      buildBookingItemMutate({
        items,
        onSettled: () => {
          // Heal optimistic state with the canonical server view.
          void qc.invalidateQueries({
            queryKey: ['views-bookings', currentOperatorId ?? 'none'],
          })
        },
      }),
    [items, qc, currentOperatorId],
  )
  if (bookings.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        {t.views.body.loading}
      </p>
    )
  }
  if (bookings.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.views.body.loadError}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {bookings.error instanceof Error ? bookings.error.message : ''}
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <BoardLayout
      view={view}
      items={items}
      onItemMutate={onItemMutate}
    />
  )
}

// landr-wwhn.17 — Ticket board branch. Fetches tickets (with embedded label
// areas for client-side area filtering), applies ticketConfig.labelAreas if
// set, and hands the filtered list to TicketBoardLayout. The branch owns the
// fetch/filter so the layout component stays pure (props in, render out).
//
// landr-wwhn.31 — operator filter. When the view config carries
// ticketConfig.operatorId, the fetch is scoped to that operator's tickets
// instead of the session's currentOperatorId. This allows staff to pin a
// per-operator ticket view and have it load the right tickets automatically.
// The client-side applyTicketViewFilters also applies the operator filter so
// the column counts stay consistent while the refetch is in flight.
function TicketBoardLayoutBranch({
  view,
  setConfig,
}: {
  view: SavedViewWithState
  setConfig: (config: Record<string, unknown>) => void
}) {
  const { currentOperatorId } = useOperator()
  // Use the view-config operator when set (staff filtered view), otherwise
  // fall back to the session's currentOperatorId.
  const configOperatorId = readTicketConfigOperatorId(view.config)
  const effectiveOperatorId = configOperatorId ?? currentOperatorId
  const tickets = useViewTickets(effectiveOperatorId)
  const items = useMemo(
    () =>
      applyTicketViewFilters(tickets.data ?? [], view.config),
    [tickets.data, view.config],
  )
  if (tickets.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        {t.views.body.loading}
      </p>
    )
  }
  if (tickets.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.views.body.loadError}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {tickets.error instanceof Error ? tickets.error.message : ''}
          </p>
        </CardContent>
      </Card>
    )
  }
  return (
    <TicketBoardLayout
      view={view}
      items={items}
      onConfigChange={setConfig}
    />
  )
}

// ----------------------------------------------------------------------------
// buildBookingItemMutate (landr-kjls) — maps a flat field change on a
// BookingItem to the right write endpoint. v1 wires only `current_stage`;
// everything else rejects so the optimistic UI in the layout reverts.
//
// Stage transitions:
//   awaiting_general_approval  → confirmed | cancelled   → general approval
//   awaiting_hotel_approval    → confirmed | cancelled   → hotel approval
//
// Any other (fromStage, toStage) pair is rejected. The Board layout's
// per-column gating mirrors this set so disallowed columns visibly grey
// out before the drop is even attempted; this is the belt-and-braces
// check that prevents stale UI from sneaking a bad write through.
//
// Not prefixed with `use` — it's a plain factory, not a hook
// (widget-no-use-prefix-on-helpers memory).
// eslint-disable-next-line react-refresh/only-export-components
export function buildBookingItemMutate(args: {
  items: BookingItem[]
  onSettled: () => void
}): BoardItemMutate {
  return async (
    itemId: string,
    fieldKey: string,
    newValue: string,
  ): Promise<void> => {
    if (fieldKey !== 'current_stage') {
      const err = new Error(
        `View item mutation for field "${fieldKey}" is not supported in v1.`,
      )
      toast.error(t.views.body.board.mutateError, {
        description: err.message,
      })
      throw err
    }

    const current = args.items.find((it) => it.id === itemId)
    const fromStage = current ? stageCode(current) : null

    try {
      await dispatchStageTransition(itemId, fromStage, newValue)
      args.onSettled()
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Stage transition failed.'
      toast.error(t.views.body.board.mutateError, { description: message })
      args.onSettled()
      throw e
    }
  }
}

async function dispatchStageTransition(
  itemId: string,
  fromStage: string | null,
  toStage: string,
): Promise<void> {
  const decision =
    toStage === 'confirmed'
      ? 'approve'
      : toStage === 'cancelled'
        ? 'reject'
        : null
  if (!decision) {
    throw new Error(
      `Target stage "${toStage}" is not a known approval outcome.`,
    )
  }
  if (fromStage === 'awaiting_general_approval') {
    await postGeneralApprovalDecision({ bookingId: itemId, decision })
    return
  }
  if (fromStage === 'awaiting_hotel_approval') {
    await postHotelApprovalDecision({ bookingId: itemId, decision })
    return
  }
  throw new Error(
    `No approval endpoint for transition from "${fromStage ?? 'null'}" to "${toStage}".`,
  )
}

function readConfigLayout(config: Record<string, unknown>): ViewLayout {
  const raw = (config as { layout?: unknown }).layout
  return isViewLayout(raw as string | null | undefined) ? raw as ViewLayout : 'table'
}

// landr-mhhq — default export so the route can be lazy-loaded via
// React.lazy() in App.tsx. ViewPage drags fullcalendar (+timegrid +
// daygrid + interaction) and @dnd-kit (core + sortable + utilities)
// through its CalendarLayout / BoardLayout layouts. Named export and
// the buildBookingItemMutate test helper export stay intact.
export default ViewPage
