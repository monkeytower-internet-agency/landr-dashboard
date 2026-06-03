import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailTemplateForm } from '@/components/EmailTemplateForm'
import { EmailTemplatePreview, EmailVariableCatalog } from '@/components/EmailTemplatePreview'
import { useOperator } from '@/lib/operator'
import { fetchOperator } from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import {
  TEMPLATE_KINDS,
  OPERATOR_LOCALES,
  fetchTemplates,
  fetchEffective,
  fetchVariables,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  isHotelKind,
  type EmailTemplate,
  type EffectiveTemplate,
  type TemplateKind,
  type OperatorLocale,
  type TemplateFormValues,
} from '@/lib/emailTemplates'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Selection = { kind: TemplateKind; locale: OperatorLocale }

// landr-x5o5.6: ASSUMPTION — hotel_email_locale is not yet surfaced in the
// dashboard API (landr-x5o5.7 will add it). We resolve the pinned hotel locale
// from the operator's default_locale (fetchOperator) and fall back to 'es'
// when that is also absent (Para42 is ES, which is the only live operator).
const HOTEL_LOCALE_FALLBACK: OperatorLocale = 'es'

/** Resolve a valid OperatorLocale from a raw string or return the fallback. */
function resolveHotelLocale(raw: string | null | undefined): OperatorLocale {
  if (raw && (OPERATOR_LOCALES as readonly string[]).includes(raw)) {
    return raw as OperatorLocale
  }
  return HOTEL_LOCALE_FALLBACK
}

