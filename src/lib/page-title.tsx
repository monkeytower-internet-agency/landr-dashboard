// landr-fx2i — page-title infrastructure for the topbar.
//
// A route component declares its title (or breadcrumb) by rendering
// <PageTitle title="Bookings" /> or
// <PageTitle crumbs={[{label:'Products', to:'/settings/products'}, {label: productName}]} />
// somewhere in its tree. The component is a render-prop-style side-
// effect — it returns null and writes the title into a React context
// for the lifetime of the route. AppShell's <PageTitleDisplay /> reads
// the same context and renders the title or breadcrumb in the topbar.
//
// Why context (not a static route → title map)? Detail pages need a
// dynamic label that depends on a query result (product name, contact
// name). Context lets the page populate the label once the data
// arrives without coupling AppShell to every fetch.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type Crumb = { label: string; to?: string }

export type PageTitleState = {
  title: string | null
  crumbs: Crumb[]
}

type PageTitleApi = {
  state: PageTitleState
  set: (state: PageTitleState) => void
}

const PageTitleContext = createContext<PageTitleApi | undefined>(undefined)

const EMPTY_STATE: PageTitleState = { title: null, crumbs: [] }

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageTitleState>(EMPTY_STATE)
  const set = useCallback((next: PageTitleState) => {
    setState(next)
  }, [])
  const value = useMemo<PageTitleApi>(() => ({ state, set }), [state, set])
  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  )
}

/**
 * Side-effect component: writes title (or crumbs) into the topbar context
 * for the lifetime of the calling component, then clears on unmount.
 *
 * Use in each route component:
 *   <PageTitle title="Bookings" />
 *   <PageTitle crumbs={[{label:'Products', to:'/settings/products'}, {label: name}]} />
 *
 * If both `title` and `crumbs` are passed, `crumbs` wins (breadcrumb mode).
 */
export function PageTitle({
  title,
  crumbs,
}: {
  title?: string
  crumbs?: Crumb[]
}): null {
  const ctx = useContext(PageTitleContext)
  // Outside a provider this is a no-op (lets tests render route components
  // in isolation without wrapping them in AppShell).
  const set = ctx?.set
  // Serialise crumbs so the effect dep array reacts to deep changes without
  // identity churn from each render returning a fresh array literal.
  const crumbsKey = JSON.stringify(crumbs ?? [])
  useEffect(() => {
    if (!set) return
    set({ title: title ?? null, crumbs: crumbs ?? [] })
    return () => {
      set(EMPTY_STATE)
    }
    // crumbsKey covers the deep content of `crumbs`; including the raw
    // crumbs array would re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, crumbsKey, set])
  return null
}

/**
 * Read the current page-title state for the topbar display.
 * Returns the empty state outside a provider (safe default).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePageTitle(): PageTitleState {
  const ctx = useContext(PageTitleContext)
  return ctx?.state ?? EMPTY_STATE
}
