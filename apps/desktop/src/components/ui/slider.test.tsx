import type { ComponentProps } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Slider } from "./slider"

type SliderProps = ComponentProps<typeof Slider>

function acceptSliderProps(_props: SliderProps) {}

if (false) {
  acceptSliderProps({ defaultValue: 50, "aria-label": "Volume" })
  // @ts-expect-error BandScope's wrapper intentionally exposes one horizontal scalar thumb.
  acceptSliderProps({ defaultValue: [25, 75], "aria-label": "Range" })
  // @ts-expect-error Vertical geometry is not part of the BandScope slider contract.
  acceptSliderProps({ orientation: "vertical", defaultValue: 50, "aria-label": "Vertical" })
}

describe("Slider accessibility contract", () => {
  it("names the actual range input and anchors the thumb inside the track", () => {
    const { container } = render(
      <Slider defaultValue={50} aria-label="Volume" aria-describedby="volume-help" />
    )

    const input = screen.getByRole("slider", { name: "Volume" })
    expect(input.getAttribute("aria-describedby")).toBe("volume-help")

    const track = container.querySelector('[data-slot="slider-track"]')
    const thumb = container.querySelector('[data-slot="slider-thumb"]')
    expect(track).toBeTruthy()
    expect(thumb).toBeTruthy()
    expect(track?.contains(thumb)).toBe(true)
  })

  it("keeps a 24 CSS px thumb and Base UI disabled/focus state selectors", () => {
    const { container } = render(
      <Slider defaultValue={50} aria-label="Volume" disabled />
    )
    const thumb = container.querySelector('[data-slot="slider-thumb"]')

    expect(thumb?.className).toContain("size-6")
    expect(thumb?.className).toContain("data-[disabled]:pointer-events-none")
    expect(thumb?.className).toContain("has(input:focus-visible)")
  })
})
