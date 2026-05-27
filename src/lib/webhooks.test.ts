// landr-ah9u — unit tests for the webhook localStorage helpers.
//
// Covers the read/add/update/delete contract, per-operator isolation,
// validation (https-only URLs, event whitelisting), secret generation
// strength, and graceful handling of corrupt storage values.

import { beforeEach, describe, expect, it } from 'vitest'

import {
  addWebhook,
  deleteWebhook,
  generateSecret,
  isHttpsUrl,
  readWebhooks,
  storageKey,
  updateWebhook,
  WEBHOOK_EVENTS,
  type Webhook,
} from './webhooks'

beforeEach(() => {
  window.localStorage.clear()
})

describe('storageKey', () => {
  it('namespaces by operator id', () => {
    expect(storageKey('op-1')).toBe('landr.dashboard.webhooks.op-1')
    expect(storageKey('op-2')).toBe('landr.dashboard.webhooks.op-2')
  })
})

describe('WEBHOOK_EVENTS', () => {
  it('exposes the v1 event whitelist', () => {
    expect(WEBHOOK_EVENTS).toEqual([
      'booking.created',
      'booking.approved',
      'booking.cancelled',
      'booking.completed',
      'payment.received',
    ])
  })
})

describe('isHttpsUrl', () => {
  it('accepts https URLs', () => {
    expect(isHttpsUrl('https://example.com/webhook')).toBe(true)
    expect(isHttpsUrl('  https://example.com/webhook  ')).toBe(true)
  })

  it('rejects http URLs', () => {
    expect(isHttpsUrl('http://example.com/webhook')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isHttpsUrl('not a url')).toBe(false)
    expect(isHttpsUrl('example.com')).toBe(false)
    expect(isHttpsUrl('')).toBe(false)
    expect(isHttpsUrl('   ')).toBe(false)
  })
})

describe('generateSecret', () => {
  it('returns a 48-char hex string (24 random bytes)', () => {
    const s = generateSecret()
    expect(s).toHaveLength(48)
    expect(s).toMatch(/^[0-9a-f]{48}$/)
  })

  it('returns a fresh value on each call', () => {
    const a = generateSecret()
    const b = generateSecret()
    expect(a).not.toBe(b)
  })
})

describe('readWebhooks', () => {
  it('returns [] when storage is empty', () => {
    expect(readWebhooks('op-1')).toEqual([])
  })

  it('returns [] when stored JSON is malformed', () => {
    window.localStorage.setItem(storageKey('op-1'), 'not-json')
    expect(readWebhooks('op-1')).toEqual([])
  })

  it('returns [] when stored payload is not an array', () => {
    window.localStorage.setItem(
      storageKey('op-1'),
      JSON.stringify({ foo: 'bar' }),
    )
    expect(readWebhooks('op-1')).toEqual([])
  })

  it('filters out entries that do not match the webhook shape', () => {
    const validHook: Webhook = {
      id: 'wh-1',
      url: 'https://example.com/hook',
      events: ['booking.created'],
      secret: 'deadbeef',
      created_at: '2026-05-21T00:00:00.000Z',
    }
    window.localStorage.setItem(
      storageKey('op-1'),
      JSON.stringify([validHook, { id: 'broken' }, null, 'garbage']),
    )
    expect(readWebhooks('op-1')).toEqual([validHook])
  })

  it('drops entries with unknown event names', () => {
    const bad = {
      id: 'wh-bad',
      url: 'https://example.com/hook',
      events: ['booking.created', 'booking.refunded'],
      secret: 'beef',
      created_at: '2026-05-21T00:00:00.000Z',
    }
    window.localStorage.setItem(storageKey('op-1'), JSON.stringify([bad]))
    expect(readWebhooks('op-1')).toEqual([])
  })
})

