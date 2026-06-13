/**
 * /settings/forms/:formId — field-builder editor stub (landr-71kz.6).
 *
 * This route is a placeholder for the form field-builder editor which
 * ships in sibling ticket landr-71kz.6. The shell is wired here so that
 * the "Edit fields" link from the Forms library does not 404, and so
 * other dashboard surfaces can deep-link to a future editor without a
 * routing change.
 */
import { Link, useParams } from 'react-router-dom'
import { ArrowLeftIcon, WandSparklesIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function FormEditorStub() {
  const { formId } = useParams<{ formId: string }>()
  const { currentOperatorId: _operatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.forms, to: '/settings/forms' },
          { label: t.formEditorStub.crumb },
        ]}
      />

      <div className="flex flex-col items-center gap-4 rounded-md border border-dashed p-10 text-center">
        <WandSparklesIcon className="text-muted-foreground size-10" />
        <div>
          <p className="font-medium">{t.formEditorStub.title}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t.formEditorStub.description}
          </p>
          {formId ? (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {formId}
            </p>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings/forms">
            <ArrowLeftIcon className="size-3.5" />
            {t.formEditorStub.backToLibrary}
          </Link>
        </Button>
      </div>
    </>
  )
}
