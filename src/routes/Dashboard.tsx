import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <header>
          <h1 className="text-xl font-semibold">LANDR Operator Dashboard</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Scaffold ready</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Vite + React 19 + TypeScript + Tailwind + shadcn/ui. Auth, data,
              and PWA come in follow-up tickets (landr-m05.2+).
            </p>
            <Button type="button">Placeholder action</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
