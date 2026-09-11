import type { Meta, StoryObj } from "@storybook/react"
import { Slider } from "./slider"

/** Slider component stories */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Default slider state */
export const Default: Story = {
  args: {
    defaultValue: 50,
    className: "w-[60%]",
  },
}

/** Disabled slider state */
export const Disabled: Story = {
  args: {
    defaultValue: 30,
    disabled: true,
    className: "w-[60%]",
  },
}
