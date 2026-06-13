/**
 * Settings → Campaigns (landr-sp4r).
 *
 * Operator-scoped CRUD over the campaigns table. Campaigns are the
 * marketing-attribution carrier referenced by bookings.campaign_id;
 * until this page existed, nothing created campaign rows.
 *
 * Shape: a list of campaign rows + a single create/edit dialog. Deletion
 * is a soft delete server-side (the FK is ON DELETE SET NULL), surfaced
 * to operators as "Deactivate" since historical attribution survives and
 * the code becomes reusable.
 */
import { useState } from 'react'
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
  CAMPAIGN_KINDS,
  CAMPAIGN_KIND_LABELS,
  createCampaign,
  deleteCampaign,
  fetchCampaigns,
  patchCampaign,
  type Campaign,
  type CampaignInput,
  type CampaignKind,
  type CampaignScope,
} from '@/lib/campaigns'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

const SCOPES: { value: CampaignScope; labelKey: keyof typeof t.campaignsSettings }[] = [
  { value: 'booking', labelKey: 'scopeBooking' },
  { value: 'subscription', labelKey: 'scopeSubscription' },
  { value: 'any', labelKey: 'scopeAny' },
]

export function CampaignsSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.campaigns },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.campaigns}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <p className="text-muted-foreground text-sm">
          {t.campaignsSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <CampaignsManager operatorId={currentOperatorId} />
    </>
  )
}

type ManagerProps = {
  operatorId: string
}

export function CampaignsManager({ operatorId }: ManagerProps) {
  const campaignsQuery = useQuery<Campaign[]>({
    queryKey: ['campaigns', operatorId],
    queryFn: () => fetchCampaigns(operatorId),
  })

  // null = dialog closed; { ...existing } = edit; 'new' = create.
  const [editorState, setEditorState] = useState<Campaign | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-end gap-4">
        <Button
          type="button"
          size="sm"
          onClick={() => setEditorState('new')}
          data-testid="campaigns-settings-new"
        >
          {t.campaignsSettings.newButton}
        </Button>
      </header>

      <section data-testid="campaigns-settings-list">
        <h2 className="text-sm font-medium">
          {t.campaignsSettings.existingTitle}
        </h2>
        {campaignsQuery.isPending ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.campaignsSettings.loading}
          </p>
        ) : campaignsQuery.isError ? (
          <p className="text-destructive mt-2 text-sm" role="alert">
            {t.campaignsSettings.errorTitle}{' '}
            {(campaignsQuery.error as Error).message}
          </p>
        ) : (campaignsQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground mt-2 text-sm">
            {t.campaignsSettings.empty}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y rounded-md border">
            {(campaignsQuery.data ?? []).map((campaign) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                operatorId={operatorId}
                onEdit={() => setEditorState(campaign)}
              />
            ))}
          </ul>
        )}
      </section>

      {editorState !== null ? (
        <CampaignDialog
          operatorId={operatorId}
          campaign={editorState === 'new' ? null : editorState}
          onClose={() => setEditorState(null)}
        />
      ) : null}
    </div>
  )
}

// ---- one campaign row ------------------------------------------------

type RowProps = {
  campaign: Campaign
  operatorId: string
  onEdit: () => void
}

function CampaignRow({ campaign, operatorId, onEdit }: RowProps) {
  const queryClient = useQueryClient()
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const deactivateMutation = useMutation({
    mutationFn: () => deleteCampaign(operatorId, campaign.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', operatorId] })
      toast.success(t.campaignsSettings.toastDeactivated)
    },
    onError: (err: Error) => {
      toast.error(t.campaignsSettings.toastDeactivateError, {
        description: err.message,
      })
    },
  })

  const dateRange = campaign.end_date
    ? `${campaign.start_date} → ${campaign.end_date}`
    : `${campaign.start_date} →`

  return (
    <li
      className="flex flex-wrap items-center gap-3 p-3"
      data-testid={`campaign-row-${campaign.id}`}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
            {campaign.code}
          </code>
          <span className="truncate text-sm font-medium">{campaign.label}</span>
          {!campaign.active ? (
            <span className="text-muted-foreground border-muted-foreground/30 rounded border px-1.5 py-0.5 text-[10px] uppercase">
              {t.campaignsSettings.statusInactive}
            </span>
          ) : null}
        </div>
        <span className="text-muted-foreground text-xs">
          {CAMPAIGN_KIND_LABELS[campaign.kind]} · {dateRange}
        </span>
      </div>

      <span className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onEdit}
          data-testid={`campaign-row-${campaign.id}-edit`}
        >
          {t.campaignsSettings.edit}
        </Button>
        {confirmDeactivate ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate()}
              data-testid={`campaign-row-${campaign.id}-confirm-deactivate`}
            >
              {deactivateMutation.isPending
                ? t.campaignsSettings.deactivating
                : t.campaignsSettings.confirmDeactivate}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDeactivate(false)}
            >
              {t.campaignsSettings.cancel}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDeactivate(true)}
            data-testid={`campaign-row-${campaign.id}-deactivate`}
          >
            {t.campaignsSettings.deactivate}
          </Button>
        )}
      </span>
    </li>
  )
}

