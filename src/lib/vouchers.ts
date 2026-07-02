/**
 * Operator-scoped voucher CRUD wrappers + form validation (landr-v198).
 *
 * Backs Settings → Vouchers. The voucher *editor* writes go through the
 * FastAPI staff_vouchers router (operator-scoped, per-operator code
 * uniqueness surfaced as a clean 409, code uppercasing enforced server-
 * side). This is separate from `vouchers-analytics.ts`, which reads the
 * same table directly via Supabase REST for the analytics performance
 * card — keep the two files distinct: analytics is a read projection,
 * this is the management CRUD surface.
 *
 * Write routing (per CLAUDE.md write-routing convention): voucher CRUD is
 * a plain row write the audit + RLS triggers already cover, so it *could*
 * go either way. We funnel through FastAPI because the per-operator code
 * unique index makes a 409 nicer with a server-side catch (PostgREST
 * surfaces unique violations as opaque errors) and because the uppercase
 * normalisation is owned by the router.
 */

import { api } from '@/lib/api-client'

export type VoucherKind = 'percent' | 'flat'
export type VoucherScope = 'booking' | 'subscription' | 'any'

/** A voucher row as returned by the staff router (used_count included).
 *
 * NOTE (landr-c53m.5): the `vouchers` table also has
 * `applies_to_product_id` (FK products, engine-checked in
 * pricing.py's voucher-applicability gate) and `campaign_id` (FK
 * campaigns, attribution-only — not currently engine-checked at
 * redemption time). Neither is exposed here because
 * `staff_vouchers.py`'s VoucherIn/VoucherPatch models don't declare
 * them yet, so a POST/PATCH sending them would have the values
 * silently dropped (pydantic v2 default `extra="ignore"`) and GET
 * never round-trips them. Shipping a picker against those two fields
 * without the API change first would look like it works but silently
 * not scope the voucher — worse than no UI. Tracked as a blocker on
 * landr-api: landr-u3jr (blocks this ticket, landr-c53m.5). Once
 * landr-u3jr lands, add `applies_to_product_id: string | null` and
 * `campaign_id: string | null` here + to VoucherInput/VoucherPatch
 * below, and wire a product picker (mirror SimulateDialog.tsx's
 * fetchProducts NativeSelect) + a campaign picker (mirror
 * fetchCampaigns in campaigns.ts) into VouchersSettings.tsx's
 * VoucherDialog.
 */
