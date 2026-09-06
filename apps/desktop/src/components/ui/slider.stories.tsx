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

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
