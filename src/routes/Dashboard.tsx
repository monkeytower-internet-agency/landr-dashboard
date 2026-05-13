import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOperator } from '@/lib/operator'

export function Dashboard() {
  const { currentOperator } = useOperator()

  return (
    <div className="flex flex-col gap-6">
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
