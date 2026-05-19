import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { NativeSelect } from '@/components/ui/native-select'
import {
  nameToSlug,
  type PricingSchemeRef,
  type ProductGroupRef,
  type ProductRow,
} from '@/lib/products'
import { t } from '@/lib/strings'

// Zod schema for the product form. Mirrors the DB CHECK constraints:
//   - time_slot requires duration_minutes
//   - fixed_date_range bounds must be paired (both NULL or both NOT NULL)
//
// All "free-form" fields are kept as strings here (including numbers like
// duration_minutes and sort_order). Coercion happens in handleSubmit so the
// input/output types of the schema stay identical — which avoids a known
// type-incompatibility between zod's "transformed output" types and
// react-hook-form's strict generics.
const productFormSchema = z
  .object({
    name: z.string().trim().min(1, t.products.errorNameRequired),
    slug: z
      .string()
      .trim()
      .min(1, t.products.errorSlugRequired)
      .regex(/^[a-z0-9-]+$/i, t.products.errorSlugFormat),
    short_description: z.string().max(280),
    description: z.string(),
    product_group_id: z.string(),
    duration_kind: z.enum(['single_days_range', 'fixed_date_range', 'time_slot']),
    duration_minutes: z.string(),
    fixed_start_date: z.string(),
    fixed_end_date: z.string(),
    default_pricing_scheme_id: z.string(),
    needs_provider: z.boolean(),
    needs_pickup: z.boolean(),
    revenue_flows_through_operator: z.boolean(),
    is_publicly_listed: z.boolean(),
    active: z.boolean(),
    sort_order: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.duration_kind === 'time_slot') {
      const trimmed = (data.duration_minutes ?? '').trim()
      const n = Number(trimmed)
      if (!trimmed || !Number.isFinite(n) || n < 1) {
        ctx.addIssue({
          code: 'custom',
          message: t.products.errorDurationRequired,
          path: ['duration_minutes'],
        })
      }
    }
    if (data.duration_kind === 'fixed_date_range') {
      const a = (data.fixed_start_date ?? '').trim()
      const b = (data.fixed_end_date ?? '').trim()
      if ((a && !b) || (!a && b)) {
        ctx.addIssue({
          code: 'custom',
          message: t.products.errorDateRangePaired,
          path: ['fixed_end_date'],
        })
      }
    }
    if (data.sort_order && !Number.isFinite(Number(data.sort_order))) {
      ctx.addIssue({
        code: 'custom',
        message: 'Sort order must be a number.',
        path: ['sort_order'],
      })
    }
  })

export type ProductFormValues = z.infer<typeof productFormSchema>

export type ProductFormSubmitValue = {
  name: string
  slug: string
  short_description: string | null
  description: string | null
  product_group_id: string | null
  duration_kind: 'single_days_range' | 'fixed_date_range' | 'time_slot'
  duration_minutes: number | null
  fixed_start_date: string | null
  fixed_end_date: string | null
  default_pricing_scheme_id: string | null
  needs_provider: boolean
  needs_pickup: boolean
  revenue_flows_through_operator: boolean
  is_publicly_listed: boolean
  active: boolean
  sort_order: number
}

type Props = {
  product: ProductRow | null
  pricingSchemes: PricingSchemeRef[]
  productGroups: ProductGroupRef[]
  onSubmit: (values: ProductFormSubmitValue) => Promise<void> | void
  onDelete?: () => void
  submitting?: boolean
  deleting?: boolean
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null
  const t = v.trim()
  return t === '' ? null : t
}

function defaultValues(product: ProductRow | null): ProductFormValues {
  if (!product) {
    return {
      name: '',
      slug: '',
      short_description: '',
      description: '',
      product_group_id: '',
      duration_kind: 'single_days_range',
      duration_minutes: '',
      fixed_start_date: '',
      fixed_end_date: '',
      default_pricing_scheme_id: '',
      needs_provider: true,
      needs_pickup: true,
      revenue_flows_through_operator: true,
      is_publicly_listed: false,
      active: true,
      sort_order: '0',
    }
  }
  return {
    name: product.name,
    slug: product.slug,
    short_description: product.short_description ?? '',
    description: product.description ?? '',
    product_group_id: product.product_group_id ?? '',
    duration_kind: product.duration_kind,
    duration_minutes:
      product.duration_minutes == null ? '' : String(product.duration_minutes),
    fixed_start_date: product.fixed_start_date ?? '',
    fixed_end_date: product.fixed_end_date ?? '',
    default_pricing_scheme_id: product.default_pricing_scheme_id ?? '',
    needs_provider: product.needs_provider,
    needs_pickup: product.needs_pickup,
    revenue_flows_through_operator: product.revenue_flows_through_operator,
    is_publicly_listed: product.is_publicly_listed,
    active: product.active,
    sort_order: String(product.sort_order ?? 0),
  }
}

