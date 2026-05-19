import { z } from 'zod'
import { supabase } from '@/lib/supabase'

export const TaxIdKindSchema = z.enum(['es_nif', 'es_cif', 'de_ust_idnr', 'uk_vat', 'fr_siren', 'generic_eu_vat', 'other'])
export type TaxIdKind = z.infer<typeof TaxIdKindSchema>
export const TAX_ID_KIND_LABELS: Record<TaxIdKind, string> = {
  es_nif: 'ES NIF (individual)',
  es_cif: 'ES CIF (company)',
  de_ust_idnr: 'DE USt-IdNr.',
  uk_vat: 'UK VAT',
  fr_siren: 'FR SIREN',
  generic_eu_vat: 'EU VAT (other)',
  other: 'Other',
}

export const OperatorSettingsSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Company name is required.'),
  legal_name: z.string().nullable().optional(),
  slug: z.string(),
  tax_id: z.string().nullable().optional(),
  tax_id_kind: TaxIdKindSchema.nullable().optional(),
  phone: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().length(2, 'Must be ISO-3166 alpha-2 (e.g. DE).').nullable().optional(),
  timezone: z.string().nullable().optional(),
  default_locale: z.string().nullable().optional(),
  onboarded_at: z.string().nullable().optional(),
})

export type OperatorSettings = z.infer<typeof OperatorSettingsSchema>

export const OperatorPatchSchema = OperatorSettingsSchema.omit({ id: true, slug: true }).partial()
export type OperatorPatch = z.infer<typeof OperatorPatchSchema>

export const GmailStatusSchema = z.object({
  connected: z.boolean(),
  email_address: z.string().nullable().optional(),
  connected_at: z.string().nullable().optional(),
  last_send_at: z.string().nullable().optional(),
})
export type GmailStatus = z.infer<typeof GmailStatusSchema>

async function getBearerToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}

const apiBase = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export async function fetchOperator(operatorId: string): Promise<OperatorSettings> {
  const token = await getBearerToken()
  const res = await fetch(`${apiBase()}/api/staff/operators/${operatorId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: { error?: string } }).detail?.error ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<OperatorSettings>
}

export async function patchOperator(
  operatorId: string,
  patch: OperatorPatch,
): Promise<OperatorSettings> {
  const token = await getBearerToken()
  const res = await fetch(`${apiBase()}/api/staff/operators/${operatorId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: { error?: string } }).detail?.error ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<OperatorSettings>
}

export async function fetchGmailStatus(operatorId: string): Promise<GmailStatus> {
  const token = await getBearerToken()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/integrations/gmail`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: { error?: string } }).detail?.error ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<GmailStatus>
}

export async function fetchGmailInstallUrl(
  operatorId: string,
): Promise<{ install_url: string; state: string }> {
  const token = await getBearerToken()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/integrations/gmail/install`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: { error?: string } }).detail?.error ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<{ install_url: string; state: string }>
}

export async function markOnboarded(
  operatorId: string,
): Promise<OperatorSettings> {
  return patchOperator(operatorId, { onboarded_at: new Date().toISOString() })
}

export async function disconnectGmail(operatorId: string): Promise<void> {
  const token = await getBearerToken()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/integrations/gmail`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok && res.status !== 204) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: { error?: string } }).detail?.error ?? `HTTP ${res.status}`,
    )
  }
}
