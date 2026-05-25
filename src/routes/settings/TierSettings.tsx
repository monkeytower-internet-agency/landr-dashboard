// landr-sbhz.5 — Settings → Tiers & features (STAFF-ONLY).
//
// The Landr-staff control surface for the tier/feature-entitlement system
// (foundation landr-sbhz.1). Two panels:
//
//   1. TIER editor — pick a subscription_packages tier, toggle each registry
//      feature on/off for that tier (writes package_features). Features are
//      grouped by category with a ga/beta/wip status badge.
//   2. OPERATOR OVERRIDE — pick an operator, force individual features on/off
//      (writes operator_features with a note) — the "unlock one feature at a
//      time for Martin/Para42" lever. Shows the EFFECTIVE resolution
//      (override > tier > default) via operator_effective_features so staff
//      see exactly what the operator gets.
//
// STAFF GATING: this is Landr tooling, NOT a tenant-entitlement-gated module
// (like /audit it is left out of the feature registry). Access is gated to
// is_landr_staff in three places: the sub-sidebar hides the section for
// non-staff, the route redirects non-staff to home, and — the real
// enforcement — RLS makes package_features / operator_features staff-write
// only. Non-staff who deep-link here get redirected; even if they didn't, the
// writes would 403 at the DB.
import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { useEntitlements } from '@/lib/entitlements'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import {
  clearOperatorFeature,
  fetchEffectiveFeatures,
  fetchFeatures,
  fetchOperatorFeatures,
  fetchOperators,
  fetchPackageFeatures,
  fetchPackages,
  groupFeaturesByCategory,
  setOperatorFeature,
  setPackageFeature,
  type Feature,
  type FeatureStatus,
} from '@/lib/tiers'

const STATUS_BADGE: Record<FeatureStatus, string> = {
  ga: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  beta: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  wip: 'border-muted-foreground/40 text-muted-foreground',
}

