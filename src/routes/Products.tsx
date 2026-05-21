import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ProductsManager } from '@/components/products/ProductsManager'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function Products() {
  const { currentOperatorId } = useOperator()
  const navigate = useNavigate()
  // landr-i018 — /products/:productId deep-links to a specific product so
  // cross-page links (e.g. the Pricing settings 'Used by' chips) can
  // open the editor directly. The plain /products route renders the
  // list view; /products/:productId renders the detail full-page (landr-li8e).
  const { productId } = useParams<{ productId?: string }>()

  // landr-li8e — URL is the source of truth for the active product. Selecting
  // a row in the list pushes /settings/products/:id (full-page detail);
  // 'Back to list' pops back to /settings/products (list-only).
  const handleSelect = useCallback(
    (id: string | null) => {
      navigate(id ? `/settings/products/${id}` : '/settings/products')
    },
    [navigate],
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {/* landr-fx2i — set the topbar breadcrumb even before the
            operator id is available so the loading shell doesn't
            momentarily show the parent SettingsLayout's "Settings"
            title. */}
        <PageTitle
          crumbs={[
            { label: t.app.settings, to: '/settings' },
            { label: t.products.title },
          ]}
        />
        <header>
          <h1 className="text-xl font-semibold">{t.products.title}</h1>
        </header>
        <p className="text-muted-foreground text-sm">{t.products.loading}</p>
      </div>
    )
  }

  return (
    <ProductsManager
      operatorId={currentOperatorId}
      urlSelection={productId ?? null}
      onUrlSelect={handleSelect}
    />
  )
}
