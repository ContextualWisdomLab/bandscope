import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

describe("Tooltip resilience contract", () => {
  it("keeps Base UI trigger button semantics and native props", () => {
    const onClick = vi.fn()

    render(
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-disabled="true"
          aria-label="Settings coming soon"
          className="focus-contract"
          onClick={onClick}
        >
          Settings
        </TooltipTrigger>
        <TooltipContent>Settings coming soon</TooltipContent>
      </Tooltip>
    )

    const trigger = screen.getByRole("button", { name: "Settings coming soon" })
    expect(trigger.tagName).toBe("BUTTON")
    expect(trigger).toHaveAttribute("type", "button")
    expect(trigger).toHaveAttribute("aria-disabled", "true")
    expect(trigger).toHaveClass("focus-contract")

    fireEvent.click(trigger)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

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
