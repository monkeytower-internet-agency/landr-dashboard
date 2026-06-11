// landr-atwy — Settings → Account link prompt.
//
// Per-operator opt-in toggle for the post-booking
// "Track this booking in the LANDR app" account-link prompt shown in the
// booking widget (AccountLinkPrompt). OFF by default for privacy.
//
// Prerequisites before enabling:
//   * Magic-link email must be working in production (landr-16u9:
//     SMTP + email_redirect_to + branded template).
//
// Write path: direct PATCH /api/staff/operators/{id} via patchOperator()
// (plain boolean flag update; no side-effects, RLS + audit triggers cover
// it — matches the write-routing convention for plain row flags).

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  patchOperator,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

type AccountLinkEditorProps = {
  operator: OperatorSettings
  operatorId: string
  invalidate: () => void
}

function AccountLinkEditor({
  operator,
  operatorId,
  invalidate,
}: AccountLinkEditorProps) {
  const [enabled, setEnabled] = useState(
    operator.offer_account_link ?? false,
  )

  const dirty = enabled !== (operator.offer_account_link ?? false)

  const saveMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => {
      invalidate()
      toast.success(t.accountLinkSettings.toastSaved)
    },
    onError: (err: Error) =>
      toast.error(t.accountLinkSettings.toastError, {
        description: err.message,
      }),
  })

  function save() {
    if (!dirty || saveMutation.isPending) return
    saveMutation.mutate({ offer_account_link: enabled } satisfies OperatorPatch)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.accountLinkSettings.cardTitle}</CardTitle>
          <CardDescription>
            {t.accountLinkSettings.cardDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saveMutation.isPending}
              data-testid="account-link-enabled"
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t.accountLinkSettings.enableLabel}
              </span>
              <span className="text-muted-foreground text-xs">
                {t.accountLinkSettings.enableHint}
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              data-testid="account-link-save"
            >
              {saveMutation.isPending
                ? t.accountLinkSettings.saving
                : t.accountLinkSettings.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function AccountLinkSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.accountLink },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.accountLink}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <AccountLinkEditor
            operator={operator}
            operatorId={operatorId}
            invalidate={invalidate}
          />
        )}
      </OperatorSection>
    </>
  )
}
