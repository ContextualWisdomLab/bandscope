import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import { Slider } from "./slider"
import userEvent from "@testing-library/user-event"

describe("Slider component", () => {
  it("renders correctly with default props", () => {
    render(<Slider aria-label="Test Slider" defaultValue={50} />)
    const thumb = screen.getByRole("slider", { name: "Test Slider" })
    expect(thumb).toBeInTheDocument()
    expect(thumb).toHaveAttribute("aria-valuenow", "50")
  })

  it("handles RTL direction using DirectionProvider", () => {
    render(
      <DirectionProvider direction="rtl">
        <Slider aria-label="RTL Slider" defaultValue={50} />
      </DirectionProvider>
    )
    const thumb = screen.getByRole("slider", { name: "RTL Slider" })
    expect(thumb).toBeInTheDocument()
  })

  it("applies functional className correctly", () => {
    render(
      <Slider
        aria-label="Class Slider"
        className={(state) => (state.disabled ? "is-disabled" : "is-enabled")}
        disabled
      />
    )
    const group = screen.getByRole("group", { name: "Class Slider" })
    expect(group).toHaveClass("is-disabled")
  })

  it("can receive focus", async () => {
    render(<Slider aria-label="Focus Slider" defaultValue={50} />)
    const thumb = screen.getByRole("slider", { name: "Focus Slider" })

    await userEvent.tab()
    expect(thumb).toHaveFocus()
  })

  it("anchors the expanded hit target to the thumb and styles thumb focus directly", () => {
    render(<Slider aria-label="Interaction Slider" defaultValue={50} />)
    const thumb = screen.getByRole("slider", { name: "Interaction Slider" })

    expect(thumb).toHaveClass("relative")
    expect(thumb).toHaveClass("focus-visible:outline-none")
    expect(thumb).toHaveClass("focus-visible:ring-2")
    expect(thumb).not.toHaveClass("has-[:focus-visible]:ring-2")
  })
})
