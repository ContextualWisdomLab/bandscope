/** Kind discriminator for the public licensed-demo provenance manifest. */
export const DEMO_PROVENANCE_KIND = "bandscope.licensed-demo" as const;

/** Relative directory that Tauri bundles as the licensed demo package. */
export const DEMO_RESOURCE_DIRECTORY = "apps/desktop/src-tauri/resources/demo";

/** Permitted asset roles inside one licensed demo package. */
export type DemoAssetRole = "audio" | "license" | "annotations";

/** One hashed file in the licensed demo package. */
export type DemoProvenanceAsset = {
  path: string;
  role: DemoAssetRole;
  sha256: string;
  bytes: number;
  mediaType: string;
};

/** Provenance contract for the redistributable BandScope demo song. */
export type DemoProvenanceManifest = {
  manifestVersion: 1;
  artifactKind: typeof DEMO_PROVENANCE_KIND;
  song: {
    id: string;
    title: string;
    performer: string;
    license: "CC0-1.0";
    licenseUrl: string;
    permittedUses: string[];
  };
  assets: DemoProvenanceAsset[];
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELATIVE_FILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_MANIFEST_BYTES = 16_384;
const MAX_ASSET_BYTES = 2_000_000;
const REQUIRED_ROLES: DemoAssetRole[] = ["audio", "license", "annotations"];

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) {
    throw new Error(`Invalid demo provenance field '${field}'`);
  }
  return value.trim();
}

function asAssetRole(value: unknown): DemoAssetRole {
  if (value === "audio" || value === "license" || value === "annotations") {
    return value;
  }
  throw new Error("Invalid demo provenance field 'assets.role'");
}

/** Parse one licensed-demo provenance manifest and reject unknown fields. */
export function parseDemoProvenanceManifest(payload: unknown): DemoProvenanceManifest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid demo provenance field 'root'");
  }
  const record = payload as Record<string, unknown>;
  const allowed = new Set(["manifestVersion", "artifactKind", "song", "assets"]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid demo provenance field '${key}'`);
    }
  }
  if (record.manifestVersion !== 1) {
    throw new Error("Invalid demo provenance field 'manifestVersion'");
  }
  if (record.artifactKind !== DEMO_PROVENANCE_KIND) {
    throw new Error("Invalid demo provenance field 'artifactKind'");
  }
  if (record.song === null || typeof record.song !== "object" || Array.isArray(record.song)) {
    throw new Error("Invalid demo provenance field 'song'");
  }
  const songRecord = record.song as Record<string, unknown>;
  for (const key of Object.keys(songRecord)) {
    if (
      key !== "id" &&
      key !== "title" &&
      key !== "performer" &&
      key !== "license" &&
      key !== "licenseUrl" &&
      key !== "permittedUses"
    ) {
      throw new Error(`Invalid demo provenance field 'song.${key}'`);
    }
  }
  const permittedUses = songRecord.permittedUses;
  if (!Array.isArray(permittedUses) || permittedUses.length === 0 || permittedUses.length > 8) {
    throw new Error("Invalid demo provenance field 'song.permittedUses'");
  }
  const uses = permittedUses.map((entry, index) => asNonEmptyString(entry, `song.permittedUses[${index}]`));
  if (songRecord.license !== "CC0-1.0") {
    throw new Error("Invalid demo provenance field 'song.license'");
  }
  if (!Array.isArray(record.assets) || record.assets.length !== 3) {
    throw new Error("Invalid demo provenance field 'assets'");
  }
  const assets: DemoProvenanceAsset[] = record.assets.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid demo provenance field 'assets[${index}]'`);
    }
    const asset = entry as Record<string, unknown>;
    for (const key of Object.keys(asset)) {
      if (key !== "path" && key !== "role" && key !== "sha256" && key !== "bytes" && key !== "mediaType") {
        throw new Error(`Invalid demo provenance field 'assets[${index}].${key}'`);
      }
    }
    const assetPath = asNonEmptyString(asset.path, `assets[${index}].path`);
    if (!RELATIVE_FILE_PATTERN.test(assetPath)) {
      throw new Error(`Invalid demo provenance field 'assets[${index}].path'`);
    }
    const sha256 = asNonEmptyString(asset.sha256, `assets[${index}].sha256`);
    if (!SHA256_PATTERN.test(sha256)) {
      throw new Error(`Invalid demo provenance field 'assets[${index}].sha256'`);
    }
    if (
      !Number.isSafeInteger(asset.bytes) ||
      (asset.bytes as number) <= 0 ||
      (asset.bytes as number) > MAX_ASSET_BYTES
    ) {
      throw new Error(`Invalid demo provenance field 'assets[${index}].bytes'`);
    }
    return {
      path: assetPath,
      role: asAssetRole(asset.role),
      sha256,
      bytes: asset.bytes as number,
      mediaType: asNonEmptyString(asset.mediaType, `assets[${index}].mediaType`)
    };
  });
  const roles = new Set(assets.map((asset) => asset.role));
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) {
      throw new Error("Invalid demo provenance field 'assets.role'");
    }
  }
  const encoded = JSON.stringify(payload);
  if (encoded.length > MAX_MANIFEST_BYTES) {
    throw new Error("Invalid demo provenance field 'root'");
  }
  return {
    manifestVersion: 1,
    artifactKind: DEMO_PROVENANCE_KIND,
    song: {
      id: asNonEmptyString(songRecord.id, "song.id"),
      title: asNonEmptyString(songRecord.title, "song.title"),
      performer: asNonEmptyString(songRecord.performer, "song.performer"),
      license: "CC0-1.0",
      licenseUrl: asNonEmptyString(songRecord.licenseUrl, "song.licenseUrl"),
      permittedUses: uses
    },
    assets
  };
}
