/**
 * HotelPlacesSearch — Google Places Text Search widget for the Hotels form.
 *
 * ENTER-only: the user types a hotel name and presses Enter (or clicks the
 * Search button). A single POST to the backend proxy fires; up to 10 results
 * are shown as a list. Picking a result calls onSelect directly — no second
 * "details" round-trip is needed because Text Search already returns the full
 * field set (name / address / phone / website / mapsLink / timezone).
 *
 * The input is NEVER disabled while typing. Only the Search button shows a
 * loading state. When the key is missing the component degrades gracefully to
 * a quiet inline hint so manual entry always keeps working.
 */
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  fetchHotelPlaceSearch,
  PlacesNotConfiguredError,
  type PlaceSearchResult,
} from '@/lib/hotels'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  operatorId: string
  /** Passed through from the parent form (e.g. while the form mutation is pending) */
  disabled?: boolean
  onSelect: (result: PlaceSearchResult) => void
}

export function HotelPlacesSearch({ operatorId, disabled, onSelect }: Props) {
  const [inputValue, setInputValue] = useState('')
  // The query key that actually triggers a fetch — only updated on submit.
  const [committedQuery, setCommittedQuery] = useState('')
  const [notConfigured, setNotConfigured] = useState(false)
  // Track whether the results panel is visible (hidden after a pick or explicit dismiss).
  const [resultsVisible, setResultsVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const searchQuery = useQuery<PlaceSearchResult[], Error>({
    queryKey: ['hotel-places-text-search', operatorId, committedQuery],
    queryFn: async () => {
      try {
        const results = await fetchHotelPlaceSearch(operatorId, committedQuery)
        setNotConfigured(false)
        return results
      } catch (err) {
        if (err instanceof PlacesNotConfiguredError) {
          setNotConfigured(true)
          return []
        }
        throw err
      }
    },
    // Only fire when committedQuery is non-empty (set by form submit).
    enabled: committedQuery.length > 0,
    staleTime: 60_000,
    retry: false,
  })

  function handleSubmit() {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    setCommittedQuery(trimmed)
    setResultsVisible(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handlePick(result: PlaceSearchResult) {
    setResultsVisible(false)
    setInputValue('')
    setCommittedQuery('')
    onSelect(result)
  }

  const isSearching = searchQuery.isFetching
  const results = searchQuery.data ?? []
  const showResults = resultsVisible && !notConfigured && committedQuery.length > 0
  const showNoResults =
    showResults &&
    !isSearching &&
    results.length === 0 &&
    searchQuery.isFetchedAfterMount

  return (
    <div ref={containerRef} className="relative space-y-1">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.hotels.placesSearchPlaceholder}
            aria-label={t.hotels.placesSearchLabel}
            // Input is NEVER disabled while typing — only the button shows loading.
            disabled={false}
            autoComplete="off"
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSubmit}
          disabled={disabled || isSearching || !inputValue.trim()}
          aria-label={t.hotels.placesSearchButton}
        >
          {isSearching ? t.hotels.placesSearching : t.hotels.placesSearchButton}
        </Button>
      </div>

      {/* Results list */}
      {showResults && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Place suggestions"
          className="absolute z-50 w-full rounded-md border bg-popover py-1 shadow-md"
        >
          {results.map((r) => (
            <li
              key={r.placeId}
              role="option"
              aria-selected={false}
              className={cn(
                'cursor-pointer select-none px-3 py-2 text-sm hover:bg-accent',
              )}
              onMouseDown={(e) => {
                // Prevent blur from collapsing list before click fires.
                e.preventDefault()
              }}
              onClick={() => handlePick(r)}
            >
              <span className="font-medium">{r.name}</span>
              {r.address && (
                <span className="ml-1 text-muted-foreground">{r.address}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {showNoResults && (
        <p className="absolute z-50 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          {t.hotels.placesNoResults}
        </p>
      )}

      {/* Not-configured hint */}
      {notConfigured && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="places-not-configured"
        >
          {t.hotels.placesNotConfigured}
        </p>
      )}
    </div>
  )
}
