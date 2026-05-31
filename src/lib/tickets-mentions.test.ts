// landr-wwhn.24 — tests for @mention utilities (parseMentionHandles,
// resolveMentionHandles, searchMentionUsers, notifyMentions).
//
// parseMentionHandles is a pure function — no mock needed.
// resolveMentionHandles / searchMentionUsers use the Supabase client → mocked.
// notifyMentions uses the api-client → mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Supabase mock ----------------------------------------------------------

const { mock: sbMock } = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[],
    error: null as { message: string } | null,
  }

  const makeBuilder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      ilike: vi.fn(() => b),
      or: vi.fn(() => b),
      limit: vi.fn(async () => ({ data: state.rows, error: state.error })),
    })
    return b
  }

  const supabase = {
    from: vi.fn((_table: string) => makeBuilder()),
  }

  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: sbMock.supabase,
  getSupabase: () => sbMock.supabase,
}))

// ---- api-client mock --------------------------------------------------------

const apiMock = vi.fn<(method: string, url: string, body?: unknown) => Promise<void>>(async () => undefined)
vi.mock('@/lib/api-client', () => ({
  api: apiMock,
}))

import {
  notifyMentions,
  parseMentionHandles,
  resolveMentionHandles,
  searchMentionUsers,
  splitMentionSegments,
} from './tickets'

// ---- helpers ----------------------------------------------------------------

function reset() {
  sbMock.state.rows = []
  sbMock.state.error = null
  sbMock.supabase.from.mockClear()
  apiMock.mockClear()
}

beforeEach(reset)
afterEach(() => vi.clearAllMocks())

// ---- parseMentionHandles (pure) ---------------------------------------------

describe('parseMentionHandles', () => {
  it('extracts a single @handle', () => {
    const handles = parseMentionHandles('hello @alice how are you')
    expect(handles).toEqual(new Set(['alice']))
  })

  it('extracts multiple @handles', () => {
    const handles = parseMentionHandles('@bob can you check with @carol')
    expect(handles).toEqual(new Set(['bob', 'carol']))
  })

  it('de-duplicates handles', () => {
    const handles = parseMentionHandles('@alice @alice again @alice')
    expect(handles.size).toBe(1)
    expect(handles.has('alice')).toBe(true)
  })

  it('lower-cases handles', () => {
    const handles = parseMentionHandles('@Alice @BOB')
    expect(handles.has('alice')).toBe(true)
    expect(handles.has('bob')).toBe(true)
  })

  it('returns empty set when no mentions', () => {
    const handles = parseMentionHandles('no mentions here')
    expect(handles.size).toBe(0)
  })

  it('handles @-token at start of string', () => {
    const handles = parseMentionHandles('@alice leads the team')
    expect(handles.has('alice')).toBe(true)
  })

  it('handles email-like tokens (extracts full token)', () => {
    // "@alice@example.com" — the @ in the domain will start a new token
    // The first token is "alice" (up to the second @).
    const handles = parseMentionHandles('cc @alice@example.com thanks')
    // "alice" is before the second @; "example.com" follows the second @.
    expect(handles.has('alice')).toBe(true)
  })

  it('ignores bare @ with no following chars before whitespace', () => {
    const handles = parseMentionHandles('email me @ your convenience')
    // "your" follows "@ " but there's a space after @, so it shouldn't match.
    expect(handles.size).toBe(0)
  })
})

// ---- splitMentionSegments (pure, landr-7dya.12) -----------------------------

