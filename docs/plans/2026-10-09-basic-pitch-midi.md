# Basic Pitch recording-to-MIDI drafts

## Purpose and delivery status

Let a player choose a short local recording, inspect estimated notes and pitch
bends, listen to a simple MIDI preview, and export a MIDI draft for rehearsal.
This is the implementation response to the request to apply the Basic Pitch
workflow shown in the [referenced reel](https://www.instagram.com/reel/DePR3Arh057/).
The reel's example timing and note count are not BandScope benchmarks.

This feature branch is stacked on [Resource Admission PR #866](https://github.com/ContextualWisdomLab/bandscope/pull/866).
It consumes that branch's bounded decoder, owned-process lifecycle, bounded pipe
capture, and admitted local-source copy. The stacked feature must be validated
again against its eventual merge base. Windows amd64/arm64 and macOS Intel/arm64
CI has not been verified for this feature at the time of this design record.
Their existing merge gates remain required.

**Installer offline execution is BLOCKED by a repo-controlled packaging gap.**
The current Tauri bundle has no collection path for the analysis Python runtime,
its installed modules, or model/notice files. CI's `uv sync` installs dependencies
in the build checkout; the release helper only copies and hashes completed Tauri
installers. The verified feature runs with the development checkout's installed
engine and an explicitly provisioned runtime through `BANDSCOPE_ANALYSIS_PYTHON`.
Installer delivery must be connected to the runtime/model packaging owner and
then tested from the installed app. The missing packaging path is a `FAILED`
release-readiness condition under the dependency policy, not a permissions
exception or merely an unperformed artifact inspection.

Final local verification reported by the implementation owners on 2026-10-09:
`scripts/harness/quickcheck.sh` exited zero. All 327 desktop tests across 23 files
passed; frontend coverage was 98.37% statements, 96.44% branches, 98.15%
functions, and 99.48% lines. Python reported 1,070 passed, one skipped, and one
warning, with 100% coverage across 4,267 statements and 1,482 branches. Lint,
typechecking, the production frontend build, documentation, Security Notes, and
supply-chain checks passed. The scoped feature Rust checks passed 11 library
tests and six actual-process tests. A separate real Rust → Python CLI → ONNX →
native cache → atomic MIDI save smoke passed with four notes, 148 pitch-bend
points, and 572 saved MIDI bytes. These counts describe that fixture, not a
musical accuracy or speed benchmark. The frontend tests use mocked IPC for UI
state transitions; actual visual UI inspection and native-picker interaction
remain unverified target-platform acceptance checks.

The complete Rust baseline also reported an `E0369` compilation error; passing
the scoped feature tests does not establish a passing full Rust suite. The Tauri
shell was not compiled on this Linux host because GTK/pkg-config support was
unavailable and normal package-manager installation was denied.
The feature's `.github/workflows/basic-pitch-midi.yml` supplies the target-OS
shell-compile checks; their actual Windows/macOS run results remain pending.

The result is a separate, temporary recording draft. It does not become a saved
song role or a manually confirmed part. The earlier
[bass/temporal-grid transcription plan](2026-04-25-v2-transcription.md) remains a
separate product direction: this slice does not claim beat-grid alignment, tabs,
readable notation, automatic role assignment, or its proposed accuracy targets.

## User behavior

- A native file chooser admits one local WAV, MP3, or FLAC candidate. The
  extension is a filter; the bounded decoder still has to accept the container.
- BandScope makes an app-owned temporary copy for this job. It leaves the
  player's original recording in place and removes its own copy on terminal
  success, failure, or cancellation, subject to the cleanup limitations below.
- The desktop displays estimated note names, their time intervals, and a piano
  roll. This is note geometry, not a raw CQT display or a calibrated confidence
  map. Model amplitude becomes MIDI velocity; it is not a correctness score.
- Preview uses the admitted notes through Web Audio, with a 32-voice limit and
  short scheduling lookahead. It is a simple synthesizer preview, not a recording
  of the original instrument.
- Save MIDI opens the native destination chooser for the verified draft. The
  player selects a `.mid` or `.midi` file; dismissal leaves the draft available.
  The UI reports completion only after the native file operation succeeds.
- The player must review the result by ear. One clearly recorded instrument or
  a separated part is the recommended input. Mixed arrangements, percussion,
  expressive bends, and dense overlap can produce imperfect estimates.

## Implementation boundaries

| Owner | Responsibility | Implementation reference |
| --- | --- | --- |
| Native desktop | File chooser, single transcription lease, shared job admission, temporary source copy, fixed child invocation, cleanup | `apps/desktop/src-tauri/src/transcription.rs` |
| Desktop core | Typed result admission, cancellation state, 180-second child deadline, shared process termination and bounded pipe capture | `apps/desktop/core/src/transcription.rs` |
| Native MIDI save | OS destination chooser, portable default name, save/cancel result | `apps/desktop/src-tauri/src/transcription_export.rs` |
| Desktop export core | Verified MIDI cache, exact expected-value matching, single save lease, stable byte snapshot, staged file write | `apps/desktop/core/src/transcription_export.rs` |
| Python CLI | One bounded JSON request, one opened regular file, canonical bounded decoding, fixed error envelope | `services/analysis-engine/src/bandscope_analysis/transcription/cli.py` |
| Inference adapter | Verify packaged model bytes, run CPU ONNX inference over admitted PCM, validate output arrays, reuse upstream note decoding | `services/analysis-engine/src/bandscope_analysis/transcription/basic_pitch_backend.py` |
| MIDI adapter | Admit notes and bends, apply overlapping-bend policy, serialize ordered MIDI events, expose matching note geometry | `services/analysis-engine/src/bandscope_analysis/transcription/midi.py` |
| Renderer | Validate path-free result, display estimates, schedule bounded preview, request native save for the current draft | `apps/desktop/src/lib/transcription.ts` and `TranscriptionPanel.tsx` |

`transcribe_recording`, `cancel_transcription`, and `save_transcription_midi` are
added to the native command surface. Their invoke registration, application command manifest,
generated permissions, and window capability must agree. The renderer does not
choose a filesystem path, model path, executable, PID, or process handle.
Transcription uses the existing analysis executable selection with the fixed
`bandscope_analysis.transcription.cli` module and argument-array invocation.
It opens no HTTP listener and adds no runtime model download.

### Resource and result contract

| Boundary | Limit or required value |
| --- | --- |
| Admitted encoded recording | Non-empty; at most 50 MiB, rechecked after the owned copy and at the opened decoder boundary |
| Source metadata | Canonical Resource Admission checks, including 8–192 kHz source rate and one or two source channels before downmix/resample |
| Admitted PCM | Finite, one-dimensional `float32`, mono, 22,050 Hz; at most 120 seconds / 2,646,000 samples / 10,584,000 bytes |
| Child lifetime | 180-second execution deadline; cancellation and terminal cleanup use the shared process owner |
| Parent stream capture | At most 1 MiB per stdout/stderr stream, with the shared one-byte overflow probe; overflow/read failure rejects the result |
| JSON response | Schema version 1; at most 1 MiB including the CLI newline; fixed model identity and no source path |
| Note events | At most 4,096; MIDI pitch 0–127; finite onset, offset, and velocity; intervals inside the admitted recording |
| Pitch-bend points | At most 32,768 in total; finite absolute times inside each note's half-open interval; signed MIDI wheel representation at a two-semitone range |
| MIDI bytes | At most 256 KiB before base64 encoding; admitted Standard MIDI File header and complete bounded track chunks |
| Native save request | Non-empty `expectedMidiBase64`, at most 350,000 bytes; exact match against the native cache, never decoded as new write content |
| Native export ownership | One current cached MIDI and one active save lease; a lease retains its selected snapshot if a later draft replaces the cache |

The transcription profile is stricter than the general audio policy. It does not
change the canonical policy's defaults. The existing copy owner applies its own
bounded admission while staging; the transcription-specific 50 MiB check rejects
an over-limit copied result before inference. These limits do not establish a
whole-process RSS, GPU-memory, or decoder sandbox guarantee.

Basic Pitch's `note`, `onset`, and `contour` outputs are validated for expected
shape, `float32` dtype, finiteness, and values in `[0, 1]` before note decoding.
The model is loaded from the same byte buffer whose exact size and SHA-256 were
verified. No check-then-reopen model path is passed to ONNX Runtime.

The adapter converts upstream pitch-bend bins to MIDI wheel values, clips note
times to the admitted duration, and binds JSON note geometry to the MIDI tick
grid. A fixed serialization tempo does not imply a detected song tempo or
beat-grid quantization. Overlapping notes retain their pitches but omit bends
that would conflict on the shared MIDI channel. At a touching note boundary,
note-off and wheel reset precede the next bend and note-on.

The warning vocabulary is restricted to `audio_peak_normalized`,
`overlapping_pitch_bends_omitted`, `note_times_clipped`, and
`out_of_range_notes_omitted`. Unknown warning/error codes or extra result fields
fail admission. A warning describes a concrete transformation, not a confidence
level.

### Native MIDI save contract

After successful transcription, admitted-source cleanup, and the final
cancellation check, native code validates the draft and publishes it to
`TranscriptionExportState`. Publication decodes the already bounded base64 with
the pinned Rust `base64` crate, checks the MIDI header, track sizes and terminal
end-of-track markers, and retains the bytes, their encoded identity, and source
label. Invalid publication leaves the preceding verified cache intact.

`save_transcription_midi(expectedMidiBase64)` accepts only an equality value for
that cache. A missing or different cache is stale; a concurrent save is busy.
The acquired lease retains the native bytes while the OS save chooser is open,
even if another successful transcription replaces the current cache. Renderer
supplied paths or replacement file contents are not part of this command.

Native code derives a bounded, portable default filename from the source label.
The chooser must return an absolute path with a `.mid` or `.midi` extension; an
invalid extension is rejected without appending or changing a destination.
The core reserves a same-directory temporary file with `create_new` (mode 0600
on Unix), writes and synchronizes the complete MIDI, closes the handle, and
renames the stage to the selected destination. The selected existing file can
be replaced. `false` means the chooser was dismissed; `true` means write,
file synchronization, and rename completed. Errors use fixed export categories.
An unpublished stage is removed on normal error paths on a best-effort basis.
There is no Blob/anchor download path, and no claim that an OS crash preserves
the parent directory's rename operation.

## Model and dependency decision

Use `basic-pitch[onnx]==0.4.0`, `mido==1.3.3`, and the explicitly pinned ONNX CPU
runtime profile. ONNX Runtime is 1.30.0 except on Intel macOS, where 1.23.2 has the
required official wheel. The exact resolver is uv 0.12.23. Version-scoped uv
exclusions remove Basic Pitch 0.4.0's TensorFlow, tensorflow-macos, CoreML, and
TFLite runtime dependencies. They do not remove the inactive model files already
inside that wheel.

All 91 existing package/version identities remain in the lock, with 13 entries
added. The lock also changes revision 2 to 5, platform/dependency markers, and
wheel pruning; it is not an append-only file change. The admission record lists
those metadata changes separately from dependency versions.

The native export core also directly pins Rust `base64 = "=0.22.1"`. This crate
was already present at the same version and checksum in the native desktop
lock; the root core lock gains that one package. It adds no normal or build
dependencies. Its source, dual license, and known-advisory review are in the
dependency admission record.

The active artifact is
`basic_pitch/saved_models/icassp_2022/nmp.onnx`, 230,444 bytes, with SHA-256
`2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`.
Inference is explicitly `CPUExecutionProvider`, sequential, with one intra-op and
one inter-op thread. The version and digest are part of result admission across
Python, Rust, and TypeScript.

See the [dependency admission record](../security/basic-pitch-dependency-admission.md),
[model inventory](../../supply-chain/supplemental-component-inventory.json), and
[wheel asset/notice provenance](../../supply-chain/third-party/basic-pitch-0.4.0/README.md).

## Data classification and retention

| Data | Sensitivity and location | Retention and sharing |
| --- | --- | --- |
| Original recording | Potentially private or copyrighted; the OS-selected external file | Remains player-owned; no upload or modification by this feature |
| Temporary recording copy | Same sensitivity; native app-owned temporary job directory | Removed on normal terminal paths; abrupt app/OS termination or filesystem denial can leave a copy requiring recovery |
| PCM and model activations | Derived private audio data; Python child memory | Process lifetime; never included in result JSON, logs, or telemetry |
| Note draft | Derived musical content; child/renderer memory | Current workspace draft until discarded; no automatic saved-song persistence |
| Native verified MIDI cache | Derived musical content plus source basename and encoded identity; native app memory | Retained until the next successful publication or app exit; UI dismissal/unmount, save completion, save cancellation, or a failed new transcription does not clear it. An active save lease can temporarily retain the preceding snapshot until its file operation finishes. |
| MIDI save stage | Derived musical content; newly created temporary file beside the selected destination | Renamed on success; removed on normal error paths on a best-effort basis. Abrupt app/OS termination or filesystem denial can leave a stage. |
| Saved MIDI | Derived musical content; file selected in the native destination chooser | Player-controlled file retention and sharing; no upload by this feature |
| Source label | Potentially identifying basename; validated result/UI text | No full original path in the renderer result or surfaced error |
| Logs and diagnostics | Fixed error categories; bounded library stderr is treated as untrusted | Raw child stderr is not returned to the UI; no new persistent log or upload path |
| Stems and saved project files | Existing app data outside this recording-draft feature | Existing policies apply; this feature adds no automatic persistence to them |

## Security Notes

### Attack surface

Local media bytes and container metadata reach native file admission and audio
decoding. Package/model bytes reach a native inference runtime. Child stdout and
stderr cross a process boundary. JSON note values, labels, and MIDI bytes reach
WebView rendering, Web Audio scheduling, and native export admission. An expected
base64 identity crosses the save IPC; the OS chooser and destination filesystem
govern the final write.

### Trust boundary

The OS picker and native source-copy owner hold file authority. The Python child
consumes only that admitted copy and returns a typed, path-free draft. The
renderer gains neither general filesystem access nor generic process control.
For export, it identifies a native-retained MIDI and cannot supply the path or
new file bytes. Native code owns the destination chooser, selected byte
snapshot, temporary file, and completion result.
Package installation is a supply-chain boundary; inference is an offline local
operation after a locked installation.

### Realistic threats

Malformed media can exploit native decoders or exhaust resources. A file changed
after picker preflight can invalidate metadata assumptions. Replaced model bytes
can alter inference behavior or target model parsing. A child can emit excessive
output or leave descendants holding pipes. Invalid notes can create excessive
render/audio work. Hostile labels, substituted or stale renderer MIDI values,
competing save requests, or incomplete writes can invalidate the export result.

### Mitigations

Use the inherited admitted copy, opened-handle metadata checks, bounded decode,
finite PCM validation, and a fresh model digest check before inference. Bound
event expansion, MIDI size, JSON size, and both child streams. Use the shared
owned-process API for deadline, cancellation, terminal cleanup, and reaping.
Admit exact schema/model identity at native and renderer boundaries. Render
labels as text, sanitize the native default filename, and validate MIDI container
structure before cache publication. Bound the save identity before comparison,
require an exact native-cache match, and use one save lease with a stable native
snapshot. Accept only a native-chosen absolute MIDI path; reserve the sibling
stage exclusively, synchronize its contents, and rename only after a complete
write. Report success only after that operation succeeds; chooser dismissal
returns cancellation without clearing the cache.
Expose fixed error categories instead of paths, library exceptions, or raw
stderr. Retain the pinned package licenses and model provenance with release
evidence; do not introduce runtime fallback downloads.

### Remaining risk

Process ownership is not sandboxing, dropped privileges, or a whole-process
memory quota. The current #866 base's `apps/desktop/core/src/owned_process.rs`
uses Unix process groups and a Windows Job Object for ordinary descendants.
Windows creates the child suspended, assigns it to a Job Object configured with
`KILL_ON_JOB_CLOSE`, and resumes it only after successful assignment; termination
uses the retained job. These controls do not establish containment of deliberate
escape attempts. Target-platform execution evidence for termination, inherited
handle release, and cleanup is still required. Temporary-copy cleanup is best
effort after abrupt process or OS failure, and cleanup errors fail the normal
completion path.

The MIDI cache contains private derived music until replacement or app exit,
even after its UI is closed. Save-stage deletion is best effort after errors or
abrupt termination. File synchronization precedes rename, but the implementation
does not synchronize the parent directory or promise power-loss durability.
Native chooser behavior and replacement semantics still need actual
Windows/macOS execution evidence.

Intel macOS uses an older ONNX Runtime and does not inherit all 1.30.0 hardening.
Wheel availability does not prove the full Python/native dependency closure or
packaged app works on an architecture. Windows/macOS CI, release artifact
inspection, real-audio accuracy, peak-resource measurements, and cancellation
latency for this feature remain unverified in this record. No four-second
performance claim, calibrated confidence claim, or musical accuracy threshold
is inferred from the reel or a synthetic smoke run.

### Test points

- Run `test_transcription_cli.py`, `test_basic_pitch_backend.py`, and
  `test_basic_pitch_midi.py` for request/PCM/model admission, changed or missing
  model bytes, malformed outputs, boundary note/bend counts, clipping, MIDI
  event ordering, and fixed error behavior.
- Run desktop-core transcription tests and the inherited process-output tests
  for single ownership, cancellation, timeout, oversized streams, child failure,
  and pipe release after terminal child status.
- Run export-core tests for absent/stale/malformed cache identities, invalid
  base64 and MIDI structure, failed publication preserving the previous cache,
  competing save leases, snapshot stability during new publication, complete
  file replacement, invalid paths/extensions, and stage cleanup after errors.
- Run `src/lib/transcription.test.ts` and `Workspace.test.tsx` for strict result
  admission, preview stop/unmount behavior, bounded labels, native save request
  shape, chooser cancellation, confirmed-save feedback, and failure/busy/stale
  UI state transitions with mocked IPC. Exercise the real native bridge and OS
  choosers separately in target-platform checks.
- Verify native chooser dismissal, admitted-copy cleanup on success/error/cancel,
  cleanup failure, portable default MIDI names, actual save completion and
  destination replacement, IPC permission synchronization, and signed/packaged
  runtime availability on both architectures of Windows and macOS.
- Check the installed/packaged model and notice bytes against provenance, retain
  the per-artifact SBOM/inventory/checksums, and run the existing dependency and
  security gates for the final merge revision.

These are acceptance checks beyond the local results recorded above, not a claim
that every listed check has passed.
Attach actual command results and platform CI links to the feature PR.
