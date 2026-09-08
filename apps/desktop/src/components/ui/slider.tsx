import * as React from "react"
import { Slider as BaseSlider } from "@base-ui/react/slider"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import { cn } from "@/lib/utils"

/**
 * Base UI의 방향을 지원하는 래퍼 컴포넌트
 */
const DirectionWrapper = ({
  direction,
  children,
}: {
  direction?: "ltr" | "rtl"
  children: React.ReactNode
}) => {
  if (direction) {
    return <DirectionProvider direction={direction}>{children}</DirectionProvider>
  }
  return <>{children}</>
}

/**
 * 터치 영역을 보장하고 접근성 및 Base UI 스타일을 지원하는 슬라이더 컴포넌트입니다.
 */
const Slider = React.forwardRef<
  React.ComponentRef<typeof BaseSlider.Root>,
  React.ComponentPropsWithoutRef<typeof BaseSlider.Root> & { direction?: "ltr" | "rtl" }
>(({ className, direction, ...props }, ref) => (
  <DirectionWrapper direction={direction}>
    <BaseSlider.Root
      ref={ref}
      className={
        typeof className === "function"
          ? (state) =>
              cn(
                "relative flex w-full touch-none select-none items-center data-disabled:opacity-50",
                className(state)
              )
          : cn("relative flex w-full touch-none select-none items-center data-disabled:opacity-50", className)
      }
      {...props}
    >
      <BaseSlider.Control className="relative flex w-full items-center">
        <BaseSlider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <BaseSlider.Indicator className="h-full bg-primary" />
        </BaseSlider.Track>
        <BaseSlider.Thumb
          className="block size-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 data-disabled:cursor-not-allowed after:absolute after:inset-[-12px] after:content-['']"
        />
      </BaseSlider.Control>
    </BaseSlider.Root>
  </DirectionWrapper>
))
Slider.displayName = "Slider"

export { Slider }
