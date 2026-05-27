import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2Icon, PencilIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  createFixedDateWindow,
  deleteFixedDateWindow,
  fetchFixedDateWindows,
  patchFixedDateWindow,
  type FixedDateWindow,
} from '@/lib/fixedDateWindows'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  productId: string
}

type EditState =
  | { mode: 'idle' }
  | { mode: 'new' }
  | { mode: 'edit'; window: FixedDateWindow }

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function plusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function FixedDateWindowsTable({ operatorId, productId }: Props) {
  const queryClient = useQueryClient()
  const queryKey = ['fixed_date_windows', operatorId, productId] as const
  const [editing, setEditing] = useState<EditState>({ mode: 'idle' })
  const [formError, setFormError] = useState<string | null>(null)

  const listQuery = useQuery<FixedDateWindow[]>({
    queryKey,
    queryFn: () => fetchFixedDateWindows(operatorId, productId),
  })

  const createMutation = useMutation({
    mutationFn: (payload: {
      start_date: string
      end_date: string
      capacity: number
    }) => createFixedDateWindow(operatorId, productId, payload),
    onSuccess: (row) => {
      queryClient.setQueryData<FixedDateWindow[]>(queryKey, (prev) =>
        prev ? [...prev, row].sort((a, b) => a.start_date.localeCompare(b.start_date)) : [row],
      )
      setEditing({ mode: 'idle' })
    },
  })

  const patchMutation = useMutation({
    mutationFn: ({
      windowId,
      payload,
    }: {
      windowId: string
      payload: {
        start_date?: string
        end_date?: string
        capacity?: number
        active?: boolean
      }
    }) => patchFixedDateWindow(operatorId, productId, windowId, payload),
    onSuccess: (row) => {
      queryClient.setQueryData<FixedDateWindow[]>(queryKey, (prev) =>
        prev
          ? prev
              .map((w) => (w.id === row.id ? row : w))
              .sort((a, b) => a.start_date.localeCompare(b.start_date))
          : prev,
      )
      setEditing({ mode: 'idle' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (windowId: string) =>
      deleteFixedDateWindow(operatorId, productId, windowId),
    onSuccess: (_void, windowId) => {
      queryClient.setQueryData<FixedDateWindow[]>(queryKey, (prev) =>
        prev ? prev.filter((w) => w.id !== windowId) : prev,
      )
    },
  })

  async function handleSubmit(values: {
    start_date: string
    end_date: string
    capacity: number
  }) {
    setFormError(null)
    if (!values.start_date || !values.end_date) {
      setFormError(t.products.windowErrorRange)
      return
    }
    if (values.end_date < values.start_date) {
      setFormError(t.products.windowErrorRange)
      return
    }
    if (!Number.isFinite(values.capacity) || values.capacity < 1) {
      setFormError(t.products.windowErrorCapacity)
      return
    }
    try {
      if (editing.mode === 'edit') {
        await patchMutation.mutateAsync({
          windowId: editing.window.id,
          payload: values,
        })
      } else {
        await createMutation.mutateAsync(values)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.products.windowErrorSave)
    }
  }

  async function handleDelete(window: FixedDateWindow) {
    if (!window) return
    const ok = window && (typeof globalThis === 'undefined' || globalThis.confirm
      ? globalThis.confirm(t.products.windowConfirmDelete)
      : true)
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(window.id)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.products.windowErrorDelete)
    }
  }

  const rows = listQuery.data ?? []
  const mutationError = createMutation.error ?? patchMutation.error ?? deleteMutation.error
  const errorMessage = formError ?? (mutationError ? mutationError.message : null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.products.fixedDateWindowsHeading}</CardTitle>
        <CardDescription>{t.products.fixedDateWindowsHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {listQuery.isPending ? (
          <p className="text-muted-foreground text-sm">{t.products.loading}</p>
        ) : listQuery.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {t.products.windowErrorLoad}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.products.windowEmpty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-3 font-medium">
                  {t.products.windowColumnStart}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t.products.windowColumnEnd}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t.products.windowColumnCapacity}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t.products.windowColumnReserved}
                </th>
                <th className="py-2 pr-3 font-medium">
                  {t.products.windowColumnActive}
                </th>
                <th className="py-2" aria-label={t.products.windowColumnActions} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 tabular-nums">{row.start_date}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.end_date}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.capacity}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.capacity_reserved}</td>
                  <td className="py-2 pr-3">{row.active ? '✓' : '—'}</td>
                  <td className="py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFormError(null)
                        setEditing({ mode: 'edit', window: row })
                      }}
                      aria-label={t.products.windowEditButton}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(row)}
                      aria-label={t.products.windowDeleteButton}
                      className="text-destructive"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editing.mode === 'idle' ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFormError(null)
                setEditing({ mode: 'new' })
              }}
            >
              {t.products.windowAddButton}
            </Button>
          </div>
        ) : (
          <WindowForm
            key={editing.mode === 'edit' ? editing.window.id : 'new'}
            initial={
              editing.mode === 'edit'
                ? {
                    start_date: editing.window.start_date,
                    end_date: editing.window.end_date,
                    capacity: editing.window.capacity,
                  }
                : {
                    start_date: isoToday(),
                    end_date: plusDays(isoToday(), 6),
                    capacity: 8,
                  }
            }
            isEditing={editing.mode === 'edit'}
            submitting={createMutation.isPending || patchMutation.isPending}
            onCancel={() => {
              setFormError(null)
              setEditing({ mode: 'idle' })
            }}
            onSubmit={handleSubmit}
          />
        )}

        {errorMessage ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

type FormProps = {
  initial: { start_date: string; end_date: string; capacity: number }
  isEditing: boolean
  submitting: boolean
  onSubmit: (values: {
    start_date: string
    end_date: string
    capacity: number
  }) => Promise<void> | void
  onCancel: () => void
}

function WindowForm({
  initial,
  isEditing,
  submitting,
  onSubmit,
  onCancel,
}: FormProps) {
  const [startDate, setStartDate] = useState(initial.start_date)
  const [endDate, setEndDate] = useState(initial.end_date)
  const [capacity, setCapacity] = useState(String(initial.capacity))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          start_date: startDate,
          end_date: endDate,
          capacity: Number(capacity),
        })
      }}
      className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="window-start">{t.products.windowFormStart}</Label>
        <Input
          id="window-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="window-end">{t.products.windowFormEnd}</Label>
        <Input
          id="window-end"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="window-capacity">{t.products.windowFormCapacity}</Label>
        <Input
          id="window-capacity"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {isEditing ? t.products.windowSaveEdit : t.products.windowSaveAdd}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          {t.products.windowCancel}
        </Button>
      </div>
    </form>
  )
}
