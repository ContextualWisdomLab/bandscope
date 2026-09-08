# Subprocess containment evidence

Last reviewed: 2026-09-08

## Decision boundary

BandScope treats native analysis and timed YouTube import as product-owned subprocess boundaries. The renderer may request work or cancellation only through BandScope-minted product identifiers; it does not receive a PID, process-group id, generic signal primitive, or arbitrary execution authority.

On Linux and macOS, `bandscope_desktop_core` configures every owned analysis/import `Command` with `CommandExt::process_group(0)` before spawn. The child therefore leads a fresh process group before `exec`, and ordinary descendants inherit that group unless they deliberately change group or session. The shared termination path signals the negative group id with `SIGKILL`, then reaps the directly owned child when it is still running. Direct-child kill/reap is retained as the fail-closed fallback when group signalling is unavailable or fails.

The output-draining boundary needs one additional invariant beyond timeout/cancellation cleanup. A directly owned process can exit successfully while a descendant still holds inherited stdout/stderr descriptors. Joining the reader threads immediately after observing the parent's terminal status can then block until that descendant exits, which defeats the product timeout even though the parent has already completed. The current implementation therefore terminates residual same-group descendants after direct-parent terminal status and before joining stdout/stderr readers. The returned `ExitStatus` remains the directly owned process's status; descendant cleanup is containment, not a replacement result.

Executable regressions cover both terminal shapes on Linux/macOS: a parent that is still running when the product timeout expires, and a parent that exits successfully while a five-second descendant retains the inherited pipes. Both paths must return without waiting for that descendant. This is a process/pipe containment contract, not proof of bounded whole-process RSS, temp-file cleanup, or sandbox isolation.

## Authoritative evidence and traceability

| Evidence | BandScope decision |
| --- | --- |
| Rust's Unix `CommandExt::process_group` configures a child's process group as part of command setup before execution. | Establish the BandScope-owned process group before `exec` rather than attempting to retrofit group membership after helper descendants may already exist. |
| POSIX.1-2024 `kill()` defines a negative PID other than `-1` as signalling processes whose process-group id equals the absolute value. | Use one narrow reviewed C ABI binding to signal the owned Linux/macOS group; no PID or signal value crosses IPC. |
| Rust 1.98.1 documents `ChildExt` process-group signalling helpers but marks them as the unstable `unix_send_signal` API. | Do not make a nightly-only standard-library API a production dependency; retain the narrow stable-compatible `kill()` binding until a stable equivalent is available and adopted deliberately. |
| Microsoft documents that processes assigned to a Job Object are managed as a unit and that `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the final job handle closes. | Windows requires a dedicated Job Object owner for analysis/import descendants before BandScope can claim process-tree containment. |
| `AssignProcessToJobObject` assigns an already-created process to a job. | A post-spawn assignment is not accepted as race-free proof when the Python process could create descendants before assignment. The Windows implementation must prevent execution through that pre-assignment window or use an equivalent creation boundary. |

## Claim boundary

The Linux/macOS guarantee covers ordinary descendants that retain the BandScope-owned process group. A descendant that deliberately invokes `setsid()` or changes process group escapes this narrow mechanism and is outside the claim. The mechanism is not a sandbox, container, seccomp/AppArmor/SELinux boundary, nor an egress policy owner.

Windows remains direct-child-only in the current production slice. The next platform prerequisite is race-free Job Object creation/assignment with kill-on-close semantics and tests that exercise an actual descendant, inherited handles, cancellation, normal parent exit, timeout, and cleanup.

Commercial acceptance remains broader than these synthetic process regressions. Rights-cleared full-length rehearsal audio must still measure cancellation latency, inherited pipe/handle release, child-created temporary-artifact cleanup, decoder/resampler/downstream peak RSS and accelerator memory, and explicit per-job CPU/GPU budgets. Synthetic shell descendants establish the process-control invariant only; they do not substitute for real-audio scientific or buyer acceptance.

## References

IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Microsoft. (2022, July 26). *CreateJobObjectW function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Rust Project Developers. (2026). *CommandExt in std::os::unix::process.* Rust standard library documentation. https://doc.rust-lang.org/stable/std/os/unix/process/trait.CommandExt.html

Rust Project Developers. (2026). *ChildExt in std::os::unix::process (Rust 1.98.1).* Rust standard library documentation. https://doc.rust-lang.org/std/os/unix/process/trait.ChildExt.html
