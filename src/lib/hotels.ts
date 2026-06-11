// landr-cyoi — Hotels as a first-class settings entity, separate from the
// generic pickup-locations editor. A hotel is still a `locations` row with
// role_type.code='hotel' under the hood, but it carries a sidecar of
// required contact details (address/email/phone) plus an optional Google
// Maps link. Kept in its own module (not locations.ts) so the basic-location
// types/schema stay lean.
import { z } from 'zod'
import { api } from '@/lib/api-client'

export type Hotel = {
  id: string
  name: string
  email: string | null
  address: string | null
  phone: string | null
  maps_link: string | null
  // True when locations.email is NULL — a hotel that can't receive booking
  // confirmations. Surfaced as a per-row error in the dashboard.
  missing_email: boolean
  created_at: string
  updated_at: string
}

// email + address + phone are REQUIRED; maps_link is optional (allow '').
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
