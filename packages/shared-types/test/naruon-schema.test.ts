import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NARUON_REHEARSAL_HANDOFF_KIND,
  NARUON_REHEARSAL_HANDOFF_VERSION
} from "../src/naruon";

type HandoffSchema = {
  $schema: string;
  additionalProperties: boolean;
  properties: {
    artifactKind: { const: string };
    artifactVersion: { const: number };
    provenance: {
      properties: {
        evidence: { maxItems: number };
      };
    };
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
});
