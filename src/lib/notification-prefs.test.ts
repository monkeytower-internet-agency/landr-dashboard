// landr-wwhn.16 — tests for the notification preferences data layer.
//
// Covers:
//   fetchNotificationPrefs        — own-row global default
//   upsertNotificationPrefs       — upsert on notification_preferences
//   fetchTicketNotifySettings     — own-row per-ticket override
//   upsertTicketNotifySettings    — upsert / delete per-ticket override
//   resolveEffectiveNotifySettings — client-side COALESCE mirror

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Supabase mock ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  type BuildResult = { data: unknown; error: { message: string } | null }

  const state = {
    single: null as unknown,
    error: null as { message: string } | null,
    lastUpsert: null as unknown,
    lastDelete: false,
    fromTable: '',
  }

  const makeBuilder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      upsert: vi.fn((vals: unknown) => {
        state.lastUpsert = vals
        return b
      }),
      delete: vi.fn(() => {
        state.lastDelete = true
        return b
      }),
      single: vi.fn(async (): Promise<BuildResult> => ({
        data: state.single,
        error: state.error,
      })),
      maybeSingle: vi.fn(async (): Promise<BuildResult> => ({
        data: state.single,
        error: state.error,
      })),
      // no-arg terminal (delete chain)
      then: (resolve: (v: BuildResult) => void) =>
        resolve({ data: null, error: state.error }),
    })
    return b
  }

  const supabase = {
    from: vi.fn((table: string) => {
      state.fromTable = table
      return makeBuilder()
    }),
  }

  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

import {
  fetchNotificationPrefs,
  upsertNotificationPrefs,
  fetchTicketNotifySettings,
  upsertTicketNotifySettings,
  resolveEffectiveNotifySettings,
  NOTIF_PREFS_DEFAULTS,
} from './notification-prefs'

function resetState() {
  mock.state.single = null
  mock.state.error = null
  mock.state.lastUpsert = null
  mock.state.lastDelete = false
  mock.state.fromTable = ''
}

beforeEach(resetState)
afterEach(() => vi.clearAllMocks())

// ---- fetchNotificationPrefs -------------------------------------------------

