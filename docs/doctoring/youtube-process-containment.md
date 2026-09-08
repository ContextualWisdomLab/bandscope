# YouTube subprocess containment evidence

## Scope

This note records the evidence and claim boundary for BandScope's timed YouTube-import subprocess lifecycle. It applies to the allowlisted `bandscope_analysis.youtube` process launched by the native desktop boundary and to ordinary yt-dlp/FFmpeg descendants that retain the parent's process group. It is not a sandbox claim and does not establish Windows process-tree containment.

## Problem and decision

The existing `wait_for_process_output` timeout path killed and reaped only the directly spawned Python importer and then joined stdout/stderr reader threads. `bandscope_analysis.youtube` invokes yt-dlp with `FFmpegExtractAudio`, so a descendant could outlive the Python parent. If that descendant retained inherited output handles, the reader join could remain live after the product timeout.

RED `65c94f72c1b87ce6a7be1c7f316409530330bf5e` starts a Unix shell that creates a five-second descendant while retaining inherited stdout/stderr, applies a 50 ms product timeout, and requires cleanup to return in under one second. Production `81a489026ce26fd14cf38bf1ea334e85d37346ee` configures the timed importer as leader of a fresh Unix process group before spawn and targets that group on timeout or wait failure before joining output readers. `9c36cf0a0b427e2383a128202db832b268d2f791` mirrors the regression through the Tauri shell test target so the native-shell test lane can execute the same boundary.

The chosen repair reuses the same OS mechanism already proven for the analysis runner: pre-`exec` process-group creation on Unix, negative-group signalling on Linux/macOS, direct-child reap, and direct-child kill/reap as fail-closed fallback if group signalling fails. A generic renderer process-control API was rejected because the WebView must never receive PID, process-group, or arbitrary kill authority.

A remaining DDD/SOLID repair is explicit: analysis orchestration and the GUI-independent YouTube helper currently contain equivalent low-level process-group primitives. They must converge on one shared owner before protected adoption so cancellation semantics cannot drift between two security-sensitive implementations.

## TRACEABILITY

| Evidence | BandScope control | Claim boundary |
| --- | --- | --- |
| Rust 1.98.1 exposes Unix process extensions in `std::os::unix::process`; stable `CommandExt` is the supported pre-spawn extension point, while whole-process-group signalling on `ChildExt` remains experimental/nightly. | BandScope establishes the owned Unix process group before `spawn`/`exec` and keeps the reviewed narrow POSIX signalling path rather than adopting a nightly-only runtime API. | Linux/macOS implementation evidence only; this is not Windows containment. |
| POSIX.1-2024 `kill()` defines a negative PID other than `-1` as targeting the process group whose id is the absolute value of that PID. | The owned child is made process-group leader, so signalling `-child.id()` targets ordinary descendants that retain that group. | Descendants that deliberately call `setsid()`/`setpgid()` or otherwise leave the group are outside the guarantee. |
| yt-dlp is configured with `FFmpegExtractAudio`, which may involve an external FFmpeg process during the import lifecycle. | The native timeout boundary contains the importer and ordinary helper descendants as one Unix process group before output-reader joins. | The regression uses an OS child process that retains pipes; it does not claim a rights-cleared real YouTube/FFmpeg commercial acceptance run. |
| Microsoft documents that Job Objects can associate child processes with a job and that `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the final job handle closes. Microsoft also notes that resource operations performed before `AssignProcessToJobObject` are not retroactively covered. | The Windows design must create a dedicated Job Object and avoid an uncontained post-spawn window; if needed, create the process suspended, assign it, then resume. | Windows remains direct-child-only in current production code. |

## Security Notes

**Attack surface.** A public YouTube URL crosses the User Input, Network, Process, and Storage boundaries. The importer can invoke yt-dlp/FFmpeg and writes only inside the app-owned import workspace under the existing URL, byte-budget, lease, and path-containment controls.

**Threat.** A timeout that terminates only the Python parent can leave ordinary descendants consuming CPU, holding cache/temp files, or keeping stdout/stderr handles live. The latter can turn an advertised timeout into a longer or unbounded wait in the native reader joins.

**Mitigation.** Establish containment before execution, terminate the owned group before joining readers, reap the directly owned child, preserve direct-child fallback, and expose no process identifier or kill primitive to the renderer.

**Remaining risk.** Windows requires a race-free Job Object boundary. Unix descendants can intentionally escape the inherited process group. Real-audio/real-tool evidence is still required for cancellation latency, temp cleanup, pipe/handle release, and process-resource return. The duplicate low-level Unix containment implementations must be consolidated before protected adoption.

**Test points.** Execute the descendant-pipe regression on a Unix runner; run the Tauri shell test lane on the same exact head; verify timeout/error paths terminate before reader joins; retain cross-platform compilation; later add Windows Job Object descendant/handle tests and rights-cleared full-length real-audio/tool runs.

## References

Microsoft. (2022, July 26). *CreateJobObjectW function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Rust Project Developers. (2026). *std::os::unix::process (Rust 1.98.1)* [Documentation]. https://doc.rust-lang.org/std/os/unix/process/

Rust Project Developers. (2026). *ChildExt in std::os::unix::process (Rust 1.98.1)* [Documentation]. https://doc.rust-lang.org/std/os/unix/process/trait.ChildExt.html

The IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html
