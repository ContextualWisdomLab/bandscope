import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "./slider"

describe("Slider canonical composition", () => {
  it("keeps range thumbs inside a usable track-press area without clipping their pointer targets", () => {
    const { container } = render(
      <Slider defaultValue={[25, 75]}>
        <span id="loop-range-help">Selected rehearsal loop boundaries</span>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb
              index={0}
              aria-label="Loop start"
              aria-describedby="loop-range-help"
            />
            <SliderThumb index={1} aria-label="Loop end" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    )

    const control = container.querySelector('[data-slot="slider-control"]')
    const track = container.querySelector('[data-slot="slider-track"]')
    const start = screen.getByRole("slider", { name: "Loop start" })
    const end = screen.getByRole("slider", { name: "Loop end" })

    expect(control).toHaveClass("min-h-6")
    expect(track).toBeInTheDocument()
    expect(track).toContainElement(start)
    expect(track).toContainElement(end)
    expect(track).not.toHaveClass("overflow-hidden")
    expect(start).toHaveAttribute("aria-describedby", "loop-range-help")
    expect(start.parentElement).toHaveClass("after:inset-[-12px]")
    expect(end.parentElement).toHaveClass("after:inset-[-12px]")
  })

  it("preserves the same track-owned thumb anatomy and press width for a vertical control", () => {
    const { container } = render(
      <Slider defaultValue={50} orientation="vertical">
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb aria-label="Vertical position" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    )

    const control = container.querySelector('[data-slot="slider-control"]')
    const track = container.querySelector('[data-slot="slider-track"]')
    const thumb = screen.getByRole("slider", { name: "Vertical position" })

    expect(thumb).toHaveAttribute("aria-orientation", "vertical")
    expect(control).toHaveClass("data-[orientation=vertical]:min-w-6")
    expect(track).toContainElement(thumb)
    expect(track).not.toHaveClass("overflow-hidden")
  })
})