export type Voucher = {
  id: string
  operator_id: string
  code: string
  kind: VoucherKind
  /** percent: 10.00 = 10%; flat: currency-units. */
  amount: number | string
  currency: string
  max_uses: number | null
  used_count: number
  valid_from: string | null
  valid_until: string | null
  scope: VoucherScope
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

/** Create payload. `code` is uppercased server-side; we also uppercase in
 *  the form so the operator sees what they'll get. */
export type VoucherInput = {
  code: string
  kind: VoucherKind
  amount: number
  currency?: string
  max_uses?: number | null
  valid_from?: string | null
  valid_until?: string | null
  scope?: VoucherScope
  description?: string | null
  active?: boolean
}

/** Partial edit. used_count is intentionally absent — read-only here. */
export type VoucherPatch = Partial<VoucherInput>

export const VOUCHER_SCOPES: readonly VoucherScope[] = [
  'booking',
  'subscription',
  'any',
]

// ---- CRUD ------------------------------------------------------------

/** List live vouchers for an operator (soft-deleted rows excluded server-
 *  side), newest first, with their used_count. */
export async function fetchVouchers(operatorId: string): Promise<Voucher[]> {
  return await api<Voucher[]>(
    'GET',
    `/api/staff/operators/${operatorId}/vouchers`,
  )
}

/** Create a voucher. Throws if the code is already taken on this operator. */
export async function createVoucher(
  operatorId: string,
  input: VoucherInput,
): Promise<Voucher> {
  return await api<Voucher>(
    'POST',
    `/api/staff/operators/${operatorId}/vouchers`,
    input,
  )
}

export async function patchVoucher(
  operatorId: string,
  voucherId: string,
  patch: VoucherPatch,
): Promise<Voucher> {
  return await api<Voucher>(
    'PATCH',
    `/api/staff/operators/${operatorId}/vouchers/${voucherId}`,
    patch,
  )
}

/** Soft-delete (deactivate) a voucher. The row stays for audit + analytics
 *  and historical booking references; the code frees up for re-use. */
export async function deleteVoucher(
  operatorId: string,
  voucherId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/vouchers/${voucherId}`,
  )
}

// ---- form validation -------------------------------------------------
//
// Pulled out as pure functions so the dialog + unit tests share one
// source of truth. Mirrors the server-side rules in staff_vouchers.py
// (amount > 0, percent <= 100, valid_until > valid_from) so the form
// fails fast before the round-trip.

export type VoucherFormValues = {
  code: string
  kind: VoucherKind
  /** Raw string from the <input type="number">. Empty = not yet entered. */
  amount: string
  max_uses: string
  valid_from: string
  valid_until: string
  scope: VoucherScope
  description: string
  active: boolean
}

export type VoucherFieldErrors = Partial<
  Record<'code' | 'amount' | 'max_uses' | 'valid_until', string>
>

/** Validate the dialog form. Returns a (possibly empty) field-error map.
 *  An empty map means the form is submittable. Keep the messages short —
 *  they render inline under each field. */
export function validateVoucherForm(
  values: VoucherFormValues,
): VoucherFieldErrors {
  const errors: VoucherFieldErrors = {}

  if (values.code.trim().length === 0) {
    errors.code = 'Code is required.'
  }

  const amount = Number(values.amount)
  if (values.amount.trim() === '' || Number.isNaN(amount)) {
    errors.amount = 'Amount is required.'
  } else if (amount <= 0) {
    errors.amount = 'Amount must be greater than 0.'
  } else if (values.kind === 'percent' && amount > 100) {
    errors.amount = 'A percentage cannot exceed 100.'
  }

  if (values.max_uses.trim() !== '') {
    const maxUses = Number(values.max_uses)
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      errors.max_uses = 'Max uses must be a positive whole number.'
    }
  }

  if (
    values.valid_from.trim() !== '' &&
    values.valid_until.trim() !== '' &&
    new Date(values.valid_until) <= new Date(values.valid_from)
  ) {
    errors.valid_until = 'End must be after start.'
  }

  return errors
}

/** Marshal the form into the API payload, applying the same normalisation
 *  the server does (uppercase code, numeric coercion, null-empty). */
export function formToInput(values: VoucherFormValues): VoucherInput {
  return {
    code: values.code.trim().toUpperCase(),
    kind: values.kind,
    amount: Number(values.amount),
    max_uses: values.max_uses.trim() === '' ? null : Number(values.max_uses),
    valid_from:
      values.valid_from.trim() === '' ? null : isoFromLocal(values.valid_from),
    valid_until:
      values.valid_until.trim() === ''
        ? null
        : isoFromLocal(values.valid_until),
    scope: values.scope,
    description:
      values.description.trim() === '' ? null : values.description.trim(),
    active: values.active,
  }
}

/** A `datetime-local` value is a wall-clock string with no timezone. Turn
 *  it into a full ISO timestamp so the server stores an unambiguous
 *  instant. `new Date(local)` interprets it in the browser's zone, which
 *  is what the operator means when they pick "starts 1 June 09:00". */
export function isoFromLocal(local: string): string {
  return new Date(local).toISOString()
}

/** Inverse of {@link isoFromLocal} for prefilling the edit dialog: turn a
 *  stored ISO timestamp into a `datetime-local`-compatible string in the
 *  browser's zone. Empty string for null/invalid. */
export function localFromIso(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Offset to local wall-clock, then slice off seconds + the Z.
  const tzOffsetMs = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16)
}

/** Human-friendly amount label for the table: "10%" or "€50". Falls back
 *  to the bare number for unknown currencies. */
export function formatVoucherAmount(voucher: Voucher): string {
  const amount = Number(voucher.amount)
  if (voucher.kind === 'percent') return `${amount}%`
  const symbol =
    voucher.currency === 'EUR'
      ? '€'
      : voucher.currency === 'USD'
        ? '$'
        : voucher.currency === 'GBP'
          ? '£'
          : `${voucher.currency} `
  return `${symbol}${amount}`
}

/** "3 / 100" or "3 / ∞" for the usage column. */
export function formatUsage(voucher: Voucher): string {
  return `${voucher.used_count} / ${voucher.max_uses ?? '∞'}`
}
