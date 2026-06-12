// landr-4pn1 — /trash route ("recently deleted" bin).
//
// Tenant-scoped (via the FastAPI staff_trash router which checks
// operator_memberships server-side). Tabs per category — bookings,
// contacts, products, operator_tags, pricing_schemes. Each row shows a
// label, when it was deleted, and a Restore button that flips
// `deleted_at` back to NULL.
//
// Why the FastAPI hop instead of direct Supabase REST: the standard
// apply_tenant_rls() helper filters out rows where `deleted_at IS NOT
// NULL` on both SELECT and UPDATE policies, so the anon client cannot
// see soft-deleted rows OR flip them back. The trash router runs as the
// service role after verifying the caller's operator_memberships row.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  fetchTrash,
  restoreTrashRow,
  TRASH_KINDS,
  trashDeletedAtDisplay,
  trashRowLabel,
  type AnyTrashRow,
  type TrashKind,
} from '@/lib/trash'
import { t } from '@/lib/strings'

export function Trash() {
  const { currentOperatorId } = useOperator()
  const [activeTab, setActiveTab] = useState<TrashKind>('bookings')

  const titleNode = (
    <PageTitle title={t.trash.title} subtitle={t.trash.subtitle} />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{t.trash.title}</h1>
          <p className="text-muted-foreground text-sm">{t.trash.subtitle}</p>
        </header>
        <p className="text-muted-foreground text-sm">{t.trash.loading}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {titleNode}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t.trash.title}</h1>
        <p className="text-muted-foreground text-sm">{t.trash.subtitle}</p>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TrashKind)}
        className="flex flex-col gap-4"
      >
        <TabsList>
          {TRASH_KINDS.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t.trash.tabs[kind]}
            </TabsTrigger>
          ))}
        </TabsList>

        {TRASH_KINDS.map((kind) => (
          <TabsContent key={kind} value={kind}>
            <TrashCategory operatorId={currentOperatorId} kind={kind} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function TrashCategory({
  operatorId,
  kind,
}: {
  operatorId: string
  kind: TrashKind
}) {
  const queryClient = useQueryClient()
  const queryKey = ['trash', operatorId, kind]

  const query = useQuery<AnyTrashRow[], Error>({
    queryKey,
    queryFn: () => fetchTrash(operatorId, kind),
  })

  // Track which row is currently mid-restore so we can disable JUST that
  // button (a category-wide pending flag would feel sluggish on the long
  // tabs like Bookings).
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const restoreMutation = useMutation({
    mutationFn: (rowId: string) => restoreTrashRow(operatorId, kind, rowId),
    onMutate: (rowId) => {
      setRestoringId(rowId)
    },
    onSuccess: (_data, rowId) => {
      // Drop the row from the cached list — match the server-side state
      // without a re-fetch round-trip. Cross-surface invalidation
      // (bookings cache, products cache, etc.) is deliberately out of
      // scope here: the trash bin is a rare surface and other surfaces
      // refetch on their own staleTime; trying to wire every cache
      // would be a sprawling cross-feature concern for a single ticket.
      queryClient.setQueryData<AnyTrashRow[]>(queryKey, (rows) =>
        (rows ?? []).filter((r) => r.id !== rowId),
      )
      toast.success(t.trash.restoreSuccess)
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : t.trash.restoreError
      toast.error(message || t.trash.restoreError)
    },
    onSettled: () => {
      setRestoringId(null)
    },
  })

  if (query.isError) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-destructive text-sm">{t.trash.error}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {query.error?.message ?? ''}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">{t.trash.loading}</p>
  }

  const rows = query.data ?? []
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground text-sm">{t.trash.empty}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    // landr-3qkr.6 — overflow-x-auto so the trash table (item + fixed-width
    // deleted-at/actions cols sum past 360px) scrolls inside its own box on a
    // phone instead of being clipped by the page-level overflow-x-guard.
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.trash.columnItem}</TableHead>
            <TableHead className="w-[12rem]">
              {t.trash.columnDeletedAt}
            </TableHead>
            <TableHead className="w-[8rem] text-right">
              <span className="sr-only">{t.trash.restore}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const { label, sublabel } = trashRowLabel(kind, row)
            const isRestoring = restoringId === row.id
            return (
              <TableRow key={row.id} data-testid={`trash-row-${kind}`}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{label}</span>
                    {sublabel ? (
                      <span className="text-muted-foreground text-xs">
                        {sublabel}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                  {trashDeletedAtDisplay(row.deleted_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isRestoring}
                    onClick={() => restoreMutation.mutate(row.id)}
                    aria-label={`${t.trash.restore} ${label}`}
                  >
                    {isRestoring ? t.trash.restoring : t.trash.restore}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// landr-mhhq pattern — default export so App.tsx can lazy-load this off the
// initial bundle. Trash is a rare-use surface (operator visits only when
// they need to undo a delete) so it shouldn't weigh down the initial chunk.
export default Trash
