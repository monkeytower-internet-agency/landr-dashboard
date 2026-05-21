import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

// Plan subsection — placeholder. Shows the operator's current
// subscription_package name + slug. The full upgrade flow lands in a
// future ticket (landr-1kk per the briefing); until then the card is
// read-only with a contact-support hint.
export function PlanSettings() {
  return (
    <OperatorSection>
      {({ operator }) => {
        const plan = operator.package
        return (
          <div className="mx-auto max-w-2xl space-y-6">
            <PageTitle
              crumbs={[
                { label: t.app.settings, to: '/settings' },
                { label: t.settingsHub.sections.plan },
              ]}
            />
            <h1 className="text-2xl font-semibold">
              {t.settingsHub.plan.title}
            </h1>
            <Card>
              <CardHeader>
                <CardTitle>{t.settingsHub.plan.title}</CardTitle>
                <CardDescription>
                  {t.settingsHub.plan.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {plan ? (
                  <dl className="grid gap-3 text-sm">
                    <div className="grid gap-0.5">
                      <dt className="text-muted-foreground text-xs">
                        {t.settingsHub.plan.currentLabel}
                      </dt>
                      <dd className="font-medium">{plan.name}</dd>
                    </div>
                    <div className="grid gap-0.5">
                      <dt className="text-muted-foreground text-xs">
                        {t.settingsHub.plan.slugLabel}
                      </dt>
                      <dd className="font-mono text-xs">{plan.slug}</dd>
                    </div>
                    <p className="text-muted-foreground pt-2 text-xs">
                      {t.settingsHub.plan.upgradeHint}
                    </p>
                  </dl>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t.settingsHub.plan.noPlan}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )
      }}
    </OperatorSection>
  )
}
