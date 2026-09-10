import type { Meta, StoryObj } from "@storybook/react"
import { DirectionProvider } from "@base-ui/react/direction-provider"

import {
  Slider,
  SliderControl,
  SliderTrack,
  SliderIndicator,
  SliderThumb,
} from "./slider"

/** Meta definition for the Slider component. */
const meta = {
  title: "UI/Slider",
  component: Slider,
  tags: ["autodocs"],
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** The default slider. */
export const Default: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]}>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb aria-label="Volume" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </div>
  ),
}

/** The disabled slider. */
export const Disabled: Story = {
  render: () => (
    <div className="w-[300px]">
      <Slider defaultValue={[50]} disabled>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb aria-label="Volume" />
          </SliderTrack>
        </SliderControl>
      </Slider>
    </div>
  ),
}

/** The slider with Right-to-Left support. */
export const RightToLeft: Story = {
  render: () => (
    <DirectionProvider direction="rtl">
      <div className="w-[300px]" dir="rtl">
        <Slider defaultValue={[50]}>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb aria-label="Volume" />
            </SliderTrack>
          </SliderControl>
        </Slider>
      </div>
    </DirectionProvider>
  ),
}
