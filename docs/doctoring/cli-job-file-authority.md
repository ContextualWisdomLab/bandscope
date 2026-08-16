# CLI job-file path authority evidence

## Status

**Active Draft PR evidence.** This record documents the security boundary under review on BandScope PR #811. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Boundary and threat model

`bandscope-analysis --job <path>` is an explicit local-file input mode. Selecting that mode authorizes one bounded read of one regular local job file; it does not grant network-share, device, pipe, directory, or symlink authority.

A pathname is not merely a string on Windows. Universal Naming Convention (UNC) paths are used to access network resources, while DOS device paths use the `\\?\` or `\\.\` namespace forms. Windows file APIs can also translate ordinary `/` separators to `\` before native path processing. Therefore, sending an arbitrary caller-provided pathname to `os.lstat()` before classifying its namespace can acquire network or device authority even if later checks reject the resulting object (Microsoft, 2025; Microsoft, n.d.-a; Microsoft, n.d.-b).

The CLI consequently rejects pathname strings beginning with two backslashes or two forward slashes **before any filesystem metadata lookup**. This catches ordinary UNC forms, extended UNC forms such as `\\?\UNC\server\share`, and device namespace forms such as `\\.\pipe\...`, while making the same explicit-input contract deterministic across hosts.

Reserved Win32 device aliases are also classified before metadata lookup. Device-name comparison strips the leading ASCII space that Win32 can normalize away during file/folder creation, then applies the already-established trailing ASCII-space/period, extension, alternate-stream, and case normalization. This prevents forms such as ` NUL`, ` NUL.txt`, ` COM1 .log`, and ` AUX:` from bypassing the lexical authority boundary merely because a caller prepended an ASCII space (Microsoft, n.d.-b).

## Descriptor-bound local-file validation

For a pathname that passes the lexical namespace boundary, the CLI uses this sequence:

1. call `os.lstat()` and require a regular file, rejecting directories, FIFOs, devices, sockets, and symlinks visible at preflight before `open()`;
2. open read-only, requesting close-on-exec, no-follow, and nonblocking descriptor semantics where the host exposes them;
3. call `os.fstat()` on the obtained descriptor and require a regular file whose `(st_dev, st_ino)` identity matches the preflighted file; and
4. read at most `MAX_JSON_FILE_SIZE + 1` bytes through that verified descriptor.

The nonblocking flag closes a narrower availability race that descriptor revalidation alone cannot close. A local actor can replace a preflighted regular pathname with a FIFO or blocking device between `lstat()` and `open()`. Because `fstat()` executes only after descriptor acquisition, a blocking `open(O_RDONLY)` could otherwise wait indefinitely before the authority check runs. Requesting `O_NONBLOCK` where available prevents FIFO/device acquisition from waiting for a peer, while regular-file reads retain their normal semantics; the subsequent descriptor type and inode/device checks still reject any substituted object.

Python documents `os.fstat()` as descriptor-based status inspection, `os.lstat()` as a non-following pathname status operation, and `O_NONBLOCK`, `O_NOFOLLOW`, and related flags as platform extensions that may be unavailable when the underlying C library does not define them (Python Software Foundation, 2026). The inode/device identity check is therefore retained even when these flags are available rather than treating one platform-specific flag as the complete authority boundary.

## TDD evidence contract

The original regression test landed before the namespace repair. It supplies ordinary UNC, forward-slash UNC, extended UNC, and named-pipe device paths while replacing `os.lstat()` with a sentinel that fails if any filesystem lookup is attempted. Exact-head release preflight on that RED commit failed in harness verification, establishing that the previous implementation reached the filesystem lookup. The production repair then moved namespace rejection ahead of `os.lstat()`.

A second regression-first cycle covers the `lstat()`-to-`open()` availability race. The test captures the exact descriptor flags used by `_read_bounded_job_file()` while preserving normal regular-file I/O and requires `O_NONBLOCK` whenever the host exposes it. The test-only predecessor head failed on that assertion, proving that close-on-exec/no-follow alone did not prevent a substituted FIFO/device from turning descriptor acquisition into a wait. The production repair adds only the nonblocking descriptor flag; `fstat()` regular-file and identity checks remain unchanged.

A third regression-first cycle covers Win32 leading-space normalization. The RED test replaces `os.lstat()` with a sentinel and supplies leading-space reserved aliases; therefore any failure to classify the alias lexically is observable as an attempted filesystem lookup. The production repair changes only the reserved-device normalization step by removing leading ASCII spaces before device-name comparison. It does not broadly trim arbitrary leading periods or Unicode whitespace and therefore does not widen the lexical policy beyond the documented Win32 normalization boundary.

Commercial merge evidence still requires the final exact head to pass repository CI/release/build-baseline, owned statement and branch coverage, docstring, SAST, security, SBOM/supply-chain, and qualifying independent non-author review gates. Protected-base dependency failures owned by canonical PR #783 are not suppressed or treated as leaf-branch success.

## Residual boundary

This lexical rule deliberately does not claim to prove physical storage locality for drive-letter paths. Windows can expose storage through mounts or mappings whose network provenance is controlled outside this process. The CLI boundary prevents caller-selected UNC/device namespaces from acquiring authority and verifies the selected regular file descriptor; host-level mount policy remains a deployment/endpoint-control responsibility.

`O_NONBLOCK` also does not claim general descriptor-level race freedom across every filesystem or operating system. It prevents the specific blocking-open availability failure where supported. Stronger race-resistant pathname acquisition primitives remain a separate platform-hardening layer when a deployment threat model includes a privileged local actor continuously replacing directory entries.

## References

Microsoft. (2024, April 23). *[MS-DFSC]: UNC path*. Microsoft Learn. https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-dfsc/149a3039-98ce-491a-9268-2f5ddef08192

Microsoft. (2025, October 22). *File path formats on Windows systems*. Microsoft Learn. https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats

Microsoft. (n.d.-a). *Maximum path length limitation*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation

Microsoft. (n.d.-b). *Naming files, paths, and namespaces*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces*. Python 3.14.7 documentation. https://docs.python.org/3/library/os.html
