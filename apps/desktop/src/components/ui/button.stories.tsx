import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./button"

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: { layout: "centered" },
  args: { children: "분석 시작" },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Outline: Story = {
  args: { variant: "outline", children: "로컬 오디오 선택" },
}
export const Destructive: Story = {
  args: { variant: "destructive", children: "삭제" },
}
export const Small: Story = { args: { size: "sm" } }
