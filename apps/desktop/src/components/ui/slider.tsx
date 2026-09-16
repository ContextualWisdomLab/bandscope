import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

/** Render a slider component. */
export function Slider({
  className,
  ...props
}: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex w-full touch-none select-none items-center",
                className(state)
              )
          : cn(
              "relative flex w-full touch-none select-none items-center",
              className
            )
      }
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center">
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Indicator className="h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={props["aria-label"]}
          className="relative block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:opacity-50 after:absolute after:inset-[-12px] after:content-['']"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
