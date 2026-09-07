import type { ComponentProps } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Slider } from "./slider"

type SliderProps = ComponentProps<typeof Slider>

describe("Slider accessibility contract", () => {
  it("exposes one horizontal scalar thumb rather than unsupported range or vertical geometry", () => {
    const scalarProps = {
      defaultValue: 50,
      "aria-label": "Volume",
    } satisfies SliderProps
    expect(scalarProps.defaultValue).toBe(50)

    // @ts-expect-error BandScope's wrapper intentionally exposes one horizontal scalar thumb.
    const rangeProps: SliderProps = { defaultValue: [25, 75], "aria-label": "Range" }
    // @ts-expect-error Vertical geometry is not part of the BandScope slider contract.
    const verticalProps: SliderProps = { orientation: "vertical", defaultValue: 50 }
    expect([rangeProps, verticalProps]).toHaveLength(2)
  })

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

  it("keeps a 24 CSS px pointer target and Base UI disabled/focus state selectors", () => {
    const { container } = render(
      <Slider defaultValue={50} aria-label="Volume" disabled />
    )
    const control = container.querySelector('[data-slot="slider-control"]')
    const thumb = container.querySelector('[data-slot="slider-thumb"]')

    expect(control?.className).toContain("min-h-6")
    expect(thumb?.className).toContain("size-6")
    expect(thumb?.className).toContain("data-[disabled]:pointer-events-none")
    expect(thumb?.className).toContain("has(input:focus-visible)")
  })
})
