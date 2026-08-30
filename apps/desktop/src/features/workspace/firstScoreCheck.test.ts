import { createDemoRehearsalSong, type RehearsalSong } from "@bandscope/shared-types";
import { describe, expect, it } from "vitest";
import {
  firstScoreCheck,
  trustedScoreAttachment,
  trustedScoreFileName
} from "./firstScoreCheck";
import { fillRangeCopy } from "./firstRangeSqueeze";

const TRUSTED_SCORE_ID = "3f2c8f0e-1a2b-4c3d-8e9f-001122334455";

function songWithAttachments(
  attachments: unknown,
  song: RehearsalSong = createDemoRehearsalSong()
): RehearsalSong {
  return {
    ...song,
    scoreAttachments: attachments as RehearsalSong["scoreAttachments"]
  };
}

function blankRoleRange(song: RehearsalSong): RehearsalSong {
  return {
    ...song,
    sections: song.sections.map((section) => ({
      ...section,
      roles: section.roles.map((role) => ({
        ...role,
        range: { lowestNote: "", highestNote: "" },
        overlapWarnings: []
      }))
    }))
  };
}

describe("trustedScoreFileName", () => {
  it("admits a PDF basename", () => {
    expect(trustedScoreFileName("opener.pdf")).toBe("opener.pdf");
    expect(trustedScoreFileName("Late Night Set.PDF")).toBe("Late Night Set.PDF");
  });

  it("keeps native-valid display basenames instead of hiding attached scores", () => {
    for (const value of [
      " opener.pdf",
      "opener.pdf ",
      "mix..final.pdf",
      "CON.pdf",
      `${"a".repeat(120)}.pdf`
    ]) {
      expect(trustedScoreFileName(value)).toBe(value);
    }
  });

  it("fails closed on blank, path, control, and non-PDF names", () => {
    for (const value of [
      "",
      "pdf",
      ".pdf",
      "opener.pdf/",
      "../opener.pdf",
      "folder/opener.pdf",
      "folder\\opener.pdf",
      "open\ner.pdf",
      "open\u0000er.pdf",
      "opener.docx"
    ]) {
      expect(trustedScoreFileName(value)).toBeNull();
    }
  });
});

describe("trustedScoreAttachment", () => {
  it("admits a lowercase UUID plus trusted PDF basename", () => {
    expect(
      trustedScoreAttachment({ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" })
    ).toEqual({ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" });
  });

  it("fails closed on extra keys, inherited members, and malformed ids", () => {
    expect(trustedScoreAttachment(null)).toBeNull();
    expect(trustedScoreAttachment({ fileName: "opener.pdf" })).toBeNull();
    expect(
      trustedScoreAttachment({
        id: TRUSTED_SCORE_ID,
        fileName: "opener.pdf",
        extra: true
      })
    ).toBeNull();
    expect(
      trustedScoreAttachment({
        id: "3F2C8F0E-1A2B-4C3D-8E9F-001122334455",
        fileName: "opener.pdf"
      })
    ).toBeNull();
    expect(
      trustedScoreAttachment({
        id: "../../etc/passwd-aaaa-bbbb-cccc-dddddddddddd",
        fileName: "opener.pdf"
      })
    ).toBeNull();
    expect(
      trustedScoreAttachment(Object.create({ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" }))
    ).toBeNull();
  });
});

describe("firstScoreCheck", () => {
  it("returns null when no trusted score is attached", () => {
    expect(firstScoreCheck(createDemoRehearsalSong())).toBeNull();
    expect(firstScoreCheck(songWithAttachments(null))).toBeNull();
    expect(firstScoreCheck(songWithAttachments([]))).toBeNull();
    expect(firstScoreCheck(songWithAttachments([{ id: "bad", fileName: "opener.pdf" }]))).toBeNull();
  });

  it("skips malformed attachments and names the first trusted score with tonight's range", () => {
    const check = firstScoreCheck(
      songWithAttachments([
        { id: "bad", fileName: "skip.pdf" },
        { id: TRUSTED_SCORE_ID, fileName: "opener.pdf" }
      ])
    );

    expect(check).toEqual({
      fileName: "opener.pdf",
      sectionLabel: "verse",
      roleName: "Bass Guitar",
      lowestNote: "C#2",
      highestNote: "E3"
    });
  });

  it("does not advertise openability without a live project workspace", () => {
    expect(
      firstScoreCheck(
        songWithAttachments([{ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" }]),
        null,
        false
      )
    ).toBeNull();
  });

  it("still names the score when the selected part has no playable span", () => {
    expect(
      firstScoreCheck(
        songWithAttachments(
          [{ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" }],
          blankRoleRange(createDemoRehearsalSong())
        )
      )
    ).toEqual({ fileName: "opener.pdf" });
  });

  it("limits the paired range to the selected role", () => {
    expect(
      firstScoreCheck(
        songWithAttachments([{ id: TRUSTED_SCORE_ID, fileName: "opener.pdf" }]),
        "lead-vocal"
      )
    ).toEqual({
      fileName: "opener.pdf",
      sectionLabel: "verse",
      roleName: "Lead Vocal",
      lowestNote: "G#3",
      highestNote: "C#5"
    });
  });

  it("fails closed on malformed runtime roots", () => {
    for (const malformed of [null, {}, { scoreAttachments: {} }]) {
      expect(firstScoreCheck(malformed as unknown as RehearsalSong)).toBeNull();
    }
  });
});

describe("score check copy filling", () => {
  it("keeps the attached file name literal", () => {
    expect(
      fillRangeCopy("Open {fileName} in Score before the {sectionLabel}.", {
        fileName: "Bass $& {sectionLabel}.pdf",
        sectionLabel: "verse"
      })
    ).toBe("Open Bass $& {sectionLabel}.pdf in Score before the verse.");
  });
});
