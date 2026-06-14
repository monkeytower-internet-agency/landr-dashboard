/**
 * Settings → Vouchers (landr-v198).
 *
 * Operator-scoped CRUD over the vouchers table via the FastAPI
 * staff_vouchers router. The page renders a table (code, kind, amount,
 * used/max, valid window, active) plus a create/edit dialog and a
 * deactivate (soft-delete) action.
 *
 * Distinct from the Voucher-performance card on /analytics (which reads
 * the same table directly for redemption stats). This is the management
 * surface; analytics is read-only.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  createVoucher,
  deleteVoucher,
  fetchVouchers,
  formToInput,
  formatUsage,
  formatVoucherAmount,
  localFromIso,
  patchVoucher,
  validateVoucherForm,
  VOUCHER_SCOPES,
  type Voucher,
  type VoucherFieldErrors,
  type VoucherFormValues,
} from '@/lib/vouchers'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

const EMPTY_FORM: VoucherFormValues = {
  code: '',
  kind: 'percent',
  amount: '',
  max_uses: '',
  valid_from: '',
  valid_until: '',
  scope: 'booking',
  description: '',
  active: true,
}

function formFromVoucher(v: Voucher): VoucherFormValues {
  return {
    code: v.code,
    kind: v.kind,
    amount: String(v.amount),
    max_uses: v.max_uses == null ? '' : String(v.max_uses),
    valid_from: localFromIso(v.valid_from),
    valid_until: localFromIso(v.valid_until),
    scope: v.scope,
    description: v.description ?? '',
    active: v.active,
  }
}

export function VouchersSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.vouchers },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.vouchers}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <p className="text-muted-foreground text-sm">
          {t.vouchersSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <VouchersManager operatorId={currentOperatorId} />
    </>
  )
}

type ManagerProps = { operatorId: string }

export function VouchersManager({ operatorId }: ManagerProps) {
  const queryClient = useQueryClient()
  const vouchersQuery = useQuery<Voucher[]>({
    queryKey: ['vouchers', operatorId],
    queryFn: () => fetchVouchers(operatorId),
  })

  // null = closed; { voucher: null } = create; { voucher } = edit.
  const [dialog, setDialog] = useState<{ voucher: Voucher | null } | null>(null)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['vouchers', operatorId] })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-end gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => setDialog({ voucher: null })}
          data-testid="vouchers-create"
        >
          {t.vouchersSettings.newVoucher}
        </Button>
      </header>

      <section data-testid="vouchers-list">
        {vouchersQuery.isPending ? (
          <p className="text-muted-foreground text-sm">
            {t.vouchersSettings.loading}
          </p>
        ) : vouchersQuery.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {(vouchersQuery.error as Error).message}
          </p>
        ) : (vouchersQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.vouchersSettings.empty}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colCode}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colKind}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colAmount}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colUsage}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colWindow}
                  </th>
                  <th className="px-3 py-2 font-medium">
                    {t.vouchersSettings.colActive}
                  </th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {(vouchersQuery.data ?? []).map((v) => (
                  <VoucherRow
                    key={v.id}
                    voucher={v}
                    operatorId={operatorId}
                    onEdit={() => setDialog({ voucher: v })}
                    onDeactivated={invalidate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog ? (
        <VoucherDialog
          operatorId={operatorId}
          voucher={dialog.voucher}
          onClose={() => setDialog(null)}
          onSaved={() => {
            invalidate()
            setDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}

// ---- one table row ---------------------------------------------------

type RowProps = {
  voucher: Voucher
  operatorId: string
  onEdit: () => void
  onDeactivated: () => void
}

function VoucherRow({ voucher, operatorId, onEdit, onDeactivated }: RowProps) {
  const [confirm, setConfirm] = useState(false)
  const deleteMutation = useMutation({
    mutationFn: () => deleteVoucher(operatorId, voucher.id),
    onSuccess: () => {
      toast.success(t.vouchersSettings.toastDeactivated)
      onDeactivated()
    },
    onError: (err: Error) => {
      toast.error(t.vouchersSettings.toastDeactivateError, {
        description: err.message,
      })
    },
  })

  const window = formatWindow(voucher.valid_from, voucher.valid_until)

  return (
    <tr data-testid={`voucher-row-${voucher.id}`}>
      <td className="px-3 py-2 font-mono font-medium">{voucher.code}</td>
      <td className="px-3 py-2">
        {voucher.kind === 'percent'
          ? t.vouchersSettings.kindPercent
          : t.vouchersSettings.kindFlat}
      </td>
      <td className="px-3 py-2">{formatVoucherAmount(voucher)}</td>
      <td className="px-3 py-2 tabular-nums">{formatUsage(voucher)}</td>
      <td className="text-muted-foreground px-3 py-2 text-xs">{window}</td>
      <td className="px-3 py-2">
        <span
          className={
            voucher.active
              ? 'text-green-600 dark:text-green-400'
              : 'text-muted-foreground'
          }
        >
          {voucher.active
            ? t.vouchersSettings.statusActive
            : t.vouchersSettings.statusInactive}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onEdit}
            data-testid={`voucher-row-${voucher.id}-edit`}
          >
            {t.vouchersSettings.edit}
          </Button>
          {confirm ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
                data-testid={`voucher-row-${voucher.id}-confirm-deactivate`}
              >
                {deleteMutation.isPending
                  ? t.vouchersSettings.deactivating
                  : t.vouchersSettings.confirmDeactivate}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirm(false)}
              >
                {t.vouchersSettings.cancel}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirm(true)}
              data-testid={`voucher-row-${voucher.id}-deactivate`}
            >
              {t.vouchersSettings.deactivate}
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ---- create / edit dialog --------------------------------------------

type DialogProps = {
  operatorId: string
  /** null = create mode; a voucher = edit mode. */
  voucher: Voucher | null
  onClose: () => void
  onSaved: () => void
}

