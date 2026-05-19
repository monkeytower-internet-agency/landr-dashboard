import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Card primitive — landr-z7t visual depth pass.
 *
 * Default: top-level surface with hairline border + shadow-s (compound
 * inset highlight + 2-layer drop). `interactive` adds hover:shadow-l for
 * clickable cards. `inner` drops the border (shade differential already
 * separates it from the parent card per video 2's selective border rule).
 */
function Card({
  className,
  inner = false,
  interactive = false,
  ...props
}: React.ComponentProps<"div"> & {
  inner?: boolean
  interactive?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-inner={inner ? "true" : undefined}
      data-interactive={interactive ? "true" : undefined}
      className={cn(
        "flex flex-col gap-6 rounded-xl bg-card py-6 text-card-foreground shadow-s",
        inner ? "" : "border",
        interactive && "transition-shadow hover:shadow-l",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
