"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { DirectionProvider } from "@base-ui/react/direction-provider"

import { cn } from "@/lib/utils"

/** Render a slider component. */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <DirectionProvider direction="ltr">
    <SliderPrimitive.Root
      ref={ref}
      data-slot="slider"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex w-full touch-none select-none items-center",
                "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
                "data-disabled:opacity-50",
                className(state)
              )
          : cn(
              "relative flex w-full touch-none select-none items-center",
              "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
              "data-disabled:opacity-50",
              className
            )
      }
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center data-[orientation=vertical]:h-full data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2">
          <SliderPrimitive.Indicator className="absolute h-full bg-primary data-[orientation=vertical]:w-full" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 data-disabled:pointer-events-none after:absolute after:inset-[-12px] after:content-['']"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  </DirectionProvider>
))
Slider.displayName = "Slider"

export { Slider }
