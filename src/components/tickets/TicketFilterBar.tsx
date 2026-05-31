// landr-7dya.11 — the shell-level ticket filter bar.
//
// Rendered by TicketSystemShell ABOVE the <Outlet />, so it spans the Inbox and
// Board surfaces. Two layers:
//
//   • Quick-filter chips (always visible) for the high-frequency triage states:
//     Assigned to me · Unread · Mentioned me · Unassigned. (Watching / Blocked
//     live in the popover — useful but lower-frequency.)
//   • A "More filters" popover with the full combinable set: operator, status,
//     type, severity, priority, MoSCoW, impact, origin tier, time range +
//     date-field, plus the secondary toggles (watching / blocked).
//
// All state flows through useTicketFilter() → the URL (deep-linkable). The bar
// itself holds NO state; it is a pure projection of the shared filter.

import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useOperator } from '@/lib/operator'
import { useTicketFilter } from '@/lib/ticket-filter-context'
import {
  ORIGIN_TIERS,
  ORIGIN_TIER_LABEL,
  SEVERITY_LABEL,
  TICKET_SEVERITIES,
  TIME_RANGES,
  TIME_RANGE_LABEL,
  activeFilterCount,
  isFilterEmpty,
  type OriginTier,
  type TicketSeverity,
  type TimeRange,
} from '@/lib/ticket-filters'
import {
  MOSCOW_LABEL,
  MOSCOW_VALUES,
  PERCEIVED_IMPACT_LABEL,
  PRIORITY_LABEL,
  TICKET_STATUSES,
  TYPE_LABEL,
  type TicketMoscow,
  type TicketPerceivedImpact,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from '@/lib/tickets'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import {
  AtSignIcon,
  CircleSlashIcon,
  EyeIcon,
  MailIcon,
  SlidersHorizontalIcon,
  UserCheckIcon,
} from 'lucide-react'

const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
}

// ---- quick chip -------------------------------------------------------------

type QuickChipProps = {
  active: boolean
  onToggle: () => void
  icon: ReactNode
  label: string
  testId: string
}

function QuickChip({ active, onToggle, icon, label, testId }: QuickChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-active={active || undefined}
      data-testid={testId}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-input text-muted-foreground hover:border-foreground/40 hover:text-foreground',
      )}
    >
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  )
}

// ---- popover select row -----------------------------------------------------

type SelectRowProps<T extends string> = {
  label: string
  allLabel: string
  value: T | null
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T | null) => void
  testId: string
}

function SelectRow<T extends string>({
  label,
  allLabel,
  value,
  options,
  onChange,
  testId,
}: SelectRowProps<T>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <NativeSelect
        value={value ?? ''}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : (e.target.value as T))
        }
        className="h-8 text-xs"
        aria-label={label}
        data-testid={testId}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
  )
}

// ---- the bar ----------------------------------------------------------------

