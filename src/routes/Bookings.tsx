import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/strings'

export function Bookings() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.bookings.title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>{t.bookings.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t.bookings.empty}</p>
        </CardContent>
      </Card>
    </div>
  )
}
