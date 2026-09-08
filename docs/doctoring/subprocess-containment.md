# Subprocess containment evidence

Last reviewed: 2026-09-08

## Decision boundary

BandScope treats native analysis and timed YouTube import as product-owned subprocess boundaries. The renderer may request work or cancellation only through BandScope-minted product identifiers; it does not receive a PID, process-group id, generic signal primitive, or arbitrary execution authority.

On Linux and macOS, `bandscope_desktop_core` configures every owned analysis/import `Command` with `CommandExt::process_group(0)` before spawn. The child therefore leads a fresh process group before `exec`, and ordinary descendants inherit that group unless they deliberately change group or session. The shared termination path signals the negative group id with `SIGKILL`, then reaps the directly owned child when it is still running. Direct-child kill/reap is retained as the fail-closed fallback when group signalling is unavailable or fails.

The output-draining boundary needs one additional invariant beyond timeout/cancellation cleanup. A directly owned process can exit successfully while a descendant still holds inherited stdout/stderr descriptors. Joining the reader threads immediately after observing the parent's terminal status can then block until that descendant exits, which defeats the product timeout even though the parent has already completed. The current implementation therefore terminates residual same-group descendants after direct-parent terminal status and before joining stdout/stderr readers. The returned `ExitStatus` remains the directly owned process's status; descendant cleanup is containment, not a replacement result.

Captured helper output is also an admission boundary, not an unbounded diagnostics sink. stdout and stderr are each limited to 1 MiB plus one overflow-probe byte before metadata parsing or error presentation. Each reader reports a bounded-read failure to the parent through a standard-library MPSC channel. The parent checks that signal inside the same process-status polling loop and terminates the owned process boundary before joining readers, rather than allowing a helper that has already violated output admission to continue until the overall process deadline. Oversized or unreadable streams still fail closed with the existing payload-free process execution error. This bounds parent-side capture memory and the post-detection lifetime of the owned helper; it does not constrain memory allocated inside Python, yt-dlp, FFmpeg, decoders, MIR/model code, or accelerator runtimes.

A process timeout is also a deadline contract rather than a polling suggestion. The polling loop clamps every sleep to the smaller of the configured poll interval and the monotonic time remaining until the deadline. A caller therefore cannot accidentally extend a 100 ms deadline by supplying a multi-second poll interval. This is intentionally separate from scheduler precision: BandScope does not claim hard real-time wake-up, but the implementation no longer adds a full poll interval of avoidable overshoot.

Executable regressions cover the process-control terminal shapes on Linux/macOS and the output/time boundary: a parent that is still running when the product timeout expires, a parent that exits successfully while a five-second descendant retains inherited pipes, an oversized helper-output stream that must be rejected instead of being retained until JSON metadata parsing, and a helper that emits one byte beyond the output ceiling and then keeps running. The output-overflow regression requires fail-closed termination well before the helper deadline, so a known admission violation cannot simply consume the remainder of the timeout window. `process_timeout_does_not_oversleep_poll_interval` separately gives the helper a 100 ms deadline with a two-second poll interval and requires timeout return in under one second. These are process/pipe/output/deadline contracts, not proof of bounded whole-process RSS, temp-file cleanup, sandbox isolation, or hard real-time scheduling.

## Authoritative evidence and traceability

