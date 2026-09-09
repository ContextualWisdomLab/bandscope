import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "./slider"

/** Slider Storybook Meta */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "padded" },
  args: {
    defaultValue: 50,
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Default Slider */
export const Default: Story = {}

/** Disabled Slider */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
}
