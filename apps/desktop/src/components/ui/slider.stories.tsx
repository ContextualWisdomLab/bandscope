import type { Meta, StoryObj } from "@storybook/react"

import {
  Slider,
  SliderControl,
  SliderTrack,
  SliderIndicator,
  SliderThumb,
} from "./slider"

/** Base UI Slider primitive documentation. */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Default slider view rendering. */
export const Default: Story = {
  render: (args) => (
    <div className="w-[200px]">
      <Slider defaultValue={50} {...args}>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
          </SliderTrack>
          <SliderThumb aria-label="Volume" />
        </SliderControl>
      </Slider>
    </div>
  ),
}
