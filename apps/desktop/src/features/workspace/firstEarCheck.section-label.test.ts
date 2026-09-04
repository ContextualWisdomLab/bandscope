import {
  createDemoRehearsalSong,
  type RehearsalSection,
  type RehearsalSong
} from "@bandscope/shared-types";
import { expect, it } from "vitest";
import { resolveFirstEarCheck } from "./firstEarCheck";

it("rejects a noncanonical section label instead of surfacing untranslated rehearsal copy", () => {
  const song = createDemoRehearsalSong();
  const section = song.sections[0];
  if (!section) {
    throw new Error("demo song must contain an opening section");
  }

  const runtimeSong = {
    ...song,
    sections: [
      {
        ...section,
        label: "verse-custom"
      } as unknown as RehearsalSection
    ]
  } as RehearsalSong;

  expect(resolveFirstEarCheck(runtimeSong)).toBeNull();
});
