import type { Meta, StoryObj } from "@storybook/react-vite";
import { PracticeProgress } from "./PracticeProgress";

/** Storybook metadata for rehearsal practice-progress controls. */
const meta = {
  title: "Workspace/PracticeProgress",
  component: PracticeProgress,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PracticeProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty rehearsal-progress state at zero percent. */
export const Empty: Story = {
  args: { progress: 0, onChange: () => undefined },
};

/** Midway rehearsal-progress state whose Storybook controls remain bound to component props. */
export const Midway: Story = {
  args: { progress: 40, onChange: () => undefined },
};
