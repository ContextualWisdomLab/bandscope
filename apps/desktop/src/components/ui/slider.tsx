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
        typeof className === 'function'
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
      <SliderPrimitive.Control className="relative w-full flex items-center">
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Indicator className="h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label={props["aria-label"]}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:opacity-50 after:absolute after:inset-[-12px] after:content-['']"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}
