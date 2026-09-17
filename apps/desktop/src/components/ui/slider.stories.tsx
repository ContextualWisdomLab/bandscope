import type { Meta, StoryObj } from "@storybook/react-vite"

import { Slider } from "./slider"

/** Meta information for the Slider component. */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: { layout: "centered" },
  args: { defaultValue: [50], max: 100, step: 1 },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Default Slider story */
export const Default: Story = {}
