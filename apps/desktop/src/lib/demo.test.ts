import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEMO_PROVENANCE_KIND,
  DEMO_RESOURCE_DIRECTORY,
  parseDemoProvenanceManifest,
  type DemoProvenanceManifest
} from "./demo";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");

function bundledManifest(): DemoProvenanceManifest {
  const raw = readFileSync(
    path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, "provenance.json"),
    "utf8"
  );
  return parseDemoProvenanceManifest(JSON.parse(raw));
}

describe("licensed demo provenance", () => {
  it("accepts the bundled CC0 package and verifies every recorded hash", () => {
    const manifest = bundledManifest();
    expect(manifest.artifactKind).toBe(DEMO_PROVENANCE_KIND);
    expect(manifest.song.license).toBe("CC0-1.0");
    expect(manifest.song.title).toBe("Late Night Set");
    expect(manifest.song.permittedUses).toEqual([
      "evaluation",
      "redistribution",
      "rehearsal-demo"
    ]);
    for (const asset of manifest.assets) {
      const bytes = readFileSync(path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, asset.path));
      expect(bytes.byteLength).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
    const audio = manifest.assets.find((asset) => asset.role === "audio");
    expect(audio?.path).toBe("late-night-set.wav");
    const wav = readFileSync(path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, "late-night-set.wav"));
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("rejects unknown fields, the wrong kind, and a missing asset role", () => {
    const manifest = bundledManifest();
    expect(() => parseDemoProvenanceManifest(null)).toThrow(/root/);
    expect(() => parseDemoProvenanceManifest([])).toThrow(/root/);
    expect(() => parseDemoProvenanceManifest({ ...manifest, extra: true })).toThrow(
      /Invalid demo provenance field 'extra'/
    );
    expect(() => parseDemoProvenanceManifest({ ...manifest, artifactKind: "other" })).toThrow(
      /artifactKind/
    );
    expect(() => parseDemoProvenanceManifest({ ...manifest, manifestVersion: 2 })).toThrow(
      /manifestVersion/
    );
    expect(() => parseDemoProvenanceManifest({ ...manifest, song: null })).toThrow(/song/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        song: { ...manifest.song, extra: "nope" }
      })
    ).toThrow(/song\.extra/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        song: { ...manifest.song, license: "MIT" }
      })
    ).toThrow(/license/);
    const withoutAudio = {
      ...manifest,
      assets: manifest.assets.filter((asset) => asset.role !== "audio")
    };
    expect(() => parseDemoProvenanceManifest(withoutAudio)).toThrow(/assets/);
  });

  it("rejects manifests whose UTF-8 serialization exceeds the byte ceiling", () => {
    const manifest = bundledManifest();
    const oversizedUtf8Manifest = { ...manifest };
    Object.defineProperty(oversizedUtf8Manifest, "toJSON", {
      enumerable: false,
      value: () => "가".repeat(6000)
    });

    expect(() => parseDemoProvenanceManifest(oversizedUtf8Manifest)).toThrow(/too large/);
  });

  it("rejects traversal paths, dot segments, non-hex hashes, and malformed assets", () => {
    const manifest = bundledManifest();
    const [audio, license, annotations] = manifest.assets;
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [{ ...audio, path: "../secret.wav" }, license, annotations]
      })
    ).toThrow(/assets\[0\]\.path/);
    for (const dotSegment of [".", ".."]) {
      expect(() =>
        parseDemoProvenanceManifest({
          ...manifest,
          assets: [{ ...audio, path: dotSegment }, license, annotations]
        })
      ).toThrow(/assets\[0\]\.path/);
    }
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [{ ...audio, sha256: "not-a-hash" }, license, annotations]
      })
    ).toThrow(/sha256/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [{ ...audio, bytes: 1.5 }, license, annotations]
      })
    ).toThrow(/bytes/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [{ ...audio, extra: true }, license, annotations]
      })
    ).toThrow(/assets\[0\]\.extra/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [null, license, annotations]
      })
    ).toThrow(/assets\[0\]/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        assets: [{ ...audio, role: "stems" }, license, annotations]
      })
    ).toThrow(/assets\.role/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...manifest,
        song: { ...manifest.song, permittedUses: [] }
      })
    ).toThrow(/permittedUses/);
  });
});
