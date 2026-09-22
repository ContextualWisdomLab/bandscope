# Subprocess containment evidence

Last reviewed: 2026-09-22

## Decision boundary

BandScope treats the native analysis runner and timed YouTube import as product-owned subprocess boundaries. Renderer code can request work or cancellation only with BandScope-minted product identifiers; it never receives a PID, process-group id, Windows Job handle, generic signal primitive, or arbitrary execution authority.

The canonical process-lifetime owner is `bandscope_desktop_core::OwnedProcess` in `apps/desktop/core/src/owned_process.rs`. Callers configure only the executable, arguments, working directory and standard streams, then call `spawn_owned_process`. They do not assemble platform-specific process containment themselves.

On Linux and macOS, `spawn_owned_process` applies `CommandExt::process_group(0)` before spawn. Ordinary descendants therefore inherit a BandScope-owned process group unless they deliberately leave it. `OwnedProcess::terminate` signals that group with `SIGKILL` and reaps the directly owned child; direct-child kill/reap remains the fail-closed fallback when group signalling fails.

On Windows, post-spawn Job assignment is rejected because child code could create a descendant before `AssignProcessToJobObject` runs. The canonical owner instead creates an unnamed Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, starts the child with `CREATE_SUSPENDED`, assigns the still-suspended child to the Job Object, locates the suspended child thread through Toolhelp, and resumes it only after assignment succeeds. The Job handle stays owned by `OwnedProcess`; cleanup calls `TerminateJobObject` before inherited-output reader joins. Direct-child kill/reap remains a setup/termination failure fallback.

This is a process-tree lifetime boundary, not a sandbox. Deliberate Unix `setsid`/process-group escape, Windows breakaway semantics, egress control, seccomp/AppArmor/SELinux, filesystem isolation, CPU/RAM/PID/disk quotas, and accelerator isolation remain separate controls.

## Why the analysis runner had to move behind the same owner

The timed-import path already used `spawn_owned_process`, but `apps/desktop/src-tauri/src/main.rs::run_analysis_engine` still composed `configure_owned_process(&mut command)` and `Command::spawn()` directly. On Unix that happened to preserve process-group containment. On Windows it bypassed the pre-execution Job Object boundary entirely, so cancellation, timeout, protocol failure, and successful-parent cleanup remained direct-child-only even though the adjacent timed-import boundary had stronger semantics.

RED `6025e120c9c9b18e8984281c3acde1478893b781` changes the Tauri containment contract so the analysis runner must use `spawn_owned_process`, must not use the old configure-then-spawn sequence, and must terminate through `OwnedProcess` before joining inherited output readers. The contract also binds the adapter to the cross-platform executable descendant-pipe regression in `apps/desktop/core/tests/process_output_large_streams.rs`.

Production `5533cbc95eb6d7b90c7422c9d0f50540ccb31037` exposes only the narrow `OwnedProcess` capability required by a native caller: stdin/stdout/stderr take-once access, direct-child `try_wait`, and tree-aware `terminate`. Its child and platform handles remain private. `01770c9934b5b0f4a7d2e4b78b1d85f553b855bd` re-exports that capability from the desktop-core crate root. `ae9a0f1cfbb2861b841f8ad343344d5d0b06af18` migrates `run_analysis_engine` to `spawn_owned_process`, `take_stdin`/`take_stdout`/`take_stderr`, `try_wait`, and `terminate` without changing job-id/request-time authority, JSONL admission, cancellation semantics, timeout, or the direct child exit status used as product truth.

`14885e893a55dbe46d28389dc9c50df7ecf8e261` expands the dedicated Windows/macOS Resource Admission workflow so it executes both the real core descendant/dual-pipe regression and the native Tauri adapter contract on the exact PR source head. `2ec4d6e4b9c71ea7ae6e7bc75b445675748082a8` updates the workflow-policy regression so future changes to either owner path must trigger fresh cross-platform evidence.

No hosted RED is claimed for `6025e120...`: the RED and production changes are ordinary forward descendants in one owner lane. Exact-head hosted GREEN is claimed only after the final documentation head has completed the dedicated Windows Server 2025 and macOS 15 workflow.

## Output, timeout and protocol admission

Captured helper output is an admission boundary, not a diagnostics sink. stdout and stderr are each limited to 1 MiB plus one overflow-probe byte. A reader failure wakes the single process-control owner through standard-library MPSC; the owner terminates the process boundary before joining readers. The wait interval is clamped to the smaller of the configured poll interval and the remaining monotonic deadline, so a coarse poll interval cannot add a full interval of avoidable timeout overshoot.

The native analysis worker owns `jobId` and `requestedAt`. Helper status is admitted only when both identities match exactly. Before direct-child exit, only `Running` progress may be published. `Succeeded` or `Failed` is retained privately until the child exits successfully and bounded readers join. Helper-authored `Queued`, malformed JSONL, schema-invalid status, state/payload contradictions, progress outside 0..=100, records after terminal status, and native identity mismatches fail closed.

