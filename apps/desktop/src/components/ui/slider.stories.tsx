import type { Meta, StoryObj } from "@storybook/react-vite"

import { DirectionProvider } from "@base-ui/react/direction-provider"

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

/** Vertical orientation rendering. */
export const Vertical: Story = {
  render: (args) => (
    <div className="h-[200px]">
      <Slider defaultValue={50} orientation="vertical" {...args}>
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

/** Disabled interaction rendering. */
export const Disabled: Story = {
  render: (args) => (
    <div className="w-[200px]">
      <Slider defaultValue={50} disabled {...args}>
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

/** Stepped value rendering. */
export const CustomStep: Story = {
  render: (args) => (
    <div className="w-[200px]">
      <Slider defaultValue={50} step={10} {...args}>
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

/** Right-to-Left (RTL) reading direction rendering. */
export const RTL: Story = {
  render: (args) => (
    <DirectionProvider direction="rtl">
      <div className="w-[200px]" dir="rtl">
        <Slider defaultValue={50} {...args}>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
            </SliderTrack>
            <SliderThumb aria-label="Volume" />
          </SliderControl>
        </Slider>
      </div>
    </DirectionProvider>
  ),
}
