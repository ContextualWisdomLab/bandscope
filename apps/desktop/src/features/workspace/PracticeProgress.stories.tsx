import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PracticeProgress } from "./PracticeProgress";

const meta = {
  title: "Workspace/PracticeProgress",
  component: PracticeProgress,
  parameters: { layout: "padded" },
} satisfies Meta<typeof PracticeProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { progress: 0, onChange: () => undefined },
};

export const Midway: Story = {
  render: function MidwayStory() {
    const [progress, setProgress] = useState(40);
    return <PracticeProgress progress={progress} onChange={setProgress} />;
  },
};
