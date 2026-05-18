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
  type TemplateFormValues,
} from '@/lib/emailTemplates'

type Props = {
  template: EmailTemplate | null
  saving: boolean
  onSave: (values: TemplateFormValues) => void
  onResetToDefault: () => void
  resetting: boolean
}

export function EmailTemplateForm({
  template,
  saving,
  onSave,
  onResetToDefault,
  resetting,
}: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    values: {
      subject: template?.subject ?? '',
      body_html: template?.body_html ?? '',
      body_text: template?.body_text ?? '',
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
