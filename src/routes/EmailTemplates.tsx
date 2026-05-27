import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailTemplateForm } from '@/components/EmailTemplateForm'
import { EmailTemplatePreview } from '@/components/EmailTemplatePreview'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  TEMPLATE_KINDS,
  OPERATOR_LOCALES,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type EmailTemplate,
  type TemplateKind,
  type OperatorLocale,
  type TemplateFormValues,
} from '@/lib/emailTemplates'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Selection = { kind: TemplateKind; locale: OperatorLocale }

export function EmailTemplates() {
  const { currentOperatorId } = useOperator()
  const qc = useQueryClient()
  const [selection, setSelection] = useState<Selection | null>(null)

  const query = useQuery({
    queryKey: ['email-templates', currentOperatorId ?? 'none'],
    queryFn: () => fetchTemplates(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const templates = query.data ?? []

  function findTemplate(kind: string, locale: string): EmailTemplate | null {
    return templates.find(
      (tpl) => tpl.template_kind === kind && tpl.locale === locale,
    ) ?? null
  }

  const selectedTemplate =
    selection ? findTemplate(selection.kind, selection.locale) : null

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      if (!currentOperatorId || !selection) throw new Error('No operator or selection')
      const existing = findTemplate(selection.kind, selection.locale)
      if (existing) {
        return updateTemplate(currentOperatorId, existing.id, {
          subject: values.subject,
          body_html: values.body_html,
          body_text: values.body_text || undefined,
        })
      } else {
        return createTemplate(currentOperatorId, {
          template_kind: selection.kind,
          locale: selection.locale,
          subject: values.subject,
          body_html: values.body_html,
          body_text: values.body_text ?? '',
        })
      }
    },
    onSuccess: () => {
      toast.success(t.emailTemplates.toastSaved)
      void qc.invalidateQueries({ queryKey: ['email-templates', currentOperatorId] })
      void qc.invalidateQueries({ queryKey: ['email-template-preview'] })
    },
    onError: (err: Error) => {
      toast.error(`${t.emailTemplates.toastSaveError}: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId || !selectedTemplate) throw new Error('No template selected')
      return deleteTemplate(currentOperatorId, selectedTemplate.id)
    },
    onSuccess: () => {
      toast.success(t.emailTemplates.toastReset)
      void qc.invalidateQueries({ queryKey: ['email-templates', currentOperatorId] })
      void qc.invalidateQueries({ queryKey: ['email-template-preview'] })
    },
    onError: (err: Error) => {
      toast.error(`${t.emailTemplates.toastResetError}: ${err.message}`)
    },
  })

  if (query.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.emailTemplates.error}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{query.error?.message}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.emailTemplates },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.emailTemplates}
      />
      <header>
        <h1 className="text-xl font-semibold">{t.emailTemplates.title}</h1>
        <p className="text-muted-foreground text-sm">{t.emailTemplates.subtitle}</p>
      </header>

      {query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.emailTemplates.loading}</p>
      ) : (
        <div className="flex gap-6">
          {/* Left: kind cards */}
          <div className="flex w-72 shrink-0 flex-col gap-3">
            {TEMPLATE_KINDS.map((kind) => (
              <Card key={kind} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    {t.emailTemplates.kindLabels[kind]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="flex border-t">
                    {OPERATOR_LOCALES.map((locale) => {
                      const has = !!findTemplate(kind, locale)
                      const isSelected =
                        selection?.kind === kind && selection.locale === locale
                      return (
                        <button
                          key={locale}
                          type="button"
                          onClick={() => setSelection({ kind, locale })}
                          className={cn(
                            'flex-1 cursor-pointer border-r px-3 py-2 text-sm last:border-r-0 transition-colors',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-accent hover:text-accent-foreground',
                          )}
                          aria-pressed={isSelected}
                        >
                          <span className="block font-medium uppercase">{locale}</span>
                          <span
                            className={cn(
                              'block text-xs',
                              isSelected
                                ? 'text-primary-foreground/70'
                                : 'text-muted-foreground',
                            )}
                          >
                            {has
                              ? t.emailTemplates.statusCustom
                              : t.emailTemplates.statusDefault}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Right: edit + preview */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {!selection ? (
              <p className="text-muted-foreground text-sm">{t.emailTemplates.selectHint}</p>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {t.emailTemplates.kindLabels[selection.kind]} —{' '}
                      {t.emailTemplates.localeLabels[selection.locale]}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EmailTemplateForm
                      template={selectedTemplate}
                      saving={saveMutation.isPending}
                      onSave={(values) => saveMutation.mutate(values)}
                      onResetToDefault={() => deleteMutation.mutate()}
                      resetting={deleteMutation.isPending}
                    />
                  </CardContent>
                </Card>

                {selectedTemplate && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">{t.emailTemplates.previewTitle}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <EmailTemplatePreview
                        operatorId={currentOperatorId as string}
                        template={selectedTemplate}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
