// landr-r87i — server-side default booking-checklist template.
//
// Operators curate their own seed item list (Settings -> Operations)
// instead of consuming the hardcoded landr-84n1 defaults. Per-booking
// done flags + custom items stay in localStorage v1; only the template
// moves to Postgres (operator_checklist_templates table). See
// landr-api/app/routers/staff_operator_checklist_template.py for the
// endpoint shape and auto-seed behaviour.

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { api } from '@/lib/api-client'
import type { ChecklistTemplateItem } from '@/lib/booking-checklist'

export const ChecklistTemplateItemSchema = z.object({
  // Server uses `key` as the stable id; the booking-checklist hook uses
  // `id` (matches the localStorage shape from v1). We rename on the wire
  // boundary so the rest of the dashboard stays in the `{id, label}`
  // vocabulary.
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  order: z.number().int().nonnegative(),
})
export type ChecklistTemplateItemWire = z.infer<typeof ChecklistTemplateItemSchema>

export const ChecklistTemplateSchema = z.object({
  items: z.array(ChecklistTemplateItemSchema),
})
export type ChecklistTemplate = z.infer<typeof ChecklistTemplateSchema>

export const CHECKLIST_TEMPLATE_QUERY_KEY = (operatorId: string) =>
  ['checklist-template', operatorId] as const

export async function fetchChecklistTemplate(
  operatorId: string,
): Promise<ChecklistTemplate> {
  const raw = await api<ChecklistTemplate>(
    'GET',
    `/api/staff/operators/${operatorId}/checklist-template`,
  )
  return ChecklistTemplateSchema.parse(raw)
}

export async function putChecklistTemplate(
  operatorId: string,
  items: ChecklistTemplateItemWire[],
): Promise<ChecklistTemplate> {
  const raw = await api<ChecklistTemplate>(
    'PUT',
    `/api/staff/operators/${operatorId}/checklist-template`,
    { items },
  )
  return ChecklistTemplateSchema.parse(raw)
}

/** Convert the wire shape to the `{id, label}` shape useBookingChecklist
 *  consumes. Sorts by `order` ascending so the dashboard renders the
 *  same sequence the operator configured. */
export function wireItemsToTemplate(
  items: ChecklistTemplateItemWire[],
): ChecklistTemplateItem[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((i) => ({ id: i.key, label: i.label }))
}

/**
 * React Query hook for the operator's checklist template. Returns the
 * `{id, label}[]` shape the BookingChecklist hook wants. When the query
 * is loading or errored, callers can fall back to DEFAULT_CHECKLIST_ITEMS
 * — done flags survive the swap because v1 default keys match v2 server
 * defaults.
 *
 * `staleTime` is generous (5 min): the template rarely changes; the
 * Settings editor explicitly invalidates the query on save via
 * `useInvalidateChecklistTemplate`.
 */
export function useChecklistTemplate(operatorId: string | null) {
  return useQuery({
    queryKey: operatorId
      ? CHECKLIST_TEMPLATE_QUERY_KEY(operatorId)
      : ['checklist-template', 'no-op'],
    queryFn: () => fetchChecklistTemplate(operatorId as string),
    enabled: !!operatorId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useInvalidateChecklistTemplate() {
  const qc = useQueryClient()
  return (operatorId: string) =>
    qc.invalidateQueries({ queryKey: CHECKLIST_TEMPLATE_QUERY_KEY(operatorId) })
}
