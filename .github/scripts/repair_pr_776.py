from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, check=check, text=True)


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"unexpected {label} shape in {path}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def add_red_tests() -> None:
    test_path = ROOT / "apps/desktop/src/features/workspace/Workspace.test.tsx"
    replace_once(
        test_path,
        'import { fireEvent, render, screen } from "@testing-library/react";',
        'import { fireEvent, render, screen, within } from "@testing-library/react";',
        "Workspace test import",
    )
    marker = '  it("exports a metadata-only handoff artifact from the workspace", async () => {'
    tests = r'''  it("shows normalized setup, simplification, and ordered overlap actions in the active workspace", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: "Bass Guitar",
      setupNote: "  Lower the keyboard stand before the count-in.  ",
      simplification: "  Hold roots on beats one and three.  ",
      overlapWarnings: [
        " ",
        "  Leave the pickup to the lead vocal.  ",
        "NONE",
        "Double only after the chorus entrance."
      ]
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const guidance = screen.getByRole("region", { name: "Actionable rehearsal guidance" });
    expect(within(guidance).getByText("Set up before the take")).toBeTruthy();
    expect(within(guidance).getByText("Lower the keyboard stand before the count-in.")).toBeTruthy();
    expect(within(guidance).getByText("Simplify if the pass breaks down")).toBeTruthy();
    expect(within(guidance).getByText("Hold roots on beats one and three.")).toBeTruthy();
    expect(within(guidance).getByText("Resolve these overlaps")).toBeTruthy();

    const warnings = within(guidance).getByRole("list", { name: "Bass Guitar overlap warnings" });
    expect(within(warnings).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Leave the pickup to the lead vocal.",
      "Double only after the chorus entrance."
    ]);
    expect(within(guidance).queryByText(/^none$/i)).toBeNull();
  });

  it("does not infer rehearsal guidance from blank or legacy sentinel evidence", () => {
    setNavigatorLanguage("en-US");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: "Bass Guitar",
      transpositionPlan: " none ",
      setupNote: " NONE ",
      simplification: "   ",
      overlapWarnings: ["", " none ", "   "]
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    expect(screen.queryByRole("region", { name: "Actionable rehearsal guidance" })).toBeNull();
    expect(screen.queryByText(/^none$/i)).toBeNull();
  });

  it("localizes actionable rehearsal guidance in Korean", () => {
    setNavigatorLanguage("ko-KR");
    const song = createDemoRehearsalSong();
    song.sections[0]!.roles[0] = {
      ...song.sections[0]!.roles[0]!,
      name: "Bass Guitar",
      setupNote: "앰프 게인을 먼저 낮추세요.",
      simplification: "첫 박의 근음만 유지하세요.",
      overlapWarnings: ["보컬 픽업과 겹치지 않게 쉬세요."]
    };

    render(<Workspace song={song} />);
    fireEvent.click(screen.getByRole("tab", { name: "Bass Guitar" }));

    const guidance = screen.getByRole("region", { name: "실행 가능한 합주 가이드" });
    expect(within(guidance).getByText("연주 전에 준비하세요")).toBeTruthy();
    expect(within(guidance).getByText("합주가 흔들리면 이렇게 단순화하세요")).toBeTruthy();
    expect(within(guidance).getByText("이 겹침을 먼저 해결하세요")).toBeTruthy();
  });

'''
    replace_once(test_path, marker, tests + marker, "Workspace test insertion point")


