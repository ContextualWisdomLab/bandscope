# CLI job-file path authority evidence

## Status

**Active Draft PR evidence.** This record documents the security boundary under review on BandScope PR #811. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Boundary and threat model

`bandscope-analysis --job <path>` is an explicit local-file input mode. Selecting that mode authorizes one bounded read of one regular local job file; it does not grant network-share, device, pipe, directory, or symlink authority.

A pathname is not merely a string on Windows. Universal Naming Convention (UNC) paths are used to access network resources, while DOS device paths use the `\\?\` or `\\.\` namespace forms. Windows file APIs can also translate ordinary `/` separators to `\` before native path processing. Therefore, sending an arbitrary caller-provided pathname to `os.lstat()` before classifying its namespace can acquire network or device authority even if later checks reject the resulting object (Microsoft, 2025; Microsoft, n.d.-a; Microsoft, n.d.-b).

The CLI consequently rejects pathname strings beginning with two backslashes or two forward slashes **before any filesystem metadata lookup**. This catches ordinary UNC forms, extended UNC forms such as `\\?\UNC\server\share`, and device namespace forms such as `\\.\pipe\...`, while making the same explicit-input contract deterministic across hosts.

## Descriptor-bound local-file validation

For a pathname that passes the lexical namespace boundary, the CLI uses this sequence:

1. call `os.lstat()` and require a regular file, rejecting directories, FIFOs, devices, sockets, and symlinks before `open()`;
2. open read-only, requesting close-on-exec and no-follow flags where the host exposes them;
3. call `os.fstat()` on the obtained descriptor and require a regular file whose `(st_dev, st_ino)` identity matches the preflighted file; and
4. read at most `MAX_JSON_FILE_SIZE + 1` bytes through that verified descriptor.

Python documents `os.fstat()` as descriptor-based status inspection, `os.lstat()` as a non-following pathname status operation, and `O_NOFOLLOW`/related flags as platform extensions that may be unavailable when the underlying C library does not define them (Python Software Foundation, 2026). The inode/device identity check is therefore retained even when `O_NOFOLLOW` is available rather than treating one platform-specific flag as the complete authority boundary.

## TDD evidence contract

The regression test first landed without the production guard. It supplies ordinary UNC, forward-slash UNC, extended UNC, and named-pipe device paths while replacing `os.lstat()` with a sentinel that fails if any filesystem lookup is attempted. Exact-head release preflight on that RED commit failed in harness verification, establishing that the previous implementation reached the filesystem lookup. The production repair then moved namespace rejection ahead of `os.lstat()`.

Commercial merge evidence still requires the final exact head to pass repository CI/release/build-baseline, owned statement and branch coverage, docstring, SAST, security, SBOM/supply-chain, and qualifying independent non-author review gates. Protected-base dependency failures owned by canonical PR #783 are not suppressed or treated as leaf-branch success.

## Residual boundary

This lexical rule deliberately does not claim to prove physical storage locality for drive-letter paths. Windows can expose storage through mounts or mappings whose network provenance is controlled outside this process. The CLI boundary prevents caller-selected UNC/device namespaces from acquiring authority and verifies the selected regular file descriptor; host-level mount policy remains an deployment/endpoint-control responsibility.

## References

Microsoft. (2024, April 23). *[MS-DFSC]: UNC path*. Microsoft Learn. https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-dfsc/149a3039-98ce-491a-9268-2f5ddef08192

Microsoft. (2025, October 22). *File path formats on Windows systems*. Microsoft Learn. https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats

Microsoft. (n.d.-a). *Maximum path length limitation*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation

Microsoft. (n.d.-b). *Naming files, paths, and namespaces*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces*. Python 3.14.7 documentation. https://docs.python.org/3/library/os.html
