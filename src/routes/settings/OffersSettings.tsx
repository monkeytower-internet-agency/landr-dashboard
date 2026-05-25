/**
 * Settings → Upsells & Offers (landr-znzz.5).
 *
 * A GENERIC, per-operator catalogue of add-ons the operator surfaces in the
 * AFTER phase of the customer event/briefing page. NO default offers and
 * nothing vendor-specific (memory operator-configurable-no-defaults): each
 * operator defines their own offers — flight video, photo merch, gift
 * voucher… — as a title + description + a CTA label and a CTA url that links
 * out to THEIR OWN shop/merch/form. Landr renders the cards; the operator owns
 * fulfilment. There is NO price field — the event page is a no-price surface;
 * any price lives behind cta_url.
 *
 * CRUD list with add / inline-edit / active toggle / reorder (up/down via
 * sort_order PATCH) / delete (soft-delete). Mirrors the CategoriesSettings IA.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  createOperatorOffer,
  deleteOperatorOffer,
  fetchOperatorOffers,
  updateOperatorOffer,
  type OperatorOffer,
  type OperatorOfferPatch,
} from '@/lib/operator-offers'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

const OFFERS_KEY = (operatorId: string) => ['operator-offers', operatorId]

export function OffersSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.offers },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.offers}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.offersSettings.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.offersSettings.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.offersSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <OffersManager operatorId={currentOperatorId} />
    </>
  )
}

type DraftFields = {
  title: string
  description: string
  cta_label: string
  cta_url: string
  image_url: string
  is_active: boolean
}

const EMPTY_DRAFT: DraftFields = {
  title: '',
  description: '',
  cta_label: '',
  cta_url: '',
  image_url: '',
  is_active: true,
}

// Map editor fields -> a patch/create body. Empty strings become null so we
// don't store blanks for the optional text columns.
function fieldsToBody(f: DraftFields) {
  const blank = (s: string) => {
    const v = s.trim()
    return v.length > 0 ? v : null
  }
  return {
    title: f.title.trim(),
    description: blank(f.description),
    cta_label: blank(f.cta_label),
    cta_url: blank(f.cta_url),
    image_url: blank(f.image_url),
    is_active: f.is_active,
  }
}

export function OffersManager({ operatorId }: { operatorId: string }) {
  const qc = useQueryClient()
  const query = useQuery<OperatorOffer[]>({
    queryKey: OFFERS_KEY(operatorId),
    queryFn: () => fetchOperatorOffers(operatorId),
  })
  const offers = useMemo(() => query.data ?? [], [query.data])

  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT)

  function invalidate() {
    qc.invalidateQueries({ queryKey: OFFERS_KEY(operatorId) })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createOperatorOffer(operatorId, {
        ...fieldsToBody(draft),
        // New offers append to the end.
        sort_order: offers.length,
      }),
    onSuccess: () => {
      setDraft(EMPTY_DRAFT)
      invalidate()
      toast.success(t.offersSettings.toastCreated)
    },
    onError: (err: Error) =>
      toast.error(t.offersSettings.toastError, { description: err.message }),
  })

  const canCreate = draft.title.trim().length > 0 && !createMutation.isPending

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.offersSettings.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t.offersSettings.subtitle}
        </p>
      </header>

      {/* ---- Add offer ----------------------------------------------- */}
      <section className="rounded-md border p-4" data-testid="offers-create">
        <h2 className="text-sm font-medium">{t.offersSettings.createTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="offer-new-title" className="text-xs">
              {t.offersSettings.fieldTitle}
            </Label>
            <Input
              id="offer-new-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={t.offersSettings.placeholderTitle}
              maxLength={200}
              className="h-8 text-sm"
              data-testid="offers-create-title"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="offer-new-description" className="text-xs">
              {t.offersSettings.fieldDescription}
            </Label>
            <Textarea
              id="offer-new-description"
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder={t.offersSettings.placeholderDescription}
              rows={2}
              className="text-sm"
              data-testid="offers-create-description"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="offer-new-cta-label" className="text-xs">
              {t.offersSettings.fieldCtaLabel}
            </Label>
            <Input
              id="offer-new-cta-label"
              value={draft.cta_label}
              onChange={(e) =>
                setDraft({ ...draft, cta_label: e.target.value })
              }
              placeholder={t.offersSettings.placeholderCtaLabel}
              maxLength={200}
              className="h-8 text-sm"
              data-testid="offers-create-cta-label"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="offer-new-cta-url" className="text-xs">
              {t.offersSettings.fieldCtaUrl}
            </Label>
            <Input
              id="offer-new-cta-url"
              type="url"
              value={draft.cta_url}
              onChange={(e) => setDraft({ ...draft, cta_url: e.target.value })}
              placeholder={t.offersSettings.placeholderCtaUrl}
              maxLength={2000}
              className="h-8 text-sm"
              data-testid="offers-create-cta-url"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label htmlFor="offer-new-image-url" className="text-xs">
              {t.offersSettings.fieldImageUrl}
            </Label>
            <Input
              id="offer-new-image-url"
              type="url"
              value={draft.image_url}
              onChange={(e) =>
                setDraft({ ...draft, image_url: e.target.value })
              }
              placeholder={t.offersSettings.placeholderImageUrl}
              maxLength={2000}
              className="h-8 text-sm"
              data-testid="offers-create-image-url"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) =>
                setDraft({ ...draft, is_active: e.target.checked })
              }
              data-testid="offers-create-active"
            />
            {t.offersSettings.fieldActive}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!canCreate}
            onClick={() => createMutation.mutate()}
            data-testid="offers-create-submit"
          >
            <PlusIcon className="size-4" />
            {createMutation.isPending
              ? t.offersSettings.creating
              : t.offersSettings.create}
          </Button>
        </div>
      </section>

      {/* ---- List ---------------------------------------------------- */}
      <section data-testid="offers-list">
        {query.isPending ? (
          <p className="text-muted-foreground text-sm">
            {t.offersSettings.loading}
          </p>
        ) : query.isError ? (
          <p className="text-destructive text-sm" role="alert">
            {(query.error as Error).message}
          </p>
        ) : offers.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {t.offersSettings.empty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {offers.map((offer, idx) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                operatorId={operatorId}
                isFirst={idx === 0}
                isLast={idx === offers.length - 1}
                prevSort={offers[idx - 1]?.sort_order}
                nextSort={offers[idx + 1]?.sort_order}
                onChanged={invalidate}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

type RowProps = {
  offer: OperatorOffer
  operatorId: string
  isFirst: boolean
  isLast: boolean
  prevSort: number | undefined
  nextSort: number | undefined
  onChanged: () => void
}

function OfferRow({
  offer,
  operatorId,
  isFirst,
  isLast,
  prevSort,
  nextSort,
  onChanged,
}: RowProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [fields, setFields] = useState<DraftFields>(() => ({
    title: offer.title,
    description: offer.description ?? '',
    cta_label: offer.cta_label ?? '',
    cta_url: offer.cta_url ?? '',
    image_url: offer.image_url ?? '',
    is_active: offer.is_active,
  }))

  const patchMutation = useMutation({
    mutationFn: (patch: OperatorOfferPatch) =>
      updateOperatorOffer(operatorId, offer.id, patch),
    onSuccess: () => {
      onChanged()
      toast.success(t.offersSettings.toastUpdated)
      setEditing(false)
    },
    onError: (err: Error) =>
      toast.error(t.offersSettings.toastError, { description: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteOperatorOffer(operatorId, offer.id),
    onSuccess: () => {
      onChanged()
      toast.success(t.offersSettings.toastDeleted)
    },
    onError: (err: Error) =>
      toast.error(t.offersSettings.toastError, { description: err.message }),
  })

  // Reorder: swap our sort_order with the neighbour's. The list is ordered
  // server-side by (sort_order, created_at); writing the neighbour's value
  // moves us past them. A simple, drag-free reorder affordance.
  function move(neighbourSort: number | undefined) {
    if (neighbourSort === undefined) return
    patchMutation.mutate({ sort_order: neighbourSort })
  }

  if (editing) {
    return (
      <li className="flex flex-col gap-3 p-3" data-testid={`offer-row-${offer.id}`}>
        <form
          className="grid gap-3 sm:grid-cols-2"
          aria-label={t.offersSettings.edit}
          onSubmit={(e) => {
            e.preventDefault()
            if (fields.title.trim()) patchMutation.mutate(fieldsToBody(fields))
          }}
        >
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs">{t.offersSettings.fieldTitle}</Label>
            <Input
              autoFocus
              value={fields.title}
              onChange={(e) => setFields({ ...fields, title: e.target.value })}
              maxLength={200}
              className="h-8 text-sm"
              data-testid={`offer-row-${offer.id}-title`}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs">{t.offersSettings.fieldDescription}</Label>
            <Textarea
              value={fields.description}
              onChange={(e) =>
                setFields({ ...fields, description: e.target.value })
              }
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t.offersSettings.fieldCtaLabel}</Label>
            <Input
              value={fields.cta_label}
              onChange={(e) =>
                setFields({ ...fields, cta_label: e.target.value })
              }
              maxLength={200}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t.offersSettings.fieldCtaUrl}</Label>
            <Input
              type="url"
              value={fields.cta_url}
              onChange={(e) => setFields({ ...fields, cta_url: e.target.value })}
              maxLength={2000}
              className="h-8 text-sm"
              data-testid={`offer-row-${offer.id}-cta-url`}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-xs">{t.offersSettings.fieldImageUrl}</Label>
            <Input
              type="url"
              value={fields.image_url}
              onChange={(e) =>
                setFields({ ...fields, image_url: e.target.value })
              }
              maxLength={2000}
              className="h-8 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={fields.is_active}
              onChange={(e) =>
                setFields({ ...fields, is_active: e.target.checked })
              }
            />
            {t.offersSettings.fieldActive}
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={patchMutation.isPending}>
              {patchMutation.isPending
                ? t.offersSettings.saving
                : t.offersSettings.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setFields({
                  title: offer.title,
                  description: offer.description ?? '',
                  cta_label: offer.cta_label ?? '',
                  cta_url: offer.cta_url ?? '',
                  image_url: offer.image_url ?? '',
                  is_active: offer.is_active,
                })
                setEditing(false)
              }}
            >
              {t.offersSettings.cancel}
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li
      className="flex flex-wrap items-center gap-2 p-3"
      data-testid={`offer-row-${offer.id}`}
    >
      {/* reorder */}
      <div className="flex flex-col">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={isFirst || patchMutation.isPending}
          aria-label={t.offersSettings.moveUp}
          onClick={() => move(prevSort)}
          data-testid={`offer-row-${offer.id}-up`}
        >
          <ChevronUpIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={isLast || patchMutation.isPending}
          aria-label={t.offersSettings.moveDown}
          onClick={() => move(nextSort)}
          data-testid={`offer-row-${offer.id}-down`}
        >
          <ChevronDownIcon className="size-3.5" />
        </Button>
      </div>

      <span className="min-w-0 flex-1 truncate text-sm">
        {offer.title}
        {offer.cta_url ? (
          <a
            href={offer.cta_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground ml-2 inline-flex items-center gap-1 text-xs hover:underline"
            data-testid={`offer-row-${offer.id}-cta-link`}
          >
            {offer.cta_label || t.offersSettings.ctaFallback}
            <ExternalLinkIcon className="size-3" />
          </a>
        ) : null}
        {!offer.is_active ? (
          <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
            {t.offersSettings.inactiveBadge}
          </span>
        ) : null}
      </span>

      {/* active toggle */}
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={offer.is_active}
          disabled={patchMutation.isPending}
          onChange={(e) =>
            patchMutation.mutate({ is_active: e.target.checked })
          }
          data-testid={`offer-row-${offer.id}-active`}
        />
        {t.offersSettings.activeShort}
      </label>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t.offersSettings.edit}
        onClick={() => setEditing(true)}
        data-testid={`offer-row-${offer.id}-edit`}
      >
        <PencilIcon className="size-3.5" />
      </Button>
      {confirmDelete ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid={`offer-row-${offer.id}-confirm-delete`}
          >
            {deleteMutation.isPending
              ? t.offersSettings.deleting
              : t.offersSettings.confirmDelete}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(false)}
          >
            {t.offersSettings.cancel}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.offersSettings.delete}
          onClick={() => setConfirmDelete(true)}
          data-testid={`offer-row-${offer.id}-delete`}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      )}
    </li>
  )
}
