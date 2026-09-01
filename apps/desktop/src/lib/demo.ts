/** Kind discriminator for the public licensed-demo provenance manifest. */
const DEMO_PROVENANCE_KIND = "bandscope.licensed-demo" as const;

/** Canonical buyer-facing title for the bundled licensed demo. */
const DEMO_SONG_TITLE = "Late Night Set" as const;

/** Relative directory that Tauri bundles as the licensed demo package. */
const DEMO_RESOURCE_DIRECTORY = "apps/desktop/src-tauri/resources/demo";

export { DEMO_PROVENANCE_KIND, DEMO_RESOURCE_DIRECTORY, DEMO_SONG_TITLE };

/** Permitted asset roles inside one licensed demo package. */
export type DemoAssetRole = "audio" | "license" | "annotations";

/** One hashed file in the licensed demo package after wire translation. */
export type DemoProvenanceAsset = {
  assetPath: string;
  assetRole: DemoAssetRole;
  assetSha256: string;
  assetByteCount: number;
  assetMediaType: string;
};

/** Provenance contract used internally after translating the public wire manifest. */
export type DemoProvenanceManifest = {
  manifestVersion: 1;
  artifactKind: typeof DEMO_PROVENANCE_KIND;
  demoSong: {
    songId: string;
    songTitle: string;
    performerName: string;
    licenseExpression: "CC0-1.0";
    licenseUrl: string;
    permittedUses: string[];
  };
  demoAssets: DemoProvenanceAsset[];
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELATIVE_FILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_MANIFEST_BYTES = 16_384;
const MAX_ASSET_BYTES = 2_000_000;
const REQUIRED_ROLES: DemoAssetRole[] = ["audio", "license", "annotations"];
const UTF8_TEXT_ENCODER = new TextEncoder();

/** Read one bounded non-empty provenance string. */
function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new Error(`Invalid demo provenance field '${field}'`);
  }
  return value.trim();
}

/** Narrow one untrusted asset role to the licensed-demo allowlist. */
function asAssetRole(value: unknown): DemoAssetRole {
  if (value === "audio" || value === "license" || value === "annotations") {
    return value;
  }
  throw new Error("Invalid demo provenance field 'assets.role'");
}

/** Parse the stable public wire manifest into semantically specific internal names. */
export function parseDemoProvenanceManifest(payload: unknown): DemoProvenanceManifest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid demo provenance field 'root'");
  }
  const manifestRecord = payload as Record<string, unknown>;
  const allowedManifestFields = new Set(["manifestVersion", "artifactKind", "song", "assets"]);
  for (const manifestField of Object.keys(manifestRecord)) {
    if (!allowedManifestFields.has(manifestField)) {
      throw new Error(`Invalid demo provenance field '${manifestField}'`);
    }
  }
  if (manifestRecord.manifestVersion !== 1) {
    throw new Error("Invalid demo provenance field 'manifestVersion'");
  }
  if (manifestRecord.artifactKind !== DEMO_PROVENANCE_KIND) {
    throw new Error("Invalid demo provenance field 'artifactKind'");
  }
  if (
    manifestRecord.song === null ||
    typeof manifestRecord.song !== "object" ||
    Array.isArray(manifestRecord.song)
  ) {
    throw new Error("Invalid demo provenance field 'song'");
  }
  const songRecord = manifestRecord.song as Record<string, unknown>;
  for (const songField of Object.keys(songRecord)) {
    if (
      songField !== "id" &&
      songField !== "title" &&
      songField !== "performer" &&
      songField !== "license" &&
      songField !== "licenseUrl" &&
      songField !== "permittedUses"
    ) {
      throw new Error(`Invalid demo provenance field 'song.${songField}'`);
    }
  }
  const permittedUses = songRecord.permittedUses;
  if (!Array.isArray(permittedUses) || permittedUses.length === 0 || permittedUses.length > 8) {
    throw new Error("Invalid demo provenance field 'song.permittedUses'");
  }
  const permittedUseNames = permittedUses.map((permittedUse, permittedUseIndex) =>
    asNonEmptyString(permittedUse, `song.permittedUses[${permittedUseIndex}]`)
  );
  if (songRecord.license !== "CC0-1.0") {
    throw new Error("Invalid demo provenance field 'song.license'");
  }
  if (!Array.isArray(manifestRecord.assets) || manifestRecord.assets.length !== 3) {
    throw new Error("Invalid demo provenance field 'assets'");
  }
  const demoAssets: DemoProvenanceAsset[] = manifestRecord.assets.map(
    (assetEntry, assetIndex) => {
      if (assetEntry === null || typeof assetEntry !== "object" || Array.isArray(assetEntry)) {
        throw new Error(`Invalid demo provenance field 'assets[${assetIndex}]'`);
      }
      const assetRecord = assetEntry as Record<string, unknown>;
      for (const assetField of Object.keys(assetRecord)) {
        if (
          assetField !== "path" &&
          assetField !== "role" &&
          assetField !== "sha256" &&
          assetField !== "bytes" &&
          assetField !== "mediaType"
        ) {
          throw new Error(`Invalid demo provenance field 'assets[${assetIndex}].${assetField}'`);
        }
      }
      const assetPath = asNonEmptyString(assetRecord.path, `assets[${assetIndex}].path`);
      if (assetPath === "." || assetPath === ".." || !RELATIVE_FILE_PATTERN.test(assetPath)) {
        throw new Error(`Invalid demo provenance field 'assets[${assetIndex}].path'`);
      }
      const assetSha256 = asNonEmptyString(assetRecord.sha256, `assets[${assetIndex}].sha256`);
      if (!SHA256_PATTERN.test(assetSha256)) {
        throw new Error(`Invalid demo provenance field 'assets[${assetIndex}].sha256'`);
      }
      if (
        !Number.isSafeInteger(assetRecord.bytes) ||
        (assetRecord.bytes as number) <= 0 ||
        (assetRecord.bytes as number) > MAX_ASSET_BYTES
      ) {
        throw new Error(`Invalid demo provenance field 'assets[${assetIndex}].bytes'`);
      }
      return {
        assetPath,
        assetRole: asAssetRole(assetRecord.role),
        assetSha256,
        assetByteCount: assetRecord.bytes as number,
        assetMediaType: asNonEmptyString(assetRecord.mediaType, `assets[${assetIndex}].mediaType`)
      };
    }
  );
  const assetRoles = new Set(demoAssets.map((demoAsset) => demoAsset.assetRole));
  for (const requiredRole of REQUIRED_ROLES) {
    if (!assetRoles.has(requiredRole)) {
      throw new Error("Invalid demo provenance field 'assets.role'");
    }
  }
  const serializedManifest = JSON.stringify(payload);
  const serializedManifestBytes = UTF8_TEXT_ENCODER.encode(serializedManifest).byteLength;
  if (serializedManifestBytes > MAX_MANIFEST_BYTES) {
    throw new Error("Invalid demo provenance field 'root': manifest is too large");
  }
  return {
    manifestVersion: 1,
    artifactKind: DEMO_PROVENANCE_KIND,
    demoSong: {
      songId: asNonEmptyString(songRecord.id, "song.id"),
      songTitle: asNonEmptyString(songRecord.title, "song.title"),
      performerName: asNonEmptyString(songRecord.performer, "song.performer"),
      licenseExpression: "CC0-1.0",
      licenseUrl: asNonEmptyString(songRecord.licenseUrl, "song.licenseUrl"),
      permittedUses: permittedUseNames
    },
    demoAssets
  };
}
