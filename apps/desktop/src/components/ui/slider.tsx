import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

type SliderRootProps = React.ComponentProps<typeof SliderPrimitive.Root>
type SliderProps = Omit<
  SliderRootProps,
  | "defaultValue"
  | "value"
  | "orientation"
  | "aria-label"
  | "aria-labelledby"
  | "aria-describedby"
> & {
  defaultValue?: number
  value?: number
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
}

/** Render BandScope's single-thumb horizontal slider with the accessible name on its range input. */
function Slider({
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="flex min-h-6 w-full items-center"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow rounded-full bg-primary/20"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className="h-full bg-primary"
          />
          <SliderPrimitive.Thumb
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-describedby={ariaDescribedby}
            data-slot="slider-thumb"
            className="block size-6 rounded-full border border-primary/50 bg-background shadow transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&:has(input:focus-visible)]:outline-none [&:has(input:focus-visible)]:ring-2 [&:has(input:focus-visible)]:ring-ring [&:has(input:focus-visible)]:ring-offset-2"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
