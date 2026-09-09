import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

describe("Tooltip resilience contract", () => {
  it("bounds expanded locale copy and disables decorative motion when requested", () => {
    render(
      <Tooltip open>
        <TooltipTrigger aria-label="Settings coming soon">Settings</TooltipTrigger>
        <TooltipContent>
          Einstellungen sind in dieser Version noch nicht verfügbar und werden später bereitgestellt.
        </TooltipContent>
      </Tooltip>
    )

    const tooltipContent = document.querySelector('[data-slot="tooltip-content"]')
    expect(tooltipContent).toBeTruthy()
    expect(tooltipContent).toHaveClass("max-w-[min(20rem,calc(100vw-2rem))]")
    expect(tooltipContent).toHaveClass("break-words")
    expect(tooltipContent).toHaveClass("motion-reduce:transition-none")
  })
})
