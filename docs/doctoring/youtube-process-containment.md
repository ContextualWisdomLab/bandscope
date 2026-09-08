# YouTube subprocess containment evidence

## Scope

This note records the evidence and claim boundary for BandScope's timed YouTube-import subprocess lifecycle and the shared native subprocess-containment owner used by the analysis runner. It applies to the allowlisted `bandscope_analysis.youtube` process launched by the native desktop boundary, to the analysis engine process, and to ordinary descendants that retain the parent's process group. It is not a sandbox claim and does not establish Windows process-tree containment.

## Problem and decision

The existing `wait_for_process_output` timeout path killed and reaped only the directly spawned Python importer and then joined stdout/stderr reader threads. `bandscope_analysis.youtube` invokes yt-dlp with `FFmpegExtractAudio`, so a descendant could outlive the Python parent. If that descendant retained inherited output handles, the reader join could remain live after the product timeout.

RED `65c94f72c1b87ce6a7be1c7f316409530330bf5e` starts a Unix shell that creates a five-second descendant while retaining inherited stdout/stderr, applies a 50 ms product timeout, and requires cleanup to return in under one second. Production `81a489026ce26fd14cf38bf1ea334e85d37346ee` configures the timed importer as leader of a fresh Unix process group before spawn and targets that group on timeout or wait failure before joining output readers. `9c36cf0a0b427e2383a128202db832b268d2f791` mirrors the regression through the Tauri shell test target so the native-shell test lane can execute the same boundary.

Fresh DDD/SOLID review then found that the Tauri analysis runner and GUI-independent YouTube helper had equivalent low-level Unix process-group setup and termination implementations. RED `04e4d5c14d380ab97c246d5ecf501dece9f17c04` changes the native cancellation contract so the Tauri adapter must call the shared desktop-core process owner and explicitly rejects local POSIX signalling primitives. Production `25dd7a5c87bcd1b8d16ba316ce5d9cc1c53c24ff` removes the duplicate Tauri `CommandExt`/`kill(2)` implementation and routes analysis spawn/cancel/timeout/error cleanup through `configure_owned_process` and `terminate_owned_process` in `bandscope_desktop_core`.

The chosen repair therefore has one GUI-independent OS mechanism: pre-`exec` process-group creation on Unix, negative-group signalling on Linux/macOS, direct-child reap, and direct-child kill/reap as fail-closed fallback if group signalling fails. The Tauri layer retains only orchestration and job-specific product authority. A generic renderer process-control API was rejected because the WebView must never receive PID, process-group, or arbitrary kill authority.

No hosted RED failure is claimed for `04e4d5c1…`: the regression and production repair were consecutive ordinary descendants under cancel-in-progress. Exact-head hosted evidence must come from the final descendant, not from a predecessor run.

## TRACEABILITY

| Evidence | BandScope control | Claim boundary |
| --- | --- | --- |
| Rust 1.98.1 exposes Unix process extensions in `std::os::unix::process`; stable `CommandExt` is the supported pre-spawn extension point, while whole-process-group signalling on `ChildExt` remains experimental/nightly. | The GUI-independent desktop-core owner establishes the owned Unix process group before `spawn`/`exec`; Tauri and timed import consumers call that shared owner rather than carrying duplicate POSIX primitives. | Linux/macOS implementation evidence only; this is not Windows containment. |
| POSIX.1-2024 `kill()` defines a negative PID other than `-1` as targeting the process group whose id is the absolute value of that PID. | The owned child is made process-group leader, so signalling `-child.id()` targets ordinary descendants that retain that group. | Descendants that deliberately call `setsid()`/`setpgid()` or otherwise leave the group are outside the guarantee. |
| yt-dlp is configured with `FFmpegExtractAudio`, which may involve an external FFmpeg process during the import lifecycle. | The native timeout boundary contains the importer and ordinary helper descendants as one Unix process group before output-reader joins. | The regression uses an OS child process that retains pipes; it does not claim a rights-cleared real YouTube/FFmpeg commercial acceptance run. |
| Microsoft documents that Job Objects can associate child processes with a job and that `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the final job handle closes. Microsoft also notes that resource operations performed before `AssignProcessToJobObject` are not retroactively covered. | The Windows design must create a dedicated Job Object and avoid an uncontained post-spawn window; if needed, create the process suspended, assign it, then resume. | Windows remains direct-child-only in current production code. |

## Security Notes

**Attack surface.** A public YouTube URL crosses the User Input, Network, Process, and Storage boundaries. The importer can invoke yt-dlp/FFmpeg and writes only inside the app-owned import workspace under the existing URL, byte-budget, lease, and path-containment controls. The analysis runner launches the local analysis engine under the same shared process-boundary primitive.

**Threat.** A timeout that terminates only the Python parent can leave ordinary descendants consuming CPU, holding cache/temp files, or keeping stdout/stderr handles live. Separate low-level implementations also create drift risk: one path can receive a containment fix while another keeps weaker cancellation semantics.

**Mitigation.** Establish containment before execution in one GUI-independent desktop-core owner, terminate the owned group before joining readers, reap the directly owned child, preserve direct-child fallback, and expose no process identifier or kill primitive to the renderer. Regression tests require the Tauri adapter to delegate to that owner and reject reintroduction of local POSIX signalling code.

**Remaining risk.** Windows requires a race-free Job Object boundary. Unix descendants can intentionally escape the inherited process group. Real-audio/real-tool evidence is still required for cancellation latency, temp cleanup, pipe/handle release, and process-resource return.

**Test points.** Execute the descendant-pipe regression on a Unix runner; run the Tauri shell cancellation-contract lane on the same exact head; verify timeout/error paths terminate before reader joins; retain cross-platform compilation; later add Windows Job Object descendant/handle tests and rights-cleared full-length real-audio/tool runs.

## References

Microsoft. (2022, July 26). *CreateJobObjectW function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Rust Project Developers. (2026). *std::os::unix::process (Rust 1.98.1)* [Documentation]. https://doc.rust-lang.org/std/os/unix/process/

Rust Project Developers. (2026). *ChildExt in std::os::unix::process (Rust 1.98.1)* [Documentation]. https://doc.rust-lang.org/std/os/unix/process/trait.ChildExt.html

The IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html
