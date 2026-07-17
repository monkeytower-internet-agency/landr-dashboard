import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // landr-t6f7: cursor-pointer in base classes — Tailwind v4 dropped the
  // default cursor:pointer on <button>; restoring it here makes every
  // Button usage telegraph affordance on hover. disabled:* nullifies it.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // landr-wg2y: 'destructive' was repurposed to brand-orange (below),
        // which stripped the danger signal from 26+ genuine delete/erase/
        // revoke call sites. Restored to the theme's --destructive red token
        // (same one FormErrorAlert/aria-invalid already use) so real
        // data-loss actions read as dangerous again in both light and dark.
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        // brand: the logo orange (bookings hue "vivid" token, #F5821F) with
        // dark text (orange is light → white fails contrast). References the
        // shared --color-hue-bookings-vivid token (not a raw hex) so it stays
        // in sync with the rest of the bookings hue family. For CTAs that
        // aren't actually destructive but want the brand accent — e.g. the
        // reject side of an approve/reject decision (GeneralApprovals,
        // Release proposals) — where orange reads as "this is a normal
        // business decision", not a scary warning. Actions with real
        // financial/data consequences (delete, revoke, cancel, no-show +
        // fee) stay on 'destructive' even when framed as a "reject". Form-
        // error red is unaffected — that uses the --destructive *token*
        // (aria-invalid), not this button variant.
        brand:
          "bg-hue-bookings-vivid text-black hover:bg-hue-bookings-vivid/90 focus-visible:ring-hue-bookings-vivid/40",
        outline:
          // landr-z7t: outline button gets compound shadow-s so it lifts off
          // the page like other depth surfaces.
          "border bg-background shadow-s hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
