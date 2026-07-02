// landr-72u2.2 — Settings → Tiers & features (STAFF-ONLY) — v2 editor.
//
// Three panels:
//   A. FEATURE CATALOG — read-only reference of all features (active +
//      retired). Searchable by name/description/key. Grouped by category;
//      retired features under a collapsible disclosure at the bottom.
//   B. TIER MATRIX — per-tier feature toggles (package_features). For
//      parametric features a "params" chip opens a typed param editor popover
//      so staff can set tier-level config blobs (e.g. max_products).
//   C. OPERATOR OVERRIDE — per-operator force on/off + param override
//      (operator_features). Shows the effective resolution via the NEW
//      operator_effective_entitlements RPC so staff see both gate + config.
//
// STAFF GATING: gated to is_landr_staff in three places (sub-sidebar, route
// redirect, RLS). Non-staff who deep-link here get redirected; even if they
// didn't, writes would 403 at the DB.
//
// ASSUMPTION (recorded per spec): EntitlementsProvider switches to the new
// operator_effective_entitlements RPC (fetchEnabledEntitlements). The old
// fetchEnabledFeatures stays for backward compat. We invalidate BOTH query
// keys after operator writes for a smooth cutover.
import { Fragment, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { useEntitlements } from '@/lib/entitlements'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import {
  clearOperatorFeature,
  clearOperatorFeatureConfig,
  clearPackageFeatureConfig,
  fetchAllFeatures,
  fetchEffectiveEntitlements,
  fetchFeatures,
  fetchOperatorFeatures,
  fetchOperators,
  fetchPackageFeatures,
  fetchPackages,
  groupFeaturesByCategory,
  setOperatorFeature,
  setOperatorFeatureConfig,
  setPackageFeature,
  setPackageFeatureConfig,
  type EffectiveEntitlement,
  type Feature,
  type FeatureStatus,
  type ParamDef,
  type ValueSchema,
} from '@/lib/tiers'

// ============================================================================
// Shared small components
// ============================================================================

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

function SurfaceChips({ surface }: { surface: string }) {
  const chips = surface
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (chips.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex items-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          {chip}
        </span>
      ))}
    </span>
  )
}

function ParamChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-violet-500/40 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
      {label}
    </span>
  )
}

// ============================================================================
// ParamPopover — shared typed param editor (used by Tier Matrix + Override panel)
// ============================================================================

type ParamPopoverProps = {
  schema: ValueSchema
  currentConfig: Record<string, unknown> | null
  onSave: (config: Record<string, unknown>) => void
  onClear: () => void
  busy: boolean
  clearLabel: string
  title: string
}

function ParamPopover({
  schema,
  currentConfig,
  onSave,
  onClear,
  busy,
  clearLabel,
  title,
}: ParamPopoverProps) {
  const [open, setOpen] = useState(false)
  // Local draft state — initialized from currentConfig when popover opens.
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  function handleOpen(isOpen: boolean) {
    if (isOpen) {
      // Reset draft to current values on open.
      const init: Record<string, unknown> = {}
      for (const param of schema.params) {
        init[param.key] =
          currentConfig?.[param.key] ?? param.default ?? defaultForType(param)
      }
      setDraft(init)
    }
    setOpen(isOpen)
  }

  function defaultForType(param: ParamDef): unknown {
    switch (param.type) {
      case 'integer':
        return param.min ?? 0
      case 'boolean':
        return false
      case 'enum':
        return param.options?.[0] ?? ''
      default:
        return ''
    }
  }

  function setValue(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    onSave(draft)
    setOpen(false)
  }

  function handleClear() {
    onClear()
    setOpen(false)
  }

  const hasConfig = currentConfig && Object.keys(currentConfig).length > 0

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={hasConfig ? 'default' : 'outline'}
          className="h-6 px-2 text-[10px]"
          disabled={busy}
        >
          {t.tierEditor.paramChipLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{title}</p>
          {schema.params.map((param) => (
            <ParamField
              key={param.key}
              param={param}
              value={draft[param.key]}
              onChange={(v) => setValue(param.key, v)}
            />
          ))}
          <div className="flex justify-between gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={handleClear}
            >
              {clearLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={handleSave}
            >
              {t.tierEditor.paramPopoverSaveLabel}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ParamDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground font-medium">{param.label}</span>
      {param.type === 'integer' && (
        <Input
          type="number"
          min={param.min ?? undefined}
          value={String(value ?? 0)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(Number(e.target.value))
          }
          className="h-7 text-xs"
        />
      )}
      {param.type === 'boolean' && (
        <Checkbox
          checked={Boolean(value)}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.checked)
          }
        />
      )}
      {param.type === 'string' && (
        <Input
          type="text"
          value={String(value ?? '')}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
          className="h-7 text-xs"
        />
      )}
      {param.type === 'enum' && (
        <NativeSelect
          value={String(value ?? '')}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            onChange(e.target.value)
          }
          className="h-7 text-xs"
        >
          {(param.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </NativeSelect>
      )}
    </label>
  )
}

