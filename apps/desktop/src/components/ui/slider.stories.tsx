import type { Meta, StoryObj } from "@storybook/react"
import {
  Slider,
  SliderControl,
  SliderTrack,
  SliderIndicator,
  SliderThumb,
} from "./slider"

/** Slider 컴포넌트에 대한 Storybook 메타데이터 */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** 기본 Slider 스토리 */
export const Default: Story = {
  render: () => (
    <Slider defaultValue={50} className="w-[60%]">
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
        </SliderTrack>
        <SliderThumb aria-label="볼륨" />
      </SliderControl>
    </Slider>
  ),
}
