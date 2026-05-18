import { useQuery } from '@tanstack/react-query'
import { t } from '@/lib/strings'
import { previewTemplate, type EmailTemplate } from '@/lib/emailTemplates'

type Props = {
  operatorId: string
  template: EmailTemplate | null
}

const STUB_MARKER = 'v1 stub'

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
  const isStub =
    typeof result.fixture?.note === 'string' &&
    result.fixture.note.includes(STUB_MARKER)

  return (
    <div className="flex flex-col gap-3">
      {isStub && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {t.emailTemplates.previewStubBanner}
        </div>
      )}
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
          srcDoc={result.body_html}
          sandbox=""
          title={t.emailTemplates.previewHtmlTitle}
          className="w-full rounded border"
          style={{ height: '300px' }}
        />
      </div>
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
  )
}
