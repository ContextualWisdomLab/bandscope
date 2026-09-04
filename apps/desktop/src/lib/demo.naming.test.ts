import { describe, expect, it } from "vitest";
import { parseDemoProvenanceManifest } from "./demo";

const HASH = "0".repeat(64);

const legacyWireManifest = {
  manifestVersion: 1,
  artifactKind: "bandscope.licensed-demo",
  song: {
    id: "late-night-set",
    title: "Late Night Set",
    performer: "Contextual Wisdom Lab",
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    permittedUses: ["evaluation"]
  },
  assets: [
    {
      path: "late-night-set.wav",
      role: "audio",
      sha256: HASH,
      bytes: 441044,
      mediaType: "audio/wav"
    },
    {
      path: "LICENSE",
      role: "license",
      sha256: HASH,
      bytes: 822,
      mediaType: "text/plain"
    },
    {
      path: "annotations.json",
      role: "annotations",
      sha256: HASH,
      bytes: 707,
      mediaType: "application/json"
    }
  ]
};

describe("licensed demo provenance naming boundary", () => {
  it("translates legacy public wire keys into semantic internal names", () => {
    const parsedManifest = parseDemoProvenanceManifest(legacyWireManifest) as unknown as {
      demoSong: {
        songId: string;
        songTitle: string;
        performerName: string;
        licenseExpression: string;
      };
      demoAssets: Array<{
        assetPath: string;
        assetRole: string;
        assetSha256: string;
        assetByteCount: number;
        assetMediaType: string;
      }>;
    };

    expect(parsedManifest.demoSong).toMatchObject({
      songId: "late-night-set",
      songTitle: "Late Night Set",
      performerName: "Contextual Wisdom Lab",
      licenseExpression: "CC0-1.0"
    });
    expect(parsedManifest.demoAssets[0]).toEqual({
      assetPath: "late-night-set.wav",
      assetRole: "audio",
      assetSha256: HASH,
      assetByteCount: 441044,
      assetMediaType: "audio/wav"
    });
  });
});
