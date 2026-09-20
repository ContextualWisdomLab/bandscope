import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

/** Slider Root Component */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={
      typeof className === "function"
        ? (state) => cn("relative flex w-full touch-none select-none items-center", className(state))
        : cn("relative flex w-full touch-none select-none items-center", className)
    }
    {...props}
  />
))
Slider.displayName = "Slider"

/** Slider Track Component */
const SliderTrack = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Track>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Track>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Track
    ref={ref}
    className={
      typeof className === "function"
        ? (state) => cn("relative h-3 w-full grow overflow-hidden rounded-full bg-slate-900/50 shadow-inner", className(state))
        : cn("relative h-3 w-full grow overflow-hidden rounded-full bg-slate-900/50 shadow-inner", className)
    }
    {...props}
  />
))
SliderTrack.displayName = "SliderTrack"

/** Slider Indicator Component */
const SliderIndicator = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Indicator
    ref={ref}
    className={
      typeof className === "function"
        ? (state) => cn("h-full bg-gradient-to-r from-indigo-500 to-cyan-400 data-disabled:opacity-50", className(state))
        : cn("h-full bg-gradient-to-r from-indigo-500 to-cyan-400 data-disabled:opacity-50", className)
    }
    {...props}
  />
))
SliderIndicator.displayName = "SliderIndicator"

/** Slider Thumb Component */
const SliderThumb = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Thumb>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Thumb>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Thumb
    ref={ref}
    className={
      typeof className === "function"
        ? (state) => cn("block size-5 rounded-full border-2 border-indigo-500 bg-white shadow-md ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300 has-[:focus-visible]:ring-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50 after:absolute after:inset-[-12px] after:content-['']", className(state))
        : cn("block size-5 rounded-full border-2 border-indigo-500 bg-white shadow-md ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300 has-[:focus-visible]:ring-offset-2 data-disabled:pointer-events-none data-disabled:opacity-50 after:absolute after:inset-[-12px] after:content-['']", className)
    }
    {...props}
  />
))
SliderThumb.displayName = "SliderThumb"

export { Slider, SliderTrack, SliderIndicator, SliderThumb }
