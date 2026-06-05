/**
 * landr-3qkr.3 — M3: detail sheets full-screen on mobile.
 *
 * Shared class-string constants for the full-screen sheet treatment below `md`.
 * Usage: spread the relevant entries as className props. We use a const object
 * (not a wrapper component) per the lean-review verdict landr-v9e4.13 —
 * "wrapper-only" — so the individual sheet bodies remain unchanged.
 *
 * Pattern:
 *   <SheetContent className={cn(mobileSheet.content, "sm:max-w-[60vw]")} />
 *
 * Below md (< 768px) the sheet:
 *   - spans the full viewport (w-full max-w-none h-dvh rounded-none)
 *   - removes the default border-radius so it feels like a page, not a tray
 *
 * Above md the desktop width prop (sm:max-w-*) takes over; the rounded corners
 * and standard sheet look are preserved via the sm: Tailwind override.
 *
 * NOTE: These classes are ADDITIVE to what's already on SheetContent — they
 * override the `sm:max-w-sm` the primitive applies by default only on mobile.
 * The sticky header / scrollable body / tab-strip classes are applied to the
 * interior div elements in each sheet body.
 */

/** Applied to <SheetContent>. Makes the sheet full-viewport below md. */
export const mobileSheetContent =
  'max-md:w-full max-md:max-w-none max-md:h-dvh max-md:rounded-none'

/**
 * Applied to the sticky header row (SheetHeader or the first fixed bar).
 * Ensures min touch-target height and top safe-area clearance on notched phones.
 */
export const mobileSheetHeader =
  'sticky top-0 z-10 bg-background border-b shrink-0 max-md:min-h-[44px] max-md:pt-safe'

/**
 * Applied to the scrollable body div (the flex-1 overflow-y-auto region).
 * Adds bottom safe-area padding so content clears the home indicator.
 */
export const mobileSheetBody =
  'flex-1 overflow-y-auto max-md:pb-safe'

/**
 * Applied to tab-strip containers (the Tabs wrapper div around TabsList).
 * Makes the pill strip horizontally scrollable and clips overflow on mobile
 * so tabs never push past the viewport edge.
 */
export const mobileSheetTabStrip =
  'max-md:overflow-x-auto max-md:pb-1 shrink-0'

/**
 * Applied to a bottom action row (SheetFooter / action bar) that should
 * become a sticky bar on mobile. On desktop it stays in the normal flow.
 */
export const mobileSheetFooter =
  'shrink-0 max-md:sticky max-md:bottom-0 max-md:bg-background max-md:pb-safe border-t'