describe('splitMentionSegments', () => {
  it('returns a single text segment when there are no mentions', () => {
    const segs = splitMentionSegments('plain text only')
    expect(segs).toEqual([{ type: 'text', value: 'plain text only' }])
  })

  it('returns one empty text segment for an empty body', () => {
    const segs = splitMentionSegments('')
    expect(segs).toEqual([{ type: 'text', value: '' }])
  })

  it('splits a single mention into text + mention + text', () => {
    const segs = splitMentionSegments('hi @alice please look')
    expect(segs).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@alice', handle: 'alice' },
      { type: 'text', value: ' please look' },
    ])
  })

  it('handles a mention at the very start', () => {
    const segs = splitMentionSegments('@bob leads')
    expect(segs[0]).toEqual({ type: 'mention', value: '@bob', handle: 'bob' })
    expect(segs[1]).toEqual({ type: 'text', value: ' leads' })
  })

  it('handles a mention at the very end (no trailing text segment)', () => {
    const segs = splitMentionSegments('cc @carol')
    expect(segs).toEqual([
      { type: 'text', value: 'cc ' },
      { type: 'mention', value: '@carol', handle: 'carol' },
    ])
  })

  it('handles multiple mentions', () => {
    const segs = splitMentionSegments('@bob and @carol')
    const mentions = segs.filter((s) => s.type === 'mention')
    expect(mentions.map((m) => m.value)).toEqual(['@bob', '@carol'])
  })

  it('lower-cases the handle but preserves the original token text', () => {
    const segs = splitMentionSegments('ping @Alice')
    const mention = segs.find((s) => s.type === 'mention')
    expect(mention).toEqual({
      type: 'mention',
      value: '@Alice',
      handle: 'alice',
    })
  })

  it('reassembling all segment values reproduces the original body', () => {
    const body = 'a @b c @d e'
    const segs = splitMentionSegments(body)
    expect(segs.map((s) => s.value).join('')).toBe(body)
  })
})

// ---- searchMentionUsers -----------------------------------------------------

describe('searchMentionUsers', () => {
  it('queries users with ilike on email', async () => {
    sbMock.state.rows = [
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'alicia@example.com' },
    ]
    const results = await searchMentionUsers('ali')
    expect(sbMock.supabase.from).toHaveBeenCalledWith('users')
    expect(results).toHaveLength(2)
    expect(results[0].email).toBe('alice@example.com')
  })

  it('returns empty array for empty query without calling supabase', async () => {
    const results = await searchMentionUsers('')
    expect(results).toEqual([])
    expect(sbMock.supabase.from).not.toHaveBeenCalled()
  })

  it('returns empty array for whitespace-only query', async () => {
    const results = await searchMentionUsers('   ')
    expect(results).toEqual([])
    expect(sbMock.supabase.from).not.toHaveBeenCalled()
  })

  it('throws on supabase error', async () => {
    sbMock.state.error = { message: 'search error' }
    sbMock.state.rows = []
    await expect(searchMentionUsers('ali')).rejects.toThrow('search error')
  })
})

// ---- resolveMentionHandles --------------------------------------------------

describe('resolveMentionHandles', () => {
  it('resolves handles to MentionUser objects by email prefix', async () => {
    sbMock.state.rows = [
      { id: 'u1', email: 'alice@example.com' },
      { id: 'u2', email: 'bob@example.com' },
    ]
    const result = await resolveMentionHandles(new Set(['alice', 'bob']))
    expect(result.size).toBe(2)
    expect(result.get('alice')?.id).toBe('u1')
    expect(result.get('bob')?.id).toBe('u2')
  })

  it('returns empty map for empty handles', async () => {
    const result = await resolveMentionHandles(new Set())
    expect(result.size).toBe(0)
    expect(sbMock.supabase.from).not.toHaveBeenCalled()
  })

  it('silently drops unresolved handles', async () => {
    // Only alice is in the DB, not charlie.
    sbMock.state.rows = [{ id: 'u1', email: 'alice@example.com' }]
    const result = await resolveMentionHandles(new Set(['alice', 'charlie']))
    expect(result.size).toBe(1)
    expect(result.has('alice')).toBe(true)
    expect(result.has('charlie')).toBe(false)
  })

  it('throws on supabase error', async () => {
    sbMock.state.error = { message: 'resolve error' }
    sbMock.state.rows = []
    await expect(
      resolveMentionHandles(new Set(['alice'])),
    ).rejects.toThrow('resolve error')
  })
})

// ---- notifyMentions ---------------------------------------------------------

describe('notifyMentions', () => {
  it('calls the FastAPI endpoint with the right payload', async () => {
    await notifyMentions('ticket-1', 'comment-1', ['u1', 'u2'], 'hello @alice')
    expect(apiMock).toHaveBeenCalledWith(
      'POST',
      '/api/tickets/ticket-1/notify-mentions',
      {
        comment_id: 'comment-1',
        mentioned_user_ids: ['u1', 'u2'],
        body: 'hello @alice',
      },
    )
  })

  it('is a no-op when mentionedUserIds is empty', async () => {
    await notifyMentions('ticket-1', 'comment-1', [], 'no mentions')
    expect(apiMock).not.toHaveBeenCalled()
  })
})
