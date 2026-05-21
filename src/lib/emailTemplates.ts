import { z } from 'zod'
import { api } from '@/lib/api-client'

export const TEMPLATE_KINDS = [
  'booking_received',
  'hotel_request',
  'booking_confirmation',
] as const

export const OPERATOR_LOCALES = ['de', 'en'] as const

export type TemplateKind = (typeof TEMPLATE_KINDS)[number]
export type OperatorLocale = (typeof OPERATOR_LOCALES)[number]

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
