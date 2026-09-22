# YouTube subprocess containment evidence

## Scope

This note records the evidence and claim boundary for BandScope's timed YouTube-import subprocess lifecycle and the shared native subprocess-containment owner used by the analysis runner. It applies to the allowlisted `bandscope_analysis.youtube` process launched through `wait_for_process_output`, to the analysis engine process where it already consumes the older shared process-group helpers, and to ordinary descendants that retain their parent's containment boundary. It is not a sandbox claim.

The current implementation is intentionally asymmetric while the owner is migrated in coherent verticals. The GUI-independent `wait_for_process_output` path now establishes a pre-execution Windows Job Object boundary as well as the existing Unix process-group boundary. The Tauri analysis runner still composes `configure_owned_process + Command::spawn` and therefore remains **direct-child-only on Windows** until it is migrated to the same owned-spawn abstraction. Do not generalize the Windows claim from the timed importer to every analysis subprocess yet.

## Problem and decision

The original `wait_for_process_output` timeout path killed and reaped only the directly spawned Python importer and then joined stdout/stderr reader threads. `bandscope_analysis.youtube` invokes yt-dlp with `FFmpegExtractAudio`, so a descendant could outlive the Python parent. If that descendant retained inherited output handles, the reader join could remain live after the product timeout.

RED `65c94f72c1b87ce6a7be1c7f316409530330bf5e` starts a Unix shell that creates a five-second descendant while retaining inherited stdout/stderr, applies a 50 ms product timeout, and requires cleanup to return in under one second. Production `81a489026ce26fd14cf38bf1ea334e85d37346ee` configures the timed importer as leader of a fresh Unix process group before spawn and targets that group on timeout or wait failure before joining output readers. `9c36cf0a0b427e2383a128202db832b268d2f791` mirrors the regression through the Tauri shell test target so the native-shell lane can execute the same boundary.

A later DDD/SOLID review found equivalent low-level Unix process-group setup and termination in the Tauri analysis runner and GUI-independent YouTube helper. RED `04e4d5c14d380ab97c246d5ecf501dece9f17c04` changed the native cancellation contract so the Tauri adapter must call the shared desktop-core process owner and reject local POSIX signalling primitives. Production `25dd7a5c87bcd1b8d16ba316ce5d9cc1c53c24ff` removed the duplicate Tauri `CommandExt`/`kill(2)` implementation and routed analysis spawn/cancel/timeout/error cleanup through `configure_owned_process` and `terminate_owned_process` in `bandscope_desktop_core`.

Issue #1244 then exposed a cross-platform test-harness defect while Project Persistence temporarily broadened desktop-core execution on Windows. The large stdout/stderr regression re-entered the current Rust test binary with `--exact` and a module-qualified test name. Protected `develop` used `tests::youtube_process_output_drains_large_stdout_and_stderr_before_exit`; the Resource Admission owner had moved the same test under `runtime_core::tests::...`. Hosted Windows Server 2025 run `35498831001` therefore executed no matching child test and the parent observed harness output instead of the intended payload.

Commit `d28491bab568ed43e77997237490e3734fbd5e5a` removed `--exact` and switched to the unique function-name filter. That repaired namespace coupling but did not make libtest itself an appropriate exact-limit payload generator. Exact head `a191db03c08b601f1b6bdbd71e84bbf5a707a371` proved the deeper defect in hosted run `35670228761`: both macOS 15 and Windows Server 2025 entered the intended test and then failed with `Failed to execute YouTube import process.` The child branch wrote exactly 1 MiB to stdout and 1 MiB to stderr, while `wait_for_process_output` admits at most 1 MiB per stream. Because the child was still a libtest process launched with `--nocapture`, libtest also emitted harness text on the same captured streams. The transport owner correctly treated that extra byte range as overflow. Increasing the capture ceiling, reducing the payload, suppressing the platform, or teaching production code to special-case test chatter were rejected because each would weaken or distort the actual resource contract.

The repair separates test payload generation from the Rust test harness:

- `67bb9efc9141ca49e4b74de802b3d9142b37f6bd` adds a feature-gated `bandscope-process-output-test-helper` binary target. The helper is not an ordinary product/package target.
- `19ff3ef33e467be6580d416f3c893029c810ae7a` adds the helper implementation. It writes exactly `MAX_PROCESS_OUTPUT_BYTES` bytes to stdout and exactly the same amount to stderr and flushes both streams, with no libtest protocol output.
- `9c4cff36e10f95cdff880de94c9852a1b5d249e6` adds the integration regression `process_output_drains_exact_limit_stdout_and_stderr_before_exit`. It launches the isolated helper through the production `wait_for_process_output` boundary and requires success, exact byte counts, and exact payload bytes on both streams.
- `7271df3636cd70d2577000429521e22addfd908c` changes the hosted native gate to execute that integration target on Windows Server 2025 and macOS 15 and adds both helper/test paths to the owner trigger set.
- `452ddcd6a6b63dcd0d8ef7e1f0bf48a3cef6e07f` binds the policy regression to the feature-gated helper target and the exact integration command.

