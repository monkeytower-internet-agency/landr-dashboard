import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { t } from '@/lib/strings'
import { previewTemplate, type EmailTemplate, type VariableCatalogEntry } from '@/lib/emailTemplates'
import { buildPreviewSrcDoc } from '@/lib/emailPreview'

type Props = {
  operatorId: string
  template: EmailTemplate | null
}

export function EmailTemplatePreview({ operatorId, template }: Props) {
  const query = useQuery({
    queryKey: ['email-template-preview', operatorId, template?.id],
    queryFn: () => previewTemplate(operatorId, template!.id),
    enabled: !!template,
    staleTime: 30_000,
  })

  if (!template) {
    return (
      <p className="text-muted-foreground text-sm">{t.emailTemplates.previewSelectTemplate}</p>
    )
  }

  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">{t.emailTemplates.previewLoading}</p>
  }

  if (query.isError) {
    return (
      <p className="text-destructive text-sm">
        {t.emailTemplates.previewError}: {query.error?.message}
      </p>
    )
  }

  const result = query.data
  const renderError = result.render_error ?? null
  // Convert fixture.context (key→sample) into VariableCatalogEntry[] for
  // the shared EmailVariableCatalog component. Description falls back to
  // an empty string when not available from the preview fixture.
  const contextEntries: VariableCatalogEntry[] = Object.entries(
    result.fixture?.context ?? {},
  ).map(([name, sample]) => ({ name, sample, description: '' }))

  return (
    <div className="flex flex-col gap-4">
      {/* Preview content — subject + iframe + optional error banner + plain text */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t.emailTemplates.previewSubject}
          </p>
          <p className="text-sm">{result.subject}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {t.emailTemplates.previewHtml}
          </p>
          <iframe
            srcDoc={buildPreviewSrcDoc(result.body_html)}
            sandbox=""
            title={t.emailTemplates.previewHtmlTitle}
            className="w-full rounded border bg-white"
            style={{ height: '300px', colorScheme: 'light' }}
          />
        </div>
        {/* landr-7tyo: render_error banner sits directly below the iframe
            so the operator sees both the partial render the engine
            produced and the error explaining why it stopped. */}
        {renderError && (
          <div
            role="alert"
            className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive dark:border-destructive/60 dark:bg-destructive/10"
          >
            <p className="font-semibold uppercase tracking-wide">
              {t.emailTemplates.previewRenderErrorTitle}
            </p>
            <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">
              {renderError}
            </pre>
            <p className="mt-1 text-[11px] text-destructive/80">
              {t.emailTemplates.previewRenderErrorHint}
            </p>
          </div>
        )}
        {result.body_text && (
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {t.emailTemplates.previewText}
            </p>
            <pre className="bg-muted rounded p-2 text-xs overflow-auto max-h-40">
              {result.body_text}
            </pre>
          </div>
        )}
      </div>

      {/* Variable catalog — full width below the preview */}
      <EmailVariableCatalog entries={contextEntries} />
    </div>
  )
}

// landr-x5o5.5: exported so EmailTemplates.tsx can render the catalog
// in the editor for ANY kind, independent of whether a saved template
// exists. Accepts the catalog API shape (VariableCatalogEntry[]).
export function EmailVariableCatalog({
  entries,
}: {
  entries: VariableCatalogEntry[]
}) {
  async function copy(key: string) {
    const placeholder = `{{ ${key} }}`
    try {
      await navigator.clipboard.writeText(placeholder)
      toast.success(t.emailTemplates.variablesCopied)
    } catch {
      toast.error(t.emailTemplates.variablesCopyError)
    }
  }

  return (
    <aside
      aria-label={t.emailTemplates.variablesTitle}
      className="flex w-full flex-col gap-2 rounded border bg-muted/40 p-3"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide">
          {t.emailTemplates.variablesTitle}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t.emailTemplates.variablesHint}
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t.emailTemplates.variablesEmpty}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {entries.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                onClick={() => copy(entry.name)}
                aria-label={t.emailTemplates.variablesCopyAria(entry.name)}
                title={entry.description}
                className="group flex flex-col items-start gap-0.5 rounded border bg-background px-2 py-1.5 text-left text-xs hover:border-primary/60 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code className="font-mono text-[11px] text-primary group-hover:underline">
                  {`{{ ${entry.name} }}`}
                </code>
                <span className="line-clamp-1 text-[10px] text-muted-foreground">
                  <span className="mr-1 uppercase tracking-wide">
                    {t.emailTemplates.variablesSampleLabel}:
                  </span>
                  {formatSample(entry.sample)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function formatSample(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
