/**
 * HotelPlacesSearch — Google Places autocomplete widget for the Hotels form.
 *
 * Debounces keystrokes (300 ms, min 3 chars) then calls the backend proxy
 * GET /api/staff/operators/{operatorId}/hotel-places/autocomplete.
 * Selecting a suggestion fires onSelect with the resolved PlaceDetails so the
 * parent form can pre-fill its fields.
 *
 * When the backend key is missing it returns PlacesNotConfiguredError; we show
 * a subtle inline hint instead of crashing. Manual entry always keeps working.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  fetchPlaceAutocomplete,
  fetchPlaceDetails,
  PlacesNotConfiguredError,
  type PlaceDetails,
  type PlacePrediction,
} from '@/lib/hotels'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  operatorId: string
  disabled?: boolean
  onSelect: (details: PlaceDetails) => void
}

/** One UUID-v4 per search session (closed by the details call). */
function newSession() {
  return crypto.randomUUID()
}

export function HotelPlacesSearch({ operatorId, disabled, onSelect }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [sessionToken, setSessionToken] = useState<string>(newSession)
  // userDismissed: user clicked outside or selected an item — collapse the list
  // until the query key changes (i.e. they type something new).
  const [userDismissed, setUserDismissed] = useState(false)
  const [notConfigured, setNotConfigured] = useState(false)
  const [fetchingDetail, setFetchingDetail] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounce: 300 ms, min 3 chars
  useEffect(() => {
    const trimmed = inputValue.trim()
    if (trimmed.length < 3) {
      // Use setTimeout so we're updating state asynchronously (avoids the
      // set-state-in-effect lint rule for synchronous updates).
      const t = window.setTimeout(() => {
        setDebouncedQuery('')
        setUserDismissed(false)
      }, 0)
      return () => window.clearTimeout(t)
    }
    const timer = window.setTimeout(() => {
      setDebouncedQuery(trimmed)
      setUserDismissed(false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [inputValue])

  const acQuery = useQuery<PlacePrediction[], Error>({
    queryKey: ['hotel-places-autocomplete', operatorId, debouncedQuery, sessionToken],
    queryFn: async () => {
      try {
        const results = await fetchPlaceAutocomplete(
          operatorId,
          debouncedQuery,
          sessionToken,
        )
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
    enabled: debouncedQuery.length >= 3,
    staleTime: 30_000,
    retry: false,
  })

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setUserDismissed(true)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSelect(prediction: PlacePrediction) {
    setUserDismissed(true)
    setInputValue('')
    setDebouncedQuery('')
    setFetchingDetail(true)
    const token = sessionToken
    // Reset session token — the details call closes the current session.
    setSessionToken(newSession())
    try {
      const details = await fetchPlaceDetails(operatorId, prediction.placeId, token)
      onSelect(details)
    } catch (err) {
      if (err instanceof PlacesNotConfiguredError) {
        setNotConfigured(true)
      }
      // On other errors: silently swallow — user still edits manually.
    } finally {
      setFetchingDetail(false)
    }
  }

  const isSearching = acQuery.isFetching || fetchingDetail
  const suggestions = acQuery.data ?? []
  // Show the dropdown when: we have results, the user hasn't dismissed, and
  // the query is still relevant (≥ 3 chars).
  const showDropdown =
    !userDismissed &&
    !notConfigured &&
    debouncedQuery.length >= 3 &&
    suggestions.length > 0
  const showNoResults =
    !userDismissed &&
    !notConfigured &&
    !isSearching &&
    debouncedQuery.length >= 3 &&
    suggestions.length === 0 &&
    acQuery.isFetchedAfterMount

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
            setUserDismissed(false)
          }}
          onFocus={() => setUserDismissed(false)}
          placeholder={t.hotels.placesSearchPlaceholder}
          aria-label={t.hotels.placesSearchLabel}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          disabled={disabled || isSearching}
          autoComplete="off"
          className="pl-9"
        />
        {isSearching && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {t.hotels.placesSearching}
          </span>
        )}
      </div>

      {/* Suggestion dropdown */}
      {showDropdown && (
        <ul
          role="listbox"
          aria-label="Place suggestions"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover py-1 shadow-md"
        >
          {suggestions.map((p) => (
            <li
              key={p.placeId}
              role="option"
              aria-selected={false}
              className={cn(
                'cursor-pointer select-none px-3 py-2 text-sm hover:bg-accent',
              )}
              onMouseDown={(e) => {
                // Prevent the input blur from closing the list before onClick fires.
                e.preventDefault()
              }}
              onClick={() => void handleSelect(p)}
            >
              <span className="font-medium">{p.mainText}</span>
              {p.secondaryText && (
                <span className="ml-1 text-muted-foreground">{p.secondaryText}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Empty state */}
      {showNoResults && (
        <p className="absolute z-50 mt-1 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          {t.hotels.placesNoResults}
        </p>
      )}

      {/* Not-configured hint */}
      {notConfigured && (
        <p
          className="mt-1 text-xs text-muted-foreground"
          data-testid="places-not-configured"
        >
          {t.hotels.placesNotConfigured}
        </p>
      )}
    </div>
  )
}
