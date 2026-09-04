import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Slider } from "./slider"

describe("Slider accessibility contract", () => {
  it("names the interactive thumb and keeps it inside the track", () => {
    render(<Slider defaultValue={50} aria-label="Playback position" />)

    const slider = screen.getByRole("slider", { name: "Playback position" })
    expect(slider.closest('[data-slot="slider-track"]')).not.toBeNull()
  })

  it("styles the Base UI disabled state on the thumb", () => {
    render(<Slider defaultValue={50} disabled aria-label="Playback position" />)

    const slider = screen.getByRole("slider", { name: "Playback position" })
    const thumb = slider.closest('[data-slot="slider-thumb"]')
    expect(thumb?.className).toContain("data-[disabled]:pointer-events-none")
    expect(thumb?.className).toContain("data-[disabled]:opacity-50")
  })

  it("keeps the wrapper single-thumb until a labelled range API is designed", () => {
    // @ts-expect-error A number[] would require one labelled Thumb per value.
    const unsupportedRange = <Slider defaultValue={[25, 75]} aria-label="Range" />
    expect(unsupportedRange).toBeTruthy()
  })
})
