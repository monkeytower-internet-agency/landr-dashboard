// landr-wmsc — global Cmd/Ctrl+K command palette.
//
// Single surface for "where do I want to go?" navigation:
//   - Nav: jump to any primary route (Dashboard, Bookings, Contacts…).
//   - Bookings/Contacts/Products/Views: live search across the operator's
//     data, server-fetched once per palette open via React Query so the
//     palette is cheap to mount on every page.
//   - Quick actions: New booking, New view, Open settings.
//
// Open state lives in CommandPaletteProvider (lib/command-palette-context).
// AppShell mounts the provider + the palette so the Cmd+K listener works
// from any route under the protected shell.
import { useMemo } from 'react'
import {
  CalendarIcon,
  CalendarRangeIcon,
  ChartAreaIcon,
  CheckCircleIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  PlusCircleIcon,
  SettingsIcon,
  StarIcon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useCommandPalette } from '@/lib/command-palette-context'
import { useOperator } from '@/lib/operator'
import {
  fetchBookings,
  customerDisplay,
  productDisplay,
} from '@/lib/bookings'
import { fetchContacts, contactNameDisplay } from '@/lib/contacts'
import { fetchProducts } from '@/lib/products'
import { listSavedViews } from '@/lib/saved-views'
import { t } from '@/lib/strings'

type NavEntry = {
  label: string
  to: string
  icon: LucideIcon
}

// Mirrors AppSidebar.primaryItems + the Account/Settings cluster so the
// palette is a single keyboard-driven mirror of every navigable surface.
// Kept in this file rather than imported because AppSidebar's list also
// carries icon-rail/match-group metadata the palette doesn't need.
const NAV_ENTRIES: NavEntry[] = [
  { label: t.nav.dashboard, to: '/', icon: LayoutDashboardIcon },
  { label: t.app.views, to: '/views', icon: LayersIcon },
  { label: t.nav.bookings, to: '/bookings', icon: CalendarRangeIcon },
  { label: t.nav.calendar, to: '/calendar', icon: CalendarIcon },
  { label: t.nav.contacts, to: '/contacts', icon: UsersIcon },
  { label: t.nav.reporting, to: '/reporting', icon: ChartAreaIcon },
  {
    label: t.nav.generalApprovals,
    to: '/approvals/general',
    icon: CheckCircleIcon,
  },
  // landr-znzz.8 — operator retrieve board.
  { label: t.nav.retrieve, to: '/retrieve', icon: MapPinnedIcon },
  { label: t.nav.account, to: '/account', icon: UserCircleIcon },
  { label: t.nav.settings, to: '/settings', icon: SettingsIcon },
]

// Cap each result group so a multi-thousand-row tenant can't overflow the
// palette. The palette is a navigation aid, not a full list view — if a
// user needs more results they can refine the query or open the dedicated
// page (which is itself a top-level palette nav entry).
const PER_GROUP_LIMIT = 8

