import { useState } from 'react'
import { BedIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HotelDeleteDialog } from '@/components/hotels/HotelDeleteDialog'
import { HotelFormSheet } from '@/components/hotels/HotelFormSheet'
import { HotelsTable } from '@/components/hotels/HotelsTable'
import { fetchHotels, type Hotel } from '@/lib/hotels'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  /** Hide the page-style header (title + subtitle); used when rendered inside a Sheet that has its own header. */
  hideHeader?: boolean
}

export function HotelsManager({ operatorId, hideHeader = false }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Hotel | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Hotel | null>(null)

  // Realtime watches the `locations` table because that's where the realtime
  // publication lives (hotels are locations rows). hotel_details edits also
  // touch locations.name/email, and the invalidate refetches the joined view.
  const hotelsQuery = useRealtimeQuery<Hotel[]>({
    queryKey: ['hotels', operatorId],
    queryFn: () => fetchHotels(operatorId),
    enabled: !!operatorId,
    realtime: {
      table: 'locations',
      filter: `operator_id=eq.${operatorId}`,
    },
  })

  const hotels = hotelsQuery.data ?? []

  function openCreate() {
    setEditTarget(null)
    setFormOpen(true)
  }

  function openEdit(row: Hotel) {
    setEditTarget(row)
    setFormOpen(true)
  }

  function handleFormOpenChange(open: boolean) {
    setFormOpen(open)
    if (!open) setEditTarget(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        {hideHeader ? (
          <div />
        ) : (
          <div>
            <h1 className="text-xl font-semibold">{t.hotels.title}</h1>
            <p className="text-muted-foreground text-sm">{t.hotels.subtitle}</p>
          </div>
        )}
        <Button type="button" onClick={openCreate}>
          <BedIcon className="size-4" />
          {t.hotels.addHotel}
        </Button>
      </header>

      {hotelsQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.hotels.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {hotelsQuery.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : hotelsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.hotels.loading}</p>
      ) : (
        <HotelsTable
          rows={hotels}
          onEdit={openEdit}
          onDelete={(row) => setDeleteTarget(row)}
        />
      )}

      <HotelFormSheet
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        operatorId={operatorId}
        editTarget={editTarget}
      />
      <HotelDeleteDialog
        hotel={deleteTarget}
        operatorId={operatorId}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