function VoucherDialog({ operatorId, voucher, onClose, onSaved }: DialogProps) {
  const isEdit = voucher != null
  const [values, setValues] = useState<VoucherFormValues>(
    voucher ? formFromVoucher(voucher) : EMPTY_FORM,
  )
  const [submitted, setSubmitted] = useState(false)

  const errors: VoucherFieldErrors = useMemo(
    () => validateVoucherForm(values),
    [values],
  )
  const hasErrors = Object.keys(errors).length > 0

  function set<K extends keyof VoucherFormValues>(
    key: K,
    value: VoucherFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const mutation = useMutation({
    mutationFn: () => {
      const input = formToInput(values)
      return isEdit
        ? patchVoucher(operatorId, voucher.id, input)
        : createVoucher(operatorId, input)
    },
    onSuccess: () => {
      toast.success(
        isEdit
          ? t.vouchersSettings.toastUpdated
          : t.vouchersSettings.toastCreated,
      )
      onSaved()
    },
    onError: (err: Error) => {
      toast.error(
        isEdit
          ? t.vouchersSettings.toastUpdateError
          : t.vouchersSettings.toastCreateError,
        { description: err.message },
      )
    },
  })

  function handleSubmit() {
    setSubmitted(true)
    if (hasErrors) return
    mutation.mutate()
  }

  function err(field: keyof VoucherFieldErrors): string | undefined {
    return submitted ? errors[field] : undefined
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t.vouchersSettings.dialogEditTitle
              : t.vouchersSettings.dialogCreateTitle}
          </DialogTitle>
          <DialogDescription>
            {t.vouchersSettings.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label={t.vouchersSettings.fieldCode} error={err('code')}>
            <Input
              value={values.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder={t.vouchersSettings.placeholderCode}
              maxLength={64}
              className="font-mono"
              data-testid="voucher-field-code"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.vouchersSettings.fieldKind}>
              <NativeSelect
                value={values.kind}
                onChange={(e) =>
                  set('kind', e.target.value as VoucherFormValues['kind'])
                }
                data-testid="voucher-field-kind"
              >
                <option value="percent">
                  {t.vouchersSettings.kindPercent}
                </option>
                <option value="flat">{t.vouchersSettings.kindFlat}</option>
              </NativeSelect>
            </Field>
            <Field label={t.vouchersSettings.fieldAmount} error={err('amount')}>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={values.amount}
                onChange={(e) => set('amount', e.target.value)}
                data-testid="voucher-field-amount"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.vouchersSettings.fieldScope}>
              <NativeSelect
                value={values.scope}
                onChange={(e) =>
                  set('scope', e.target.value as VoucherFormValues['scope'])
                }
                data-testid="voucher-field-scope"
              >
                {VOUCHER_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {t.vouchersSettings.scopes[s]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label={t.vouchersSettings.fieldMaxUses}
              error={err('max_uses')}
              hint={t.vouchersSettings.maxUsesHint}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step="1"
                value={values.max_uses}
                onChange={(e) => set('max_uses', e.target.value)}
                placeholder={t.vouchersSettings.placeholderUnlimited}
                data-testid="voucher-field-max-uses"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.vouchersSettings.fieldValidFrom}>
              <Input
                type="datetime-local"
                value={values.valid_from}
                onChange={(e) => set('valid_from', e.target.value)}
                data-testid="voucher-field-valid-from"
              />
            </Field>
            <Field
              label={t.vouchersSettings.fieldValidUntil}
              error={err('valid_until')}
            >
              <Input
                type="datetime-local"
                value={values.valid_until}
                onChange={(e) => set('valid_until', e.target.value)}
                data-testid="voucher-field-valid-until"
              />
            </Field>
          </div>

          <Field label={t.vouchersSettings.fieldDescription}>
            <Textarea
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t.vouchersSettings.placeholderDescription}
              data-testid="voucher-field-description"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.active}
              onChange={(e) => set('active', e.target.checked)}
              data-testid="voucher-field-active"
            />
            {t.vouchersSettings.fieldActive}
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            {t.vouchersSettings.cancel}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending || (submitted && hasErrors)}
            data-testid="voucher-dialog-submit"
          >
            {mutation.isPending
              ? t.vouchersSettings.saving
              : isEdit
                ? t.vouchersSettings.save
                : t.vouchersSettings.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- small field wrapper ---------------------------------------------

type FieldProps = {
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

function Field({ label, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && !error ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// ---- display helper --------------------------------------------------

/** Render the validity window compactly for the table. Internal to this
 *  surface (depends on t.vouchersSettings copy), so it is not exported. */
function formatWindow(
  from: string | null,
  until: string | null,
): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
  }
  if (!from && !until) return t.vouchersSettings.windowAlways
  if (from && until) return `${fmt(from)} – ${fmt(until)}`
  if (from) return `${t.vouchersSettings.windowFrom} ${fmt(from)}`
  return `${t.vouchersSettings.windowUntil} ${fmt(until as string)}`
}
