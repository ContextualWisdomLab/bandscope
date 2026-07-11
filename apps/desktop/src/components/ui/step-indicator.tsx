import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type StepState = "complete" | "current" | "upcoming"

/** Render an ordered list of progress steps. */
function StepIndicator({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="step-indicator"
      className={cn("flex w-full items-center", className)}
      {...props}
    />
  )
}

/** Render a single step, styled by its state. */
function StepItem({
  className,
  state = "upcoming",
  ...props
}: React.ComponentProps<"li"> & { state?: StepState }) {
  return (
    <li
      data-slot="step-item"
      data-state={state}
      className={cn(
        "flex flex-1 items-center gap-2 last:flex-none",
        className
      )}
      {...props}
    />
  )
}

/** Render the numbered/checked marker for a step. */
function StepIndicatorMarker({
  className,
  state = "upcoming",
  index,
  ...props
}: React.ComponentProps<"span"> & { state?: StepState; index: number }) {
  return (
    <span
      data-slot="step-marker"
      data-state={state}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
        "data-[state=upcoming]:border-border data-[state=upcoming]:text-muted-foreground",
        "data-[state=current]:border-primary data-[state=current]:text-primary",
        "data-[state=complete]:border-primary data-[state=complete]:bg-primary data-[state=complete]:text-primary-foreground",
        className
      )}
      {...props}
    >
      {state === "complete" ? <Check className="size-4" /> : index + 1}
    </span>
  )
}

/** Render the label for a step. */
function StepTitle({
  className,
  state = "upcoming",
  ...props
}: React.ComponentProps<"span"> & { state?: StepState }) {
  return (
    <span
      data-slot="step-title"
      data-state={state}
      className={cn(
        "text-sm whitespace-nowrap",
        "data-[state=upcoming]:text-muted-foreground",
        "data-[state=current]:text-foreground data-[state=current]:font-medium",
        "data-[state=complete]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/** Render the connector line between steps. */
function StepSeparator({
  className,
  state = "upcoming",
  ...props
}: React.ComponentProps<"span"> & { state?: StepState }) {
  return (
    <span
      data-slot="step-separator"
      data-state={state}
      aria-hidden="true"
      className={cn(
        "mx-2 h-px flex-1 transition-colors",
        "data-[state=complete]:bg-primary data-[state=current]:bg-primary data-[state=upcoming]:bg-border",
        className
      )}
      {...props}
    />
  )
}

export {
  StepIndicator,
  StepItem,
  StepIndicatorMarker,
  StepTitle,
  StepSeparator,
  type StepState,
}
