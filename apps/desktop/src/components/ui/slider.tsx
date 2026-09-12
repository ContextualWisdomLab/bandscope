"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

/** 슬라이더 루트 컴포넌트 */
function Slider({
  className,
  ...props
}: SliderPrimitive.Root.Props) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={
        typeof className === "function"
          ? (state) => cn("relative flex w-full touch-none select-none items-center", className(state))
          : cn("relative flex w-full touch-none select-none items-center", className)
      }
      {...props}
    />
  )
}

/** 슬라이더 트랙 컴포넌트 */
function SliderTrack({ className, ...props }: SliderPrimitive.Track.Props) {
  return (
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={cn(
        "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary",
        className
      )}
      {...props}
    />
  )
}

/** 슬라이더 인디케이터(채워진 부분) 컴포넌트 */
function SliderIndicator({
  className,
  ...props
}: SliderPrimitive.Indicator.Props) {
  return (
    <SliderPrimitive.Indicator
      data-slot="slider-indicator"
      className={cn("absolute h-full bg-primary", className)}
      {...props}
    />
  )
}

/** 슬라이더 썸(손잡이) 컴포넌트 */
function SliderThumb({ className, ...props }: SliderPrimitive.Thumb.Props) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 after:absolute after:inset-[-12px] after:content-['']",
        className
      )}
      {...props}
    />
  )
}

/** 슬라이더 컨트롤 컨테이너 컴포넌트 */
function SliderControl({ className, ...props }: SliderPrimitive.Control.Props) {
  return (
    <SliderPrimitive.Control
      data-slot="slider-control"
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    />
  )
}

export { Slider, SliderTrack, SliderIndicator, SliderThumb, SliderControl }
