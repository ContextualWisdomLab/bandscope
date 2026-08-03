"""Apply the reviewed handoff-reading source-control gate and regression test."""

from pathlib import Path

APP = Path("apps/desktop/src/App.tsx")
APP_TEST = Path("apps/desktop/src/App.handoff.test.tsx")
SELF = Path("scripts/ci/finalize_handoff_reading_gate.py")
WORKFLOW = Path(".github/workflows/finalize-handoff-reading-gate.yml")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace exactly one reviewed fragment and fail on branch drift."""
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def patch_app(source: str) -> str:
    """Propagate handoff validation activity to all competing source actions."""
    replacements = (
        (
            '  const [isImporting, setIsImporting] = useState(false);\n'
            '  const [activeView, setActiveView] = useState<RehearsalView>("workspace");',
            '  const [isImporting, setIsImporting] = useState(false);\n'
            '  const [isReadingHandoff, setIsReadingHandoff] = useState(false);\n'
            '  const [activeView, setActiveView] = useState<RehearsalView>("workspace");',
            "handoff reading state",
        ),
        (
            '                    onClick={handleChooseLocalAudio}\n'
            '                    disabled={analysisInFlight || isStarting || isImporting}',
            '                    onClick={handleChooseLocalAudio}\n'
            '                    disabled={\n'
            '                      analysisInFlight || isStarting || isImporting || isReadingHandoff\n'
            '                    }',
            "local audio gate",
        ),
        (
            '                    onHandoffChange={handleHandoffChange}\n'
            '                    onImportError={handleHandoffImportError}\n'
            '                  />',
            '                    onHandoffChange={handleHandoffChange}\n'
            '                    onImportError={handleHandoffImportError}\n'
            '                    onReadingChange={setIsReadingHandoff}\n'
            '                  />',
            "handoff activity callback",
        ),
        (
            '                        disabled={analysisInFlight || isStarting || isImporting}\n'
            '                        className="h-10 w-full',
            '                        disabled={\n'
            '                          analysisInFlight || isStarting || isImporting || isReadingHandoff\n'
            '                        }\n'
            '                        className="h-10 w-full',
            "youtube input gate",
        ),
        (
            '                      {youtubeUrl && !analysisInFlight && !isStarting && !isImporting ? (',
            '                      {youtubeUrl &&\n'
            '                      !analysisInFlight &&\n'
            '                      !isStarting &&\n'
            '                      !isImporting &&\n'
            '                      !isReadingHandoff ? (',
            "youtube clear gate",
        ),
        (
            '                    disabled={!youtubeUrl || analysisInFlight || isStarting || isImporting}\n'
            '                    variant="outline"',
            '                    disabled={\n'
            '                      !youtubeUrl ||\n'
            '                      analysisInFlight ||\n'
            '                      isStarting ||\n'
            '                      isImporting ||\n'
            '                      isReadingHandoff\n'
            '                    }\n'
            '                    variant="outline"',
            "youtube import gate",
        ),
        (
            '                  disabled={analysisInFlight || isStarting || !selectedBootstrap || isImporting}\n'
            '                  size="lg"',
            '                  disabled={\n'
            '                    analysisInFlight ||\n'
            '                    isStarting ||\n'
            '                    !selectedBootstrap ||\n'
            '                    isImporting ||\n'
            '                    isReadingHandoff\n'
            '                  }\n'
            '                  size="lg"',
            "analysis start gate",
        ),
    )
    for old, new, label in replacements:
        source = replace_once(source, old, new, label)
    return source


READING_GATE_TEST = '''  it("blocks competing source actions while a handoff is being validated", async () => {
    let resolveImport: ((value: Awaited<ReturnType<typeof readMetadataHandoffFile>>) => void) | null =
      null;
    mockedReadMetadataHandoffFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImport = resolve;
        })
    );
    render(<App />);

    const youtubeInput = screen.getByLabelText(/youtube url/i);
    fireEvent.change(youtubeInput, { target: { value: "https://youtu.be/rehearsal" } });
    expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText(/handoff JSON file/i), {
      target: { files: [uploadFile()] }
    });

    expect(await screen.findByRole("button", { name: /validating handoff/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /choose local audio/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /import youtube/i })).toBeDisabled();
    expect(youtubeInput).toBeDisabled();
    expect(mockedSelectLocalAudioSource).not.toHaveBeenCalled();

    resolveImport?.({ ok: false, code: "invalid_artifact" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /choose local audio/i })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /import youtube/i })).not.toBeDisabled();
      expect(youtubeInput).not.toBeDisabled();
    });
  });

'''


def patch_test(source: str) -> str:
    """Insert an application-level regression for competing source actions."""
    marker = '  it("clears a prior handoff error after a replacement validates", async () => {'
    if READING_GATE_TEST in source:
        return source
    if source.count(marker) != 1:
        raise RuntimeError("App handoff test insertion marker drifted")
    return source.replace(marker, READING_GATE_TEST + marker, 1)


def main() -> int:
    """Compute both patches, write them, and remove one-shot artifacts."""
    patched_app = patch_app(APP.read_text(encoding="utf-8"))
    patched_test = patch_test(APP_TEST.read_text(encoding="utf-8"))
    APP.write_text(patched_app, encoding="utf-8")
    APP_TEST.write_text(patched_test, encoding="utf-8")
    SELF.unlink()
    WORKFLOW.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
