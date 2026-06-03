import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@/lib/strings'
import {
  templateFormSchema,
  type EmailTemplate,
  type EffectiveTemplate,
  type TemplateFormValues,
} from '@/lib/emailTemplates'

type Props = {
  template: EmailTemplate | null
  /** landr-x5o5.4: resolved effective template from the /effective endpoint.
   *  Used to prefill the editor with the Landr default when no operator row
   *  exists — the editor is never blank. */
  effectiveTemplate: EffectiveTemplate | null
  saving: boolean
  onSave: (values: TemplateFormValues) => void
  onResetToDefault: () => void
  resetting: boolean
}

export function EmailTemplateForm({
  template,
  effectiveTemplate,
  saving,
  onSave,
  onResetToDefault,
  resetting,
}: Props) {
  // landr-x5o5.4: prefer the operator's own row when it exists; fall back
  // to the effective (resolved) default so the form is NEVER blank.
  const prefill = template ?? effectiveTemplate
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    values: {
      subject: prefill?.subject ?? '',
      body_html: prefill?.body_html ?? '',
      body_text: prefill?.body_text ?? '',
    },
  })

  return (
    <form
      onSubmit={handleSubmit(onSave)}
      aria-label={t.emailTemplates.formAriaLabel}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="et-subject">{t.emailTemplates.fieldSubject}</Label>
        <Input
          id="et-subject"
          {...register('subject')}
          placeholder={t.emailTemplates.fieldSubjectPlaceholder}
          disabled={saving}
        />
        {errors.subject && (
          <p className="text-destructive text-xs">{errors.subject.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="et-body-html">{t.emailTemplates.fieldBodyHtml}</Label>
        <Textarea
          id="et-body-html"
          {...register('body_html')}
          rows={10}
          className="font-mono text-xs"
          placeholder={t.emailTemplates.fieldBodyHtmlPlaceholder}
          disabled={saving}
        />
        {errors.body_html && (
          <p className="text-destructive text-xs">{errors.body_html.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="et-body-text">
          {t.emailTemplates.fieldBodyText}
          <span className="text-muted-foreground ml-1 text-xs">({t.emailTemplates.optional})</span>
        </Label>
        <Textarea
          id="et-body-text"
          {...register('body_text')}
          rows={5}
          className="font-mono text-xs"
          placeholder={t.emailTemplates.fieldBodyTextPlaceholder}
          disabled={saving}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? t.emailTemplates.saving : t.emailTemplates.save}
        </Button>
        {template && (
          <Button
            type="button"
            variant="outline"
            disabled={resetting}
            onClick={onResetToDefault}
          >
            {resetting ? t.emailTemplates.resetting : t.emailTemplates.resetToDefault}
          </Button>
        )}
      </div>
    </form>
  )
}