describe('addWebhook', () => {
  it('persists a new webhook with a generated id, secret, and timestamp', () => {
    const hook = addWebhook('op-1', {
      url: 'https://example.com/hook',
      events: ['booking.created', 'booking.approved'],
    })

    expect(hook.id).toBeTruthy()
    expect(hook.url).toBe('https://example.com/hook')
    expect(hook.events).toEqual(['booking.created', 'booking.approved'])
    expect(hook.secret).toMatch(/^[0-9a-f]{48}$/)
    expect(() => new Date(hook.created_at).toISOString()).not.toThrow()

    const stored = readWebhooks('op-1')
    expect(stored).toEqual([hook])
  })

  it('trims surrounding whitespace from the URL', () => {
    const hook = addWebhook('op-1', {
      url: '  https://example.com/hook  ',
      events: ['booking.created'],
    })
    expect(hook.url).toBe('https://example.com/hook')
  })

  it('honours an explicit secret when caller supplies one', () => {
    const hook = addWebhook('op-1', {
      url: 'https://example.com/hook',
      events: ['booking.created'],
      secret: 'explicit-secret',
    })
    expect(hook.secret).toBe('explicit-secret')
  })

  it('appends to the existing list (does not overwrite)', () => {
    addWebhook('op-1', {
      url: 'https://a.example.com/hook',
      events: ['booking.created'],
    })
    addWebhook('op-1', {
      url: 'https://b.example.com/hook',
      events: ['payment.received'],
    })
    const stored = readWebhooks('op-1')
    expect(stored.map((h) => h.url)).toEqual([
      'https://a.example.com/hook',
      'https://b.example.com/hook',
    ])
  })

  it('scopes storage by operator', () => {
    addWebhook('op-1', {
      url: 'https://op-1.example.com/hook',
      events: ['booking.created'],
    })
    addWebhook('op-2', {
      url: 'https://op-2.example.com/hook',
      events: ['payment.received'],
    })
    expect(readWebhooks('op-1')).toHaveLength(1)
    expect(readWebhooks('op-2')).toHaveLength(1)
    expect(readWebhooks('op-1')[0].url).toBe('https://op-1.example.com/hook')
    expect(readWebhooks('op-2')[0].url).toBe('https://op-2.example.com/hook')
  })
})

describe('updateWebhook', () => {
  it('patches url and events without touching secret / id / created_at', () => {
    const original = addWebhook('op-1', {
      url: 'https://old.example.com/hook',
      events: ['booking.created'],
    })

    const updated = updateWebhook('op-1', original.id, {
      url: 'https://new.example.com/hook',
      events: ['booking.cancelled', 'payment.received'],
    })

    expect(updated).not.toBeNull()
    expect(updated?.id).toBe(original.id)
    expect(updated?.secret).toBe(original.secret)
    expect(updated?.created_at).toBe(original.created_at)
    expect(updated?.url).toBe('https://new.example.com/hook')
    expect(updated?.events).toEqual(['booking.cancelled', 'payment.received'])

    const stored = readWebhooks('op-1')
    expect(stored[0]).toEqual(updated)
  })

  it('returns null when the id is not found and does not mutate storage', () => {
    const original = addWebhook('op-1', {
      url: 'https://example.com/hook',
      events: ['booking.created'],
    })
    const result = updateWebhook('op-1', 'no-such-id', {
      url: 'https://wat.example.com/hook',
    })
    expect(result).toBeNull()
    expect(readWebhooks('op-1')).toEqual([original])
  })

  it('leaves untouched fields alone when only one field is in the patch', () => {
    const original = addWebhook('op-1', {
      url: 'https://example.com/hook',
      events: ['booking.created'],
    })
    const updated = updateWebhook('op-1', original.id, {
      events: ['booking.completed'],
    })
    expect(updated?.url).toBe(original.url)
    expect(updated?.events).toEqual(['booking.completed'])
  })
})

describe('deleteWebhook', () => {
  it('removes the row by id', () => {
    const a = addWebhook('op-1', {
      url: 'https://a.example.com/hook',
      events: ['booking.created'],
    })
    const b = addWebhook('op-1', {
      url: 'https://b.example.com/hook',
      events: ['payment.received'],
    })
    deleteWebhook('op-1', a.id)
    expect(readWebhooks('op-1')).toEqual([b])
  })

  it('is a no-op when the id is not found', () => {
    const a = addWebhook('op-1', {
      url: 'https://a.example.com/hook',
      events: ['booking.created'],
    })
    deleteWebhook('op-1', 'no-such-id')
    expect(readWebhooks('op-1')).toEqual([a])
  })

  it('does not affect other operators', () => {
    const a = addWebhook('op-1', {
      url: 'https://op1.example.com/hook',
      events: ['booking.created'],
    })
    const b = addWebhook('op-2', {
      url: 'https://op2.example.com/hook',
      events: ['payment.received'],
    })
    deleteWebhook('op-1', a.id)
    expect(readWebhooks('op-1')).toEqual([])
    expect(readWebhooks('op-2')).toEqual([b])
  })
})
