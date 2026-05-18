import { z } from 'zod'
import { supabase } from '@/lib/supabase'

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
  fixture: Record<string, unknown>
}

export const templateFormSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200),
  body_html: z.string().min(1, 'HTML body is required'),
  body_text: z.string().optional(),
})

export type TemplateFormValues = z.infer<typeof templateFormSchema>

async function authHeaders(): Promise<{ Authorization: string; 'Content-Type': string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
}

export async function fetchTemplates(operatorId: string): Promise<EmailTemplate[]> {
  const headers = await authHeaders()
  const res = await fetch(`${apiBase()}/api/staff/operators/${operatorId}/email-templates`, {
    headers,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<EmailTemplate[]>
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
  const headers = await authHeaders()
  const res = await fetch(`${apiBase()}/api/staff/operators/${operatorId}/email-templates`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ active: true, ...payload }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<EmailTemplate>
}

export async function updateTemplate(
  operatorId: string,
  templateId: string,
  payload: { subject?: string; body_html?: string; body_text?: string; active?: boolean },
): Promise<EmailTemplate> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/email-templates/${templateId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<EmailTemplate>
}

export async function deleteTemplate(
  operatorId: string,
  templateId: string,
): Promise<void> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/email-templates/${templateId}`,
    {
      method: 'DELETE',
      headers,
    },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
}

export async function previewTemplate(
  operatorId: string,
  templateId: string,
): Promise<PreviewResult> {
  const headers = await authHeaders()
  const res = await fetch(
    `${apiBase()}/api/staff/operators/${operatorId}/email-templates/${templateId}/preview`,
    {
      method: 'POST',
      headers,
    },
  )
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(
      (detail as { detail?: string }).detail ?? `HTTP ${res.status}`,
    )
  }
  return res.json() as Promise<PreviewResult>
}
