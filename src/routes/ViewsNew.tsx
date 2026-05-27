// landr-v0xg — view-materialisation route.
//
// /views/new                    → blank Untitled Personal View
// /views/new?from=template:KEY  → template-seeded Personal View
//
// On mount: POST createSavedView, then replace navigate to /views/:id.
// On error: surface a small inline message with a back link.
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import {
  createSavedView,
  type SavedViewCreate,
} from '@/lib/saved-views'
import { findTemplateByKey } from '@/lib/views-templates'
import { t } from '@/lib/strings'

const TEMPLATE_PREFIX = 'template:'

function parseTemplateKey(from: string | null): string | null {
  if (!from) return null
  return from.startsWith(TEMPLATE_PREFIX)
    ? from.slice(TEMPLATE_PREFIX.length)
    : null
}

function buildCreatePayload(from: string | null): SavedViewCreate {
  const tplKey = parseTemplateKey(from)
  if (tplKey) {
    const tpl = findTemplateByKey(tplKey)
    if (tpl) {
      return {
        name: tpl.name,
        entity_type: tpl.entity_type,
        visibility: 'personal',
        config: tpl.config,
      }
    }
    // Unknown template key — fall through to blank Untitled.
  }
  return {
    name: 'Untitled view',
    entity_type: 'booking',
    visibility: 'personal',
    config: { layout: 'table', filters: [], sort: [] },
  }
}

export function ViewsNew() {
  const { currentOperatorId } = useOperator()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  // Read once on mount; subsequent renders with the same operator+from
  // shouldn't re-fire the create. The dep array uses the serialised
  // search-string to stay stable across react-router param-object identity
  // churn (mirrors the page-title.tsx pattern).
  const from = params.get('from')

  useEffect(() => {
    if (!currentOperatorId) return
    let cancelled = false
    void (async () => {
      try {
        const payload = buildCreatePayload(from)
        const created = await createSavedView(currentOperatorId, payload)
        if (cancelled) return
        // Invalidate the list so the sidebar (Phase 6) and the index page
        // pick up the new View immediately.
        await qc.invalidateQueries({
          queryKey: ['saved-views', currentOperatorId],
        })
        navigate(`/views/${created.id}`, { replace: true })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to create view')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentOperatorId, from, navigate, qc])

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.viewsIndex.title} />
      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Failed to create view</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{error}</p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">Creating view…</p>
      )}
    </div>
  )
}

// landr-mhhq — default export so the route can be lazy-loaded alongside
// the rest of the /views family in App.tsx. Named export is preserved
// for direct test imports.
export default ViewsNew