function StatusBadge({ status }: { status: FeatureStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[status]}`}
    >
      {status}
    </span>
  )
}

export function TierSettings() {
  const { user } = useAuth()
  const { isLandrStaff, isLoading: entLoading } = useEntitlements()

  // Staff route guard. While the staff flag is still resolving we render a
  // placeholder rather than flashing the page or a wrong redirect.
  if (entLoading) {
    return (
      <p className="text-muted-foreground p-6 text-sm">{t.tierEditor.loading}</p>
    )
  }
  if (!isLandrStaff) return <Navigate to="/" replace />

  return <TierSettingsInner authUid={user?.id ?? null} />
}

function TierSettingsInner({ authUid }: { authUid: string | null }) {
  // ---- shared registry ----
  const featuresQuery = useQuery({
    queryKey: ['tier-editor', 'features'],
    queryFn: fetchFeatures,
    staleTime: 1000 * 60 * 5,
  })
  const groups = useMemo(
    () => groupFeaturesByCategory(featuresQuery.data ?? []),
    [featuresQuery.data],
  )

  if (featuresQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.tierEditor.errorTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {(featuresQuery.error as Error | null)?.message ?? ''}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.tiers },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.tiers}
      />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t.tierEditor.title}</h1>
        <p className="text-muted-foreground text-sm">{t.tierEditor.subtitle}</p>
      </header>

      <TierPanel
        groups={groups}
        loading={featuresQuery.isPending}
        features={featuresQuery.data ?? []}
      />
      <OperatorOverridePanel
        groups={groups}
        loading={featuresQuery.isPending}
        features={featuresQuery.data ?? []}
        authUid={authUid}
      />
    </div>
  )
}

// ============================================================================
// Panel 1 — per-tier feature toggles (package_features).
// ============================================================================

type PanelProps = {
  groups: ReturnType<typeof groupFeaturesByCategory>
  features: Feature[]
  loading: boolean
}

function TierPanel({ groups, features, loading }: PanelProps) {
  const qc = useQueryClient()
  // `selectedId` holds the user's EXPLICIT pick (empty until they touch the
  // picker). The effective tier defaults to the first package — derived, not
  // stored, so we never setState in an effect (react-hooks/set-state-in-effect).
  const [selectedId, setSelectedId] = useState<string>('')

  const packagesQuery = useQuery({
    queryKey: ['tier-editor', 'packages'],
    queryFn: fetchPackages,
    staleTime: 1000 * 60 * 5,
  })

  const packages = packagesQuery.data ?? []
  const packageId =
    selectedId && packages.some((p) => p.id === selectedId)
      ? selectedId
      : (packages[0]?.id ?? '')

  const pkgFeaturesQuery = useQuery({
    queryKey: ['tier-editor', 'package-features', packageId],
    queryFn: () => fetchPackageFeatures(packageId),
    enabled: !!packageId,
  })

  // feature_id → explicit tier setting (absent ⇒ falls through to default).
  const tierSetting = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const row of pkgFeaturesQuery.data ?? []) m.set(row.feature_id, row.enabled)
    return m
  }, [pkgFeaturesQuery.data])

  const mutation = useMutation({
    mutationFn: (args: { featureId: string; enabled: boolean }) =>
      setPackageFeature({ packageId, featureId: args.featureId, enabled: args.enabled }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['tier-editor', 'package-features', packageId],
      })
      // Gating reads the resolver per-operator; invalidate so any operator on
      // this tier re-resolves their nav/routes after the change.
      qc.invalidateQueries({ queryKey: ['operator-effective-features'] })
      toast.success(t.tierEditor.tierSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t.tierEditor.tierSectionTitle}</h2>
        <p className="text-muted-foreground text-sm">
          {t.tierEditor.tierSectionHint}
        </p>
      </div>

      <label className="flex max-w-xs flex-col gap-1 text-xs">
        <span className="text-muted-foreground">{t.tierEditor.tierPickerLabel}</span>
        <NativeSelect
          aria-label={t.tierEditor.tierPickerLabel}
          value={packageId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={packagesQuery.isPending}
        >
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name}
              {pkg.active ? '' : ` ${t.tierEditor.inactiveSuffix}`}
            </option>
          ))}
        </NativeSelect>
      </label>

      {loading || pkgFeaturesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.tierEditor.loading}</p>
      ) : (
        <FeatureGroupedList
          groups={groups}
          renderFeature={(feature) => {
            const explicit = tierSetting.get(feature.id)
            const effective = explicit ?? feature.default_enabled
            return (
              <label
                key={feature.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={effective}
                  disabled={!packageId || mutation.isPending}
                  onChange={(e) =>
                    mutation.mutate({
                      featureId: feature.id,
                      enabled: e.target.checked,
                    })
                  }
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {feature.name}
                    <StatusBadge status={feature.status} />
                    {explicit === undefined && (
                      <span className="text-muted-foreground text-[10px] uppercase">
                        {t.tierEditor.defaultBadge}
                      </span>
                    )}
                  </span>
                  {feature.description && (
                    <span className="text-muted-foreground text-xs">
                      {feature.description}
                    </span>
                  )}
                </span>
              </label>
            )
          }}
        />
      )}
      {features.length === 0 && !loading && (
        <p className="text-muted-foreground text-sm">{t.tierEditor.noFeatures}</p>
      )}
    </section>
  )
}

// ============================================================================
// Panel 2 — per-operator override (operator_features) + effective resolution.
// ============================================================================

function OperatorOverridePanel({
  groups,
  loading,
  authUid,
}: PanelProps & { authUid: string | null }) {
  const qc = useQueryClient()
  const [operatorId, setOperatorId] = useState<string>('')
  const [note, setNote] = useState<string>('')

  const operatorsQuery = useQuery({
    queryKey: ['tier-editor', 'operators'],
    queryFn: fetchOperators,
    staleTime: 1000 * 60 * 5,
  })

  // Resolve the acting staff user's public.users id for the override audit
  // stamp (operator_features.enabled_by_user_id). Best-effort: a null id still
  // writes a valid override (the column is nullable).
  const publicUserQuery = useQuery({
    queryKey: ['current-public-user', authUid],
    queryFn: () => fetchCurrentPublicUser(authUid as string),
    enabled: !!authUid,
    staleTime: 1000 * 60 * 5,
  })
  const enabledByUserId = publicUserQuery.data?.id ?? null

  const overridesQuery = useQuery({
    queryKey: ['tier-editor', 'operator-features', operatorId],
    queryFn: () => fetchOperatorFeatures(operatorId),
    enabled: !!operatorId,
  })

  const effectiveQuery = useQuery({
    queryKey: ['tier-editor', 'effective', operatorId],
    queryFn: () => fetchEffectiveFeatures(operatorId),
    enabled: !!operatorId,
  })

  // feature_id → override row { enabled, note } (absent ⇒ no override).
  const overrideByFeature = useMemo(() => {
    const m = new Map<string, { enabled: boolean; note: string | null }>()
    for (const row of overridesQuery.data ?? [])
      m.set(row.feature_id, { enabled: row.enabled, note: row.note })
    return m
  }, [overridesQuery.data])

  function invalidateAfterWrite() {
    qc.invalidateQueries({
      queryKey: ['tier-editor', 'operator-features', operatorId],
    })
    qc.invalidateQueries({ queryKey: ['tier-editor', 'effective', operatorId] })
    // Refresh the live gating context (entitlements.tsx) for this operator so
    // nav/routes pick up the unlock immediately.
    qc.invalidateQueries({
      queryKey: ['operator-effective-features', operatorId],
    })
  }

  const setMutation = useMutation({
    mutationFn: (args: { featureId: string; enabled: boolean }) =>
      setOperatorFeature({
        operatorId,
        featureId: args.featureId,
        enabled: args.enabled,
        note: note.trim() || null,
        enabledByUserId,
      }),
    onSuccess: () => {
      invalidateAfterWrite()
      toast.success(t.tierEditor.overrideSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const clearMutation = useMutation({
    mutationFn: (featureId: string) =>
      clearOperatorFeature({ operatorId, featureId }),
    onSuccess: () => {
      invalidateAfterWrite()
      toast.success(t.tierEditor.overrideCleared)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const busy = setMutation.isPending || clearMutation.isPending
  const effective = effectiveQuery.data

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {t.tierEditor.overrideSectionTitle}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.tierEditor.overrideSectionHint}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex max-w-xs flex-1 flex-col gap-1 text-xs">
          <span className="text-muted-foreground">
            {t.tierEditor.operatorPickerLabel}
          </span>
          <NativeSelect
            aria-label={t.tierEditor.operatorPickerLabel}
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            disabled={operatorsQuery.isPending}
          >
            <option value="">{t.tierEditor.operatorPickerPlaceholder}</option>
            {(operatorsQuery.data ?? []).map((op) => (
              <option key={op.id} value={op.id}>
                {op.name ? `${op.name} (${op.slug})` : op.slug}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      {!operatorId ? (
        <p className="text-muted-foreground text-sm">
          {t.tierEditor.overrideEmpty}
        </p>
      ) : loading || overridesQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.tierEditor.loading}</p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{t.tierEditor.noteLabel}</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.tierEditor.notePlaceholder}
              rows={2}
            />
            <span className="text-muted-foreground/70 text-[10px]">
              {t.tierEditor.noteHint}
            </span>
          </label>

          <FeatureGroupedList
            groups={groups}
            renderFeature={(feature) => {
              const override = overrideByFeature.get(feature.id)
              const eff = effective?.get(feature.key)
              return (
                <div
                  key={feature.id}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {feature.name}
                      <StatusBadge status={feature.status} />
                      {eff !== undefined && (
                        <span
                          className={`text-[10px] font-medium uppercase ${
                            eff ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                          }`}
                          title={t.tierEditor.effectiveTooltip}
                        >
                          {eff ? t.tierEditor.effectiveOn : t.tierEditor.effectiveOff}
                        </span>
                      )}
                    </span>
                    {feature.description && (
                      <span className="text-muted-foreground text-xs">
                        {feature.description}
                      </span>
                    )}
                    {override?.note && (
                      <span className="text-muted-foreground/80 text-[11px] italic">
                        {t.tierEditor.notePrefix} {override.note}
                      </span>
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <OverrideButton
                      label={t.tierEditor.forceOn}
                      active={override?.enabled === true}
                      disabled={busy}
                      onClick={() =>
                        setMutation.mutate({ featureId: feature.id, enabled: true })
                      }
                    />
                    <OverrideButton
                      label={t.tierEditor.forceOff}
                      active={override?.enabled === false}
                      disabled={busy}
                      onClick={() =>
                        setMutation.mutate({ featureId: feature.id, enabled: false })
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || override === undefined}
                      onClick={() => clearMutation.mutate(feature.id)}
                    >
                      {t.tierEditor.clearOverride}
                    </Button>
                  </div>
                </div>
              )
            }}
          />
        </>
      )}
    </section>
  )
}

function OverrideButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

// ============================================================================
// Shared — grouped feature list (category sections + status-sorted rows).
// ============================================================================

function FeatureGroupedList({
  groups,
  renderFeature,
}: {
  groups: ReturnType<typeof groupFeaturesByCategory>
  renderFeature: (feature: Feature) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <Fragment key={group.category}>
          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {group.category}
            </h3>
            <div className="flex flex-col gap-1.5">
              {group.features.map((feature) => renderFeature(feature))}
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  )
}

export default TierSettings
