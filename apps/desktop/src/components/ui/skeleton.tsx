import * as React from "react"

import { cn } from "@/lib/utils"

/** Skeleton 컴포넌트는 콘텐츠가 로드되는 동안 보여줄 placeholder를 제공합니다. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