Hosted run `35671610296` on exact `452ddcd6a6b63dcd0d8ef7e1f0bf48a3cef6e07f` completed successfully on both `test / resource-admission / process-output / macos-15` and `test / resource-admission / process-output / windows-2025`. After doctoring moved the source owner to `f578ceeb77a2f3ba58b8b5e6e03b3978964c9a72`, run `35672651918` repeated the same focused contract successfully on both hosted platforms.

The old self-reentering unit regression was no longer a distinct contract after the isolated helper integration became the canonical exact-limit acceptance test. Commit `4dc54c00ef67049e948fee0b957e8e3f03fe7def` removes `youtube_process_output_drains_large_stdout_and_stderr_before_exit` from `apps/desktop/core/src/lib.rs` rather than preserving a second libtest-coupled payload generator or weakening the 1 MiB ceiling. Exact `e7be3ae872c7b4451c800821f7c8ad8f68e23e0a`, run `35674756212`, then repeated the isolated exact-limit contract successfully on both hosted platforms after that consolidation.

## Windows descendant-handle repair

The next buyer-visible failure mode was not an output-size error. On Windows the shared `configure_owned_process` helper had no process-tree primitive and `terminate_owned_process` could kill only the direct child. A helper parent could therefore exit successfully after starting a descendant that inherited stdout/stderr; `wait_for_process_output` would observe the parent exit and then block its reader joins until the descendant finally closed those handles.

Test-only RED `709c452266a202d767db640c26ada4bc0e934779` extends the isolated helper so a parent can start a five-second descendant that inherits the same stdout/stderr handles and immediately exit. The production integration requires `wait_for_process_output` to return in less than two seconds without reducing the descendant lifetime, changing the 1 MiB ceiling, or skipping Windows. The predecessor Windows implementation cannot satisfy that contract because it owns only the direct `Child`.

Production repair `ab3ae64760f320fd0b5fa58c6c0327d125b748c0` introduces one GUI-independent `OwnedProcess` boundary for `wait_for_process_output`. On Windows it:

1. creates an unnamed Job Object and configures `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`;
2. requests `CREATE_SUSPENDED` through stable Rust `CommandExt::creation_flags` before spawn;
3. assigns the still-suspended direct child to the Job Object;
4. locates the child's suspended thread through the Toolhelp thread snapshot contract and resumes it only after Job membership succeeds;
5. retains the Job handle for the owned-process lifetime and uses `TerminateJobObject` before reader joins, with direct-child kill/reap only as a fail-closed fallback.

This ordering rejects the weaker `spawn → AssignProcessToJobObject` design: Microsoft explicitly notes that operations performed before assignment are not retroactively covered, and ordinary child processes inherit a job by default only after their parent is associated. Suspending before assignment prevents BandScope child code from creating an uncontained ordinary descendant during that window. Rust documents that caller-supplied Windows creation flags are passed to `CreateProcess` and are ORed with `CREATE_UNICODE_ENVIRONMENT`; no nightly process API or extra dependency is introduced.

Exact source-repair run `35686021381` on `ab3ae64760f320fd0b5fa58c6c0327d125b748c0` completed the focused integration successfully on both `windows-2025` and `macos-15`. The Windows job executed the same exact-limit case plus the new inherited-pipe descendant case. This proves the timed `wait_for_process_output` boundary on that exact source head. It does **not** prove the still-unmigrated Tauri analysis runner, deliberately breakaway descendants, or rights-cleared real yt-dlp/FFmpeg cancellation/resource return.

## TRACEABILITY

