#!/usr/bin/env python3
"""Finalize Workspace localization safely, add regressions, and self-delete."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / "apps/desktop/src/features/workspace/Workspace.tsx"
I18N = ROOT / "apps/desktop/src/i18n/index.ts"
I18N_TEST = ROOT / "apps/desktop/src/i18n/index.test.ts"
EN = ROOT / "apps/desktop/src/locales/en/common.json"
KO = ROOT / "apps/desktop/src/locales/ko/common.json"
SELF = ROOT / "scripts/ci/finalize_workspace_i18n.py"
WORKFLOW = ROOT / ".github/workflows/finalize-workspace-i18n.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_workspace(text: str) -> str:
    """Remove redundant type assertions and localize the fallback role name."""
    assertion = ' as Extract<import("../../i18n").TranslationKey, string>'
    assertion_count = text.count(assertion)
    if assertion_count < 10:
        raise RuntimeError(
            f"workspace translation assertions drifted: expected at least 10, found {assertion_count}"
        )
    text = text.replace(assertion, "")
    return replace_once(
        text,
        'activeRoleDetails?.name ?? "This role"',
        'activeRoleDetails?.name ?? t("thisRole")',
        "localized role fallback",
    )


def patch_i18n(text: str) -> str:
    """Interpolate literal placeholders without regular-expression semantics."""
    old = '''/** Documented. */
export function createTranslator(locale: Locale = "en") {
  return function t(key: TranslationKey, variables?: Record<string, string>): string {
    let text = dictionaries[locale][key] ?? dictionaries.en[key];
    if (variables) {
      for (const [k, v] of Object.entries(variables)) {
        text = text.replace(new RegExp(`{${k}}`, "g"), v);
      }
    }
    return text;
  };
}
'''
    new = '''/** Create a locale-bound translator with literal placeholder interpolation. */
export function createTranslator(locale: Locale = "en") {
  return function translate(
    key: TranslationKey,
    variables?: Readonly<Record<string, string>>
  ): string {
    let text = dictionaries[locale][key] ?? dictionaries.en[key];
    if (variables) {
      for (const [variableName, variableValue] of Object.entries(variables)) {
        text = text.split(`{${variableName}}`).join(variableValue);
      }
    }
    return text;
  };
}
'''
    return replace_once(text, old, new, "translator interpolation")


def patch_locale(path: Path, key: str, value: str) -> None:
    """Add one synchronized locale entry without changing existing translations."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"locale root must be an object: {path}")
    existing = payload.get(key)
    if existing not in {None, value}:
        raise RuntimeError(f"locale key conflict for {key}: {path}")
    payload[key] = value
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_tests(text: str) -> str:
    """Add regression coverage for repeated and literal replacement values."""
    addition = '''

describe("translator placeholder interpolation", () => {
  it("replaces every occurrence of a named placeholder", () => {
    const t = createTranslator("en");

    expect(
      t("transcriptionComingSoon", { roleName: "Bass {roleName}" })
    ).toBe("Bass {roleName} transcription is coming soon. Bass is ready first.");
  });

  it("preserves replacement characters literally", () => {
    const t = createTranslator("en");

    expect(t("transcriptionComingSoon", { roleName: "$& [lead].*" })).toBe(
      "$& [lead].* transcription is coming soon. Bass is ready first."
    );
  });
});
'''
    if 'describe("translator placeholder interpolation"' in text:
        raise RuntimeError("translator interpolation regression already exists")
    return text.rstrip() + addition


def main() -> int:
    """Apply reviewed localization changes and remove temporary automation files."""
    WORKSPACE.write_text(
        patch_workspace(WORKSPACE.read_text(encoding="utf-8")), encoding="utf-8"
    )
    I18N.write_text(patch_i18n(I18N.read_text(encoding="utf-8")), encoding="utf-8")
    I18N_TEST.write_text(
        patch_tests(I18N_TEST.read_text(encoding="utf-8")), encoding="utf-8"
    )
    patch_locale(EN, "thisRole", "This role")
    patch_locale(KO, "thisRole", "이 역할")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
