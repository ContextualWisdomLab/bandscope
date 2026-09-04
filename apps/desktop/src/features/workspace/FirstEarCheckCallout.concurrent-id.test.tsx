import { render } from "@testing-library/react";
import { createDemoRehearsalSong } from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { FirstEarCheckCallout } from "./FirstEarCheckCallout";

it("keeps concurrent ear-check landmarks free of duplicate ids", () => {
  const song = createDemoRehearsalSong();
  const { container } = render(
    <>
      <FirstEarCheckCallout song={song} />
      <FirstEarCheckCallout song={song} />
    </>
  );

  const ids = Array.from(container.querySelectorAll<HTMLElement>("[id]"), (element) => element.id);
  expect(ids).toEqual(Array.from(new Set(ids)));
});