export function TicketFilterBar() {
  const { filter, patchFilter, clearFilter } = useTicketFilter()
  const { staffOperators } = useOperator()

  const count = activeFilterCount(filter)
  const empty = isFilterEmpty(filter)

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t.ticketFilters.barLabel}
      data-testid="ticket-filter-bar"
    >
      {/* ---- quick chips ---- */}
      <QuickChip
        active={filter.assignedToMe}
        onToggle={() => patchFilter({ assignedToMe: !filter.assignedToMe })}
        icon={<UserCheckIcon className="size-3.5" />}
        label={t.ticketFilters.chipAssignedToMe}
        testId="ticket-filter-chip-mine"
      />
      <QuickChip
        active={filter.unreadOnly}
        onToggle={() => patchFilter({ unreadOnly: !filter.unreadOnly })}
        icon={<MailIcon className="size-3.5" />}
        label={t.ticketFilters.chipUnread}
        testId="ticket-filter-chip-unread"
      />
      <QuickChip
        active={filter.mentionedMeOnly}
        onToggle={() =>
          patchFilter({ mentionedMeOnly: !filter.mentionedMeOnly })
        }
        icon={<AtSignIcon className="size-3.5" />}
        label={t.ticketFilters.chipMentionedMe}
        testId="ticket-filter-chip-mentioned"
      />
      <QuickChip
        active={filter.unassignedOnly}
        onToggle={() =>
          patchFilter({ unassignedOnly: !filter.unassignedOnly })
        }
        icon={<CircleSlashIcon className="size-3.5" />}
        label={t.ticketFilters.chipUnassigned}
        testId="ticket-filter-chip-unassigned"
      />

      <span className="bg-border mx-0.5 h-5 w-px" aria-hidden />

      {/* ---- more-filters popover ---- */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={count > 0 && !isQuickOnly(filter) ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            data-testid="ticket-filter-more"
          >
            <SlidersHorizontalIcon className="size-3.5" aria-hidden />
            {t.ticketFilters.moreFilters}
            {count > 0 && (
              <span
                className="bg-primary-foreground/20 ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                data-testid="ticket-filter-active-count"
              >
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-3"
          data-testid="ticket-filter-popover"
        >
          <div className="flex flex-col gap-3">
            {/* Operator */}
            {staffOperators.length > 0 && (
              <SelectRow<string>
                label={t.ticketFilters.operatorLabel}
                allLabel={t.ticketFilters.operatorAll}
                value={filter.operatorId}
                options={staffOperators.map((op) => ({
                  value: op.id,
                  label: op.name ?? op.slug,
                }))}
                onChange={(v) => patchFilter({ operatorId: v })}
                testId="ticket-filter-operator"
              />
            )}

            {/* Origin tier */}
            <SelectRow<OriginTier>
              label={t.ticketFilters.tierLabel}
              allLabel={t.ticketFilters.tierAll}
              value={filter.originTier}
              options={ORIGIN_TIERS.map((tier) => ({
                value: tier,
                label: ORIGIN_TIER_LABEL[tier],
              }))}
              onChange={(v) => patchFilter({ originTier: v })}
              testId="ticket-filter-tier"
            />

            <div className="bg-border h-px" aria-hidden />
            <p className="text-foreground/60 text-[11px] font-semibold tracking-wide uppercase">
              {t.ticketFilters.sectionType}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <SelectRow<TicketStatus>
                label={t.ticketFilters.statusLabel}
                allLabel={t.ticketFilters.statusAll}
                value={filter.status}
                options={TICKET_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
                onChange={(v) => patchFilter({ status: v })}
                testId="ticket-filter-status"
              />
              <SelectRow<TicketType>
                label={t.ticketFilters.typeLabel}
                allLabel={t.ticketFilters.typeAll}
                value={filter.type}
                options={(
                  ['bug', 'feature', 'annoyance', 'question'] as TicketType[]
                ).map((ty) => ({ value: ty, label: TYPE_LABEL[ty] }))}
                onChange={(v) => patchFilter({ type: v })}
                testId="ticket-filter-type"
              />
              <SelectRow<TicketPerceivedImpact>
                label={t.ticketFilters.impactLabel}
                allLabel={t.ticketFilters.impactAll}
                value={filter.perceivedImpact}
                options={(
                  ['blocking', 'annoying', 'idea'] as TicketPerceivedImpact[]
                ).map((im) => ({
                  value: im,
                  label: PERCEIVED_IMPACT_LABEL[im],
                }))}
                onChange={(v) => patchFilter({ perceivedImpact: v })}
                testId="ticket-filter-impact"
              />
              <SelectRow<TicketSeverity>
                label={t.ticketFilters.severityLabel}
                allLabel={t.ticketFilters.severityAll}
                value={filter.severity}
                options={TICKET_SEVERITIES.map((sev) => ({
                  value: sev,
                  label: SEVERITY_LABEL[sev],
                }))}
                onChange={(v) => patchFilter({ severity: v })}
                testId="ticket-filter-severity"
              />
              <SelectRow<TicketPriority>
                label={t.ticketFilters.priorityLabel}
                allLabel={t.ticketFilters.priorityAll}
                value={filter.priority}
                options={(['p0', 'p1', 'p2'] as TicketPriority[]).map((p) => ({
                  value: p,
                  label: PRIORITY_LABEL[p],
                }))}
                onChange={(v) => patchFilter({ priority: v })}
                testId="ticket-filter-priority"
              />
              <SelectRow<TicketMoscow>
                label={t.ticketFilters.moscowLabel}
                allLabel={t.ticketFilters.moscowAll}
                value={filter.moscow}
                options={MOSCOW_VALUES.map((m) => ({
                  value: m,
                  label: MOSCOW_LABEL[m],
                }))}
                onChange={(v) => patchFilter({ moscow: v })}
                testId="ticket-filter-moscow"
              />
            </div>

            <div className="bg-border h-px" aria-hidden />
            <p className="text-foreground/60 text-[11px] font-semibold tracking-wide uppercase">
              {t.ticketFilters.sectionTime}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SelectRow<TimeRange>
                label={t.ticketFilters.timeRangeLabel}
                allLabel={t.ticketFilters.timeRangeAll}
                value={filter.timeRange}
                options={TIME_RANGES.map((r) => ({
                  value: r,
                  label: TIME_RANGE_LABEL[r],
                }))}
                onChange={(v) => patchFilter({ timeRange: v })}
                testId="ticket-filter-time-range"
              />
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs font-medium">
                  {t.ticketFilters.timeFieldLabel}
                </span>
                <NativeSelect
                  value={filter.timeField}
                  onChange={(e) =>
                    patchFilter({
                      timeField:
                        e.target.value === 'created' ? 'created' : 'updated',
                    })
                  }
                  className="h-8 text-xs"
                  aria-label={t.ticketFilters.timeFieldLabel}
                  data-testid="ticket-filter-time-field"
                  disabled={filter.timeRange === null}
                >
                  <option value="updated">
                    {t.ticketFilters.timeFieldUpdated}
                  </option>
                  <option value="created">
                    {t.ticketFilters.timeFieldCreated}
                  </option>
                </NativeSelect>
              </label>
            </div>

            <div className="bg-border h-px" aria-hidden />
            <p className="text-foreground/60 text-[11px] font-semibold tracking-wide uppercase">
              {t.ticketFilters.sectionScope}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <QuickChip
                active={filter.watchingOnly}
                onToggle={() =>
                  patchFilter({ watchingOnly: !filter.watchingOnly })
                }
                icon={<EyeIcon className="size-3.5" />}
                label={t.ticketFilters.chipWatching}
                testId="ticket-filter-chip-watching"
              />
              <QuickChip
                active={filter.blockedOnly}
                onToggle={() =>
                  patchFilter({ blockedOnly: !filter.blockedOnly })
                }
                icon={<CircleSlashIcon className="size-3.5" />}
                label={t.ticketFilters.chipBlocked}
                testId="ticket-filter-chip-blocked"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* ---- clear-all ---- */}
      {!empty && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 px-2 text-xs"
          onClick={clearFilter}
          data-testid="ticket-filter-clear-all"
        >
          {t.ticketFilters.clearAll}
        </Button>
      )}
    </div>
  )
}

/** True when the only active facets are the always-visible quick chips, so the
 *  "More filters" button stays in its neutral (outline) state. */
function isQuickOnly(filter: {
  operatorId: string | null
  status: TicketStatus | null
  type: TicketType | null
  severity: TicketSeverity | null
  priority: TicketPriority | null
  moscow: TicketMoscow | null
  perceivedImpact: TicketPerceivedImpact | null
  originTier: OriginTier | null
  timeRange: TimeRange | null
  watchingOnly: boolean
  blockedOnly: boolean
}): boolean {
  return (
    filter.operatorId === null &&
    filter.status === null &&
    filter.type === null &&
    filter.severity === null &&
    filter.priority === null &&
    filter.moscow === null &&
    filter.perceivedImpact === null &&
    filter.originTier === null &&
    filter.timeRange === null &&
    !filter.watchingOnly &&
    !filter.blockedOnly
  )
}

export default TicketFilterBar