// ============================================================================
// Root — staff gate + shell
// ============================================================================

export function TierSettings() {
  const { user } = useAuth()
  const { effectiveIsStaff, isLoading: entLoading } = useEntitlements()

  if (entLoading) {
    return (
      // landr-hxnb.7 — comic loading state: settings-hue soft-bg.
      <p
        className="rounded-xl px-6 py-6 text-sm"
        style={{
          background: 'var(--hue-settings-soft-bg)',
          color: 'var(--hue-settings-vivid)',
        }}
      >
        {t.tierEditor.loading}
      </p>
    )
  }
  if (!effectiveIsStaff) return <Navigate to="/" replace />

  return <TierSettingsInner authUid={user?.id ?? null} />
}

function TierSettingsInner({ authUid }: { authUid: string | null }) {
  // Active features — shared by Tier Matrix and Operator Override panels.
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
      // landr-hxnb.7 — comic error card: settings-hue soft-bg.
      <div
        className="animate-slide-up-fade rounded-xl p-6 text-sm"
        style={{
          background: 'var(--hue-settings-soft-bg)',
          color: 'var(--hue-settings-vivid)',
        }}
      >
        <p className="font-display text-lg font-semibold">{t.tierEditor.errorTitle}</p>
        <p className="text-muted-foreground mt-1">
          {(featuresQuery.error as Error | null)?.message ?? ''}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.tiers },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.tiers}
      />

      <FeatureCatalogPanel />

      <TierMatrixPanel
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
// Panel A — Feature Catalog (read-only reference).
// ============================================================================