def implement() -> None:
    workspace_path = ROOT / "apps/desktop/src/features/workspace/Workspace.tsx"
    replace_once(
        workspace_path,
        '''/** Documented. */
function nonBlankText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
''',
        '''/** Return trimmed source text when the analysis supplied nonblank evidence. */
function nonBlankText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Return buyer-visible guidance only when the producer supplied meaningful evidence.
 *
 * Historical analysis payloads used case-insensitive `none` text as an absence
 * sentinel. The active Workspace must not turn that missing evidence into an
 * instruction, warning, or transposition plan.
 */
function actionableGuidanceText(value: string | undefined): string | undefined {
  const normalized = nonBlankText(value);
  return normalized?.toLowerCase() === "none" ? undefined : normalized;
}

/** Preserve meaningful overlap-warning order without mutating analysis output. */
function actionableOverlapWarnings(values: readonly string[]): string[] {
  const warnings: string[] = [];
  for (const value of values) {
    const normalized = actionableGuidanceText(value);
    if (normalized) {
      warnings.push(normalized);
    }
  }
  return warnings;
}
''',
        "Workspace helper",
    )
    replace_once(
        workspace_path,
        '''  const roleTranspositionPlan =
    nonBlankText(activeRoleDetails?.transpositionPlan) ??
    nonBlankText(activeRoleDetails?.simplification);
''',
        '''  const roleTranspositionPlan = actionableGuidanceText(activeRoleDetails?.transpositionPlan);
  const roleSetupNote = actionableGuidanceText(activeRoleDetails?.setupNote);
  const roleSimplification = actionableGuidanceText(activeRoleDetails?.simplification);
  const roleOverlapWarnings = actionableOverlapWarnings(activeRoleDetails?.overlapWarnings ?? []);
  const hasActionableGuidance = Boolean(
    roleSetupNote || roleSimplification || roleOverlapWarnings.length > 0
  );
''',
        "Workspace planning values",
    )
    replace_once(
        workspace_path,
        '''                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                    <div className="flex items-center gap-2 text-cyan-100">
                      <Music4 className="size-4" aria-hidden="true" />
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceHarmonyExplainLabel")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {roleHarmonicExplanation}
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-3">
                    <div className="flex items-center gap-2 text-indigo-100">
                      <ClipboardList className="size-4" aria-hidden="true" />
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceTranspositionLabel")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {roleTranspositionPlan}
                    </p>
                  </div>
                </div>
''',
        '''                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] p-3">
                    <div className="flex items-center gap-2 text-cyan-100">
                      <Music4 className="size-4" aria-hidden="true" />
                      <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceHarmonyExplainLabel")}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      {roleHarmonicExplanation}
                    </p>
                  </div>
                  {roleTranspositionPlan && (
                    <div className="rounded-xl border border-indigo-300/20 bg-indigo-300/[0.08] p-3">
                      <div className="flex items-center gap-2 text-indigo-100">
                        <ClipboardList className="size-4" aria-hidden="true" />
                        <p className="text-[0.7rem] font-black uppercase tracking-[0.22em]">{t("workspaceTranspositionLabel")}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-200">
                        {roleTranspositionPlan}
                      </p>
                    </div>
                  )}
                </div>
                {hasActionableGuidance && (
                  <section
                    role="region"
                    aria-label={t("workspaceGuidanceRegionLabel")}
                    className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-3"
                  >
                    <div className="grid gap-3 lg:grid-cols-3">
                      {roleSetupNote && (
                        <article className="rounded-xl border border-teal-300/20 bg-teal-300/[0.07] p-3">
                          <h4 className="text-[0.7rem] font-black uppercase tracking-[0.2em] text-teal-100">
                            {t("workspaceSetupLabel")}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-slate-100">{roleSetupNote}</p>
                        </article>
                      )}
                      {roleSimplification && (
                        <article className="rounded-xl border border-violet-300/20 bg-violet-300/[0.07] p-3">
                          <h4 className="text-[0.7rem] font-black uppercase tracking-[0.2em] text-violet-100">
                            {t("workspaceSimplificationLabel")}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-slate-100">{roleSimplification}</p>
                        </article>
                      )}
                      {roleOverlapWarnings.length > 0 && (
                        <article className="rounded-xl border border-rose-300/20 bg-rose-300/[0.07] p-3">
                          <h4 className="text-[0.7rem] font-black uppercase tracking-[0.2em] text-rose-100">
                            {t("workspaceOverlapWarningsLabel")}
                          </h4>
                          <ul
                            aria-label={`${activeRoleDetails?.name ?? activeRole} overlap warnings`}
                            className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-100"
                          >
                            {roleOverlapWarnings.map((warning, warningIndex) => (
                              <li key={`${activeRole}-${warningIndex}-${warning}`}>{warning}</li>
                            ))}
                          </ul>
                        </article>
                      )}
                    </div>
                  </section>
                )}
''',
        "Workspace role cards",
    )
    replace_once(
        ROOT / "apps/desktop/src/locales/en/common.json",
        '  "workspaceTranspositionLabel": "Transpose / simplify",\n',
        '  "workspaceTranspositionLabel": "Transpose",\n'
        '  "workspaceGuidanceRegionLabel": "Actionable rehearsal guidance",\n'
        '  "workspaceSetupLabel": "Set up before the take",\n'
        '  "workspaceSimplificationLabel": "Simplify if the pass breaks down",\n'
        '  "workspaceOverlapWarningsLabel": "Resolve these overlaps",\n',
        "English locale insertion point",
    )
    replace_once(
        ROOT / "apps/desktop/src/locales/ko/common.json",
        '  "workspaceTranspositionLabel": "전조 / 단순화",\n',
        '  "workspaceTranspositionLabel": "전조",\n'
        '  "workspaceGuidanceRegionLabel": "실행 가능한 합주 가이드",\n'
        '  "workspaceSetupLabel": "연주 전에 준비하세요",\n'
        '  "workspaceSimplificationLabel": "합주가 흔들리면 이렇게 단순화하세요",\n'
        '  "workspaceOverlapWarningsLabel": "이 겹침을 먼저 해결하세요",\n',
        "Korean locale insertion point",
    )
    replace_once(
        ROOT / "CHANGELOG.md",
        "- Display actionable role-level setup notes, simplification guidance, and overlap warnings in the Chords view while suppressing empty and legacy `none` sentinel values.",
        "- Display evidence-backed setup notes, simplification actions, and overlap warnings in the active rehearsal Workspace, with English/Korean action labels and no inference from blank or legacy `none` sentinel values.",
        "rehearsal-guidance changelog",
    )