| Evidence | BandScope decision |
| --- | --- |
| Rust's Unix `CommandExt::process_group` configures a child's process group as part of command setup before execution. | Establish the BandScope-owned process group before `exec` rather than attempting to retrofit group membership after helper descendants may already exist. |
| POSIX.1-2024 `kill()` defines a negative PID other than `-1` as signalling processes whose process-group id equals the absolute value. | Use one narrow reviewed C ABI binding to signal the owned Linux/macOS group; no PID or signal value crosses IPC. |
| Rust 1.98.1 `std::io::Take` is a reader adapter that limits how many bytes can be read from the underlying reader. | Read at most the configured output ceiling plus one probe byte; reject when the probe demonstrates overflow instead of allowing `read_to_end` to grow an unbounded `Vec`. |
| Rust 1.98.1 `std::sync::mpsc` provides multi-producer/single-consumer message channels and cloneable senders. | Let either stdout or stderr reader notify the single process-control loop of an admission failure without exposing a new product or IPC capability. The loop remains the only owner that terminates/reaps the helper. |
| Rust 1.98.1 `std::time::Instant` is a monotonic time measurement and `saturating_duration_since` yields the non-negative duration remaining between instants. `std::cmp::min` returns the smaller ordered value. | Compute the remaining deadline on each idle poll and sleep for `min(poll_interval, remaining)` so configured poll granularity cannot itself extend the owned helper's deadline. |
| Rust 1.98.1 documents `ChildExt` process-group signalling helpers but marks them as the unstable `unix_send_signal` API. | Do not make a nightly-only standard-library API a production dependency; retain the narrow stable-compatible `kill()` binding until a stable equivalent is available and adopted deliberately. |
| Microsoft documents that processes assigned to a Job Object are managed as a unit and that `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` terminates associated processes when the final job handle closes. | Windows requires a dedicated Job Object owner for analysis/import descendants before BandScope can claim process-tree containment. |
| `AssignProcessToJobObject` assigns an already-created process to a job. | A post-spawn assignment is not accepted as race-free proof when the Python process could create descendants before assignment. The Windows implementation must prevent execution through that pre-assignment window or use an equivalent creation boundary. |

## Claim boundary

The Linux/macOS guarantee covers ordinary descendants that retain the BandScope-owned process group. A descendant that deliberately invokes `setsid()` or changes process group escapes this narrow mechanism and is outside the claim. The mechanism is not a sandbox, container, seccomp/AppArmor/SELinux boundary, nor an egress policy owner.

The 1 MiB stdout and 1 MiB stderr ceilings bound only bytes retained by BandScope's parent-side capture buffers. Once either reader detects overflow or a read failure, the process-control loop terminates the owned helper boundary on its next poll rather than waiting for the full product deadline. The poll sleep itself is clamped to the monotonic deadline, so coarse caller polling cannot add an avoidable full-interval delay. This narrows wasted post-violation and post-deadline compute time but still does not establish a whole-process memory limit and does not replace CPU, RAM, PID, disk, or accelerator controls.

Windows remains direct-child-only in the current production slice. The next platform prerequisite is race-free Job Object creation/assignment with kill-on-close semantics and tests that exercise an actual descendant, inherited handles, cancellation, normal parent exit, timeout, and cleanup.

Commercial acceptance remains broader than these synthetic process regressions. Rights-cleared full-length rehearsal audio must still measure cancellation latency, inherited pipe/handle release, child-created temporary-artifact cleanup, decoder/resampler/downstream peak RSS and accelerator memory, and explicit per-job CPU/GPU budgets. Synthetic shell descendants establish the process-control invariant only; they do not substitute for real-audio scientific or buyer acceptance.

## References

IEEE & The Open Group. (2024). *The Open Group Base Specifications Issue 8 / IEEE Std 1003.1-2024: kill().* https://pubs.opengroup.org/onlinepubs/9799919799/functions/kill.html

Microsoft. (2025). *Job Objects.* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Microsoft. (2022, July 26). *CreateJobObjectW function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-createjobobjectw

Microsoft. (2021, October 12). *AssignProcessToJobObject function (jobapi2.h).* Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject

Rust Project Developers. (2026). *CommandExt in std::os::unix::process.* Rust standard library documentation. https://doc.rust-lang.org/stable/std/os/unix/process/trait.CommandExt.html

Rust Project Developers. (2026). *Take in std::io (Rust 1.98.1).* Rust standard library documentation. https://doc.rust-lang.org/std/io/struct.Take.html

Rust Project Developers. (2026). *std::sync::mpsc (Rust 1.98.1).* Rust standard library documentation. https://doc.rust-lang.org/std/sync/mpsc/

Rust Project Developers. (2026). *std::time (Rust 1.98.1).* Rust standard library documentation. https://doc.rust-lang.org/std/time/

Rust Project Developers. (2026). *min in core::cmp (Rust 1.98.0).* Rust standard library documentation. https://doc.rust-lang.org/stable/core/cmp/fn.min.html

Rust Project Developers. (2026). *ChildExt in std::os::unix::process (Rust 1.98.1).* Rust standard library documentation. https://doc.rust-lang.org/std/os/unix/process/trait.ChildExt.html
