import type { Meta, StoryObj } from "@storybook/react-vite";
import { RehearsalCallout } from "./RehearsalCallout";

const meta = {
  title: "Workspace/RehearsalCallout",
  component: RehearsalCallout,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RehearsalCallout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LockChorusFirst: Story = {
  args: {
    title: "Lock the chorus bass first",
    body: "Bass and vocal overlap on the hook. Loop the chorus before the room starts.",
    actionLabel: "Loop the chorus",
  },
};
