// landr-c58d / landr-45pb — sort + bucketing helpers for the Views sub-list.
//
// Lives in its own module so the React-Refresh ESLint rule
// (react-refresh/only-export-components) stays happy for the .tsx
// components that import it.
//
// Gmail-style three-bucket IA (landr-45pb):
//   1. Primary: views with user_state.pinned === true, ordered by
//      user_state.sort_order ASC (DnD-persisted per user).
//      Tiebreak: name ASC (locale-aware) — keeps adjacent rows stable.
//   2. More: views with pinned === false AND hidden === false,
//      ordered by name ASC.
//   3. Hidden: views with hidden === true, ordered by name ASC.
//
// `sortViewsForSidebar` is kept as the legacy single-bucket helper because
// the existing tests assert against it and a downstream caller may still
// want the pre-bucketed view (e.g. mobile-narrow layout). The new
// `bucketViewsForSidebar` is the API the new sidebar consumes.
import type { SavedViewWithState } from '@/lib/saved-views'

export function sortViewsForSidebar(
  views: ReadonlyArray<SavedViewWithState>,
): SavedViewWithState[] {
  return [...views].sort((a, b) => {
    const aPin = a.user_state.pinned ? 0 : 1
    const bPin = b.user_state.pinned ? 0 : 1
    if (aPin !== bPin) return aPin - bPin
    const aOrder = a.user_state.sort_order
    const bOrder = b.user_state.sort_order
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.name.localeCompare(b.name)
  })
}

export type ViewBuckets = {
  primary: SavedViewWithState[]
  more: SavedViewWithState[]
  hidden: SavedViewWithState[]
}

export function bucketViewsForSidebar(
  views: ReadonlyArray<SavedViewWithState>,
): ViewBuckets {
  const primary: SavedViewWithState[] = []
  const more: SavedViewWithState[] = []
  const hidden: SavedViewWithState[] = []

  for (const v of views) {
    if (v.user_state.hidden) {
      hidden.push(v)
    } else if (v.user_state.pinned) {
      primary.push(v)
    } else {
      more.push(v)
    }
  }

  primary.sort((a, b) => {
    if (a.user_state.sort_order !== b.user_state.sort_order) {
      return a.user_state.sort_order - b.user_state.sort_order
    }
    return a.name.localeCompare(b.name)
  })
  more.sort((a, b) => a.name.localeCompare(b.name))
  hidden.sort((a, b) => a.name.localeCompare(b.name))

  return { primary, more, hidden }
}
