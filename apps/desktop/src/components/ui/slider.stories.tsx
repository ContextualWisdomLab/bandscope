import type { Meta, StoryObj } from "@storybook/react"
import { Slider } from "./slider"

/**
 * 슬라이더 컴포넌트의 스토리북 메타데이터입니다.
 */
const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Slider>

export default meta
type Story = StoryObj<typeof meta>

/**
 * 기본 슬라이더 상태입니다.
 */
export const Default: Story = {
  args: {
    defaultValue: 50,
    className: "w-[200px]",
  },
}

/**
 * 비활성화된 슬라이더 상태입니다.
 */
export const Disabled: Story = {
  args: {
    defaultValue: 50,
    disabled: true,
    className: "w-[200px]",
  },
}
