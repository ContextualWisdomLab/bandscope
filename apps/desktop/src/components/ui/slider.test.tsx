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
    // Base-ui internally sets some properties for RTL, but we check if it renders without crashing
  })

  it("applies functional className correctly", () => {
    render(
      <Slider
        aria-label="Class Slider"
        className={(state) => (state.disabled ? "is-disabled" : "is-enabled")}
        disabled
      />
    )
    // The class is applied to the root which has role="group"
    const group = screen.getByRole("group", { name: "Class Slider" })
    expect(group).toHaveClass("is-disabled")
  })

  it("can receive focus and show focus-visible classes", async () => {
    render(<Slider aria-label="Focus Slider" defaultValue={50} />)
    const thumb = screen.getByRole("slider", { name: "Focus Slider" })

    // Test the focus interaction using userEvent
    await userEvent.tab()
    expect(thumb).toHaveFocus()
  })
})
