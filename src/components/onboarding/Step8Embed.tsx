import { useState } from 'react'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  slug: string
  onFinish: () => void
  onBack: () => void
  finishing?: boolean
}

function shortcode(slug: string, type?: string): string {
  const base = `[landr_booking operator=${slug}`
  return type ? `${base} type=${type}]` : `${base}]`
}

export function Step8Embed({ slug, onFinish, onBack, finishing }: Props) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      toast.success(t.onboarding.step8.copied)
      window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500)
    } catch {
      toast.error(t.onboarding.saveError)
    }
  }

  const variants = [
    { label: t.onboarding.step8.variantCourses, code: shortcode(slug, 'courses') },
    { label: t.onboarding.step8.variantSpecialty, code: shortcode(slug, 'specialty') },
    { label: t.onboarding.step8.variantGuided, code: shortcode(slug, 'guided-days') },
  ]

  const mainCode = shortcode(slug)

  return (
    <StepShell heading={t.onboarding.step8.heading} body={t.onboarding.step8.body}>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">
        <code className="flex-1 truncate">{mainCode}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => copy(mainCode)}
          aria-label={t.onboarding.step8.copy}
        >
          {copiedCode === mainCode ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          <span className="ml-1">
            {copiedCode === mainCode ? t.onboarding.step8.copied : t.onboarding.step8.copy}
          </span>
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t.onboarding.step8.variantsTitle}
        </p>
        {variants.map((v) => (
          <div
            key={v.code}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 font-mono text-xs"
          >
            <span className="text-muted-foreground text-[0.7rem] whitespace-nowrap">
              {v.label}:
            </span>
            <code className="flex-1 truncate">{v.code}</code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => copy(v.code)}
              aria-label={t.onboarding.step8.copy}
            >
              {copiedCode === v.code ? (
                <CheckIcon className="size-3.5" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          </div>
        ))}
      </div>

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