export function CommandPalette() {
  const { open, setOpen } = useCommandPalette()
  const navigate = useNavigate()
  const { currentOperatorId } = useOperator()

  // Fetch lazily — `enabled` gates on both the palette being open and an
  // operator being selected, so closing the palette stops the query from
  // re-running on focus changes. React Query caches the result keyed by
  // operatorId so reopening the palette is instant.
  const enabled = open && !!currentOperatorId

  const bookingsQuery = useQuery({
    queryKey: ['command-palette', 'bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled,
    staleTime: 30_000,
  })

  const contactsQuery = useQuery({
    queryKey: ['command-palette', 'contacts', currentOperatorId ?? 'none'],
    queryFn: () => fetchContacts(currentOperatorId as string),
    enabled,
    staleTime: 30_000,
  })

  const productsQuery = useQuery({
    queryKey: ['command-palette', 'products', currentOperatorId ?? 'none'],
    queryFn: () => fetchProducts(currentOperatorId as string),
    enabled,
    staleTime: 30_000,
  })

  const viewsQuery = useQuery({
    queryKey: ['command-palette', 'views', currentOperatorId ?? 'none'],
    queryFn: () => listSavedViews(currentOperatorId as string),
    enabled,
    staleTime: 30_000,
  })

  // Trim per-group payloads so cmdk's substring matcher doesn't pay for
  // hundreds of hidden DOM nodes when the user starts typing. The lists
  // are pre-sorted by their fetchers (newest first for bookings/contacts,
  // sort_order for products/views) so slicing keeps the most relevant.
  const bookings = useMemo(
    () => (bookingsQuery.data ?? []).slice(0, PER_GROUP_LIMIT),
    [bookingsQuery.data],
  )
  const contacts = useMemo(
    () => (contactsQuery.data ?? []).slice(0, PER_GROUP_LIMIT),
    [contactsQuery.data],
  )
  const products = useMemo(
    () => (productsQuery.data ?? []).slice(0, PER_GROUP_LIMIT),
    [productsQuery.data],
  )
  const views = useMemo(
    () => (viewsQuery.data ?? []).slice(0, PER_GROUP_LIMIT),
    [viewsQuery.data],
  )

  // Single navigation helper: every CommandItem onSelect funnels through
  // here so the palette always closes after a pick (cmdk's default is to
  // leave it open). Wrapping in a callback also gives us a single seam to
  // add e.g. analytics or focus restoration later.
  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t.commandPalette.dialogTitle}
      description={t.commandPalette.dialogDescription}
    >
      <CommandInput placeholder={t.commandPalette.inputPlaceholder} />
      <CommandList>
        <CommandEmpty>{t.commandPalette.empty}</CommandEmpty>

        <CommandGroup heading={t.commandPalette.groupNav}>
          {NAV_ENTRIES.map((entry) => {
            const Icon = entry.icon
            return (
              <CommandItem
                // cmdk's default fuzzy matcher scores by character overlap,
                // so keep the value tight — just the label. Throwing extra
                // tokens (e.g. the URL) in here would cause spurious matches
                // ("vip" fuzzy-matching "Reporting" via v-i-p).
                key={entry.to}
                value={entry.label}
                onSelect={() => go(entry.to)}
              >
                <Icon className="size-4" aria-hidden />
                <span>{entry.label}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t.commandPalette.groupActions}>
          <CommandItem
            value={t.commandPalette.actionNewBooking}
            onSelect={() => go('/bookings')}
          >
            <PlusCircleIcon className="size-4" aria-hidden />
            <span>{t.commandPalette.actionNewBooking}</span>
          </CommandItem>
          <CommandItem
            value={t.commandPalette.actionNewView}
            onSelect={() => go('/views/new')}
          >
            <PlusCircleIcon className="size-4" aria-hidden />
            <span>{t.commandPalette.actionNewView}</span>
          </CommandItem>
          <CommandItem
            value={t.commandPalette.actionOpenSettings}
            onSelect={() => go('/settings')}
          >
            <SettingsIcon className="size-4" aria-hidden />
            <span>{t.commandPalette.actionOpenSettings}</span>
          </CommandItem>
        </CommandGroup>

        {bookings.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t.commandPalette.groupBookings}>
              {bookings.map((booking) => {
                const customer =
                  customerDisplay(booking) ||
                  t.commandPalette.bookingMissingCustomer
                const product = productDisplay(booking)
                return (
                  <CommandItem
                    key={booking.id}
                    // cmdk de-duplicates items by `value` and ranks via
                    // fuzzy char overlap. Use the matchable text + id
                    // suffix so values stay unique without polluting the
                    // matcher with low-signal prefix tokens.
                    value={`${customer} ${product} ${booking.id}`}
                    onSelect={() => go('/bookings')}
                  >
                    <CalendarRangeIcon className="size-4" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{customer}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {product}
                      </span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        ) : null}

        {contacts.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t.commandPalette.groupContacts}>
              {contacts.map((contact) => {
                const name = contactNameDisplay(contact)
                const email = contact.email ?? ''
                return (
                  <CommandItem
                    key={contact.id}
                    value={`${name} ${email} ${contact.id}`}
                    onSelect={() => go('/contacts')}
                  >
                    <UsersIcon className="size-4" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{name}</span>
                      {email ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {email}
                        </span>
                      ) : null}
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </>
        ) : null}

        {products.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t.commandPalette.groupProducts}>
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.name} ${product.slug ?? ''} ${product.id}`}
                  onSelect={() =>
                    go(`/settings/products/${product.id}`)
                  }
                >
                  <LayersIcon className="size-4" aria-hidden />
                  <span className="truncate">{product.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {views.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t.commandPalette.groupViews}>
              {views.map((view) => (
                <CommandItem
                  key={view.id}
                  value={`${view.name} ${view.id}`}
                  onSelect={() => go(`/views/${view.id}`)}
                >
                  {view.user_state.starred ? (
                    <StarIcon
                      className="size-4 fill-current text-amber-500"
                      aria-hidden
                    />
                  ) : (
                    <LayersIcon className="size-4" aria-hidden />
                  )}
                  <span className="truncate">{view.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
