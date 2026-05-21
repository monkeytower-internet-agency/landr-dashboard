// landr-c58d — sort helper for the Views sub-list.
//
// Lives in its own module so the React-Refresh ESLint rule
// (react-refresh/only-export-components) stays happy for the .tsx
// components that import it.
//
// Order rule:
//   1. Starred views first.
//   2. Inside each bucket: sort_order ASC.
//   3. Tiebreak by name ASC (locale-aware).
import type { SavedViewWithState } from '@/lib/saved-views'

export function sortViewsForSidebar(
  views: ReadonlyArray<SavedViewWithState>,
): SavedViewWithState[] {
  return [...views].sort((a, b) => {
    const aStar = a.user_state.starred ? 0 : 1
    const bStar = b.user_state.starred ? 0 : 1
    if (aStar !== bStar) return aStar - bStar
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.name.localeCompare(b.name)
  })
}
