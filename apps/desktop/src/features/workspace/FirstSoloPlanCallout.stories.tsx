import type { Meta, StoryObj } from "@storybook/react-vite";
import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { FirstSoloPlanCallout } from "./FirstSoloPlanCallout";
import { SectionRoadmap } from "./SectionRoadmap";

function withoutSoloPlans(): RehearsalSong {
  const song = createDemoRehearsalSong();
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({ ...role, soloPlan: "" }))
    }))
  };
}

function StorySurface({ song }: { song: RehearsalSong }) {
  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <FirstSoloPlanCallout song={song} />
        <div id="workspace-song-structure-grid" aria-hidden="true" className="hidden" />
        <SectionRoadmap song={song} activeRole={null} />
      </div>
    </div>
  );
}

const meta = {
  title: "Workspace/First Solo Plan Callout",
  component: FirstSoloPlanCallout,
  parameters: { layout: "fullscreen" },
  render: ({ song }) => <StorySurface song={song} />
} satisfies Meta<typeof FirstSoloPlanCallout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {
  args: { song: createDemoRehearsalSong() }
};

export const Unavailable: Story = {
  args: { song: withoutSoloPlans() }
};
