import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { SectionRoadmap } from "./SectionRoadmap";

/** Storybook metadata for the section-by-section rehearsal roadmap. */
const meta = {
  title: "Workspace/SectionRoadmap",
  component: SectionRoadmap,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SectionRoadmap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full demo-song roadmap showing all rehearsal roles. */
export const DemoSong: Story = {
  args: {
    song: createDemoRehearsalSong(),
    activeRole: null,
  },
};
