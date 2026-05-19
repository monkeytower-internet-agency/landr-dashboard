import { ProductsManager } from '@/components/products/ProductsManager'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

export function Products() {
  const { currentOperatorId } = useOperator()

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

  return <ProductsManager operatorId={currentOperatorId} />
}