export function EmailTemplates() {
  const { currentOperatorId } = useOperator()
  const qc = useQueryClient()
  // Default to first kind + first locale so the editor shows immediately
  const [selection, setSelection] = useState<Selection>({
    kind: TEMPLATE_KINDS[0],
    locale: OPERATOR_LOCALES[0],
  })

  // landr-x5o5.6: fetch operator settings to read default_locale as proxy
  // for hotel_email_locale (until landr-x5o5.7 surfaces the real column).
  // Shares the same React Query cache key used by OperatorSection in settings
  // so the request is deduped on the settings page.
  const operatorSettingsQuery = useQuery({
    queryKey: ['operator-settings', currentOperatorId ?? 'none'],
    queryFn: () => fetchOperator(currentOperatorId as string),
    enabled: !!currentOperatorId,
    staleTime: 5 * 60 * 1000,
  })
  const hotelLocale = resolveHotelLocale(operatorSettingsQuery.data?.default_locale)

  // landr-x5o5.6: For hotel-facing kinds the locale is always the pinned
  // hotelLocale — we derive it here rather than storing it in state to avoid
  // an extra render cycle. `selection.locale` is only meaningful for
  // non-hotel kinds and is left unchanged when the user switches kinds.
  const effectiveLocale: OperatorLocale = isHotelKind(selection.kind)
    ? hotelLocale
    : selection.locale

  const query = useQuery({
    queryKey: ['email-templates', currentOperatorId ?? 'none'],
    queryFn: () => fetchTemplates(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  // landr-x5o5.5: per-kind variable catalog — fetched by selected kind,
  // independent of whether a saved template exists. A brand-new template
  // immediately shows its variables.
  const variablesQuery = useQuery({
    queryKey: ['email-template-variables', currentOperatorId ?? 'none', selection.kind],
    queryFn: () => fetchVariables(currentOperatorId as string, selection.kind),
    enabled: !!currentOperatorId,
    staleTime: 5 * 60 * 1000, // catalog is stable; cache 5 min
  })

  // landr-x5o5.4: resolved effective template — prefills the editor with the
  // default content when the operator hasn't customized yet (is_default=true).
  const effectiveQuery = useQuery<EffectiveTemplate>({
    queryKey: ['email-template-effective', currentOperatorId ?? 'none', selection.kind, effectiveLocale],
    queryFn: () => fetchEffective(currentOperatorId as string, selection.kind, effectiveLocale),
    enabled: !!currentOperatorId,
    // Stable while operator row or system_templates don't change — 2 min TTL.
    staleTime: 2 * 60 * 1000,
  })

  const templates = query.data ?? []

  function findTemplate(kind: string, locale: string): EmailTemplate | null {
    return (
      templates.find(
        (tpl) => tpl.template_kind === kind && tpl.locale === locale,
      ) ?? null
    )
  }

  const selectedTemplate = findTemplate(selection.kind, effectiveLocale)
  const effectiveTemplate = effectiveQuery.data ?? null

  /** True when the operator has their own row (is_default=false from effective). */
  const isCustom = effectiveTemplate ? !effectiveTemplate.is_default : !!selectedTemplate

  /** Returns true if form values are byte-identical to the resolved default. */
  function isIdenticalToDefault(values: TemplateFormValues): boolean {
    if (!effectiveTemplate) return false
    return (
      values.subject === effectiveTemplate.subject &&
      values.body_html === effectiveTemplate.body_html &&
      (values.body_text ?? '') === (effectiveTemplate.body_text ?? '')
    )
  }

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      if (!currentOperatorId) throw new Error('No operator or selection')
      const existing = findTemplate(selection.kind, effectiveLocale)

      // landr-x5o5.4: if the operator has no custom row AND the submitted
      // content matches the default exactly, skip the write entirely.
      if (!existing && effectiveTemplate?.is_default && isIdenticalToDefault(values)) {
        return null // sentinel: no-op
      }

      if (existing) {
        return updateTemplate(currentOperatorId, existing.id, {
          subject: values.subject,
          body_html: values.body_html,
          body_text: values.body_text || undefined,
        })
      } else {
        return createTemplate(currentOperatorId, {
          template_kind: selection.kind,
          locale: effectiveLocale,
          subject: values.subject,
          body_html: values.body_html,
          body_text: values.body_text ?? '',
        })
      }
    },
    onSuccess: (result) => {
      if (result === null) {
        // No-op: content was identical to the default.
        toast.success(t.emailTemplates.toastNoChangeFromDefault)
        return
      }
      toast.success(t.emailTemplates.toastSaved)
      void qc.invalidateQueries({ queryKey: ['email-templates', currentOperatorId] })
      void qc.invalidateQueries({ queryKey: ['email-template-preview'] })
      void qc.invalidateQueries({ queryKey: ['email-template-effective', currentOperatorId] })
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

  const catalogEntries = variablesQuery.data?.variables ?? []

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

                {/* Locale segmented control — hidden for hotel-facing kinds;
                    those are always sent in the operator's hotel_email_locale.
                    landr-x5o5.6: until landr-x5o5.7 surfaces hotel_email_locale
                    we display default_locale / 'es' fallback. */}
                {isHotelKind(selection.kind) ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                      {t.emailTemplates.selectorLocaleLabel}
                    </p>
                    <p
                      className="text-muted-foreground text-sm"
                      data-testid="hotel-locale-pin-note"
                    >
                      {t.emailTemplates.hotelLocalePinNote(hotelLocale)}
                    </p>
                  </div>
                ) : (
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
                )}

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

          {/* Full-width editor — form + always-visible variable catalog */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {t.emailTemplates.kindLabels[selection.kind]} —{' '}
                {t.emailTemplates.localeLabels[effectiveLocale]}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <EmailTemplateForm
                template={selectedTemplate}
                effectiveTemplate={effectiveTemplate}
                saving={saveMutation.isPending}
                onSave={(values) => saveMutation.mutate(values)}
                onResetToDefault={() => deleteMutation.mutate()}
                resetting={deleteMutation.isPending}
              />
              {/* landr-x5o5.5: variable catalog — always visible for the
                  selected kind, no saved template required. Replaces the
                  preview-only path from landr-7tyo. */}
              <EmailVariableCatalog entries={catalogEntries} />
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
