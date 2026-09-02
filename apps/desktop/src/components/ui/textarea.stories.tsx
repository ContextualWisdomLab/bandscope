import type { Meta, StoryObj } from "@storybook/react-vite"

import { Textarea } from "./textarea"

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  args: { placeholder: "여기에 의견을 적어주세요." },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Disabled: Story = {
  args: { disabled: true, value: "수정할 수 없는 텍스트" },
}
