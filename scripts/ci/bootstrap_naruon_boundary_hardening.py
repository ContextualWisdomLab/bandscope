#!/usr/bin/env python3
"""Harden the naruon handoff trust boundary, add regression tests, then self-delete."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "packages/shared-types/src/naruon.ts"
TEST = ROOT / "packages/shared-types/test/naruon-hardening.test.ts"
SELF = ROOT / "scripts/ci/bootstrap_naruon_boundary_hardening.py"
SELF_WORKFLOW = ROOT / ".github/workflows/bootstrap-naruon-boundary-hardening.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_source(text: str) -> str:
    """Snapshot public validator inputs and redact malformed JSON details."""
    text = replace_once(
        text,
        """export function validateNaruonRehearsalHandoff(value: unknown): string | null {
  return validateSnapshot(value);
}
""",
        """export function validateNaruonRehearsalHandoff(value: unknown): string | null {
  const snapshot = snapshotBoundaryValue(value);
  return snapshot.ok ? validateSnapshot(snapshot.value) : snapshot.error;
}
""",
        "public validator snapshot",
    )
    text = replace_once(
        text,
        """  } catch (error) {
    const detail = String(error);
    throw new TypeError(`Invalid naruon rehearsal handoff JSON: ${detail}`);
  }
""",
        """  } catch {
    throw new TypeError("Invalid naruon rehearsal handoff JSON: malformed JSON");
  }
""",
        "payload-free JSON error",
    )
    return text


def patch_test(text: str) -> str:
    """Add validation snapshot and payload-redaction regression coverage."""
    accessor_block = """  it("snapshots nested accessors once before validation and canonicalization", () => {
    const input = validInput();
    let reads = 0;
    Object.defineProperty(input.source, "bandId", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "band-hardening" : "band-mutated";
      }
    });

    expect(createNaruonRehearsalHandoff(input).source.bandId).toBe("band-hardening");
    expect(reads).toBe(1);
  });
"""
    accessor_replacement = accessor_block + """
  it("snapshots public validation inputs before reading nested accessors", () => {
    const value = artifact(validInput()) as {
      source: CreateNaruonRehearsalHandoffInput["source"];
    };
    let reads = 0;
    Object.defineProperty(value.source, "bandId", {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? "band-hardening" : "band-mutated";
      }
    });

    expect(validateNaruonRehearsalHandoff(value)).toBeNull();
    expect(reads).toBe(1);
  });
"""
    text = replace_once(
        text,
        accessor_block,
        accessor_replacement,
        "validator snapshot regression",
    )
    text = replace_once(
        text,
        """  it("rejects proxy-backed parser inputs that cannot be snapshotted", () => {
    const value = new Proxy(artifact(validInput()) as object, {});
    expect(() => parseNaruonRehearsalHandoff(value)).toThrow(
      "root is not structured-cloneable"
    );
  });
""",
        """  it("rejects proxy-backed boundary inputs that cannot be snapshotted", () => {
    const value = new Proxy(artifact(validInput()) as object, {});
    expect(validateNaruonRehearsalHandoff(value)).toBe(
      "root is not structured-cloneable"
    );
    expect(() => parseNaruonRehearsalHandoff(value)).toThrow(
      "root is not structured-cloneable"
    );
  });
""",
        "proxy boundary regression",
    )
    bounds_block = """  it("bounds untrusted serialized input before JSON parsing", () => {
    expect(() => deserializeNaruonRehearsalHandoff(42)).toThrow(
      "serialized payload is invalid or oversized"
    );
    expect(() =>
      deserializeNaruonRehearsalHandoff("x".repeat(MAX_NARUON_SERIALIZED_BYTES + 1))
    ).toThrow("serialized payload is invalid or oversized");
    expect(() => deserializeNaruonRehearsalHandoff("😀".repeat(70_000))).toThrow(
      "serialized payload is invalid or oversized"
    );
  });
"""
    bounds_replacement = bounds_block + """
  it("does not echo untrusted JSON fragments in parser errors", () => {
    const secret = "private-rehearsal-secret";
    let message = "";
    try {
      deserializeNaruonRehearsalHandoff(`{"${secret}":`);
    } catch (error) {
      message = String(error);
    }

    expect(message).toContain("malformed JSON");
    expect(message).not.toContain(secret);
  });
"""
    text = replace_once(
        text,
        bounds_block,
        bounds_replacement,
        "JSON error redaction regression",
    )
    text = replace_once(
        text,
        """    expect(validateNaruonRehearsalHandoff(hostile)).toBe("root must be an object");
""",
        """    expect(validateNaruonRehearsalHandoff(hostile)).toBe(
      "root is not structured-cloneable"
    );
""",
        "hostile proxy expectation",
    )
    return text


def main() -> int:
    """Patch reviewed files and remove the one-shot bootstrap artifacts."""
    SOURCE.write_text(patch_source(SOURCE.read_text(encoding="utf-8")), encoding="utf-8")
    TEST.write_text(patch_test(TEST.read_text(encoding="utf-8")), encoding="utf-8")
    SELF.unlink()
    SELF_WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
