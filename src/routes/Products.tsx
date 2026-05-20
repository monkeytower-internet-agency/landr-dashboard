import { useParams } from 'react-router-dom'

import { ProductsManager } from '@/components/products/ProductsManager'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

export function Products() {
  const { currentOperatorId } = useOperator()
  // landr-i018 — /products/:productId deep-links to a specific product so
  // cross-page links (e.g. the Pricing settings 'Used by' chips) can
  // open the editor directly. The plain /products route renders the
  // manager with no initial selection (it auto-picks the first row).
  const { productId } = useParams<{ productId?: string }>()

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
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
      initialSelection={productId ?? null}
    />
  )
}
