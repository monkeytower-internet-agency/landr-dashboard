import { useEffect } from 'react'
import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type PostgresEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE'

export type RealtimeFilter = {
  schema?: string
  table: string
  event?: PostgresEvent
  filter?: string
}

export type UseRealtimeQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryKey' | 'queryFn'
> & {
  queryKey: QueryKey
  queryFn: () => Promise<TData>
  realtime: RealtimeFilter | RealtimeFilter[] | null
  onRealtimeEvent?: (
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
  ) => void
}

// A TanStack Query that auto-invalidates whenever a matching Supabase
// Realtime postgres_changes event fires. Pass `realtime: null` to disable
// the subscription (e.g. when the operator scope is not yet known).
export function useRealtimeQuery<TData>({
  queryKey,
  queryFn,
  realtime,
  onRealtimeEvent,
  ...options
}: UseRealtimeQueryOptions<TData>): UseQueryResult<TData, Error> {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!realtime) return
    const filters = Array.isArray(realtime) ? realtime : [realtime]
    if (filters.length === 0) return

    const channelName = `realtime:${filters
      .map(
        (f) =>
          `${f.schema ?? 'public'}.${f.table}:${f.event ?? '*'}:${f.filter ?? ''}`,
      )
      .join('|')}:${JSON.stringify(queryKey)}`

    const channel = supabase.channel(channelName)

    for (const f of filters) {
      channel.on(
        // postgres_changes is typed too narrowly in supabase-js generics;
        // the runtime accepts the string literal.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: f.event ?? '*',
          schema: f.schema ?? 'public',
          table: f.table,
          ...(f.filter ? { filter: f.filter } : {}),
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          onRealtimeEvent?.(payload)
          queryClient.invalidateQueries({ queryKey })
        },
      )
    }

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // queryKey and realtime are stringified for stable dep comparison so
    // callers can pass inline arrays without retriggering on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(queryKey), JSON.stringify(realtime), queryClient])

  return useQuery<TData, Error, TData, QueryKey>({
    queryKey,
    queryFn,
    ...options,
  })
}
