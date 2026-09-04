import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "./slider"

const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  args: {
    defaultValue: 50,
    "aria-label": "Playback position",
    className: "w-[60vw]"
  },
} satisfies Meta<typeof Slider>

/** Storybook metadata for the reusable horizontal slider. */
export default meta
type Story = StoryObj<typeof meta>

/** Default single-value slider interaction. */
export const Default: Story = {}
