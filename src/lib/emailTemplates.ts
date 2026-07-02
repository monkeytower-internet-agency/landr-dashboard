import { z } from 'zod'
import { api } from '@/lib/api-client'

export const TEMPLATE_KINDS = [
  'booking_received',
  'hotel_request',
  'hotel_confirmation',
  'booking_confirmation',
] as const

export const OPERATOR_LOCALES = ['de', 'en', 'es'] as const

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]
export type OperatorLocale = (typeof OPERATOR_LOCALES)[number]

// landr-x5o5.6: hotel-facing kinds are always sent in the operator's
// hotel_email_locale regardless of customer language. The locale switcher
// is hidden for these kinds; only the pinned hotel locale is ever used.
// landr-x5o5.7 surfaced hotel_email_locale in the dashboard API; the
// EmailTemplates route reads it directly, falling back to
// operators.default_locale (from fetchOperator) and then to the neutral
// 'en' default (landr-c53m.7 — never a single hardcoded operator locale).
export const HOTEL_KINDS: ReadonlySet<TemplateKind> = new Set([
  'hotel_request',
  'hotel_confirmation',
] as const)

/** Returns true when the given kind is hotel-facing (locale is pinned). */
export function isHotelKind(kind: TemplateKind): boolean {
  return HOTEL_KINDS.has(kind)
}

export type EmailTemplate = {
  id: string
  operator_id: string
  template_kind: string
  locale: string
  subject: string
  body_html: string
  body_text: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type PreviewResult = {
  template_kind: string
  locale: string
  subject: string
  body_html: string
  body_text: string | null
  // landr-tq6j: preview endpoint runs the same Jinja2 engine as the
  // sender. A missing/invalid variable surfaces here as a string the
  // dashboard renders inline so operators see the failure before send
  // time. Still arrives with status 200.
  render_error: string | null
  fixture: {
    note?: string
    // landr-tq6j: the sample context the preview rendered against.
    // The dashboard surfaces these keys as the variable catalog so
    // template authors stop guessing names.
    context?: Record<string, unknown>
  } & Record<string, unknown>
}

export const templateFormSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200),
  body_html: z.string().min(1, 'HTML body is required'),
  body_text: z.string().optional(),
})

export type TemplateFormValues = z.infer<typeof templateFormSchema>

export async function fetchTemplates(operatorId: string): Promise<EmailTemplate[]> {
  return api<EmailTemplate[]>('GET', `/api/staff/operators/${operatorId}/email-templates`)
}

export async function createTemplate(
  operatorId: string,
  payload: {
    template_kind: string
    locale: string
    subject: string
    body_html: string
    body_text: string
    active?: boolean
  },
): Promise<EmailTemplate> {
  return api<EmailTemplate>(
    'POST',
    `/api/staff/operators/${operatorId}/email-templates`,
    { active: true, ...payload },
  )
}

export async function updateTemplate(
  operatorId: string,
  templateId: string,
  payload: { subject?: string; body_html?: string; body_text?: string; active?: boolean },
): Promise<EmailTemplate> {
  return api<EmailTemplate>(
    'PATCH',
    `/api/staff/operators/${operatorId}/email-templates/${templateId}`,
    payload,
  )
}

export async function deleteTemplate(
  operatorId: string,
  templateId: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `/api/staff/operators/${operatorId}/email-templates/${templateId}`,
  )
}

export async function previewTemplate(
  operatorId: string,
  templateId: string,
): Promise<PreviewResult> {
  // POST with no body — keep the JSON content-type behavior by passing {}.
  return api<PreviewResult>(
    'POST',
    `/api/staff/operators/${operatorId}/email-templates/${templateId}/preview`,
    {},
  )
}

// landr-x5o5.4: effective-template endpoint — resolves the operator row if it
// exists, otherwise falls back to the Landr system default.
export type EffectiveTemplate = {
  kind: string
  locale: string
  subject: string
  body_html: string
  body_text: string | null
  /** true → content is the Landr default (no operator row); false → operator has a custom row */
  is_default: boolean
  /** e.g. "system_template" or "operator_template" */
  source: string
}

export async function fetchEffective(
  operatorId: string,
  kind: string,
  locale: string,
): Promise<EffectiveTemplate> {
  return api<EffectiveTemplate>(
    'GET',
    `/api/staff/operators/${operatorId}/email-templates/effective?kind=${encodeURIComponent(kind)}&locale=${encodeURIComponent(locale)}`,
  )
}

// landr-x5o5.5: per-kind variable catalog — independent of saved templates.
export type VariableCatalogEntry = {
  name: string
  sample: unknown
  description: string
}

export type VariableCatalogResult = {
  kind: string
  variables: VariableCatalogEntry[]
}

export async function fetchVariables(
  operatorId: string,
  kind: string,
): Promise<VariableCatalogResult> {
  return api<VariableCatalogResult>(
    'GET',
    `/api/staff/operators/${operatorId}/email-templates/variables?kind=${encodeURIComponent(kind)}`,
  )
}
