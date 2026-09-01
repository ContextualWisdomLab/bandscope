import type { Meta, StoryObj } from "@storybook/react"

import { Textarea } from "./textarea"
import { Label } from "./label"

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    placeholder: { control: "text" },
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    placeholder: "내용을 입력하세요...",
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: "입력할 수 없습니다.",
  },
}

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="message">메시지</Label>
      <Textarea id="message" {...args} />
    </div>
  ),
  args: {
    placeholder: "메시지를 입력하세요...",
  },
}
