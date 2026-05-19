import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'

export type Operator = {
  id: string
  slug: string
  name: string | null
  onboarded_at: string | null
}

type OperatorContextValue = {
  operators: Operator[]
  currentOperator: Operator | null
  currentOperatorId: string | null
  loading: boolean
  switchOperator: (operatorId: string) => void
  refreshOperators: () => void
}

const STORAGE_KEY = 'landr.dashboard.currentOperatorId'

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined)

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStored(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage may be disabled — UX hint only, fail silently.
  }
}

type FetchedOperators = {
  sessionUserId: string
  operators: Operator[]
}

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const [fetched, setFetched] = useState<FetchedOperators | null>(null)
  const [storedId, setStoredId] = useState<string | null>(() => readStored())
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (authLoading || !session) return

    let cancelled = false

    // landr-69c: filter to the caller's own memberships. RLS bypass for
    // is_landr_staff makes a no-filter query leak every membership row in
    // the system, producing duplicate dropdown entries + accidental
    // tenant-switches into operators the user doesn't own. The auth.uid()
    // is the supabase_auth_id; resolve it to public.users.id via the
    // bridge table, then filter operator_memberships.user_id by that.
    ;(async () => {
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('supabase_auth_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (userErr || !userRow) {
        setFetched({ sessionUserId: session.user.id, operators: [] })
        return
      }

      const { data, error } = await supabase
        .from('operator_memberships')
        .select('operator_id, operators!inner ( id, slug, name, onboarded_at )')
        .eq('user_id', userRow.id)
      if (cancelled) return
      if (error || !data) {
        setFetched({ sessionUserId: session.user.id, operators: [] })
        return
      }
      const rows = data as unknown as Array<{
        operators: Operator | Operator[] | null
      }>
      const seen = new Set<string>()
      const next: Operator[] = []
      for (const row of rows) {
        const op = Array.isArray(row.operators) ? row.operators[0] : row.operators
        if (op && !seen.has(op.id)) {
          seen.add(op.id)
          next.push(op)
        }
      }
      setFetched({ sessionUserId: session.user.id, operators: next })
    })()

    return () => {
      cancelled = true
    }
  }, [session, authLoading, reloadTick])

  const refreshOperators = useCallback(() => {
    setReloadTick((t) => t + 1)
  }, [])

  const operators = useMemo<Operator[]>(() => {
    if (!session) return []
    if (fetched?.sessionUserId === session.user.id) return fetched.operators
    return []
  }, [session, fetched])

  const loading = !!session && fetched?.sessionUserId !== session?.user?.id

  const currentOperatorId = useMemo<string | null>(() => {
    if (!session) return null
    if (storedId && operators.some((o) => o.id === storedId)) return storedId
    return operators[0]?.id ?? null
  }, [session, operators, storedId])

  useEffect(() => {
    writeStored(currentOperatorId)
  }, [currentOperatorId])

  const switchOperator = useCallback((operatorId: string) => {
    setStoredId(operatorId)
  }, [])

  const value = useMemo<OperatorContextValue>(() => {
    const currentOperator =
      operators.find((o) => o.id === currentOperatorId) ?? null
    return {
      operators,
      currentOperator,
      currentOperatorId,
      loading,
      switchOperator,
      refreshOperators,
    }
  }, [operators, currentOperatorId, loading, switchOperator, refreshOperators])

  return (
    <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOperator(): OperatorContextValue {
  const ctx = useContext(OperatorContext)
  if (!ctx) {
    throw new Error('useOperator must be used inside <OperatorProvider>')
  }
  return ctx
}
