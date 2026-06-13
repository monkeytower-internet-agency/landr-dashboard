// landr-9qo1 — operator-internal notes panel inside BookingDetailSheet.
//
// Top: textarea + "Save note" button.
// Bottom: list of past notes (newest first) with author + timestamp and
// a trash icon to delete each row. All staff-only — never sent to the
// customer.
//
// The panel re-fetches the notes list itself (TanStack Query) keyed by
// (operatorId, bookingId) so it stays in sync after any
// create/delete mutation without the parent sheet needing to invalidate
// queries it doesn't otherwise care about.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  authorLabel,
  bookingNotesQueryKey,
  createBookingNote,
  deleteBookingNote,
  listBookingNotes,
  type BookingNote,
} from '@/lib/booking-notes'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  bookingId: string
}

function formatTimestamp(iso: string): string {
  // Defensive parse — the API returns ISO 8601 timestamptz.
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Locale-aware short timestamp; the operator's browser locale wins.
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function BookingNotes({ operatorId, bookingId }: Props) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')

  const notesQuery = useQuery({
    queryKey: bookingNotesQueryKey(operatorId, bookingId),
    queryFn: () => listBookingNotes(operatorId, bookingId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: bookingNotesQueryKey(operatorId, bookingId),
    })
  }

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      return createBookingNote(operatorId, bookingId, { content })
    },
    onSuccess: () => {
      toast.success(t.bookings.notes.composerSuccess)
      setDraft('')
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.notes.composerError, {
        description: err.message,
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await deleteBookingNote(operatorId, bookingId, noteId)
    },
    onSuccess: () => {
      toast.success(t.bookings.notes.deleteSuccess)
      invalidate()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.notes.deleteError, {
        description: err.message,
      })
    },
  })

  const draftReady = draft.trim().length > 0
  const busy = createMutation.isPending || deleteMutation.isPending

  function handleSubmit() {
    if (!draftReady || busy) return
    createMutation.mutate(draft.trim())
  }

  function handleDelete(note: BookingNote) {
    if (busy) return
    if (!window.confirm(t.bookings.notes.deleteConfirm)) return
    deleteMutation.mutate(note.id)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t.bookings.notes.sectionTitle}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {t.bookings.notes.sectionHint}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Composer */}
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.bookings.notes.composerPlaceholder}
            disabled={createMutation.isPending}
            rows={3}
            aria-label={t.bookings.notes.composerPlaceholder}
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!draftReady || busy}
            >
              {createMutation.isPending
                ? t.bookings.notes.composerSaving
                : t.bookings.notes.composerSave}
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2">
          {notesQuery.isLoading ? (
            <p className="text-muted-foreground text-xs italic">
              {t.bookings.notes.loading}
            </p>
          ) : notesQuery.isError ? (
            <p className="text-destructive text-xs" role="alert">
              {t.bookings.notes.loadError}
            </p>
          ) : (notesQuery.data ?? []).length === 0 ? (
            <p className="text-muted-foreground text-xs italic">
              {t.bookings.notes.empty}
            </p>
          ) : (
            (notesQuery.data ?? []).map((note) => (
              <div
                key={note.id}
                className="flex items-start gap-2 rounded-md border p-3"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {note.content}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t.bookings.notes.byAuthor(
                      authorLabel(note),
                      formatTimestamp(note.created_at),
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(note)}
                  disabled={busy}
                  aria-label={t.bookings.notes.deleteLabel}
                  title={t.bookings.notes.deleteLabel}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
