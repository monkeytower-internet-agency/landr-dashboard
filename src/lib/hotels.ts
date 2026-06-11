// landr-cyoi — Hotels as a first-class settings entity, separate from the
// generic pickup-locations editor. A hotel is still a `locations` row with
// role_type.code='hotel' under the hood, but it carries a sidecar of
// required contact details (address/email/phone) plus an optional Google
// Maps link and additional operational fields. Kept in its own module (not
// locations.ts) so the basic-location types/schema stay lean.
//
// Email field semantics:
//   email         — booking-confirmation email (locations.email). Required.
//                   Feeds booking_emails._resolve_hotel_email. Do NOT move.
//   contact_email — general / website contact email (hotel_details.contact_email).
//                   Optional. Distinct from the booking email; may be the same
//                   address for small hotels.
import { z } from 'zod'
import { api } from '@/lib/api-client'

export type Hotel = {
  id: string
  name: string
  /** Booking-confirmation email (locations.email). Required. */
  email: string | null
  address: string | null
  phone: string | null
  maps_link: string | null
  /** General / website contact email (hotel_details.contact_email). Optional. */
  contact_email: string | null
  website: string | null
  checkin_time: string | null   // HH:MM
  checkout_time: string | null  // HH:MM
  /** IANA timezone string (hotel_details.timezone). When null, falls back to
   *  the operator's timezone at send-time on the API. */
  timezone: string | null
  // True when locations.email is NULL — a hotel that can't receive booking
  // confirmations. Surfaced as a per-row error in the dashboard.
  missing_email: boolean
  created_at: string
  updated_at: string
}

const emailShape = (msg: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: msg,
    })

const timeShape = () =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), {
      message: 'Use HH:MM format.',
    })

// email + address + phone are REQUIRED; maps_link, website, contact_email,
// checkin_time, checkout_time, timezone are optional (allow ''/null).
// The email regex mirrors the API's HotelIn validator exactly so the form
// rejects the same shapes the server would 422 on.
export const hotelFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z
    .string()
    .trim()
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'Enter a valid email address.',
    }),
  address: z.string().trim().min(1, 'Address is required.'),
  phone: z.string().trim().min(1, 'Phone is required.'),
  maps_link: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\//.test(v), {
      message: 'Maps link must start with http(s)://',
    }),
  website: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\//.test(v), {
      message: 'Website must start with http(s)://',
    }),
  contact_email: emailShape('Enter a valid email address.'),
  checkin_time: timeShape(),
  checkout_time: timeShape(),
  timezone: z.string().trim(),
})

export type HotelFormValues = z.infer<typeof hotelFormSchema>

export async function fetchHotels(operatorId: string): Promise<Hotel[]> {
  return api<Hotel[]>('GET', `/api/staff/operators/${operatorId}/hotels`)
}

export async function createHotel(
  operatorId: string,
  body: HotelFormValues,
): Promise<Hotel> {
  return api<Hotel>('POST', `/api/staff/operators/${operatorId}/hotels`, body)
}

export async function updateHotel(
  operatorId: string,
  hotelId: string,
  body: Partial<HotelFormValues>,
): Promise<Hotel> {
  return api<Hotel>(
    'PATCH',
    `/api/staff/operators/${operatorId}/hotels/${hotelId}`,
    body,
  )
}

export async function deleteHotel(
  operatorId: string,
  hotelId: string,
): Promise<void> {
  await api<void>('DELETE', `/api/staff/operators/${operatorId}/hotels/${hotelId}`)
}

// ── Google Places autofill ────────────────────────────────────────────────────
// Uses the backend proxy so the API key never reaches the browser.
// When the key is not configured the API returns HTTP 503 with
// { configured: false, detail: "..." }; callers receive PlacesNotConfigured.

export type PlacePrediction = {
  placeId: string
  mainText: string
  secondaryText: string
}

export type PlaceDetails = {
  name: string
  address: string | null
  phone: string | null
  website: string | null
  mapsLink: string | null
  /** IANA timezone string derived from lat/lng via tzlookup, or null. */
  timezone: string | null
}

/** One result from the Places Text Search (POST /v1/places:searchText).
 *  Carries everything needed to pre-fill the hotel form in a single API call
 *  — no second "details" round-trip required. */
export type PlaceSearchResult = {
  placeId: string
  name: string
  address: string | null
  phone: string | null
  website: string | null
  mapsLink: string | null
  timezone: string | null
}

/** Thrown when the backend reports { configured: false }. */
export class PlacesNotConfiguredError extends Error {
  constructor() {
    super('Google Places lookup is not configured.')
    this.name = 'PlacesNotConfiguredError'
  }
}

type AutocompleteRaw = {
  configured?: false
  detail?: string
  suggestions?: PlacePrediction[]
}

type DetailsRaw = {
  configured?: false
  detail?: string
} & Partial<PlaceDetails>

// api() throws on any non-2xx BEFORE exposing the body, so the backend's real
// HTTP 503 {configured:false, detail:"...not configured"} arrives as a plain
// Error carrying that detail. Translate it to the typed not-configured signal
// so the Hotels form degrades to the quiet hint instead of failing silently.
// (The data.configured===false checks below only fire on a 200 body, which the
// backend never returns — kept as belt-and-suspenders.)
async function placesApi<T>(method: 'GET', path: string): Promise<T> {
  try {
    return await api<T>(method, path)
  } catch (err) {
    if (err instanceof Error && /not configured/i.test(err.message)) {
      throw new PlacesNotConfiguredError()
    }
    throw err
  }
}

export async function fetchPlaceAutocomplete(
  operatorId: string,
  query: string,
  sessionToken: string,
): Promise<PlacePrediction[]> {
  const params = new URLSearchParams({ q: query, session_token: sessionToken })
  const data = await placesApi<AutocompleteRaw>(
    'GET',
    `/api/staff/operators/${operatorId}/hotel-places/autocomplete?${params}`,
  )
  if (data.configured === false) throw new PlacesNotConfiguredError()
  return data.suggestions ?? []
}

export async function fetchPlaceDetails(
  operatorId: string,
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails> {
  const params = new URLSearchParams({ session_token: sessionToken })
  const data = await placesApi<DetailsRaw>(
    'GET',
    `/api/staff/operators/${operatorId}/hotel-places/details/${encodeURIComponent(placeId)}?${params}`,
  )
  if (data.configured === false) throw new PlacesNotConfiguredError()
  return {
    name: data.name ?? '',
    address: data.address ?? null,
    phone: data.phone ?? null,
    website: data.website ?? null,
    mapsLink: data.mapsLink ?? null,
    timezone: data.timezone ?? null,
  }
}

// Raw shape returned by GET /hotel-places/search
type SearchRaw = {
  configured?: false
  detail?: string
  results?: Array<{
    place_id: string
    name: string
    address: string | null
    phone: string | null
    website: string | null
    maps_link: string | null
    timezone: string | null
  }>
}

/** One-shot text search: fires on ENTER, returns up to 10 results.
 *  No session token — a single billable request replaces per-keystroke calls. */
export async function fetchHotelPlaceSearch(
  operatorId: string,
  query: string,
): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({ q: query })
  const data = await placesApi<SearchRaw>(
    'GET',
    `/api/staff/operators/${operatorId}/hotel-places/search?${params}`,
  )
  if (data.configured === false) throw new PlacesNotConfiguredError()
  return (data.results ?? []).map((r) => ({
    placeId: r.place_id,
    name: r.name,
    address: r.address,
    phone: r.phone,
    website: r.website,
    mapsLink: r.maps_link,
    timezone: r.timezone,
  }))
}
