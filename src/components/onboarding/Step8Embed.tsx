import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { t } from '@/lib/strings'
import { buildShortcode, fetchWidgetToken } from '@/lib/shortcode'
import { StepShell } from './StepShell'

type Props = {
  operatorId: string
  onFinish: () => void
  onBack: () => void
  finishing?: boolean
}

export function Step8Embed({ operatorId, onFinish, onBack, finishing }: Props) {
  const [copied, setCopied] = useState(false)

  // landr-il9f.3 — embed snippets resolve the operator by an opaque,
  // rotatable widget_token (NOT the slug), to prevent operator enumeration.
  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', operatorId],
    queryFn: () => fetchWidgetToken(operatorId),
    enabled: !!operatorId,
  })
  const widgetToken = tokenQuery.data ?? null
  const mainCode = widgetToken ? buildShortcode({ token: widgetToken }) : null

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(t.onboarding.step8.copied)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t.onboarding.saveError)
    }
  }

  return (
    <StepShell heading={t.onboarding.step8.heading} body={t.onboarding.step8.body}>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
        {mainCode ? (
          <>
            <code className="flex-1 truncate">{mainCode}</code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copy(mainCode)}
              aria-label={t.onboarding.step8.copy}
            >
              {copied ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              <span className="ml-1">
                {copied ? t.onboarding.step8.copied : t.onboarding.step8.copy}
              </span>
            </Button>
          </>
        ) : (
          <span className="text-muted-foreground" role="status">
            {tokenQuery.isError
              ? t.onboarding.step8.tokenError
              : t.onboarding.step8.loading}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t.onboarding.step8.filterHint}</p>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.onboarding.back}
        </Button>
        <Button type="button" onClick={onFinish} disabled={finishing}>
          {finishing ? t.onboarding.saving : t.onboarding.step8.done}
        </Button>
      </div>
    </StepShell>
  )
}
