import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Slider } from "./slider"

describe("Slider accessibility contract", () => {
  it("names the interactive thumb and keeps it inside the track", () => {
    render(<Slider defaultValue={50} aria-label="Playback position" />)

    const slider = screen.getByRole("slider", { name: "Playback position" })
    expect(slider.closest('[data-slot="slider-track"]')).not.toBeNull()
  })
})
