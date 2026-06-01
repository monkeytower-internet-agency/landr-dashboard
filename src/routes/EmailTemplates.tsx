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
  // Default to first kind + first locale so the editor shows immediately
  const [selection, setSelection] = useState<Selection>({
    kind: TEMPLATE_KINDS[0],
    locale: OPERATOR_LOCALES[0],
  })

  const query = useQuery({
    queryKey: ['email-templates', currentOperatorId ?? 'none'],
    queryFn: () => fetchTemplates(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const templates = query.data ?? []

  function findTemplate(kind: string, locale: string): EmailTemplate | null {
    return (
      templates.find(
        (tpl) => tpl.template_kind === kind && tpl.locale === locale,
      ) ?? null
    )
  }

  const selectedTemplate = findTemplate(selection.kind, selection.locale)

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      if (!currentOperatorId) throw new Error('No operator or selection')
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

  const isCustom = !!selectedTemplate

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
        <div className="flex flex-col gap-6">
          {/* Top selector bar: kind tabs + locale tabs */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
                {/* Kind segmented control */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {t.emailTemplates.selectorKindLabel}
                  </p>
                  <div
                    role="tablist"
                    aria-label={t.emailTemplates.selectorKindLabel}
                    className="flex rounded-md border bg-muted/40 p-0.5 gap-0.5"
                  >
                    {TEMPLATE_KINDS.map((kind) => {
                      const isSelected = selection.kind === kind
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => setSelection((s) => ({ ...s, kind }))}
                          className={cn(
                            'rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                          )}
                        >
                          {t.emailTemplates.kindLabels[kind]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Locale segmented control */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {t.emailTemplates.selectorLocaleLabel}
                  </p>
                  <div
                    role="tablist"
                    aria-label={t.emailTemplates.selectorLocaleLabel}
                    className="flex rounded-md border bg-muted/40 p-0.5 gap-0.5"
                  >
                    {OPERATOR_LOCALES.map((locale) => {
                      const isSelected = selection.locale === locale
                      const hasCustom = !!findTemplate(selection.kind, locale)
                      return (
                        <button
                          key={locale}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => setSelection((s) => ({ ...s, locale }))}
                          className={cn(
                            'relative flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            isSelected
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
                          )}
                        >
                          <span className="uppercase">{locale}</span>
                          {hasCustom && (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                isSelected ? 'bg-primary' : 'bg-muted-foreground/60',
                              )}
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Status badge for selected kind+locale */}
                <div className="flex items-end sm:ml-auto">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      isCustom
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {isCustom
                      ? t.emailTemplates.statusCustom
                      : t.emailTemplates.statusDefault}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Full-width editor */}
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

          {/* Full-width preview (only when a custom template exists) */}
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
        </div>
      )}
    </div>
  )
}
