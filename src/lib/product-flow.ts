// landr-71kz.7 — product_flow_modules CRUD helpers.
//
// Writes go directly to Supabase REST (hybrid write-routing rule: plain row
// writes with no server-side side effects).  The UNIQUE(product_id, position)
// constraint is DEFERRABLE INITIALLY DEFERRED, so a multi-row batch executed
// in a single client request is safe — Postgres checks uniqueness only at
// transaction commit, not mid-batch.  We rely on Supabase's implicit
// transaction on each REST call; for a reorder we upsert all rows at once.

import { supabase } from '@/lib/supabase'

export type ModuleKind =
  | 'selection'
  | 'participants'
  | 'accommodation'
  | 'service_addons'
  | 'pickup'
  | 'custom_form'

export const MODULE_KIND_LABELS: Record<ModuleKind, string> = {
  selection: 'Date & time selection',
  participants: 'Participants',
  accommodation: 'Accommodation',
  service_addons: 'Service add-ons',
  pickup: 'Pickup location',
  custom_form: 'Custom form',
}

/** All non-custom module kinds that can be inserted as standard steps. */
export const STANDARD_KINDS: Exclude<ModuleKind, 'custom_form'>[] = [
  'selection',
  'participants',
  'accommodation',
  'service_addons',
  'pickup',
]

export type FlowModule = {
  id: string
  product_id: string
  module_kind: ModuleKind
  /** null for non-custom_form modules */
  form_id: string | null
  position: number
}

export type FormRef = {
  id: string
  name: string
  key: string
}

// ── Fetch ──────────────────────────────────────────────────────────────────

export async function fetchFlowModules(productId: string): Promise<FlowModule[]> {
  const { data, error } = await supabase
    .from('product_flow_modules')
    .select('id, product_id, module_kind, form_id, position')
    .eq('product_id', productId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as FlowModule[]
}

export async function fetchOperatorForms(operatorId: string): Promise<FormRef[]> {
  const { data, error } = await supabase
    .from('forms')
    .select('id, name, key')
    .eq('operator_id', operatorId)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as FormRef[]
}

// ── Write ──────────────────────────────────────────────────────────────────

/**
 * Insert a new module at the given position.
 */
export async function insertFlowModule(
  productId: string,
  moduleKind: ModuleKind,
  position: number,
  operatorId: string,
  formId?: string,
): Promise<FlowModule> {
  // operator_id is NOT NULL on product_flow_modules AND the apply_tenant_rls
  // INSERT policy checks is_tenant_visible(operator_id) — omitting it fails the
  // write (NOT NULL violation / RLS). Mirror forms.ts which threads operatorId.
  const { data, error } = await supabase
    .from('product_flow_modules')
    .insert({
      operator_id: operatorId,
      product_id: productId,
      module_kind: moduleKind,
      position,
      form_id: formId ?? null,
    })
    .select('id, product_id, module_kind, form_id, position')
    .single()
  if (error) throw new Error(error.message)
  return data as FlowModule
}

/**
 * Reorder: upsert all modules with their new positions in one batch.
 * Uses the DEFERRABLE constraint safety — all rows for the product are
 * written in one REST call (Supabase wraps the upsert in a transaction).
 */
export async function upsertFlowModulePositions(
  modules: Pick<FlowModule, 'id' | 'product_id' | 'module_kind' | 'form_id' | 'position'>[],
  operatorId: string,
): Promise<void> {
  if (modules.length === 0) return
  // PostgREST upsert is INSERT ... ON CONFLICT, so each row's VALUES must carry
  // operator_id (NOT NULL + RLS WITH CHECK) or the write fails before conflict
  // resolution.
  const { error } = await supabase
    .from('product_flow_modules')
    .upsert(
      modules.map((m) => ({
        id: m.id,
        operator_id: operatorId,
        product_id: m.product_id,
        module_kind: m.module_kind,
        form_id: m.form_id,
        position: m.position,
      })),
      { onConflict: 'id' },
    )
  if (error) throw new Error(error.message)
}

/**
 * Delete a single module by id.
 *
 * Scoped by operator_id in addition to id — belt-and-suspenders parity with
 * the module's other writes (insert/upsert above), which all thread
 * operatorId, so a delete never relies solely on RLS.
 */
export async function deleteFlowModule(
  id: string,
  operatorId: string,
): Promise<void> {
  const { error } = await supabase
    .from('product_flow_modules')
    .delete()
    .eq('id', id)
    .eq('operator_id', operatorId)
  if (error) throw new Error(error.message)
}