describe('fetchNotificationPrefs', () => {
  it('queries notification_preferences by user_id', async () => {
    mock.state.single = {
      user_id: 'u1',
      bell: true,
      email: false,
      push: false,
      delivery_mode: 'immediate',
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    const result = await fetchNotificationPrefs('u1')
    expect(mock.supabase.from).toHaveBeenCalledWith('notification_preferences')
    expect(result?.bell).toBe(true)
    expect(result?.email).toBe(false)
    expect(result?.delivery_mode).toBe('immediate')
  })

  it('returns null when no row exists (new user)', async () => {
    mock.state.single = null
    const result = await fetchNotificationPrefs('new-user')
    expect(result).toBeNull()
  })

  it('throws on Supabase error', async () => {
    mock.state.error = { message: 'rls error' }
    mock.state.single = null
    await expect(fetchNotificationPrefs('u1')).rejects.toThrow('rls error')
  })
})

// ---- upsertNotificationPrefs ------------------------------------------------

describe('upsertNotificationPrefs', () => {
  it('upserts the global default row', async () => {
    const saved = {
      user_id: 'u1',
      bell: false,
      email: true,
      push: false,
      delivery_mode: 'immediate',
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    mock.state.single = saved
    const result = await upsertNotificationPrefs('u1', {
      bell: false,
      email: true,
      push: false,
      delivery_mode: 'immediate',
    })
    expect(mock.supabase.from).toHaveBeenCalledWith('notification_preferences')
    expect(mock.state.lastUpsert).toMatchObject({ user_id: 'u1', bell: false, email: true })
    expect(result.email).toBe(true)
  })

  it('throws on Supabase error', async () => {
    mock.state.error = { message: 'constraint violation' }
    mock.state.single = null
    await expect(
      upsertNotificationPrefs('u1', { bell: true, email: false, push: false, delivery_mode: 'immediate' }),
    ).rejects.toThrow('constraint violation')
  })
})

// ---- fetchTicketNotifySettings ----------------------------------------------

describe('fetchTicketNotifySettings', () => {
  it('queries ticket_notify_settings for (ticket, user)', async () => {
    mock.state.single = {
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: null,
      email: true,
      push: null,
      delivery_mode: null,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    const result = await fetchTicketNotifySettings('tk1', 'u1')
    expect(mock.supabase.from).toHaveBeenCalledWith('ticket_notify_settings')
    expect(result?.email).toBe(true)
    expect(result?.bell).toBeNull()
  })

  it('returns null when no override row exists', async () => {
    mock.state.single = null
    const result = await fetchTicketNotifySettings('tk-none', 'u1')
    expect(result).toBeNull()
  })

  it('throws on Supabase error', async () => {
    mock.state.error = { message: 'rls denied' }
    mock.state.single = null
    await expect(fetchTicketNotifySettings('tk1', 'u1')).rejects.toThrow('rls denied')
  })
})

// ---- upsertTicketNotifySettings — happy path --------------------------------

describe('upsertTicketNotifySettings — upsert', () => {
  it('upserts a per-ticket override row when at least one channel is set', async () => {
    const saved = {
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: false,
      email: null,
      push: null,
      delivery_mode: null,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    mock.state.single = saved
    const result = await upsertTicketNotifySettings('tk1', 'u1', {
      bell: false,
      email: null,
      push: null,
    })
    expect(mock.supabase.from).toHaveBeenCalledWith('ticket_notify_settings')
    expect(mock.state.lastUpsert).toMatchObject({
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: false,
    })
    expect(result?.bell).toBe(false)
  })

  it('throws on upsert Supabase error', async () => {
    mock.state.error = { message: 'upsert failed' }
    mock.state.single = null
    await expect(
      upsertTicketNotifySettings('tk1', 'u1', { bell: true, email: null, push: null }),
    ).rejects.toThrow('upsert failed')
  })
})

// ---- upsertTicketNotifySettings — all-null → DELETE -------------------------

describe('upsertTicketNotifySettings — all-null deletes the row', () => {
  it('deletes the row when all channels are null (follow global)', async () => {
    mock.state.error = null
    const result = await upsertTicketNotifySettings('tk1', 'u1', {
      bell: null,
      email: null,
      push: null,
    })
    expect(mock.supabase.from).toHaveBeenCalledWith('ticket_notify_settings')
    expect(mock.state.lastDelete).toBe(true)
    expect(result).toBeNull()
  })

  it('throws on delete Supabase error', async () => {
    mock.state.error = { message: 'delete denied' }
    await expect(
      upsertTicketNotifySettings('tk1', 'u1', { bell: null, email: null, push: null }),
    ).rejects.toThrow('delete denied')
  })
})

// ---- resolveEffectiveNotifySettings -----------------------------------------

describe('resolveEffectiveNotifySettings', () => {
  it('returns hard defaults when both global and per-ticket are null', () => {
    const result = resolveEffectiveNotifySettings(null, null)
    expect(result.bell).toBe(NOTIF_PREFS_DEFAULTS.bell)       // true
    expect(result.email).toBe(NOTIF_PREFS_DEFAULTS.email)     // false
    expect(result.push).toBe(NOTIF_PREFS_DEFAULTS.push)       // false
    expect(result.delivery_mode).toBe(NOTIF_PREFS_DEFAULTS.delivery_mode) // 'immediate'
  })

  it('returns global defaults when per-ticket is null (all fields null)', () => {
    const global = {
      user_id: 'u1',
      bell: false,
      email: true,
      push: false,
      delivery_mode: 'digest' as const,
      created_at: '',
      updated_at: '',
    }
    const result = resolveEffectiveNotifySettings(global, null)
    expect(result.bell).toBe(false)
    expect(result.email).toBe(true)
    expect(result.delivery_mode).toBe('digest')
  })

  it('per-ticket non-null field overrides global', () => {
    const global = {
      user_id: 'u1',
      bell: true,
      email: false,
      push: false,
      delivery_mode: 'immediate' as const,
      created_at: '',
      updated_at: '',
    }
    const perTicket = {
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: false,     // overrides global true
      email: null,     // follows global false
      push: true,      // overrides global false
      delivery_mode: null,
      created_at: '',
      updated_at: '',
    }
    const result = resolveEffectiveNotifySettings(global, perTicket)
    expect(result.bell).toBe(false)   // pinned
    expect(result.email).toBe(false)  // global fallback
    expect(result.push).toBe(true)    // pinned
    expect(result.delivery_mode).toBe('immediate') // global fallback
  })

  it('per-ticket all-null follows global live (same as no row)', () => {
    const global = {
      user_id: 'u1',
      bell: true,
      email: true,
      push: false,
      delivery_mode: 'immediate' as const,
      created_at: '',
      updated_at: '',
    }
    const perTicket = {
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: null,
      email: null,
      push: null,
      delivery_mode: null,
      created_at: '',
      updated_at: '',
    }
    const result = resolveEffectiveNotifySettings(global, perTicket)
    // All fall through to global values
    expect(result.bell).toBe(true)
    expect(result.email).toBe(true)
    expect(result.push).toBe(false)
  })

  it('per-ticket delivery_mode overrides global', () => {
    const global = {
      user_id: 'u1',
      bell: true,
      email: false,
      push: false,
      delivery_mode: 'immediate' as const,
      created_at: '',
      updated_at: '',
    }
    const perTicket = {
      ticket_id: 'tk1',
      user_id: 'u1',
      bell: null,
      email: null,
      push: null,
      delivery_mode: 'digest' as const,
      created_at: '',
      updated_at: '',
    }
    const result = resolveEffectiveNotifySettings(global, perTicket)
    expect(result.delivery_mode).toBe('digest')
  })
})
