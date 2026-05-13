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
}

type OperatorContextValue = {
  operators: Operator[]
  currentOperator: Operator | null
  currentOperatorId: string | null
  loading: boolean
  switchOperator: (operatorId: string) => void
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

  useEffect(() => {
    if (authLoading || !session) return

    let cancelled = false
    supabase
      .from('operator_memberships')
      .select('operator_id, operators!inner ( id, slug, name )')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setFetched({ sessionUserId: session.user.id, operators: [] })
          return
        }
        const rows = data as unknown as Array<{
          operators: Operator | Operator[] | null
        }>
        const next: Operator[] = []
        for (const row of rows) {
          const op = Array.isArray(row.operators) ? row.operators[0] : row.operators
          if (op) next.push(op)
        }
        setFetched({ sessionUserId: session.user.id, operators: next })
      })

    return () => {
      cancelled = true
    }
  }, [session, authLoading])

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
    }
  }, [operators, currentOperatorId, loading, switchOperator])

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
