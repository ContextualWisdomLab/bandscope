import type { Meta, StoryObj } from "@storybook/react"
import { Slider, SliderTrack, SliderIndicator, SliderThumb } from "./slider"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

/** Meta configuration for Slider. */
const meta = {
  title: "UI/Slider",
  component: Slider,
  tags: ["autodocs"],
  argTypes: {
    defaultValue: { control: "object" },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/** Default slider representation. */
export const Default: Story = {
  render: (args) => (
    <Slider defaultValue={[50]} max={100} step={1} className="w-[60%]" {...args}>
      <SliderPrimitive.Control>
        <SliderTrack>
          <SliderIndicator />
        </SliderTrack>
        <SliderThumb />
      </SliderPrimitive.Control>
    </Slider>
  ),
}
