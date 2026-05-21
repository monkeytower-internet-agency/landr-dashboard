import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function Dashboard() {
  const { currentOperator } = useOperator()

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.nav.dashboard} />
      <header>
        <h1 className="text-xl font-semibold">
          {currentOperator?.name ?? currentOperator?.slug ?? 'Dashboard'}
        </h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Scaffold ready</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Auth + operator switcher wired. Data, sidebar, and the rest of the
            shell come in follow-up tickets (landr-m05.3+).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
