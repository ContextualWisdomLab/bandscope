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

/** Legacy public wire shape retained only at the provenance anti-corruption boundary. */
type DemoProvenanceWireFixture = {
  manifestVersion: number;
  artifactKind: string;
  song: {
    id: string;
    title: string;
    performer: string;
    license: string;
    licenseUrl: string;
    permittedUses: string[];
  };
  assets: Array<{
    path: string;
    role: string;
    sha256: string;
    bytes: number;
    mediaType: string;
  }>;
};

function bundledWireManifest(): DemoProvenanceWireFixture {
  const rawManifest = readFileSync(
    path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, "provenance.json"),
    "utf8"
  );
  return JSON.parse(rawManifest) as DemoProvenanceWireFixture;
}

function bundledManifest(): DemoProvenanceManifest {
  return parseDemoProvenanceManifest(bundledWireManifest());
}

describe("licensed demo provenance", () => {
  it("accepts the bundled CC0 package and verifies every recorded hash", () => {
    const manifest = bundledManifest();
    expect(manifest.artifactKind).toBe(DEMO_PROVENANCE_KIND);
    expect(manifest.demoSong.licenseExpression).toBe("CC0-1.0");
    expect(manifest.demoSong.songTitle).toBe("Late Night Set");
    expect(manifest.demoSong.permittedUses).toEqual([
      "evaluation",
      "redistribution",
      "rehearsal-demo"
    ]);
    for (const demoAsset of manifest.demoAssets) {
      const assetBytes = readFileSync(
        path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, demoAsset.assetPath)
      );
      expect(assetBytes.byteLength).toBe(demoAsset.assetByteCount);
      expect(createHash("sha256").update(assetBytes).digest("hex")).toBe(demoAsset.assetSha256);
    }
    const audioAsset = manifest.demoAssets.find((demoAsset) => demoAsset.assetRole === "audio");
    expect(audioAsset?.assetPath).toBe("late-night-set.wav");
    const demoWav = readFileSync(
      path.join(workspaceRoot, DEMO_RESOURCE_DIRECTORY, "late-night-set.wav")
    );
    expect(demoWav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(demoWav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  });

  it("rejects unknown fields, the wrong kind, and a missing asset role", () => {
    const wireManifest = bundledWireManifest();
    expect(() => parseDemoProvenanceManifest(null)).toThrow(/root/);
    expect(() => parseDemoProvenanceManifest([])).toThrow(/root/);
    expect(() => parseDemoProvenanceManifest({ ...wireManifest, extra: true })).toThrow(
      /Invalid demo provenance field 'extra'/
    );
    expect(() =>
      parseDemoProvenanceManifest({ ...wireManifest, artifactKind: "other" })
    ).toThrow(/artifactKind/);
    expect(() => parseDemoProvenanceManifest({ ...wireManifest, manifestVersion: 2 })).toThrow(
      /manifestVersion/
    );
    expect(() => parseDemoProvenanceManifest({ ...wireManifest, song: null })).toThrow(/song/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        song: { ...wireManifest.song, extra: "nope" }
      })
    ).toThrow(/song\.extra/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        song: { ...wireManifest.song, license: "MIT" }
      })
    ).toThrow(/license/);
    const withoutAudio = {
      ...wireManifest,
      assets: wireManifest.assets.filter((demoAsset) => demoAsset.role !== "audio")
    };
    expect(() => parseDemoProvenanceManifest(withoutAudio)).toThrow(/assets/);
  });

  it("rejects manifests whose UTF-8 serialization exceeds the byte ceiling", () => {
    const wireManifest = bundledWireManifest();
    const oversizedUtf8Manifest = { ...wireManifest };
    Object.defineProperty(oversizedUtf8Manifest, "toJSON", {
      enumerable: false,
      value: () => "가".repeat(6000)
    });

    expect(() => parseDemoProvenanceManifest(oversizedUtf8Manifest)).toThrow(/too large/);
  });

  it("rejects traversal paths, dot segments, non-hex hashes, and malformed assets", () => {
    const wireManifest = bundledWireManifest();
    const [audioAsset, licenseAsset, annotationAsset] = wireManifest.assets;
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [{ ...audioAsset, path: "../secret.wav" }, licenseAsset, annotationAsset]
      })
    ).toThrow(/assets\[0\]\.path/);
    for (const dotSegment of [".", ".."]) {
      expect(() =>
        parseDemoProvenanceManifest({
          ...wireManifest,
          assets: [{ ...audioAsset, path: dotSegment }, licenseAsset, annotationAsset]
        })
      ).toThrow(/assets\[0\]\.path/);
    }
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [{ ...audioAsset, sha256: "not-a-hash" }, licenseAsset, annotationAsset]
      })
    ).toThrow(/sha256/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [{ ...audioAsset, bytes: 1.5 }, licenseAsset, annotationAsset]
      })
    ).toThrow(/bytes/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [{ ...audioAsset, extra: true }, licenseAsset, annotationAsset]
      })
    ).toThrow(/assets\[0\]\.extra/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [null, licenseAsset, annotationAsset]
      })
    ).toThrow(/assets\[0\]/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        assets: [{ ...audioAsset, role: "stems" }, licenseAsset, annotationAsset]
      })
    ).toThrow(/assets\.role/);
    expect(() =>
      parseDemoProvenanceManifest({
        ...wireManifest,
        song: { ...wireManifest.song, permittedUses: [] }
      })
    ).toThrow(/permittedUses/);
  });
});
