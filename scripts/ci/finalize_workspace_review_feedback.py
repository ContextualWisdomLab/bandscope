#!/usr/bin/env python3
"""Apply the remaining reviewed Workspace localization fixes and self-delete."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKSPACE = ROOT / "apps/desktop/src/features/workspace/Workspace.tsx"
WORKSPACE_TEST = ROOT / "apps/desktop/src/features/workspace/Workspace.test.tsx"
I18N_TEST = ROOT / "apps/desktop/src/i18n/index.test.ts"
EN = ROOT / "apps/desktop/src/locales/en/common.json"
SELF = ROOT / "scripts/ci/finalize_workspace_review_feedback.py"
WORKFLOW = ROOT / ".github/workflows/finalize-workspace-review-feedback.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail closed on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch_workspace(text: str) -> str:
    """Give unavailable transcription controls role-correct visible and accessible copy."""
    text = replace_once(
        text,
        '''  const canTranscribeBass = activeRoleDetails?.name.toLowerCase().includes("bass") ?? false;
''',
        '''  const canTranscribeBass = activeRoleDetails?.name.toLowerCase().includes("bass") ?? false;
  const transcriptionUnavailableLabel = t("transcriptionComingSoon", {
    roleName: activeRoleDetails?.name ?? t("thisRole")
  });
''',
        "transcription unavailable label",
    )
    return replace_once(
        text,
        '''                    <Button
                      type="button"
                      aria-disabled={true}
                      title={t("transcriptionComingSoon", { roleName: activeRoleDetails?.name ?? t("thisRole") })}
                      onClick={preventUnavailableAction}
                      variant="outline"
                      className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 font-semibold text-slate-500 opacity-70"
                    >
                      {t("transcribeBass")}
                    </Button>
''',
        '''                    <Button
                      type="button"
                      aria-disabled={true}
                      aria-label={transcriptionUnavailableLabel}
                      title={transcriptionUnavailableLabel}
                      onClick={preventUnavailableAction}
                      variant="outline"
                      className="min-h-11 cursor-not-allowed border-white/10 bg-white/5 font-semibold text-slate-500 opacity-70"
                    >
                      {t("transcribePart")}
                    </Button>
''',
        "non-bass transcription button",
    )


def patch_workspace_tests(text: str) -> str:
    """Pin the English locale and cover role-correct unavailable transcription copy."""
    text = replace_once(
        text,
        '''  it("enables bass transcription from selected role metadata rather than role id text", () => {
    const song = createDemoRehearsalSong();
''',
        '''  it("enables bass transcription from selected role metadata rather than role id text", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
''',
        "bass transcription locale",
    )
    marker = '''  it("renders bass transcription in the dark rehearsal cockpit system", () => {
'''
    addition = '''  it("names unavailable transcription for the selected non-bass role", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      id: "guitar-role",
      name: "Guitar"
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Guitar" }));

    const label = "Guitar transcription is coming soon. Bass is ready first.";
    const transcribeButton = screen.getByRole("button", { name: label });
    expect(transcribeButton).toHaveTextContent("Transcribe part");
    expect(transcribeButton).toHaveAttribute("aria-disabled", "true");
    expect(transcribeButton).toHaveAttribute("title", label);
  });

'''
    if addition in text:
        raise RuntimeError("non-bass transcription regression already exists")
    return replace_once(text, marker, addition + marker, "non-bass transcription test")


def patch_i18n_test(text: str) -> str:
    """Name the interpolation regression after the behavior it actually proves."""
    return replace_once(
        text,
        '  it("replaces every occurrence of a named placeholder", () => {',
        '  it("does not recursively interpolate placeholder text inside replacement values", () => {',
        "interpolation regression name",
    )


def patch_english_locale(path: Path) -> None:
    """Replace three incomplete status fragments with complete English sentences."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("English locale root must be an object")
    replacements = {
        "playStemSoon": ("Play stem coming soon", "Stem playback is coming soon."),
        "loopSectionSoon": ("Loop section coming soon", "Section looping is coming soon."),
        "soloMuteOthersSoon": (
            "Solo / mute others coming soon",
            "Solo and mute controls are coming soon.",
        ),
    }
    for key, (expected, replacement) in replacements.items():
        if payload.get(key) != expected:
            raise RuntimeError(f"English locale entry drifted: {key}")
        payload[key] = replacement
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    """Prepare every patch before publishing files and removing temporary helpers."""
    workspace = patch_workspace(WORKSPACE.read_text(encoding="utf-8"))
    workspace_test = patch_workspace_tests(WORKSPACE_TEST.read_text(encoding="utf-8"))
    i18n_test = patch_i18n_test(I18N_TEST.read_text(encoding="utf-8"))

    WORKSPACE.write_text(workspace, encoding="utf-8")
    WORKSPACE_TEST.write_text(workspace_test, encoding="utf-8")
    I18N_TEST.write_text(i18n_test, encoding="utf-8")
    patch_english_locale(EN)
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
