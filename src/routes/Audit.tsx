// landr-aref — /audit route.
//
// Read-only viewer for the audit_log table (see
// landr-api/supabase/migrations/20260511222146_audit_log.sql). Tenant-
// scoped via RLS on the parent table; landr staff (is_landr_staff=true)
// see cross-tenant rows automatically — no special-case here.
//
// Filters: entity_type (table_name), operation, actor user_id, and a
// [from, to] occurred_at window. Pagination is keyset-by-offset over the
// returned page (PAGE_SIZE rows at a time).
//
// Clicking a row opens a side-sheet showing the full payload jsonb
// (old_row + new_row, pretty-printed).

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  AUDIT_OPERATION_OPTIONS,
  AUDIT_PAGE_SIZE,
  AUDIT_TABLE_OPTIONS,
  auditActorDisplay,
  auditDateTime,
  auditPayloadJson,
  fetchAuditPage,
  type AuditOperation,
  type AuditRow,
} from '@/lib/audit'
import { t } from '@/lib/strings'

type FilterState = {
  tableName: string
  userId: string
  operation: AuditOperation | ''
  from: string
  to: string
}

const EMPTY_FILTERS: FilterState = {
  tableName: '',
  userId: '',
  operation: '',
  from: '',
  to: '',
}

export function Audit() {
  const { currentOperatorId } = useOperator()
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AuditRow | null>(null)

  // Reset page when any filter changes — otherwise paging on filter-changed
  // data would land on an empty page mid-way through the result set.
  function patchFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    setPage(0)
    setFilters((f) => ({ ...f, [key]: value }))
  }

  function resetFilters() {
    setPage(0)
    setFilters(EMPTY_FILTERS)
  }

  const queryArgs = useMemo(
    () => ({
      tableName: filters.tableName || null,
      userId: filters.userId.trim() || null,
      operation: filters.operation || null,
      from: filters.from || null,
      to: filters.to || null,
      page,
    }),
    [filters, page],
  )

  const query = useQuery<AuditRow[], Error>({
    queryKey: ['audit-log', currentOperatorId ?? 'none', queryArgs],
    queryFn: () => fetchAuditPage(queryArgs),
    enabled: !!currentOperatorId,
  })

  const rows = query.data ?? []
  // We requested PAGE_SIZE rows; if fewer came back we know we've reached
  // the end of the result set without an extra "is there a next page?"
  // round-trip.
  const hasNextPage = rows.length === AUDIT_PAGE_SIZE

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.audit.title} subtitle={t.audit.subtitle} />
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t.audit.title}</h1>
        <p className="text-muted-foreground text-sm">{t.audit.subtitle}</p>
      </header>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t.audit.filtersTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t.audit.filterEntityTypeLabel}
            </span>
            <NativeSelect
              aria-label={t.audit.filterEntityTypeLabel}
              value={filters.tableName}
              onChange={(e) => patchFilter('tableName', e.target.value)}
              className="h-8 w-[14rem]"
            >
              <option value="">{t.audit.filterAllOption}</option>
              {AUDIT_TABLE_OPTIONS.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {tbl}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t.audit.filterOperationLabel}
            </span>
            <NativeSelect
              aria-label={t.audit.filterOperationLabel}
              value={filters.operation}
              onChange={(e) =>
                patchFilter('operation', e.target.value as AuditOperation | '')
              }
              className="h-8 w-[10rem]"
            >
              <option value="">{t.audit.filterAllOption}</option>
              {AUDIT_OPERATION_OPTIONS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t.audit.filterActorLabel}
            </span>
            <Input
              type="text"
              aria-label={t.audit.filterActorLabel}
              placeholder={t.audit.filterActorPlaceholder}
              value={filters.userId}
              onChange={(e) => patchFilter('userId', e.target.value)}
              className="h-8 w-[20rem]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t.audit.filterFromLabel}
            </span>
            <Input
              type="date"
              aria-label={t.audit.filterFromLabel}
              value={filters.from}
              onChange={(e) => patchFilter('from', e.target.value)}
              className="h-8 w-[10rem]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              {t.audit.filterToLabel}
            </span>
            <Input
              type="date"
              aria-label={t.audit.filterToLabel}
              value={filters.to}
              onChange={(e) => patchFilter('to', e.target.value)}
              className="h-8 w-[10rem]"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetFilters}
            aria-label={t.audit.filterResetLabel}
          >
            {t.audit.filterResetLabel}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.audit.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.audit.loading}</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">{t.audit.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* landr-3qkr.6 — overflow-x-auto so the 5-column audit log scrolls
              inside its own box on a 360px phone rather than being clipped. */}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.audit.columnOccurredAt}</TableHead>
                  <TableHead>{t.audit.columnEntityType}</TableHead>
                  <TableHead>{t.audit.columnOperation}</TableHead>
                  <TableHead>{t.audit.columnActor}</TableHead>
                  <TableHead>{t.audit.columnRowId}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={`${row.id}-${row.occurred_at}`}
                    data-testid="audit-row"
                    className="cursor-pointer"
                    onClick={() => setSelected(row)}
                  >
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {auditDateTime(row.occurred_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.table_name}
                    </TableCell>
                    <TableCell>
                      <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs">
                        {row.operation}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {auditActorDisplay(row)}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {row.row_id ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              {t.audit.pageLabel(page + 1, rows.length)}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                {t.audit.prevPage}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                {t.audit.nextPage}
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Row detail drawer */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{t.audit.drawerTitle}</SheetTitle>
            <SheetDescription>
              {selected
                ? `${selected.table_name} · ${selected.operation} · ${auditDateTime(selected.occurred_at)}`
                : ''}
            </SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="flex flex-col gap-3 px-4 pb-6">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">
                  {t.audit.drawerRowId}
                </dt>
                <dd className="font-mono">{selected.row_id ?? '—'}</dd>
                <dt className="text-muted-foreground">
                  {t.audit.drawerActor}
                </dt>
                <dd>{auditActorDisplay(selected)}</dd>
                <dt className="text-muted-foreground">
                  {t.audit.drawerCorrelation}
                </dt>
                <dd className="font-mono">
                  {selected.external_correlation_id ?? '—'}
                </dd>
                <dt className="text-muted-foreground">
                  {t.audit.drawerOperator}
                </dt>
                <dd className="font-mono">{selected.operator_id ?? '—'}</dd>
              </dl>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t.audit.drawerPayload}
                </span>
                <pre
                  data-testid="audit-payload"
                  className="bg-muted/40 max-h-[60vh] overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap"
                >
                  {auditPayloadJson(selected)}
                </pre>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// landr-mhhq — default export so the route can be lazy-loaded via
// React.lazy(() => import('@/routes/Audit')) in App.tsx (keeps /audit
// off the initial bundle; operators rarely visit unless investigating
// a dispute). Named export stays for direct test imports.
export default Audit
