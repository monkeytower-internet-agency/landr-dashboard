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

// ── form_fields ─────────────────────────────────────────────────────────────

/** All legal field_type values (CHECK constraint mirrors this). */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multiselect'
  | 'language'

export const FIELD_TYPES: FieldType[] = [
  'text',
  'textarea',
  'number',
  'select',
  'radio',
  'checkbox',
  'multiselect',
  'language',
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  select: 'Dropdown',
  radio: 'Radio buttons',
  checkbox: 'Checkbox',
  multiselect: 'Multi-select',
  language: 'Language picker',
}

/** Option shape used in select / radio / multiselect fields. */
export type FieldOption = {
  value: string
  label: string
  label_localized: Record<string, string> | null
}

/** Typed validation envelope. Only the keys relevant to the field_type
 *  are populated; the rest are absent. */
export type FieldValidation = {
  min?: number
  max?: number
  min_length?: number
  max_length?: number
  pattern?: string
}

/** Single flat visibility rule (v1 — no nesting).
 *  `field_key` must be one of the PRECEDING fields in the same form. */
export type VisibilityRule = {
  field_key: string
  op: 'eq' | 'neq' | 'in' | 'truthy'
  value?: string | string[] | null
}

/** A row from the `form_fields` table. */
export type FormField = {
  id: string
  form_id: string
  key: string
  field_type: FieldType
  label: string
  label_localized: Record<string, string> | null
  help_text: string | null
  help_text_localized: Record<string, string> | null
  required: boolean
  position: number
  options: FieldOption[] | null
  validation: FieldValidation | null
  visibility_rule: VisibilityRule | null
  created_at: string
  updated_at: string
}

export type FormFieldInput = {
  key: string
  field_type: FieldType
  label: string
  label_localized?: Record<string, string> | null
  help_text?: string | null
  help_text_localized?: Record<string, string> | null
  required?: boolean
  position: number
  options?: FieldOption[] | null
  validation?: FieldValidation | null
  visibility_rule?: VisibilityRule | null
}

export type FormFieldPatch = Partial<
  Omit<FormFieldInput, 'key' | 'field_type'>
> & {
  /** key and field_type are immutable after creation. */
  label?: string
  label_localized?: Record<string, string> | null
  help_text?: string | null
  help_text_localized?: Record<string, string> | null
  required?: boolean
  position?: number
  options?: FieldOption[] | null
  validation?: FieldValidation | null
  visibility_rule?: VisibilityRule | null
}

const FIELD_SELECT = [
  'id',
  'form_id',
  'key',
  'field_type',
  'label',
  'label_localized',
  'help_text',
  'help_text_localized',
  'required',
  'position',
  'options',
  'validation',
  'visibility_rule',
  'created_at',
  'updated_at',
].join(', ')

/** Fetch all fields for a form, ordered by position. */
export async function fetchFormFields(formId: string): Promise<FormField[]> {
  const { data, error } = await supabase
    .from('form_fields')
    .select(FIELD_SELECT)
    .eq('form_id', formId)
    .order('position', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as FormField[]
}

/** Add a new field to a form. Bumps form version server-side via trigger. */
export async function createFormField(
  formId: string,
  input: FormFieldInput,
  operatorId: string,
): Promise<FormField> {
  // form_fields.operator_id is NOT NULL + tenant RLS WITH CHECK — must be set
  // (mirrors createForm). Omitting it fails every field insert.
  const { data, error } = await supabase
    .from('form_fields')
    .insert({ ...input, form_id: formId, operator_id: operatorId })
    .select(FIELD_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as FormField
}

/** Patch a form field (never key/field_type). Bumps form version server-side. */
export async function patchFormField(
  fieldId: string,
  patch: FormFieldPatch,
): Promise<FormField> {
  const { data, error } = await supabase
    .from('form_fields')
    .update(patch)
    .eq('id', fieldId)
    .select(FIELD_SELECT)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as FormField
}

/** Delete a form field. Bumps form version server-side. */
export async function deleteFormField(fieldId: string): Promise<void> {
  const { error } = await supabase
    .from('form_fields')
    .delete()
    .eq('id', fieldId)

  if (error) throw new Error(error.message)
}

/** Evaluate a single visibility rule against the current answer map.
 *  Returns true when the field should be VISIBLE. A null rule means always
 *  visible.
 *
 *  CANONICAL CONTRACT (landr-noyq) — this FormEditor PREVIEW evaluator must
 *  return the SAME boolean as the customer-facing widget
 *  (landr-booking-widget fieldVisibility.ts) and the server twin
 *  (landr-api form_responses.py is_field_visible). It previously diverged on:
 *    1. truthy of an EMPTY ARRAY: `Boolean([])` === true SHOWED the field;
 *       the widget/server use `length > 0` and HIDE it. Now `length > 0`.
 *    2. eq/neq/in against a LIST answer (checkbox/multiselect): the old
 *       `String([...]) === String(value)` was always-false; now MEMBERSHIP
 *       (value ∈ list), matching the widget/server.
 *    3. absent answers: `String(answer ?? '')` coerced an absent answer to ''
 *       (so eq against value '' matched). Now an absent answer matches nothing
 *       (eq hidden, neq visible) — the widget's behaviour, adopted as canonical.
 *    4. NULL rule value: matches nothing → eq hidden, neq visible.
 *  Whole-number-float values (e.g. 3.0) canonicalise natively in JS —
 *  `String(3.0) === "3"` — matching the answer string "3" (the server collapses
 *  N.0 floats explicitly in _canon; JS gets it for free). */
export function isFieldVisible(
  rule: VisibilityRule | null | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!rule || typeof rule !== 'object') return true
  const { field_key, op, value } = rule
  // Fail-open on a malformed rule (missing field_key / non-string op), mirroring
  // the widget/server — a bad config never silently hides a field.
  if (typeof field_key !== 'string' || !field_key) return true
  if (typeof op !== 'string') return true

  const answer = answers[field_key]

  switch (op) {
    case 'truthy': {
      // JS Boolean() semantics, EXCEPT an empty array is falsy (hidden) — a
      // non-empty string (incl. whitespace-only) is truthy.
      if (answer === undefined || answer === null) return false
      if (Array.isArray(answer)) return answer.length > 0
      return Boolean(answer)
    }
    case 'eq': {
      if (value == null) return false // null rule value matches nothing
      if (Array.isArray(answer)) {
        // List answer → membership.
        return answer.some((a) => String(a) === String(value))
      }
      if (answer === undefined || answer === null) return false
      return String(answer) === String(value)
    }
    case 'neq': {
      if (value == null) return true // null rule value ≠ everything → visible
      if (Array.isArray(answer)) {
        // List answer → NOT-member.
        return !answer.some((a) => String(a) === String(value))
      }
      if (answer === undefined || answer === null) return true // absent ≠ anything
      return String(answer) !== String(value)
    }
    case 'in': {
      // `value` must be an array; fail-open if not (matches widget/server).
      if (!Array.isArray(value)) return true
      const vals = value.map((v) => String(v))
      if (Array.isArray(answer)) {
        // List answer → any intersection → visible.
        return answer.some((a) => vals.includes(String(a)))
      }
      if (answer === undefined || answer === null) return false
      return vals.includes(String(answer))
    }
    default:
      return true
  }
}
