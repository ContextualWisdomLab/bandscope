import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NARUON_REHEARSAL_HANDOFF_KIND,
  NARUON_REHEARSAL_HANDOFF_VERSION
} from "../src/naruon";

type PatternContract = { pattern: string };

type HandoffSchema = {
  $schema: string;
  additionalProperties: boolean;
  properties: {
    artifactKind: { const: string };
    artifactVersion: { const: number };
    event: {
      properties: {
        timeZone: PatternContract;
      };
    };
    provenance: {
      properties: {
        evidence: {
          maxItems: number;
          items: {
            properties: {
              field: PatternContract;
            };
          };
        };
      };
    };
  };
  $defs: {
    opaqueIdentifier: PatternContract;
    displayText: PatternContract;
    timestamp: PatternContract;
  };
};

/** Load the checked-in public JSON Schema from the repository documentation tree. */
function loadSchema(): HandoffSchema {
  const schemaUrl = new URL(
    "../../../docs/integrations/naruon-rehearsal-handoff-v1.schema.json",
    import.meta.url
  );
  return JSON.parse(readFileSync(fileURLToPath(schemaUrl), "utf8")) as HandoffSchema;
}

/** Compile one schema pattern with the Unicode semantics used by modern validators. */
function schemaPattern(pattern: PatternContract): RegExp {
  return new RegExp(pattern.pattern, "u");
}

describe("naruon public JSON Schema", () => {
  it("is valid JSON with the same versioned identity as the runtime parser", () => {
    const schema = loadSchema();

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.properties.artifactKind.const).toBe(NARUON_REHEARSAL_HANDOFF_KIND);
    expect(schema.properties.artifactVersion.const).toBe(
      NARUON_REHEARSAL_HANDOFF_VERSION
    );
    expect(schema.properties.provenance.properties.evidence.maxItems).toBe(64);
    expect(schema.additionalProperties).toBe(false);
  });

  it("matches the runtime no-padding contract for public text fields", () => {
    const schema = loadSchema();
    const displayText = schemaPattern(schema.$defs.displayText);
    const timeZone = schemaPattern(schema.properties.event.properties.timeZone);
    const evidenceField = schemaPattern(
      schema.properties.provenance.properties.evidence.items.properties.field
    );

    expect(displayText.test("Friday rehearsal")).toBe(true);
    expect(displayText.test(" Friday rehearsal")).toBe(false);
    expect(displayText.test("Friday rehearsal ")).toBe(false);
    expect(displayText.test("\u00a0Friday rehearsal")).toBe(false);
    expect(timeZone.test("Asia/Seoul")).toBe(true);
    expect(timeZone.test(" Asia/Seoul")).toBe(false);
    expect(evidenceField.test("event.startsAt")).toBe(true);
    expect(evidenceField.test("event.startsAt ")).toBe(false);
  });

  it("keeps identifiers opaque, trimmed, and nonnumeric across Unicode digits", () => {
    const opaqueIdentifier = schemaPattern(loadSchema().$defs.opaqueIdentifier);

    expect(opaqueIdentifier.test("band-2026")).toBe(true);
    expect(opaqueIdentifier.test("123456")).toBe(false);
    expect(opaqueIdentifier.test("١٢٣٤٥٦")).toBe(false);
    expect(opaqueIdentifier.test(" band-2026")).toBe(false);
    expect(opaqueIdentifier.test("band-2026 ")).toBe(false);
  });

  it("bounds timestamp components before authoritative calendar validation", () => {
    const timestamp = schemaPattern(loadSchema().$defs.timestamp);

    expect(timestamp.test("2026-08-10T19:00:00+09:00")).toBe(true);
    expect(timestamp.test("2026-08-10T10:00:00Z")).toBe(true);
    expect(timestamp.test("2026-08-10T10:00:00-00:00")).toBe(true);
    expect(timestamp.test("2026-13-10T10:00:00Z")).toBe(false);
    expect(timestamp.test("2026-08-10T24:00:00Z")).toBe(false);
    expect(timestamp.test("2026-08-10T10:60:00Z")).toBe(false);
    expect(timestamp.test("2026-08-10T10:00:60Z")).toBe(false);
    expect(timestamp.test("2026-08-10T10:00:00+24:00")).toBe(false);
  });
});