def main() -> None:
    run("npm", "install", "--global", "npm@10.9.8")
    run("npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund")
    add_red_tests()
    run(
        "git",
        "checkout",
        "origin/develop",
        "--",
        "apps/desktop/src/features/chords/index.tsx",
        "apps/desktop/src/features/chords/index.test.tsx",
    )
    run("git", "config", "user.name", "CWL repair bot")
    run("git", "config", "user.email", "actions@users.noreply.github.com")
    run(
        "git",
        "add",
        "apps/desktop/src/features/workspace/Workspace.test.tsx",
        "apps/desktop/src/features/chords/index.tsx",
        "apps/desktop/src/features/chords/index.test.tsx",
    )
    run("git", "commit", "-m", "test(workspace): require reachable rehearsal guidance")

    red = run(
        "npm",
        "exec",
        "--workspace",
        "@bandscope/desktop",
        "--",
        "vitest",
        "run",
        "src/features/workspace/Workspace.test.tsx",
        "--coverage=false",
        check=False,
    )
    if red.returncode == 0:
        raise RuntimeError("expected reachable Workspace guidance regression to fail before implementation")

    implement()
    run(
        "npm",
        "exec",
        "--workspace",
        "@bandscope/desktop",
        "--",
        "vitest",
        "run",
        "src/features/workspace/Workspace.test.tsx",
        "--coverage=false",
    )
    run("npm", "run", "lint", "--workspace", "@bandscope/desktop")
    run("npm", "run", "typecheck", "--workspace", "@bandscope/desktop")
    run("npm", "run", "test", "--workspace", "@bandscope/desktop")
    run("npm", "run", "build", "--workspace", "@bandscope/desktop")
    run("./scripts/harness/quickcheck.sh")

    (ROOT / ".github/workflows/repair-pr-776-reachable-guidance.yml").unlink()
    Path(__file__).unlink()
    run(
        "git",
        "add",
        "CHANGELOG.md",
        "apps/desktop/src/features/chords/index.tsx",
        "apps/desktop/src/features/chords/index.test.tsx",
        "apps/desktop/src/features/workspace/Workspace.tsx",
        "apps/desktop/src/features/workspace/Workspace.test.tsx",
        "apps/desktop/src/locales/en/common.json",
        "apps/desktop/src/locales/ko/common.json",
        ".github/workflows/repair-pr-776-reachable-guidance.yml",
        ".github/scripts/repair_pr_776.py",
    )
    run("git", "commit", "-m", "fix(workspace): surface evidence-backed rehearsal guidance")
    run("git", "push", "origin", "HEAD:feat/chords-rehearsal-guidance-clean")


if __name__ == "__main__":
    main()
