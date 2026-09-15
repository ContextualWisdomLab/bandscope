import type { Meta, StoryObj } from "@storybook/react"
import { Slider } from "./slider"

/** Documented */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Documented */
export const Default: Story = {
  args: {
    defaultValue: 50,
  },
}
