import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelTranscription, createMidiPreview, saveTranscriptionMidi, transcribeRecording,
  TranscriptionError, type TranscriptionDraft, type TranscriptionErrorKind
} from "@/lib/transcription";
import { TranscriptionPanel } from "./TranscriptionPanel";

vi.mock("@/lib/transcription", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/transcription")>(),
  transcribeRecording: vi.fn(), cancelTranscription: vi.fn(), createMidiPreview: vi.fn(), saveTranscriptionMidi: vi.fn()
}));

function fixture(): TranscriptionDraft {
  return {
    schemaVersion: 1, sourceLabel: "one guitar.wav", durationSeconds: 2,
    model: { name: "basic-pitch", version: "0.4.0", sha256: "2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec" },
    notes: [{ pitch: "C4", midiPitch: 60, onset: 0, offset: 1, velocity: 0.7, pitchBends: [] }],
    midiBase64: "test-double", warnings: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function makeReady(draft = fixture()) {
  vi.mocked(transcribeRecording).mockResolvedValueOnce(draft);
  const view = render(<TranscriptionPanel locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
  await screen.findByRole("button", { name: "Save MIDI draft" });
  return view;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cancelTranscription).mockResolvedValue(undefined);
  vi.mocked(saveTranscriptionMidi).mockResolvedValue(true);
  vi.mocked(createMidiPreview).mockReturnValue({ start: vi.fn().mockResolvedValue(true), stop: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

describe("recording MIDI draft panel", () => {
  it("shows the one-instrument scope and requires an explicit file selection", () => {
    render(<TranscriptionPanel locale="en" />);
    expect(screen.getByText(/A single instrument recorded on its own works best/)).toBeInTheDocument();
    expect(screen.getByText(/up to 2 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/50 MiB maximum/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save MIDI draft" })).not.toBeInTheDocument();
    expect(transcribeRecording).not.toHaveBeenCalled();
    expect(screen.queryByText(/bass/i)).not.toBeInTheDocument();
  });

  it("locks repeated requests and displays indeterminate progress without a fabricated percent", async () => {
    const run = deferred<TranscriptionDraft | null>();
    vi.mocked(transcribeRecording).mockReturnValue(run.promise);
    render(<TranscriptionPanel locale="en" />);
    const choose = screen.getByRole("button", { name: "Choose recording to transcribe" });
    fireEvent.click(choose);
    fireEvent.click(choose);
    expect(transcribeRecording).toHaveBeenCalledOnce();
    expect(choose).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/wait while its notes are estimated/);
    expect(screen.queryByText(/45%/)).not.toBeInTheDocument();
    await act(async () => run.resolve(null));
    expect(choose).toBeEnabled();
  });

  it("returns to idle when the native chooser is dismissed", async () => {
    vi.mocked(transcribeRecording).mockResolvedValueOnce(null);
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose recording to transcribe" })).toBeEnabled());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cancels the native run, waits for cleanup, and discards a late successful result", async () => {
    const run = deferred<TranscriptionDraft | null>();
    const cancellation = deferred<void>();
    vi.mocked(transcribeRecording).mockReturnValueOnce(run.promise);
    vi.mocked(cancelTranscription).mockReturnValueOnce(cancellation.promise);
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel transcription" }));
    expect(cancelTranscription).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("Stopping transcription");
    await act(async () => cancellation.resolve());
    expect(screen.getByRole("button", { name: "Choose recording to transcribe" })).toBeDisabled();
    await act(async () => run.resolve(fixture()));
    expect(screen.getByRole("status")).toHaveTextContent("Transcription cancelled");
    expect(screen.queryByText("one guitar.wav")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save MIDI draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose recording to transcribe" })).toBeEnabled();
  });

  it("keeps the run locked after cancellation delivery fails and permits a cancellation retry", async () => {
    const run = deferred<TranscriptionDraft | null>();
    vi.mocked(transcribeRecording).mockReturnValueOnce(run.promise);
    vi.mocked(cancelTranscription).mockRejectedValueOnce(new Error("private native detail"));
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel transcription" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The cancel request could not be delivered");
    expect(screen.queryByText(/private native detail/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose recording to transcribe" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel transcription" }));
    await act(async () => run.reject(new TranscriptionError("cancelled")));
    expect(screen.getByRole("status")).toHaveTextContent("Transcription cancelled");
    expect(cancelTranscription).toHaveBeenCalledTimes(2);
  });

  it("discards a finished result after cancellation failed and releases the run for a new recording", async () => {
    const run = deferred<TranscriptionDraft | null>();
    vi.mocked(transcribeRecording).mockReturnValueOnce(run.promise);
    vi.mocked(cancelTranscription).mockRejectedValueOnce(new Error("cancel delivery failed"));
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel transcription" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The cancel request could not be delivered");
    expect(screen.getByRole("button", { name: "Choose recording to transcribe" })).toBeDisabled();

    await act(async () => run.resolve(fixture()));

    expect(screen.getByRole("alert")).toHaveTextContent("The transcription ended, but its cancellation could not be confirmed");
    expect(screen.queryByText("one guitar.wav")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save MIDI draft" })).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Choose a recording and retry" });
    expect(retry).toBeEnabled();
    vi.mocked(transcribeRecording).mockResolvedValueOnce({ ...fixture(), sourceLabel: "second recording.wav" });
    fireEvent.click(retry);
    expect(await screen.findByText("second recording.wav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("presents a localized safe failure and retries with a new source", async () => {
    vi.mocked(transcribeRecording).mockRejectedValueOnce(new Error("/Users/private/audio.wav: secret failure"));
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Transcription did not finish");
    expect(screen.queryByText(/Users|secret failure/)).not.toBeInTheDocument();
    vi.mocked(transcribeRecording).mockResolvedValueOnce(fixture());
    fireEvent.click(screen.getByRole("button", { name: "Choose a recording and retry" }));
    expect(await screen.findByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains zero notes without offering an empty preview or a misleading completed score", async () => {
    vi.mocked(transcribeRecording).mockResolvedValueOnce({ ...fixture(), notes: [], warnings: ["note_times_clipped", "out_of_range_notes_omitted"] });
    render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    expect(await screen.findByText(/No notes were found/)).toBeInTheDocument();
    expect(screen.getByText("one guitar.wav")).toBeInTheDocument();
    expect(screen.getByText(/Note times extending beyond the recording were adjusted/)).toBeInTheDocument();
    expect(screen.getByText(/too short to export were omitted/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another recording" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save MIDI draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview notes with synth sound" })).not.toBeInTheDocument();
  });

  it("waits for native save completion, locks duplicate requests, and retains the draft after chooser dismissal", async () => {
    const draft = fixture();
    const saving = deferred<boolean>();
    vi.mocked(saveTranscriptionMidi).mockReturnValueOnce(saving.promise);
    await makeReady(draft);
    expect(screen.getByText(/This is an estimated draft/)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save MIDI draft" });
    const choose = screen.getByRole("button", { name: "Choose another recording" });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(choose);
    expect(saveTranscriptionMidi).toHaveBeenCalledExactlyOnceWith(draft);
    expect(screen.getByRole("button", { name: "Saving MIDI draft…" })).toBeDisabled();
    expect(screen.getByText("Saving MIDI draft…", { selector: "p" })).toHaveAttribute("role", "status");
    expect(choose).toBeDisabled();
    expect(transcribeRecording).toHaveBeenCalledOnce();
    expect(screen.queryByText("MIDI draft saved.")).not.toBeInTheDocument();

    await act(async () => saving.resolve(true));

    expect(screen.getByText("MIDI draft saved.")).toBeInTheDocument();
    expect(save).toBeEnabled();
    expect(choose).toBeEnabled();
    vi.mocked(transcribeRecording).mockResolvedValueOnce(null);
    fireEvent.click(choose);
    expect(await screen.findByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
    expect(screen.getByText("one guitar.wav")).toBeInTheDocument();
  });

  it("keeps the draft when native saving is cancelled and allows another save", async () => {
    await makeReady();
    vi.mocked(saveTranscriptionMidi).mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));
    expect(await screen.findByText("MIDI save cancelled.")).toBeInTheDocument();
    expect(screen.queryByText("MIDI draft saved.")).not.toBeInTheDocument();
    expect(screen.getByText("one guitar.wav")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save MIDI draft" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByText("MIDI draft saved.")).toBeInTheDocument();
    expect(saveTranscriptionMidi).toHaveBeenCalledTimes(2);
  });

  it.each<[TranscriptionErrorKind, string]>([
    ["exportBusy", "Another MIDI save is in progress. Wait for it to finish, then try again."],
    ["exportStale", "This draft is no longer available for saving. Transcribe the recording again."],
    ["exportInvalid", "MIDI saving was rejected. Choose a file name ending in .mid or .midi and try again."]
  ])("shows recovery guidance for %s without replacing the visible draft", async (kind, message) => {
    await makeReady();
    vi.mocked(saveTranscriptionMidi).mockRejectedValueOnce(new TranscriptionError(kind));
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("one guitar.wav")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose another recording" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
    expect(screen.queryByText("MIDI draft saved.")).not.toBeInTheDocument();
  });

  it("ignores late save completion after unmount while a new workspace saves its own draft", async () => {
    const firstSave = deferred<boolean>();
    const secondSave = deferred<boolean>();
    vi.mocked(saveTranscriptionMidi).mockReturnValueOnce(firstSave.promise).mockReturnValueOnce(secondSave.promise);
    const firstView = await makeReady();
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));
    firstView.unmount();
    await makeReady({ ...fixture(), sourceLabel: "second recording.wav" });
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));

    await act(async () => firstSave.resolve(true));

    expect(screen.queryByText("MIDI draft saved.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saving MIDI draft…" })).toBeDisabled();
    expect(screen.getByText("second recording.wav")).toBeInTheDocument();
    await act(async () => secondSave.resolve(false));
    expect(screen.getByText("MIDI save cancelled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
  });

  it("announces save completion while the synth preview continues", async () => {
    await makeReady();
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));

    expect(await screen.findByText("MIDI draft saved.")).toHaveAttribute("role", "status");
    expect(screen.getByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop synth preview" })).toBeEnabled();
  });

  it("reports export and preview errors without exposing underlying details", async () => {
    await makeReady();
    vi.mocked(saveTranscriptionMidi).mockRejectedValueOnce(new Error("private save path"));
    fireEvent.click(screen.getByRole("button", { name: "Save MIDI draft" }));
    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
    vi.mocked(createMidiPreview).mockImplementationOnce(() => { throw new Error("private audio device"); });
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    expect(await screen.findByText(/Synth playback could not start/)).toBeInTheDocument();
    expect(screen.queryByText(/private save|private audio/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save MIDI draft" })).toBeEnabled();
  });

  it("distinguishes synth playback, prevents duplicate previews, and stops the owned preview", async () => {
    await makeReady();
    const control = vi.mocked(createMidiPreview).getMockImplementation()!();
    vi.mocked(createMidiPreview).mockReturnValue(control);
    const play = screen.getByRole("button", { name: "Preview notes with synth sound" });
    fireEvent.click(play);
    fireEvent.click(play);
    expect(createMidiPreview).toHaveBeenCalledOnce();
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    expect(screen.getByText(/It is not the original recording/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop synth preview" }));
    expect(control.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Preview notes with synth sound" })).toBeEnabled();
  });

  it("restores preview controls after natural completion and can play the draft again", async () => {
    await makeReady();
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    const finishPreview = vi.mocked(createMidiPreview).mock.calls[0][1];

    act(() => finishPreview());

    expect(screen.getByText("Synth preview finished.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop synth preview" })).not.toBeInTheDocument();
    const play = screen.getByRole("button", { name: "Preview notes with synth sound" });
    expect(play).toBeEnabled();
    fireEvent.click(play);
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    expect(createMidiPreview).toHaveBeenCalledTimes(2);
  });

  it("ignores an old preview's late completion while a new preview is playing", async () => {
    const first = { start: vi.fn().mockResolvedValue(true), stop: vi.fn() };
    const second = { start: vi.fn().mockResolvedValue(true), stop: vi.fn() };
    vi.mocked(createMidiPreview).mockReturnValueOnce(first).mockReturnValueOnce(second);
    const view = await makeReady();
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    const finishOldPreview = vi.mocked(createMidiPreview).mock.calls[0][1];
    fireEvent.click(screen.getByRole("button", { name: "Stop synth preview" }));
    expect(first.stop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    expect(await screen.findByText("Playing estimated notes with synth sound.")).toBeInTheDocument();

    act(() => finishOldPreview());

    expect(screen.getByText("Playing estimated notes with synth sound.")).toBeInTheDocument();
    expect(screen.queryByText("Synth preview finished.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop synth preview" })).toBeEnabled();
    expect(second.stop).not.toHaveBeenCalled();
    view.unmount();
    const finishCurrentPreview = vi.mocked(createMidiPreview).mock.calls[1][1];
    act(() => finishCurrentPreview());
    expect(second.stop).toHaveBeenCalledOnce();
    expect(screen.queryByText("Synth preview finished.")).not.toBeInTheDocument();
  });

  it("stops audio on unmount and ignores a late browser resume", async () => {
    const resume = deferred<boolean>();
    const control = { start: vi.fn(() => resume.promise), stop: vi.fn() };
    vi.mocked(createMidiPreview).mockReturnValue(control);
    const view = await makeReady();
    fireEvent.click(screen.getByRole("button", { name: "Preview notes with synth sound" }));
    view.unmount();
    expect(control.stop).toHaveBeenCalledOnce();
    await act(async () => resume.resolve(true));
    expect(screen.queryByText(/Playing estimated notes/)).not.toBeInTheDocument();
  });

  it("cancels an active owned run when the workspace is left", async () => {
    const run = deferred<TranscriptionDraft | null>();
    vi.mocked(transcribeRecording).mockReturnValue(run.promise);
    const view = render(<TranscriptionPanel locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Choose recording to transcribe" }));
    view.unmount();
    expect(cancelTranscription).toHaveBeenCalledOnce();
    await act(async () => run.resolve(fixture()));
    expect(screen.queryByText("one guitar.wav")).not.toBeInTheDocument();
  });

  it("renders file labels as text and explains pitch-bend and polyphony limitations", async () => {
    const draft = fixture();
    draft.sourceLabel = "<img src=x onerror=alert(1)>.wav";
    draft.warnings = ["overlapping_pitch_bends_omitted", "audio_peak_normalized"];
    draft.notes = Array.from({ length: 33 }, () => ({ ...draft.notes[0] }));
    await makeReady(draft);
    expect(screen.getByText(draft.sourceLabel)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/Pitch bends on overlapping notes were omitted/)).toBeInTheDocument();
    expect(screen.getByText(/peak level was adjusted/)).toBeInTheDocument();
    expect(screen.getByText(/more than 32 overlapping notes/)).toBeInTheDocument();
  });

  it("provides Korean guidance and native-error recovery", async () => {
    vi.mocked(transcribeRecording).mockRejectedValueOnce(new TranscriptionError("model"));
    render(<TranscriptionPanel locale="ko" />);
    expect(screen.getByRole("heading", { name: "녹음으로 MIDI 초안 만들기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "녹음 파일 선택해 채보" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("검증된 Basic Pitch 모델을 사용할 수 없습니다");
    expect(screen.getByRole("button", { name: "녹음 파일 다시 선택해 채보" })).toBeEnabled();
  });
});
