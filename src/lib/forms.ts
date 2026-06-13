/**
 * Operator-scoped form library CRUD (landr-71kz.5).
 *
 * Backs Settings → Forms. Write routing per CLAUDE.md hybrid convention:
 * forms CRUD is a plain row write with RLS + audit triggers already
 * covering side effects (no pricing recompute, no email send, no
 * cross-table orchestration) → direct Supabase REST. Retire is a soft
 * deactivation (active = false) per the no-deleted_at rule on form-builder
 * tables.
 */

import { supabase } from '@/lib/supabase'

/** A row from the `forms` table. */
export type Form = {
  id: string
  operator_id: string
  /** Machine-readable slug — UNIQUE(operator_id, key). */
  key: string
  /** Human display name. */
  name: string
  /** Localised names: { "es": "Formulario de declaraciones", … } */
  name_localized: Record<string, string> | null
  /** Bumped on field changes so manifests can detect stale snapshots. */
  version: number
  active: boolean
  created_at: string
  updated_at: string
}

export type FormInput = {
  key: string
  name: string
  name_localized?: Record<string, string> | null
  active?: boolean
}

export type FormPatch = {
  name?: string
  name_localized?: Record<string, string> | null
  active?: boolean
}

const FORM_SELECT = 'id, operator_id, key, name, name_localized, version, active, created_at, updated_at'

/** List all forms for an operator, newest first. Includes both active and
 *  retired (active=false) so operators can restore them. */
export async function fetchForms(operatorId: string): Promise<Form[]> {
  const { data, error } = await supabase
    .from('forms')
    .select(FORM_SELECT)
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as Form[]
}

/** Create a new form. Throws on key collision (UNIQUE constraint). */
export async function createForm(
  operatorId: string,
  input: FormInput,
): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .insert({ ...input, operator_id: operatorId, active: input.active ?? true })
    .select(FORM_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as Form
}

/** Rename or patch a form. Does not bump version (field changes do that). */
export async function patchForm(
  operatorId: string,
  formId: string,
  patch: FormPatch,
): Promise<Form> {
  const { data, error } = await supabase
    .from('forms')
    .update(patch)
    .eq('id', formId)
    .eq('operator_id', operatorId)
    .select(FORM_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as Form
}

/** Retire a form (active = false). Does not hard-delete. */
export async function retireForm(
  operatorId: string,
  formId: string,
): Promise<Form> {
  return patchForm(operatorId, formId, { active: false })
}

/** Restore a previously retired form (active = true). */
export async function restoreForm(
  operatorId: string,
  formId: string,
): Promise<Form> {
  return patchForm(operatorId, formId, { active: true })
}

/** Convert a display name to a URL/DB key slug. Keeps only lowercase
 *  alphanumeric and underscores; collapses runs of invalid chars to a
 *  single underscore; strips leading/trailing underscores. */
export function nameToFormKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}
