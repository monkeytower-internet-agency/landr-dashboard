/**
 * ProductShortcodeMenu (landr-up1b).
 *
 * Per-product "copy widget shortcode" affordance. Two surfaces:
 *
 *  - `variant="row"` — a single dropdown item used inside the Products
 *    list row menu: copies the single-product shortcode in one click.
 *  - `variant="detail"` — a richer dropdown for the product detail
 *    header: a breadcrumb walk of the product's category up to the root
 *    (each level offers "copy shortcode for this category level") plus a
 *    "copy this single product" option.
 *
 * The shortcode grammar is centralised in `@/lib/shortcode`.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CopyIcon, FolderTreeIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  breadcrumbFor,
  fetchProductGroupTree,
  type ProductGroup,
} from '@/lib/productGroups'
import { buildShortcode } from '@/lib/shortcode'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  operatorSlug: string
  productSlug: string
  /** The product's product_group_id (root of the breadcrumb walk). */
  productGroupId: string | null
  variant: 'row' | 'detail'
}

async function copy(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    toast.success(t.productShortcode.toastCopied)
  } catch {
    toast.error(t.productShortcode.toastError)
  }
}

export function ProductShortcodeMenu({
  operatorId,
  operatorSlug,
  productSlug,
  productGroupId,
  variant,
}: Props) {
  const [open, setOpen] = useState(false)

  // Only fetch the tree once the menu opens (detail) — the row variant
  // never needs it (single-product copy is slug-only). Cached across rows.
  const needTree = variant === 'detail'
  const treeQuery = useQuery<ProductGroup[]>({
    queryKey: ['product-group-tree', operatorId],
    queryFn: () => fetchProductGroupTree(operatorId),
    enabled: needTree && open && !!operatorId,
  })

  const breadcrumb = useMemo(() => {
    if (!productGroupId) return []
    return breadcrumbFor(treeQuery.data ?? [], productGroupId)
  }, [treeQuery.data, productGroupId])

  const productCode = useMemo(
    () => buildShortcode({ operator: operatorSlug, product: productSlug }),
    [operatorSlug, productSlug],
  )

  // Row variant: one-click single-product copy (no menu).
  if (variant === 'row') {
    return (
      <DropdownMenuItem onSelect={() => copy(productCode)}>
        <CopyIcon className="mr-2 size-4" />
        {t.productShortcode.copyProductRow}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          data-testid="product-shortcode-trigger"
        >
          <FolderTreeIcon className="size-4" />
          {t.productShortcode.menuLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-xs">
        <DropdownMenuItem onSelect={() => copy(productCode)}>
          <CopyIcon className="mr-2 size-4" />
          {t.productShortcode.copyProductDetail}
        </DropdownMenuItem>

        {breadcrumb.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {t.productShortcode.categoryLevelsLabel}
            </DropdownMenuLabel>
            {breadcrumb.map((cat, idx) => {
              const code = buildShortcode({
                operator: operatorSlug,
                group: cat.slug,
              })
              return (
                <DropdownMenuItem
                  key={cat.id}
                  onSelect={() => copy(code)}
                  data-testid={`product-shortcode-cat-${cat.id}`}
                >
                  <CopyIcon className="mr-2 size-4 shrink-0" />
                  <span className="truncate">
                    {/* Indent deeper levels so the breadcrumb reads
                        root → … → leaf. */}
                    {' '.repeat(idx * 2)}
                    {t.productShortcode.copyCategoryLevel(cat.name)}
                  </span>
                </DropdownMenuItem>
              )
            })}
          </>
        ) : treeQuery.isPending ? (
          <DropdownMenuItem disabled>
            {t.productShortcode.loading}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            {t.productShortcode.noCategory}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
