// landr-c53m.14 — Settings → Declarations enforcement.
//
// Per-operator toggle for whether the booking-submit gate requires the
// customer to accept declarations before a booking is accepted. The API
// (booking_submit.py / booking_submit_validation.py) already enforces
// operators.require_declarations at write time; until this page shipped,
// no staff/dashboard surface could flip that flag — a 2nd operator needed
// a manual SQL UPDATE (the exact out-of-band op the c53m epic set out to
// kill).
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

type DeclarationsEditorProps = {
  operator: OperatorSettings
  operatorId: string
  invalidate: () => void
}

function DeclarationsEditor({
  operator,
  operatorId,
  invalidate,
}: DeclarationsEditorProps) {
  const [enabled, setEnabled] = useState(
    operator.require_declarations ?? false,
  )

  const dirty = enabled !== (operator.require_declarations ?? false)

  const saveMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => {
      invalidate()
      toast.success(t.declarationsSettings.toastSaved)
    },
    onError: (err: Error) =>
      toast.error(t.declarationsSettings.toastError, {
        description: err.message,
      }),
  })

  function save() {
    if (!dirty || saveMutation.isPending) return
    saveMutation.mutate({ require_declarations: enabled } satisfies OperatorPatch)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.declarationsSettings.cardTitle}</CardTitle>
          <CardDescription>
            {t.declarationsSettings.cardDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saveMutation.isPending}
              data-testid="declarations-enabled"
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t.declarationsSettings.enableLabel}
              </span>
              <span className="text-muted-foreground text-xs">
                {t.declarationsSettings.enableHint}
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              data-testid="declarations-save"
            >
              {saveMutation.isPending
                ? t.declarationsSettings.saving
                : t.declarationsSettings.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DeclarationsSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.declarations },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.declarations}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <DeclarationsEditor
            operator={operator}
            operatorId={operatorId}
            invalidate={invalidate}
          />
        )}
      </OperatorSection>
    </>
  )
}
