/**
 * Regression guard (review finding landr — Epic A form-builder DOA): every
 * form-builder write MUST carry operator_id. forms/form_fields/
 * product_flow_modules all have `operator_id uuid NOT NULL` + apply_tenant_rls
 * (INSERT policy WITH CHECK is_tenant_visible(operator_id)). The helpers
 * originally omitted it, so every Add / Add-field / Add-form / reorder threw a
 * NOT NULL / RLS violation and the feature was 100% non-functional. These tests
 * pin operator_id into the insert/upsert payloads so the regression can't recur.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { state } = vi.hoisted(() => ({ state: { captured: {} as Record<string, unknown> } }))

vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {}
  builder.insert = vi.fn((payload: unknown) => {
    state.captured.insert = payload
    return builder
  })
  builder.upsert = vi.fn((rows: unknown, opts: unknown) => {
    state.captured.upsert = rows
    state.captured.upsertOpts = opts
    return Promise.resolve({ error: null })
  })
  builder.select = vi.fn(() => builder)
  builder.single = vi.fn(() =>
    Promise.resolve({ data: { id: 'new-id', ...(state.captured.insert as object) }, error: null }),
  )
  return { supabase: { from: vi.fn(() => builder) } }
})

import { createFormField } from './forms'
import { insertFlowModule, upsertFlowModulePositions } from './product-flow'

const OP = 'aaaaaaaa-1111-4111-8111-111111111111'
const PROD = 'bbbbbbbb-2222-4222-8222-222222222222'
const FORM = 'cccccccc-3333-4333-8333-333333333333'

beforeEach(() => {
  state.captured = {}
})

describe('form-builder writes carry operator_id', () => {
  it('createFormField insert includes operator_id', async () => {
    await createFormField(FORM, { key: 'age', field_type: 'number', label: 'Age', position: 0 }, OP)
    expect((state.captured.insert as Record<string, unknown>).operator_id).toBe(OP)
    expect((state.captured.insert as Record<string, unknown>).form_id).toBe(FORM)
  })

  it('insertFlowModule insert includes operator_id', async () => {
    await insertFlowModule(PROD, 'participants', 1, OP)
    expect((state.captured.insert as Record<string, unknown>).operator_id).toBe(OP)
    expect((state.captured.insert as Record<string, unknown>).product_id).toBe(PROD)
  })

  it('insertFlowModule (custom_form) keeps form_id and operator_id', async () => {
    await insertFlowModule(PROD, 'custom_form', 2, OP, FORM)
    const ins = state.captured.insert as Record<string, unknown>
    expect(ins.operator_id).toBe(OP)
    expect(ins.form_id).toBe(FORM)
  })

  it('upsertFlowModulePositions stamps operator_id on every row', async () => {
    await upsertFlowModulePositions(
      [
        { id: '1', product_id: PROD, module_kind: 'participants', form_id: null, position: 2 },
        { id: '2', product_id: PROD, module_kind: 'pickup', form_id: null, position: 1 },
      ],
      OP,
    )
    const rows = state.captured.upsert as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.operator_id === OP)).toBe(true)
  })

  it('upsertFlowModulePositions with no rows is a no-op (no write)', async () => {
    await upsertFlowModulePositions([], OP)
    expect(state.captured.upsert).toBeUndefined()
  })
})