function FeatureCatalogPanel() {
  const [search, setSearch] = useState('')

  const allFeaturesQuery = useQuery({
    queryKey: ['tier-editor', 'all-features'],
    queryFn: fetchAllFeatures,
    staleTime: 1000 * 60 * 5,
  })

  const { active, retired } = useMemo(() => {
    const allFeatures = allFeaturesQuery.data ?? []
    const q = search.trim().toLowerCase()
    const filtered = q
      ? allFeatures.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.key.toLowerCase().includes(q) ||
            (f.description?.toLowerCase().includes(q) ?? false),
        )
      : allFeatures
    return {
      active: filtered.filter((f) => f.active),
      retired: filtered.filter((f) => !f.active),
    }
  }, [allFeaturesQuery.data, search])

  const activeGroups = useMemo(
    () => groupFeaturesByCategory(active),
    [active],
  )

  return (
    // landr-hxnb.7 — Feature Catalog panel: comic section header via
    // font-display + settings hue label; data rows use surface-dense for
    // calm, legible density (information-dense, playfulness only in chrome).
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t.tierEditor.catalogSectionTitle}</h2>
        <p className="text-muted-foreground text-sm">
          {t.tierEditor.catalogSectionHint}
        </p>
      </div>

      <div className="max-w-xs">
        <Input
          type="search"
          placeholder={t.tierEditor.catalogSearchPlaceholder}
          value={search}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
      </div>

      {allFeaturesQuery.isPending ? (
        <p
          className="rounded-xl px-4 py-4 text-sm"
          style={{
            background: 'var(--hue-settings-soft-bg)',
            color: 'var(--hue-settings-vivid)',
          }}
        >
          {t.tierEditor.loading}
        </p>
      ) : (
        <>
          <FeatureGroupedList
            groups={activeGroups}
            renderFeature={(feature) => (
              <CatalogFeatureRow key={feature.id} feature={feature} />
            )}
          />

          {retired.length > 0 && (
            <details className="mt-2">
              <summary className="text-muted-foreground cursor-pointer select-none text-xs font-semibold uppercase tracking-wide">
                {t.tierEditor.catalogRetiredLabel} ({retired.length})
              </summary>
              <div className="mt-2 flex flex-col gap-1.5">
                {retired.map((feature) => (
                  <CatalogFeatureRow key={feature.id} feature={feature} dimmed />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function CatalogFeatureRow({
  feature,
  dimmed = false,
}: {
  feature: Feature
  dimmed?: boolean
}) {
  return (
    // landr-hxnb.7 — surface-dense well for catalog rows: calm, desaturated,
    // legible. Playfulness lives only in section/panel chrome above.
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${dimmed ? 'opacity-60' : ''}`}
      style={{ background: 'var(--surface-dense)', borderColor: 'var(--surface-dense-border)' }}
    >
      <span className="flex flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {feature.name}
          <StatusBadge status={feature.status} />
          <SurfaceChips surface={feature.surface} />
          {feature.value_schema && (
            <ParamChip label={t.tierEditor.catalogParamChip} />
          )}
        </span>
        <span className="text-muted-foreground/70 text-[10px] font-mono">
          {feature.key}
        </span>
        {feature.description && (
          <span className="text-muted-foreground text-xs">
            {feature.description}
          </span>
        )}
      </span>
    </div>
  )
}

// ============================================================================
// Panel B — Tier Matrix (rework of old TierPanel).
// ============================================================================

type PanelProps = {
  groups: ReturnType<typeof groupFeaturesByCategory>
  features: Feature[]
  loading: boolean
}

function TierMatrixPanel({ groups, features, loading }: PanelProps) {
  const qc = useQueryClient()
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

  const tierSetting = useMemo(() => {
    const m = new Map<string, { enabled: boolean; config: Record<string, unknown> | null }>()
    for (const row of pkgFeaturesQuery.data ?? [])
      m.set(row.feature_id, { enabled: row.enabled, config: row.config })
    return m
  }, [pkgFeaturesQuery.data])

  function invalidateAfterTierWrite() {
    qc.invalidateQueries({
      queryKey: ['tier-editor', 'package-features', packageId],
    })
    qc.invalidateQueries({ queryKey: ['operator-effective-features'] })
    qc.invalidateQueries({ queryKey: ['operator-effective-entitlements'] })
  }

  const toggleMutation = useMutation({
    mutationFn: (args: { featureId: string; enabled: boolean }) =>
      setPackageFeature({ packageId, featureId: args.featureId, enabled: args.enabled }),
    onSuccess: () => {
      invalidateAfterTierWrite()
      toast.success(t.tierEditor.tierSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const configMutation = useMutation({
    mutationFn: (args: { featureId: string; config: Record<string, unknown>; enabled: boolean }) =>
      setPackageFeatureConfig({
        packageId,
        featureId: args.featureId,
        config: args.config,
        enabled: args.enabled,
      }),
    onSuccess: () => {
      invalidateAfterTierWrite()
      toast.success(t.tierEditor.tierSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const clearConfigMutation = useMutation({
    mutationFn: (featureId: string) =>
      clearPackageFeatureConfig({ packageId, featureId }),
    onSuccess: () => {
      invalidateAfterTierWrite()
      toast.success(t.tierEditor.tierSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const busy =
    toggleMutation.isPending ||
    configMutation.isPending ||
    clearConfigMutation.isPending

  return (
    // landr-hxnb.7 — Tier Matrix panel: comic header; dense feature rows use
    // surface-dense so the matrix stays information-dense and calm.
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t.tierEditor.matrixSectionTitle}</h2>
        <p className="text-muted-foreground text-sm">
          {t.tierEditor.matrixSectionHint}
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
        <p
          className="rounded-xl px-4 py-4 text-sm"
          style={{
            background: 'var(--hue-settings-soft-bg)',
            color: 'var(--hue-settings-vivid)',
          }}
        >
          {t.tierEditor.loading}
        </p>
      ) : (
        <FeatureGroupedList
          groups={groups}
          renderFeature={(feature) => {
            const setting = tierSetting.get(feature.id)
            const effective = setting?.enabled ?? feature.default_enabled
            const config = setting?.config ?? null
            return (
              // landr-hxnb.7 — surface-dense for tier matrix rows.
              <label
                key={feature.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
                style={{
                  background: 'var(--surface-dense)',
                  borderColor: 'var(--surface-dense-border)',
                }}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={effective}
                  disabled={!packageId || busy}
                  onChange={(e) =>
                    toggleMutation.mutate({
                      featureId: feature.id,
                      enabled: e.target.checked,
                    })
                  }
                />
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {feature.name}
                    <StatusBadge status={feature.status} />
                    {setting === undefined && (
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
                {feature.value_schema && (
                  <div
                    onClick={(e) => e.preventDefault()}
                    className="shrink-0"
                  >
                    <ParamPopover
                      schema={feature.value_schema}
                      currentConfig={config}
                      onSave={(cfg) =>
                        configMutation.mutate({ featureId: feature.id, config: cfg, enabled: effective })
                      }
                      onClear={() => clearConfigMutation.mutate(feature.id)}
                      busy={busy}
                      clearLabel={t.tierEditor.paramPopoverClearLabel}
                      title={t.tierEditor.paramPopoverTitle}
                    />
                  </div>
                )}
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
// Panel C — Operator Override (extended with param config).
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

  // Use new RPC for effective resolution (includes config).
  const effectiveQuery = useQuery({
    queryKey: ['tier-editor', 'effective-entitlements', operatorId],
    queryFn: () => fetchEffectiveEntitlements(operatorId),
    enabled: !!operatorId,
  })

  const overrideByFeature = useMemo(() => {
    const m = new Map<
      string,
      { enabled: boolean; note: string | null; config: Record<string, unknown> | null }
    >()
    for (const row of overridesQuery.data ?? [])
      m.set(row.feature_id, {
        enabled: row.enabled,
        note: row.note,
        config: row.config,
      })
    return m
  }, [overridesQuery.data])

  function invalidateAfterWrite() {
    qc.invalidateQueries({
      queryKey: ['tier-editor', 'operator-features', operatorId],
    })
    qc.invalidateQueries({
      queryKey: ['tier-editor', 'effective-entitlements', operatorId],
    })
    // Refresh the live gating context for this operator — invalidate BOTH
    // old and new query keys for a smooth cutover.
    qc.invalidateQueries({
      queryKey: ['operator-effective-features', operatorId],
    })
    qc.invalidateQueries({
      queryKey: ['operator-effective-entitlements', operatorId],
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

  const setConfigMutation = useMutation({
    mutationFn: (args: {
      featureId: string
      config: Record<string, unknown>
      enabled: boolean
    }) =>
      setOperatorFeatureConfig({
        operatorId,
        featureId: args.featureId,
        config: args.config,
        enabled: args.enabled,
        enabledByUserId,
      }),
    onSuccess: () => {
      invalidateAfterWrite()
      toast.success(t.tierEditor.overrideSaved)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const clearConfigMutation = useMutation({
    mutationFn: (featureId: string) =>
      clearOperatorFeatureConfig({ operatorId, featureId }),
    onSuccess: () => {
      invalidateAfterWrite()
      toast.success(t.tierEditor.overrideCleared)
    },
    onError: (err: Error) =>
      toast.error(`${t.tierEditor.saveFailed}: ${err.message}`),
  })

  const busy =
    setMutation.isPending ||
    clearMutation.isPending ||
    setConfigMutation.isPending ||
    clearConfigMutation.isPending

  const effective = effectiveQuery.data

  return (
    // landr-hxnb.7 — Operator Override panel: comic header; override rows use
    // surface-dense for dense legible ops data.
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
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
        // landr-hxnb.7 — comic empty state with settings-hue tint.
        <p
          className="animate-slide-up-fade rounded-xl px-4 py-6 text-center text-sm font-medium"
          style={{
            background: 'var(--hue-settings-soft-bg)',
            color: 'var(--hue-settings-vivid)',
          }}
        >
          {t.tierEditor.overrideEmpty}
        </p>
      ) : loading || overridesQuery.isPending ? (
        <p
          className="rounded-xl px-4 py-4 text-sm"
          style={{
            background: 'var(--hue-settings-soft-bg)',
            color: 'var(--hue-settings-vivid)',
          }}
        >
          {t.tierEditor.loading}
        </p>
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
              const eff: EffectiveEntitlement | undefined = effective?.get(feature.key)
              return (
                // landr-hxnb.7 — surface-dense for override rows: dense, calm, legible.
                <div
                  key={feature.id}
                  className="flex flex-col gap-2 rounded-md border p-3"
                  style={{
                    background: 'var(--surface-dense)',
                    borderColor: 'var(--surface-dense-border)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {feature.name}
                        <StatusBadge status={feature.status} />
                        {eff !== undefined && (
                          <span
                            className={`text-[10px] font-medium uppercase ${
                              eff.enabled
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-muted-foreground'
                            }`}
                            title={t.tierEditor.effectiveTooltip}
                          >
                            {eff.enabled
                              ? t.tierEditor.effectiveOn
                              : t.tierEditor.effectiveOff}
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
                      {eff?.config && Object.keys(eff.config).length > 0 && (
                        <span className="text-muted-foreground/70 text-[10px] font-mono">
                          {t.tierEditor.effectiveConfigLabel}{' '}
                          {JSON.stringify(eff.config)}
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <OverrideButton
                        label={t.tierEditor.forceOn}
                        active={override?.enabled === true}
                        disabled={busy}
                        onClick={() =>
                          setMutation.mutate({
                            featureId: feature.id,
                            enabled: true,
                          })
                        }
                      />
                      <OverrideButton
                        label={t.tierEditor.forceOff}
                        active={override?.enabled === false}
                        disabled={busy}
                        onClick={() =>
                          setMutation.mutate({
                            featureId: feature.id,
                            enabled: false,
                          })
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
                      {feature.value_schema && (
                        <ParamPopover
                          schema={feature.value_schema}
                          currentConfig={override?.config ?? null}
                          onSave={(cfg) =>
                            setConfigMutation.mutate({
                              featureId: feature.id,
                              config: cfg,
                              // landr-7hac: pass the currently-resolved
                              // effective state so a params-only edit can't
                              // silently INSERT a forced-OFF override when
                              // none existed yet (operator_features.enabled
                              // is NOT NULL DEFAULT false).
                              enabled: override?.enabled ?? eff?.enabled ?? false,
                            })
                          }
                          onClear={() =>
                            clearConfigMutation.mutate(feature.id)
                          }
                          busy={busy}
                          clearLabel={t.tierEditor.paramPopoverOperatorClearLabel}
                          title={t.tierEditor.operatorParamPopoverTitle}
                        />
                      )}
                    </div>
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
    // landr-hxnb.7 — category group headers use font-display and settings hue
    // for comic identity; data rows inside each group stay dense via surface-dense.
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <Fragment key={group.category}>
          <div className="flex flex-col gap-2">
            <h3
              className="font-display text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--hue-settings-vivid)' }}
            >
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
