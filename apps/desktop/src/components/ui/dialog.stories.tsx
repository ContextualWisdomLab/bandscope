import type { Meta, StoryObj } from "@storybook/react-vite"

import { Button } from "./button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "./dialog"

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmation: Story = {
  render: () => (
    <Dialog open>
      <DialogContent>
        <DialogTitle>삭제 확인</DialogTitle>
        <DialogDescription>
          이 항목을 삭제하시겠습니까? 되돌릴 수 없습니다.
        </DialogDescription>
        <DialogFooter>
          <DialogClose
            render={<Button variant="outline">취소</Button>}
          />
          <Button variant="destructive">삭제</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
