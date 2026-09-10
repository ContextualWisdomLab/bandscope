"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

/** Render a slider component. */
function Slider({ className, ...props }: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex w-full touch-none select-none items-center",
                "data-disabled:opacity-50",
                className(state)
              )
          : cn(
              "relative flex w-full touch-none select-none items-center",
              "data-disabled:opacity-50",
              className
            )
      }
      {...props}
    />
  )
}

/** Render a slider control wrapper. */
function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      data-slot="slider-control"
      className={
        typeof className === "function"
          ? (state) => cn("flex w-full items-center", className(state))
          : cn("flex w-full items-center", className)
      }
      {...props}
    />
  )
}

/** Render a slider track. */
function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary",
                className(state)
              )
          : cn(
              "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary",
              className
            )
      }
      {...props}
    />
  )
}

/** Render a slider indicator for the filled portion of the track. */
function SliderIndicator({
  className,
  ...props
}: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={
        typeof className === "function"
          ? (state) => cn("absolute h-full bg-primary", className(state))
          : cn("absolute h-full bg-primary", className)
      }
      {...props}
    />
  )
}

/** Render a draggable slider thumb. */
function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "block size-5 rounded-full border-2 border-primary bg-background ring-ring/50 transition-colors",
                "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px]",
                "data-disabled:cursor-not-allowed",
                "after:absolute after:inset-[-12px] after:content-['']",
                className(state)
              )
          : cn(
              "block size-5 rounded-full border-2 border-primary bg-background ring-ring/50 transition-colors",
              "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px]",
              "data-disabled:cursor-not-allowed",
              "after:absolute after:inset-[-12px] after:content-['']",
              className
            )
      }
      {...props}
    />
  )
}

export { Slider, SliderControl, SliderTrack, SliderIndicator, SliderThumb }
