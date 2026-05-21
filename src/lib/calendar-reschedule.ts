// landr-nnbm — Shared drag-to-reschedule machinery for the BookingsCalendar
// (main /calendar route) and the Views CalendarLayout. Owns the optimistic
// cache write, the FastAPI patch, the rollback on error, and the
// confirmation toast with an Undo action that PATCHes back to the previous
// dates.
//
// Routing through FastAPI (not direct Supabase) is required because date
// changes re-run the pricing engine — see the `write-routing-convention`
// memory.

import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  patchBookingProduct,
  type BookingProduct,
  type BookingRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

export type RescheduleArgs = {
  /** booking id — required by the FastAPI route. */
  bookingId: string
  /** booking_products line id — the one whose dates change. */
  itemId: string
  /** ISO YYYY-MM-DD. */
  newStart: string
  /** ISO YYYY-MM-DD; null for single-day events with no explicit end. */
  newEnd: string | null
  /** ISO YYYY-MM-DD before the drag — used to render Undo. */
  previousStart: string
  /** ISO YYYY-MM-DD before the drag, or null. */
  previousEnd: string | null
  /** Human label for the toast — usually "<Customer> — <Product>". */
  label: string
}

// Friendly date label for the confirmation toast. "Mon 8 Jun" shape per
// the ticket; the underlying date is a calendar day so we render it in
// UTC to avoid timezone drift around midnight.
const _toastDateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

export function formatRescheduleDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return _toastDateFormatter.format(date)
}

// Mutate the BookingRow[] cache by writing new dates onto the matching
// item. Returns a fresh array — callers pass this to setQueryData. The
// row's `items` array is replaced in-place but element identities only
// change for the touched line, keeping unrelated memoised selectors
// stable.
export function applyRescheduleToCache(
  rows: BookingRow[] | undefined,
  itemId: string,
  startDate: string,
  endDate: string | null,
): BookingRow[] | undefined {
  if (!rows) return rows
  let touched = false
  const next = rows.map((row) => {
    const itemIdx = row.items.findIndex((it) => it.id === itemId)
    if (itemIdx === -1) return row
    touched = true
    const nextItems: BookingProduct[] = row.items.slice()
    nextItems[itemIdx] = {
      ...nextItems[itemIdx],
      date_range_start: startDate,
      date_range_end: endDate,
    }
    return { ...row, items: nextItems }
  })
  return touched ? next : rows
}

type QueryKey = ReadonlyArray<unknown>

type UseDragRescheduleOptions = {
  /** Query keys to optimistically update + invalidate after settle. The
   *  main /calendar uses ['bookings', operatorId]; ViewPage uses
   *  ['views-bookings', operatorId]. Pass all keys this write should
   *  flow to — every registered cache is patched optimistically and
   *  invalidated on settle. */
  queryKeys: ReadonlyArray<QueryKey>
}

type DragRescheduleApi = {
  /** Fire a drag-to-reschedule write. Optimistically updates every
   *  registered cache, PATCHes the booking_products row via FastAPI,
   *  and shows a sonner toast with an Undo action on success. */
  reschedule: (args: RescheduleArgs) => void
}

function writePatch(
  qc: QueryClient,
  keys: ReadonlyArray<QueryKey>,
  itemId: string,
  start: string,
  end: string | null,
): Array<{ key: QueryKey; prev: BookingRow[] | undefined }> {
  const snapshots: Array<{ key: QueryKey; prev: BookingRow[] | undefined }> = []
  for (const key of keys) {
    const prev = qc.getQueryData<BookingRow[] | undefined>(key as unknown[])
    snapshots.push({ key, prev })
    qc.setQueryData<BookingRow[] | undefined>(key as unknown[], (rows) =>
      applyRescheduleToCache(rows, itemId, start, end),
    )
  }
  return snapshots
}

function rollback(
  qc: QueryClient,
  snapshots: Array<{ key: QueryKey; prev: BookingRow[] | undefined }>,
): void {
  for (const { key, prev } of snapshots) {
    qc.setQueryData(key as unknown[], prev)
  }
}

function invalidateAll(qc: QueryClient, keys: ReadonlyArray<QueryKey>): void {
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key as unknown[] })
  }
}

export function useDragReschedule(
  options: UseDragRescheduleOptions,
): DragRescheduleApi {
  const qc = useQueryClient()
  // Keep latest keys in a ref so the callback identity is stable across
  // renders even though callers usually construct the array inline.
  const keysRef = useRef(options.queryKeys)
  useEffect(() => {
    keysRef.current = options.queryKeys
  }, [options.queryKeys])

  const writeMutation = useMutation({
    mutationFn: async (args: {
      bookingId: string
      itemId: string
      startDate: string
      endDate: string | null
    }) => {
      await patchBookingProduct(args.bookingId, args.itemId, {
        date_range_start: args.startDate,
        date_range_end: args.endDate,
      })
    },
  })

  const reschedule = useCallback<DragRescheduleApi['reschedule']>(
    (args) => {
      const keys = keysRef.current
      const snapshots = writePatch(
        qc,
        keys,
        args.itemId,
        args.newStart,
        args.newEnd,
      )

      writeMutation.mutate(
        {
          bookingId: args.bookingId,
          itemId: args.itemId,
          startDate: args.newStart,
          endDate: args.newEnd,
        },
        {
          onSuccess: () => {
            toast.success(
              t.calendar.rescheduleToast(
                args.label,
                formatRescheduleDateLabel(args.newStart),
              ),
              {
                action: {
                  label: t.calendar.rescheduleUndo,
                  onClick: () => {
                    const undoSnapshots = writePatch(
                      qc,
                      keysRef.current,
                      args.itemId,
                      args.previousStart,
                      args.previousEnd,
                    )
                    writeMutation.mutate(
                      {
                        bookingId: args.bookingId,
                        itemId: args.itemId,
                        startDate: args.previousStart,
                        endDate: args.previousEnd,
                      },
                      {
                        onSuccess: () => {
                          toast.success(t.calendar.rescheduleUndone)
                          invalidateAll(qc, keysRef.current)
                        },
                        onError: (err: Error) => {
                          rollback(qc, undoSnapshots)
                          toast.error(t.calendar.rescheduleUndoError, {
                            description: err.message,
                          })
                        },
                      },
                    )
                  },
                },
              },
            )
            invalidateAll(qc, keysRef.current)
          },
          onError: (err: Error) => {
            rollback(qc, snapshots)
            toast.error(t.calendar.rescheduleError, {
              description: err.message,
            })
          },
        },
      )
    },
    [qc, writeMutation],
  )

  return { reschedule }
}