// ---- create / edit dialog --------------------------------------------

type DialogProps = {
  operatorId: string
  /** null = create mode; a row = edit mode. */
  campaign: Campaign | null
  onClose: () => void
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function CampaignDialog({ operatorId, campaign, onClose }: DialogProps) {
  const queryClient = useQueryClient()
  const isEdit = campaign !== null

  const [code, setCode] = useState(campaign?.code ?? '')
  const [label, setLabel] = useState(campaign?.label ?? '')
  const [kind, setKind] = useState<CampaignKind>(campaign?.kind ?? 'marketing')
  const [scope, setScope] = useState<CampaignScope>(campaign?.scope ?? 'booking')
  const [description, setDescription] = useState(campaign?.description ?? '')
  const [startDate, setStartDate] = useState(campaign?.start_date ?? todayISO())
  const [endDate, setEndDate] = useState(campaign?.end_date ?? '')
  const [active, setActive] = useState(campaign?.active ?? true)

  const dateWindowInvalid = endDate !== '' && endDate < startDate

  const saveMutation = useMutation({
    mutationFn: () => {
      const base: CampaignInput = {
        code: code.trim(),
        label: label.trim(),
        kind,
        scope,
        start_date: startDate,
        end_date: endDate === '' ? null : endDate,
        description: description.trim() === '' ? null : description.trim(),
        active,
      }
      if (isEdit && campaign) {
        return patchCampaign(operatorId, campaign.id, base)
      }
      return createCampaign(operatorId, base)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns', operatorId] })
      toast.success(
        isEdit
          ? t.campaignsSettings.toastUpdated
          : t.campaignsSettings.toastCreated,
      )
      onClose()
    },
    onError: (err: Error) => {
      toast.error(
        isEdit
          ? t.campaignsSettings.toastUpdateError
          : t.campaignsSettings.toastCreateError,
        { description: err.message },
      )
    },
  })

  const canSave =
    code.trim().length > 0 &&
    label.trim().length > 0 &&
    startDate.length > 0 &&
    !dateWindowInvalid &&
    !saveMutation.isPending

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent data-testid="campaign-dialog">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t.campaignsSettings.editTitle
              : t.campaignsSettings.createTitle}
          </DialogTitle>
          <DialogDescription>
            {t.campaignsSettings.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-code">
                {t.campaignsSettings.fieldCode}
              </Label>
              <Input
                id="campaign-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t.campaignsSettings.placeholderCode}
                maxLength={64}
                data-testid="campaign-dialog-code"
              />
              <p className="text-muted-foreground text-xs">
                {t.campaignsSettings.fieldCodeHint}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-label">
                {t.campaignsSettings.fieldLabel}
              </Label>
              <Input
                id="campaign-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t.campaignsSettings.placeholderLabel}
                maxLength={200}
                data-testid="campaign-dialog-label"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-kind">
                {t.campaignsSettings.fieldKind}
              </Label>
              <NativeSelect
                id="campaign-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as CampaignKind)}
                data-testid="campaign-dialog-kind"
              >
                {CAMPAIGN_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CAMPAIGN_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-scope">
                {t.campaignsSettings.fieldScope}
              </Label>
              <NativeSelect
                id="campaign-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as CampaignScope)}
                data-testid="campaign-dialog-scope"
              >
                {SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t.campaignsSettings[s.labelKey] as string}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-start">
                {t.campaignsSettings.fieldStartDate}
              </Label>
              <Input
                id="campaign-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="campaign-dialog-start"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-end">
                {t.campaignsSettings.fieldEndDate}
              </Label>
              <Input
                id="campaign-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="campaign-dialog-end"
              />
              <p className="text-muted-foreground text-xs">
                {t.campaignsSettings.fieldEndDateHint}
              </p>
            </div>
          </div>

          {dateWindowInvalid ? (
            <p className="text-destructive text-xs" role="alert">
              {t.campaignsSettings.dateWindowError}
            </p>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label htmlFor="campaign-description">
              {t.campaignsSettings.fieldDescription}
            </Label>
            <Textarea
              id="campaign-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.campaignsSettings.placeholderDescription}
              rows={2}
              data-testid="campaign-dialog-description"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              data-testid="campaign-dialog-active"
              className="h-4 w-4"
            />
            {t.campaignsSettings.fieldActive}
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saveMutation.isPending}
          >
            {t.campaignsSettings.cancel}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
            data-testid="campaign-dialog-save"
          >
            {saveMutation.isPending
              ? isEdit
                ? t.campaignsSettings.saving
                : t.campaignsSettings.creating
              : isEdit
                ? t.campaignsSettings.save
                : t.campaignsSettings.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
