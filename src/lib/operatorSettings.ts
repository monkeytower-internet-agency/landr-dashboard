import { z } from 'zod'
import { api } from '@/lib/api-client'

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

// landr-f1s — accept 'HH:mm' or 'HH:mm:ss' (Postgres time returns the latter
// via PostgREST). Normalization isn't needed — formatTime() accepts both.
const TimeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Must be HH:mm.')

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
  // landr-f1s — calendar display prefs.
  work_hours_start: TimeOfDaySchema.nullable().optional(),
  work_hours_end: TimeOfDaySchema.nullable().optional(),
  time_format_24h: z.boolean().nullable().optional(),
  // landr-c3t — premium-tease opt-in.
  show_premium_teasers: z.boolean().nullable().optional(),
  // landr-c3t — embedded subscription_package (read-only on Settings; the
  // GET returns it via PostgREST FK join). Drives the disabled-on UX for
  // free-tier operators so they can't opt out of teasers.
  package: z
    .object({
      slug: z.string(),
      name: z.string(),
      allowed_product_kinds: z.array(z.string()),
    })
    .nullable()
    .optional(),
})

export type OperatorSettings = z.infer<typeof OperatorSettingsSchema>

const OperatorPatchBaseSchema = OperatorSettingsSchema.omit({
  id: true,
  slug: true,
  // landr-c3t — package is a read-only PostgREST embed, never patched.
  package: true,
}).partial()

// landr-f1s — mirrors the API model_validator and the DB CHECK constraint
// operators_work_hours_chk. When BOTH endpoints are present in the same
// patch, end must be strictly greater than start. Single-sided patches
// defer to the DB constraint.
export const OperatorPatchSchema = OperatorPatchBaseSchema.refine(
  (data) => {
    if (!data.work_hours_start || !data.work_hours_end) return true
    return data.work_hours_end > data.work_hours_start
  },
  {
    message: 'Work hours end must be later than start.',
    path: ['work_hours_end'],
  },
)
export type OperatorPatch = z.infer<typeof OperatorPatchSchema>

export const GmailStatusSchema = z.object({
  connected: z.boolean(),
  email_address: z.string().nullable().optional(),
  connected_at: z.string().nullable().optional(),
  last_send_at: z.string().nullable().optional(),
})
export type GmailStatus = z.infer<typeof GmailStatusSchema>

export async function fetchOperator(operatorId: string): Promise<OperatorSettings> {
  return api<OperatorSettings>('GET', `/api/staff/operators/${operatorId}`)
}

export async function patchOperator(
  operatorId: string,
  patch: OperatorPatch,
): Promise<OperatorSettings> {
  return api<OperatorSettings>('PATCH', `/api/staff/operators/${operatorId}`, patch)
}

export async function fetchGmailStatus(operatorId: string): Promise<GmailStatus> {
  return api<GmailStatus>('GET', `/api/staff/operators/${operatorId}/integrations/gmail`)
}

export async function fetchGmailInstallUrl(
  operatorId: string,
): Promise<{ install_url: string; state: string }> {
  return api<{ install_url: string; state: string }>(
    'GET',
    `/api/staff/operators/${operatorId}/integrations/gmail/install`,
  )
}

export async function markOnboarded(
  operatorId: string,
): Promise<OperatorSettings> {
  return patchOperator(operatorId, { onboarded_at: new Date().toISOString() })
}

export async function disconnectGmail(operatorId: string): Promise<void> {
  await api<void>('DELETE', `/api/staff/operators/${operatorId}/integrations/gmail`)
}
