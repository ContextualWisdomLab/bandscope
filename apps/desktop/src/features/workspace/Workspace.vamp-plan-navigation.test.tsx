import { render, screen } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import { Workspace } from "./Workspace";

describe("Workspace vamp-plan navigation contract", () => {
  it("gives the production song-structure grid the stable navigation anchor", () => {
    render(<Workspace song={createDemoRehearsalSong()} />);

    expect(screen.getByTestId("song-structure-grid").id).toBe("workspace-song-structure-grid");
  });
});
