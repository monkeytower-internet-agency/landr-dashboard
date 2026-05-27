// landr-znzz.7 — Settings → Weather.
//
// Opt-in per-operator weather forecast hint for the briefing conditions
// pre-fill. The verdict (go/marginal/no_go) stays manual — weather only
// pre-fills an informational hint shown next to the conditions chips in
// the day-card editor (BookingCustomerPage).
//
// Controls on this page:
//   * Enable/disable toggle (weather_enabled). OFF by default.
//   * Provider select (currently only 'open_meteo'; text slug stored so
//     future providers can be added without a schema change).
//   * Latitude and longitude inputs (WGS-84). Saved via PATCH /api/staff/operators/{id}.
//
// Indoor-climbing operators, etc. can leave this off entirely — they
// never see the forecast hint anywhere in the UI.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CloudSunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import {
  patchOperator,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

// The only currently supported provider. Future providers (e.g. Paraglidable
// — landr-uif5) are added here without any schema change.
const WEATHER_PROVIDERS = [
  { value: 'open_meteo', label: 'Open-Meteo (free, no API key)' },
] as const

type WeatherEditorProps = {
  operator: OperatorSettings
  operatorId: string
  invalidate: () => void
}

function WeatherEditor({ operator, operatorId, invalidate }: WeatherEditorProps) {
  const [enabled, setEnabled] = useState(operator.weather_enabled ?? false)
  const [provider, setProvider] = useState(
    operator.weather_provider ?? 'open_meteo',
  )
  const [lat, setLat] = useState(
    operator.weather_lat != null ? String(operator.weather_lat) : '',
  )
  const [lon, setLon] = useState(
    operator.weather_lon != null ? String(operator.weather_lon) : '',
  )

  const dirty =
    enabled !== (operator.weather_enabled ?? false) ||
    provider !== (operator.weather_provider ?? 'open_meteo') ||
    lat !== (operator.weather_lat != null ? String(operator.weather_lat) : '') ||
    lon !== (operator.weather_lon != null ? String(operator.weather_lon) : '')

  const saveMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => {
      invalidate()
      toast.success(t.weatherSettings.toastSaved)
    },
    onError: (err: Error) =>
      toast.error(t.weatherSettings.toastError, { description: err.message }),
  })

  function save() {
    if (!dirty || saveMutation.isPending) return

    const parsedLat = parseFloat(lat)
    const parsedLon = parseFloat(lon)

    if (enabled) {
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        toast.error(t.weatherSettings.validationLatitude)
        return
      }
      if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
        toast.error(t.weatherSettings.validationLongitude)
        return
      }
    }

    saveMutation.mutate({
      weather_enabled: enabled,
      weather_provider: enabled ? provider : null,
      weather_lat: enabled && !isNaN(parsedLat) ? parsedLat : null,
      weather_lon: enabled && !isNaN(parsedLon) ? parsedLon : null,
    } satisfies OperatorPatch)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CloudSunIcon className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">
              {t.weatherSettings.cardTitle}
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {t.weatherSettings.cardDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Enable toggle */}
          <label className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={saveMutation.isPending}
              data-testid="weather-enabled"
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t.weatherSettings.enableLabel}
              </span>
              <span className="text-muted-foreground text-xs">
                {t.weatherSettings.enableHint}
              </span>
            </span>
          </label>

          {/* Provider + location — only shown (and required) when enabled */}
          {enabled && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="weather-provider">
                  {t.weatherSettings.providerLabel}
                </Label>
                <NativeSelect
                  id="weather-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={saveMutation.isPending}
                  data-testid="weather-provider"
                >
                  {WEATHER_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="weather-lat">
                    {t.weatherSettings.latLabel}
                  </Label>
                  <Input
                    id="weather-lat"
                    type="number"
                    step="0.0001"
                    min="-90"
                    max="90"
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="e.g. 28.9716"
                    disabled={saveMutation.isPending}
                    data-testid="weather-lat"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="weather-lon">
                    {t.weatherSettings.lonLabel}
                  </Label>
                  <Input
                    id="weather-lon"
                    type="number"
                    step="0.0001"
                    min="-180"
                    max="180"
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    placeholder="e.g. -13.5538"
                    disabled={saveMutation.isPending}
                    data-testid="weather-lon"
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                {t.weatherSettings.locationHint}
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              data-testid="weather-save"
            >
              {saveMutation.isPending
                ? t.weatherSettings.saving
                : t.weatherSettings.save}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function WeatherSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.weather },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.weather}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <WeatherEditor
            operator={operator}
            operatorId={operatorId}
            invalidate={invalidate}
          />
        )}
      </OperatorSection>
    </>
  )
}