export function ProductForm({
  product,
  pricingSchemes,
  productGroups,
  onSubmit,
  onDelete,
  submitting,
  deleting,
}: Props) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaultValues(product),
    mode: 'onBlur',
  })

  // Reset when switching selected product. We key on id (and 'new' sentinel)
  // so editing one product then clicking another swaps the form state.
  useEffect(() => {
    form.reset(defaultValues(product))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id ?? 'new'])

  const durationKind = form.watch('duration_kind')

  async function handleSubmit(values: ProductFormValues) {
    const minutesTrimmed = (values.duration_minutes ?? '').trim()
    const sortTrimmed = (values.sort_order ?? '').trim()
    const payload: ProductFormSubmitValue = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      short_description: emptyToNull(values.short_description),
      description: emptyToNull(values.description),
      product_group_id: emptyToNull(values.product_group_id),
      duration_kind: values.duration_kind,
      duration_minutes:
        values.duration_kind === 'time_slot' && minutesTrimmed
          ? Number(minutesTrimmed)
          : null,
      fixed_start_date:
        values.duration_kind === 'fixed_date_range'
          ? emptyToNull(values.fixed_start_date)
          : null,
      fixed_end_date:
        values.duration_kind === 'fixed_date_range'
          ? emptyToNull(values.fixed_end_date)
          : null,
      default_pricing_scheme_id: emptyToNull(values.default_pricing_scheme_id),
      needs_provider: values.needs_provider,
      needs_pickup: values.needs_pickup,
      revenue_flows_through_operator: values.revenue_flows_through_operator,
      is_publicly_listed: values.is_publicly_listed,
      active: values.active,
      sort_order: sortTrimmed ? Number(sortTrimmed) : 0,
    }
    await onSubmit(payload)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex flex-col gap-6"
        aria-label={
          product ? t.products.formEditLabel : t.products.formCreateLabel
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldName}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e)
                      // Auto-fill slug when creating a new product and slug
                      // is either empty or still matches the slugified name.
                      if (!product) {
                        const current = form.getValues('slug')
                        if (!current || current === nameToSlug(field.value)) {
                          form.setValue('slug', nameToSlug(e.target.value))
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldSlug}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>{t.products.fieldSlugHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="short_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.products.fieldShortDescription}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.products.fieldDescription}</FormLabel>
              <FormControl>
                <MarkdownEditor
                  value={field.value}
                  onChange={(val) => field.onChange(val ?? '')}
                  onBlur={field.onBlur}
                  preview="edit"
                  height={240}
                />
              </FormControl>
              <FormDescription>{t.products.fieldDescriptionHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="duration_kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldDurationKind}</FormLabel>
                <FormControl>
                  <NativeSelect {...field}>
                    <option value="single_days_range">
                      {t.products.durationSingleDaysRange}
                    </option>
                    <option value="fixed_date_range">
                      {t.products.durationFixedDateRange}
                    </option>
                    <option value="time_slot">
                      {t.products.durationTimeSlot}
                    </option>
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {durationKind === 'time_slot' ? (
            <FormField
              control={form.control}
              name="duration_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.products.fieldDurationMinutes}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>

        {durationKind === 'fixed_date_range' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="fixed_start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.products.fieldFixedStartDate}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>
                    {t.products.fieldFixedDatesHint}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fixed_end_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.products.fieldFixedEndDate}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="default_pricing_scheme_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldPricingScheme}</FormLabel>
                <FormControl>
                  <NativeSelect {...field} value={field.value ?? ''}>
                    <option value="">{t.products.optionNone}</option>
                    {pricingSchemes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.currency})
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="product_group_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldProductGroup}</FormLabel>
                <FormControl>
                  <NativeSelect {...field} value={field.value ?? ''}>
                    <option value="">{t.products.optionNone}</option>
                    {productGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.products.fieldSortOrder}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <fieldset className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">
            {t.products.legendFlags}
          </legend>
          {(
            [
              ['active', t.products.flagActive],
              ['is_publicly_listed', t.products.flagPubliclyListed],
              ['needs_provider', t.products.flagNeedsProvider],
              ['needs_pickup', t.products.flagNeedsPickup],
              [
                'revenue_flows_through_operator',
                t.products.flagRevenueThroughOperator,
              ],
            ] as const
          ).map(([name, label]) => (
            <FormField
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer text-sm font-normal">
                    {label}
                  </FormLabel>
                </FormItem>
              )}
            />
          ))}
        </fieldset>

        <div className="flex items-center justify-between gap-2">
          {product && onDelete ? (
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={!!deleting}
              className="text-destructive"
            >
              <Trash2Icon className="size-4" />
              {deleting ? t.products.deleting : t.products.delete}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!!submitting}>
            {submitting
              ? t.products.saving
              : product
                ? t.products.save
                : t.products.create}
          </Button>
        </div>
      </form>
    </Form>
  )
}
