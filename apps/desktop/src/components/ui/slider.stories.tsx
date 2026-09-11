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

/** Range slider with two thumbs */
export const Range: Story = {
  args: {
    defaultValue: [25, 75],
    className: "w-[60%]",
  },
}

/** Vertical slider */
export const Vertical: Story = {
  args: {
    defaultValue: 50,
    orientation: "vertical",
    className: "h-32",
  },
}

/** Slider with custom steps */
export const CustomStep: Story = {
  args: {
    defaultValue: 50,
    step: 10,
    className: "w-[60%]",
  },
}

/** RTL slider */
export const RTL: Story = {
  render: () => (
    <div dir="rtl" className="w-[60vw]">
      <Slider defaultValue={50} />
    </div>
  ),
}

/** Disabled slider state */
export const Disabled: Story = {
  args: {
    defaultValue: 30,
    disabled: true,
    className: "w-[60%]",
  },
}
