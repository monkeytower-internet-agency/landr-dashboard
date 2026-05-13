import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type ChannelOn = (
  type: string,
  filter: Record<string, unknown>,
  cb: (payload: Record<string, unknown>) => void,
) => ChannelHandle

type ChannelHandle = {
  on: ChannelOn
  subscribe: ReturnType<typeof vi.fn>
}

const { mock } = vi.hoisted(() => {
  const handlers: Array<{
    filter: Record<string, unknown>
    cb: (payload: Record<string, unknown>) => void
  }> = []
  const channel: ChannelHandle = {
    on: vi.fn() as unknown as ChannelOn,
    subscribe: vi.fn(),
  }
  ;(channel.on as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_type: string, filter: Record<string, unknown>, cb) => {
      handlers.push({ filter, cb })
      return channel
    },
  )
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { mock: { supabase, channel, handlers } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

import { useRealtimeQuery } from './useRealtimeQuery'

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  mock.handlers.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useRealtimeQuery', () => {
  it('runs queryFn and returns its data', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(
      () =>
        useRealtimeQuery({
          queryKey: ['bookings', 'op-1'],
          queryFn: async () => [{ id: '1' }],
          realtime: { table: 'bookings', filter: 'operator_id=eq.op-1' },
        }),
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([{ id: '1' }])
  })

  it('subscribes to the configured realtime filter', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderHook(
      () =>
        useRealtimeQuery({
          queryKey: ['bookings'],
          queryFn: async () => [],
          realtime: { table: 'bookings', event: 'INSERT' },
        }),
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(mock.supabase.channel).toHaveBeenCalled())
    expect(mock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'bookings',
      }),
      expect.any(Function),
    )
    expect(mock.channel.subscribe).toHaveBeenCalled()
  })

  it('invalidates the query when a realtime event fires', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    renderHook(
      () =>
        useRealtimeQuery({
          queryKey: ['bookings'],
          queryFn: async () => [],
          realtime: { table: 'bookings' },
        }),
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(mock.handlers.length).toBeGreaterThan(0))
    mock.handlers[0].cb({ eventType: 'INSERT', new: { id: 'x' }, old: {} })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookings'] })
  })

  it('skips subscription when realtime is null', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result } = renderHook(
      () =>
        useRealtimeQuery({
          queryKey: ['bookings'],
          queryFn: async () => [],
          realtime: null,
        }),
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mock.supabase.channel).not.toHaveBeenCalled()
  })

  it('removes the channel on unmount', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = renderHook(
      () =>
        useRealtimeQuery({
          queryKey: ['bookings'],
          queryFn: async () => [],
          realtime: { table: 'bookings' },
        }),
      { wrapper: wrapper(client) },
    )

    await waitFor(() => expect(mock.supabase.channel).toHaveBeenCalled())
    unmount()
    expect(mock.supabase.removeChannel).toHaveBeenCalled()
  })
})