Transport does not normalize helper payload into validity. `read_bounded_process_lines` removes only the JSONL LF and optional CR delimiter; it preserves other payload whitespace and empty physical records so `serde_json`, not Resource Admission, decides JSON validity. Reader rejection is also retained in the join result, so a direct-child exit racing the MPSC notification cannot rehabilitate an already rejected stream.

Historical protocol repairs retained by this contract include native timestamp authority (`082cf63e...` / `a253c099...` / `9358035e...` / `70e4d9da...`), semantic status admission (`e3a6a20a...` / `2dbab44b...`), exit-order rejection retention (`64cb603b...` / `ea9428cc...`), non-JSON Unicode-whitespace preservation (`e4443659...` / `6258b97c...`), and blank-record preservation (`161de8d6...` / `f8135e0a...`). These remain protocol evidence; they do not establish scientific correctness of MIR output.

## Executable evidence

`apps/desktop/core/tests/process_output_large_streams.rs` uses the feature-gated standalone `bandscope-process-output-test-helper`, not libtest self-reentry, to exercise the actual `wait_for_process_output` owner. It covers exact 1 MiB stdout and stderr and a successful parent that leaves a five-second descendant holding inherited output handles. The latter must return in under two seconds because `OwnedProcess` terminates ordinary descendants before reader join.

The dedicated workflow `.github/workflows/resource-admission-process-output-native.yml` runs that executable contract on `windows-2025` and `macos-15` from `${{ github.event.pull_request.head.sha || github.sha }}` with credentials persistence disabled. It then runs `apps/desktop/src-tauri/tests/analysis_process_terminal_containment_contract.rs` on the same matrix, proving the native analysis adapter still enters the same owner boundary and cleans it before reader joins.

Earlier exact `c0c3956d10edb6e21a154c9c5de075dd2bde3217`, run `35686172417`, was GREEN on Windows Server 2025 and macOS 15 for the timed-import exact-limit and descendant-handle contract. That predecessor result explains the owner semantics but does not transfer to the later Tauri migration. The current final head requires its own generation.

## Authoritative evidence and traceability

| Evidence | BandScope decision |
| --- | --- |
| Rust `std::os::unix::process::CommandExt::process_group` configures process-group membership as part of command setup. | Establish the Unix process group before helper code executes rather than retrofitting descendant ownership. |
| POSIX.1-2024 `kill()` defines negative process-group signalling. | Terminate the owned Linux/macOS process group through a narrow native binding; never expose signal authority over IPC. |
| Microsoft Job Objects group processes for lifecycle management; `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates processes when the final job handle closes. | Retain one Job handle inside `OwnedProcess` and use it as the Windows lifetime boundary. |
| `AssignProcessToJobObject` acts on an already-created process. | Do not treat ordinary spawn-then-assign as race-free containment. |
| Windows `CREATE_SUSPENDED` prevents the initial thread from running until resumed. | Create the child suspended, assign it to the Job first, then resume it. |
| Rust Windows `CommandExt::creation_flags` passes caller flags into process creation. | Keep pre-execution Windows containment in desktop core without copying Win32 spawn policy into Tauri callers. |
| Rust `std::io::Take` bounds bytes readable from a stream. | Admit at most 1 MiB per captured helper stream plus one overflow probe byte. |
| RFC 8259 and JSON Lines distinguish JSON grammar whitespace from arbitrary Unicode whitespace and require every physical line to contain a JSON value. | Strip only the transport CR/LF delimiter and preserve malformed payload for parser rejection. |

## Claim boundary

For ordinary descendants, both product-owned subprocess paths now use the same platform owner: Unix process groups and Windows pre-execution Job Object admission. That statement does not cover an intentionally escaping descendant, an external process not spawned through `OwnedProcess`, or hostile-code sandboxing.

The 1 MiB stdout and stderr limits bound only parent-side capture. They do not establish bounded helper RSS, decoder/resampler allocations, MIR/model memory, VRAM, temporary-disk growth, or CPU/GPU budgets. Protocol identity and state admission likewise do not establish that helper-produced musical analysis is scientifically correct.

Commercial acceptance therefore still requires rights-cleared full-length rehearsal audio to measure cancellation/resource return, child-created temporary-artifact cleanup, decoder/resampler/downstream peak RSS and accelerator memory, and explicit per-job CPU/GPU budgets. Synthetic descendant tests establish the process-control invariant only; they do not substitute for real-audio scientific or buyer acceptance.

## References

Bray, T. (2017). *The JavaScript Object Notation (JSON) Data Interchange Format (RFC 8259).* Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc8259

IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html

JSON Lines. (n.d.). *JSON Lines.* Retrieved September 22, 2026, from https://jsonlines.org/

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Microsoft. (2025). *Process Creation Flags.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags

Rust Project Developers. (2026). *CommandExt in std::os::unix::process.* Rust standard library documentation. https://doc.rust-lang.org/stable/std/os/unix/process/trait.CommandExt.html

Rust Project Developers. (2026). *CommandExt in std::os::windows::process.* Rust standard library documentation. https://doc.rust-lang.org/stable/std/os/windows/process/trait.CommandExt.html

Rust Project Developers. (2026). *Take in std::io.* Rust standard library documentation. https://doc.rust-lang.org/std/io/struct.Take.html
