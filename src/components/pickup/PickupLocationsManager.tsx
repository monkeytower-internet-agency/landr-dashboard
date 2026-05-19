import { useState } from 'react'
import { MapPinIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LocationDeleteDialog } from '@/components/LocationDeleteDialog'
import { LocationFormSheet } from '@/components/LocationFormSheet'
import { LocationsTable } from '@/components/LocationsTable'
import {
  fetchLocationRoleTypes,
  fetchLocations,
  type Location,
  type LocationRoleType,
} from '@/lib/locations'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { useQuery } from '@tanstack/react-query'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  /** Hide the page-style header (title + subtitle); used when rendered inside a Sheet that has its own header. */
  hideHeader?: boolean
}

export function PickupLocationsManager({ operatorId, hideHeader = false }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Location | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null)

  const locationsQuery = useRealtimeQuery<Location[]>({
    queryKey: ['locations', operatorId],
    queryFn: () => fetchLocations(operatorId),
    enabled: !!operatorId,
    realtime: {
      table: 'locations',
      filter: `operator_id=eq.${operatorId}`,
    },
  })

  const roleTypesQuery = useQuery<LocationRoleType[]>({
    queryKey: ['location-role-types', operatorId],
    queryFn: () => fetchLocationRoleTypes(operatorId),
    enabled: !!operatorId,
  })

  const locations = locationsQuery.data ?? []
  const roleTypes = roleTypesQuery.data ?? []

  function openCreate() {
    setEditTarget(null)
    setFormOpen(true)
  }

  function openEdit(row: Location) {
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
            <h1 className="text-xl font-semibold">
              {t.pickupLocations.title}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t.pickupLocations.subtitle}
            </p>
          </div>
        )}
        <Button type="button" onClick={openCreate}>
          <MapPinIcon className="size-4" />
          {t.pickupLocations.addLocation}
        </Button>
      </header>

      {locationsQuery.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.pickupLocations.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {locationsQuery.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : locationsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">
          {t.pickupLocations.loading}
        </p>
      ) : (
        <LocationsTable
          rows={locations}
          roleTypes={roleTypes}
          onEdit={openEdit}
          onDelete={(row) => setDeleteTarget(row)}
        />
      )}

      <LocationFormSheet
        open={formOpen}
        onOpenChange={handleFormOpenChange}
        operatorId={operatorId}
        locations={locations}
        roleTypes={roleTypes}
        editTarget={editTarget}
      />
      <LocationDeleteDialog
        location={deleteTarget}
        operatorId={operatorId}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      />
    </div>
  )
}
