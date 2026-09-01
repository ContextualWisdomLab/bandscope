import { describe, expect, it } from "vitest";
import { resolveFirstPartHandoff } from "./firstPartHandoff";
import { createPartHandoffTransitionSong } from "./firstPartHandoff.test-fixture";

describe("resolveFirstPartHandoff selected role scope", () => {
  it("keeps a transition when the selected role gives or receives the pass", () => {
    const song = createPartHandoffTransitionSong();

    expect(resolveFirstPartHandoff(song, "bass-guitar")?.receivingRole.id).toBe("lead-vocal");
    expect(resolveFirstPartHandoff(song, "lead-vocal")?.givingRole.id).toBe("bass-guitar");
  });

  it("fails closed when the selected role is not on the pass", () => {
    expect(resolveFirstPartHandoff(createPartHandoffTransitionSong(), "keys-right")).toBeNull();
    expect(resolveFirstPartHandoff(createPartHandoffTransitionSong(), "missing-role")).toBeNull();
  });
});
