import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "./slider"

const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  args: {
    defaultValue: 50,
    "aria-label": "Volume",
    className: "w-[60vw]"
  },
} satisfies Meta<typeof Slider>

/** Storybook metadata for the reusable BandScope Slider primitive. */
export default meta
type Story = StoryObj<typeof meta>

/** Default single-thumb horizontal Slider example with an accessible name. */
export const Default: Story = {}