| Evidence | BandScope control | Claim boundary |
| --- | --- | --- |
| Rust exposes stable Unix `CommandExt` pre-spawn hooks. | The GUI-independent desktop-core owner establishes the owned Unix process group before `spawn`/`exec`; Tauri and timed import consumers call shared termination primitives instead of carrying duplicate POSIX signalling. | Linux/macOS implementation evidence only. |
| POSIX.1-2024 `kill()` defines a negative PID other than `-1` as targeting the process group whose id is the absolute value of that PID. | The owned child is made process-group leader, so signalling `-child.id()` targets ordinary descendants that retain that group. | Descendants that deliberately call `setsid()`/`setpgid()` or otherwise leave the group are outside the guarantee. |
| yt-dlp is configured with `FFmpegExtractAudio`, which can involve an external FFmpeg process during import. | The native timeout boundary contains the importer and ordinary helper descendants before output-reader joins. | The regression is not a rights-cleared real YouTube/FFmpeg commercial acceptance run. |
| `MAX_PROCESS_OUTPUT_BYTES` is a hard per-stream parent-side capture ceiling and `read_bounded_process_output` probes only one byte beyond it before failing closed. | The acceptance helper writes exactly the ceiling to each pipe and the integration test requires exact admitted byte counts. | This bounds captured parent-side bytes only; it is not an end-to-end RSS/VRAM or child sandbox guarantee. |
| Hosted exact `a191db03…` showed that using libtest as the payload generator adds harness bytes to the same stream and crosses the real ceiling. | Exact-limit payload generation is isolated in a feature-gated helper binary; the integration test invokes the helper as the child. | The helper is test-only and is not evidence about yt-dlp/FFmpeg payload shape. |
| Microsoft Job Objects associate ordinary children with the parent's job by default and `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the last job handle closes. | Windows `wait_for_process_output` keeps an unnamed Job Object handle for the owned child lifetime and performs tree-wide termination before joining inherited output pipes. | Child processes intentionally created with an admitted breakaway mechanism are outside this claim. |
| Microsoft documents `CREATE_SUSPENDED`; `ResumeThread` reports the previous suspension count. Rust's stable `creation_flags` passes Windows creation flags to `CreateProcess`. | BandScope spawns suspended, assigns the direct child to the Job Object, and resumes a Toolhelp-enumerated child thread only after assignment. Setup failure terminates/reaps and fails closed. | The current Tauri analysis runner has not yet migrated to `OwnedProcess`, so its Windows claim remains direct-child-only. |
| `CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD)` plus `THREADENTRY32.th32OwnerProcessID` identifies threads belonging to a process. | The suspended child cannot execute BandScope product code while its initial thread is located for the one-time resume. | Toolhelp setup failure is an engine-start failure, not permission to run without the Job boundary. |
| Repository-native owner workflows bind evidence to `${{ github.event.pull_request.head.sha || github.sha }}` rather than GitHub's synthetic merge ref. | `resource-admission-process-output-native.yml` tracks `owned_process.rs` plus the helper/test/doctoring contract and runs the same integration target on `windows-2025` and `macos-15`. | Focused native GREEN is not repository/security/review or release readiness. |

## Security Notes

**Attack surface.** A public YouTube URL crosses the User Input, Network, Process, and Storage boundaries. The importer can invoke yt-dlp/FFmpeg and writes only inside the app-owned import workspace under the existing URL, byte-budget, lease, and path-containment controls. The analysis runner launches the local analysis engine through a related native boundary, but its Windows spawn path has not yet migrated to the new Job Object owner.

**Threat.** A timeout or successful direct-parent exit that terminates only the parent can leave ordinary descendants consuming CPU, holding cache/temp files, or keeping stdout/stderr handles live. Joining readers before those handles are released can extend cancellation or completion well beyond the product deadline. A post-spawn Job assignment also leaves a child-code window before containment. Separate low-level implementations create drift risk.

**Mitigation.** For the timed importer, establish containment before child code executes: Unix process group before exec; Windows suspended creation, Job configuration/assignment, then resume. Terminate the owned boundary before joining readers and reap the directly owned child. Preserve the 1 MiB per-stream capture ceiling and expose no process identifier, Job handle, or generic kill primitive to the renderer. The feature-gated helper exercises exact-limit dual-pipe behavior and an inherited-handle descendant through the same production wait boundary on Windows and macOS.

**Remaining risk.** The Tauri analysis runner still uses the older `configure_owned_process + spawn` composition and therefore remains direct-child-only on Windows. Windows breakaway semantics, Unix descendants that deliberately escape their process group, real yt-dlp/FFmpeg cleanup, full-length rights-cleared real-audio cancellation latency, temp cleanup, and end-to-end RSS/VRAM remain outside the focused helper evidence. Hosted runner success is not release readiness; repository/security/review gates and protected ancestry remain separate requirements.

**Test points.** Run `process_output_large_streams` on Windows and macOS and require both exact 1 MiB stdout/stderr capture and bounded inherited-pipe descendant cleanup; retain the Unix descendant-pipe regression; migrate the Tauri analysis runner to the same owned-spawn boundary before claiming product-wide Windows tree containment; run real-tool cancellation/abnormal-child cases on rights-cleared full-length audio; keep setup/timeout/error paths fail closed before reader joins.

## References

Microsoft. (2022, July 26). *CreateJobObjectW function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Microsoft. (2024). *CreateToolhelp32Snapshot function (tlhelp32.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-createtoolhelp32snapshot

Microsoft. (2024). *Thread32First function (tlhelp32.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/tlhelp32/nf-tlhelp32-thread32first

Microsoft. (2025). *ResumeThread function (processthreadsapi.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread

Microsoft. (2025). *JOBOBJECT_BASIC_LIMIT_INFORMATION structure (winnt.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_basic_limit_information

Rust Project Developers. (2026). *std::os::windows::process::CommandExt* [Documentation]. https://doc.rust-lang.org/std/os/windows/process/trait.CommandExt.html

Rust Project Developers. (2026). *std::os::unix::process* [Documentation]. https://doc.rust-lang.org/std/os/unix/process/

The IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html
