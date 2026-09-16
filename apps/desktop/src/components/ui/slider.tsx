"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

/** Render the root container for the slider. */
function Slider({ className, ...props }: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex w-full touch-none select-none items-center",
                "data-[orientation=vertical]:flex-col data-[orientation=vertical]:w-auto data-[orientation=vertical]:h-full",
                "data-disabled:opacity-50 data-disabled:pointer-events-none",
                className(state)
              )
          : cn(
              "relative flex w-full touch-none select-none items-center",
              "data-[orientation=vertical]:flex-col data-[orientation=vertical]:w-auto data-[orientation=vertical]:h-full",
              "data-disabled:opacity-50 data-disabled:pointer-events-none",
              className
            )
      }
      {...props}
    />
  )
}

/** Render the interactive control area of the slider. */
function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      data-slot="slider-control"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex min-h-6 w-full items-center",
                "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-w-6 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
                className(state)
              )
          : cn(
              "relative flex min-h-6 w-full items-center",
              "data-[orientation=vertical]:h-full data-[orientation=vertical]:min-w-6 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
              className
            )
      }
      {...props}
    />
  )
}

/** Render the visual track of the slider. */
function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative h-2 w-full grow rounded-full bg-secondary",
                "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
                className(state)
              )
          : cn(
              "relative h-2 w-full grow rounded-full bg-secondary",
              "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2",
              className
            )
      }
      {...props}
    />
  )
}

/** Render the filled portion of the slider track. */
function SliderIndicator({
  className,
  ...props
}: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "h-full bg-primary",
                "data-[orientation=vertical]:w-full data-[orientation=vertical]:h-auto",
                className(state)
              )
          : cn(
              "h-full bg-primary",
              "data-[orientation=vertical]:w-full data-[orientation=vertical]:h-auto",
              className
            )
      }
      {...props}
    />
  )
}

/** Render the draggable thumb of the slider. */
function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50",
                "after:absolute after:inset-[-12px] after:content-['']",
                className(state)
              )
          : cn(
              "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50",
              "after:absolute after:inset-[-12px] after:content-['']",
              className
            )
      }
      {...props}
    />
  )
}

export { Slider, SliderControl, SliderTrack, SliderIndicator, SliderThumb }
