// Unit tests for feedback-inbox.ts pure helper: threadMatchesFilter.
// landr-v9e4.10 coverage pass.
//
// threadMatchesFilter is a pure function — no supabase mock needed.

import { describe, expect, it } from 'vitest'
import {
  INBOX_FILTER_DEFAULTS,
  threadMatchesFilter,
  type InboxFilter,
  type InboxTicketThread,
} from '@/lib/feedback-inbox'
import type { TicketRowStaff } from '@/lib/tickets'

// ---------------------------------------------------------------------------
// Helpers to build minimal stubs
// ---------------------------------------------------------------------------

function makeTicket(overrides: Partial<TicketRowStaff> = {}): TicketRowStaff {
  return {
    id: 'ticket-1',
    context: 'operations',
    type: 'bug',
    title: 'Test ticket',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    severity: null,
    linked_bd_id: null,
    promotion_prompt: null,
    promotion_requested_at: null,
    sync_status: null,
    last_synced_at: null,
    origin_tier: null,
    origin_operator_label: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  } as unknown as TicketRowStaff
}

function makeThread(
  ticketOverrides: Partial<TicketRowStaff> = {},
): InboxTicketThread {
  return {
    ticket: makeTicket(ticketOverrides),
    timeline: [],
  }
}

// ---------------------------------------------------------------------------
// threadMatchesFilter — default (null) filter passes all
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — null/default filter passes everything', () => {
  const emptySet = new Set<string>()

  it('passes a thread with all-null filter (INBOX_FILTER_DEFAULTS)', () => {
    const thread = makeThread()
    expect(
      threadMatchesFilter(thread, INBOX_FILTER_DEFAULTS, emptySet, emptySet),
    ).toBe(true)
  })

  it('passes a thread regardless of status when status filter is null', () => {
    for (const status of ['backlog', 'in_progress', 'in_review', 'done', 'ready'] as const) {
      const thread = makeThread({ status })
      expect(
        threadMatchesFilter(thread, INBOX_FILTER_DEFAULTS, emptySet, emptySet),
      ).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// status predicate
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — status predicate', () => {
  const emptySet = new Set<string>()
  const filter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, status: 'in_progress' }

  it('passes a thread whose status matches', () => {
    const thread = makeThread({ status: 'in_progress' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(true)
  })

  it('rejects a thread whose status does not match', () => {
    const thread = makeThread({ status: 'backlog' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// perceived_impact predicate
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — perceived_impact predicate', () => {
  const emptySet = new Set<string>()
  const filter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, perceived_impact: 'blocking' }

  it('passes when perceived_impact matches', () => {
    const thread = makeThread({ perceived_impact: 'blocking' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(true)
  })

  it('rejects when perceived_impact differs', () => {
    const thread = makeThread({ perceived_impact: 'annoying' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// unreadOnly predicate
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — unreadOnly predicate', () => {
  const filter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, unreadOnly: true }

  it('passes a thread whose id is in the unread set', () => {
    const thread = makeThread({ id: 'ticket-unread' })
    const unreadSet = new Set(['ticket-unread'])
    expect(threadMatchesFilter(thread, filter, unreadSet, new Set())).toBe(true)
  })

  it('rejects a thread not in the unread set', () => {
    const thread = makeThread({ id: 'ticket-read' })
    const unreadSet = new Set(['ticket-other'])
    expect(threadMatchesFilter(thread, filter, unreadSet, new Set())).toBe(false)
  })

  it('passes all threads when unreadOnly is false even if unread set is non-empty', () => {
    const passFilter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, unreadOnly: false }
    const thread = makeThread({ id: 'ticket-not-in-unread' })
    expect(
      threadMatchesFilter(thread, passFilter, new Set(['different-id']), new Set()),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// awaitingReplyOnly predicate
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — awaitingReplyOnly predicate', () => {
  const filter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, awaitingReplyOnly: true }

  it('passes when id is in the awaiting set', () => {
    const thread = makeThread({ id: 'ticket-awaiting' })
    const awaitingSet = new Set(['ticket-awaiting'])
    expect(threadMatchesFilter(thread, filter, new Set(), awaitingSet)).toBe(true)
  })

  it('rejects when id is not in the awaiting set', () => {
    const thread = makeThread({ id: 'ticket-1' })
    expect(threadMatchesFilter(thread, filter, new Set(), new Set())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// assigneeId predicate
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — assigneeId predicate', () => {
  const emptySet = new Set<string>()
  const filter: InboxFilter = {
    ...INBOX_FILTER_DEFAULTS,
    assigneeId: 'staff-user-1',
  }

  it('passes when assignee_id matches', () => {
    const thread = makeThread({ assignee_id: 'staff-user-1' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(true)
  })

  it('rejects when assignee_id is a different user', () => {
    const thread = makeThread({ assignee_id: 'staff-user-2' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(false)
  })

  it('rejects when assignee_id is null and filter has a value', () => {
    const thread = makeThread({ assignee_id: null })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(false)
  })

  it('passes when assigneeId filter is null regardless of ticket assignee', () => {
    const passFilter: InboxFilter = { ...INBOX_FILTER_DEFAULTS, assigneeId: null }
    const thread = makeThread({ assignee_id: 'any-user' })
    expect(threadMatchesFilter(thread, passFilter, emptySet, emptySet)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Multiple predicates are AND-ed together
// ---------------------------------------------------------------------------

describe('threadMatchesFilter — predicates are independent AND-ed', () => {
  const emptySet = new Set<string>()

  it('rejects when only one of two filters fails', () => {
    const filter: InboxFilter = {
      ...INBOX_FILTER_DEFAULTS,
      status: 'in_progress',
      assigneeId: 'staff-user-1',
    }
    // Status matches, assignee does NOT
    const thread = makeThread({ status: 'in_progress', assignee_id: 'staff-user-99' })
    expect(threadMatchesFilter(thread, filter, emptySet, emptySet)).toBe(false)
  })

  it('passes only when ALL predicates are satisfied', () => {
    const filter: InboxFilter = {
      status: 'in_progress',
      perceived_impact: 'blocking',
      unreadOnly: true,
      awaitingReplyOnly: false,
      assigneeId: 'staff-user-1',
    }
    const thread = makeThread({
      id: 'ticket-x',
      status: 'in_progress',
      perceived_impact: 'blocking',
      assignee_id: 'staff-user-1',
    })
    const unreadSet = new Set(['ticket-x'])
    expect(threadMatchesFilter(thread, filter, unreadSet, emptySet)).toBe(true)
  })
})
