# Filesystem path authority

## Status

**Active Draft PR evidence.** This record documents the security model for issue #852 and PR #858. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Decision boundary

BandScope accepts local audio and owns cache/temporary filesystem locations for analysis. A path string is therefore an authority-bearing input rather than an inert label. The implementation separates two checks:

1. **Lexical path-shape policy** detects relative authority, parent/current-directory segments, Windows drive-relative forms, network/UNC roots, and Win32 device namespaces without depending on the host operating system.
2. **Native filesystem authority** resolves only paths that can be interpreted as local absolute paths by the current host immediately before repository-owned read/write operations, then verifies file type or canonical containment as appropriate.

This separation is intentional. A Windows path such as `C:\Music\rehearsal.wav` can be recognized as a fully qualified local Windows path even when a Linux CI runner is evaluating syntax, while the same string must not be treated as a usable native absolute path by Linux I/O code.

## Evidence and rationale

Microsoft documents that a drive designator without a following backslash, such as `C:tmp.txt`, is relative to the current directory for that drive, and specifically gives `C:..\tmp.txt` as a relative-path form. It also distinguishes UNC names beginning with two backslashes and the Win32 device namespaces addressed through `\\?\` and `\\.\`. Those forms carry authority outside BandScope's local-file contract and are rejected rather than normalized into a different meaning.

MITRE CWE-22 treats untrusted pathname construction that can resolve outside an intended restricted location as path traversal. Its observed examples include failures to handle the Windows backslash separator and cases where an absolute input resets a joined path. BandScope therefore does not rely on a single `".."` substring rule.

Python's `pathlib` documentation recommends resolving arbitrary paths before walking them upward because `Path.resolve()` resolves symbolic links and eliminates `..` components. It also notes that `pathlib` does not provide all descriptor-relative facilities available through lower-level `os` APIs. Accordingly, this slice uses canonical resolution to detect already-present symlink escapes but does **not** claim descriptor-level protection against a privileged local actor swapping filesystem entries after validation and before a later open.

## Implemented/required controls for PR #858

- Reject empty and NUL-containing path strings.
- Reject lexical `.` and `..` components using both slash conventions.
- Reject Windows drive-relative paths such as `C:relative.wav` and `C:..\relative.wav`.
- Reject UNC/network and Win32 device namespaces for `sourcePath`, `cacheRoot`, and `tempRoot`.
- Keep validation errors payload-safe: identify the field, not the supplied path value.
- Resolve the selected local source on the native host before separation and reject a direct symlink.
- Require an existing source to be a regular file, while preserving the established orchestration contract in which an authorized but missing path reaches the separation worker and returns the stable payload-safe `Audio source file not found.` result.
- Require an existing `cacheRoot` or `tempRoot` to be a directory, and repeat that type check at the derived-path I/O boundary so a regular file cannot be silently accepted as an app-owned writable root.
- Derive cache and stem-work child names only from repository-controlled directory names and SHA-256 digests.
- Resolve already-existing child symlinks before checking that derived cache/temp paths remain within the canonical authorized root.
- Preserve the existing privacy boundary: persisted cache metadata must not include the original absolute source path.

## Residual risk and follow-up boundary

Canonicalization is a point-in-time check. A sufficiently privileged local process can race a later path open by replacing a filesystem entry after validation. Eliminating that class completely requires descriptor/handle-relative open semantics and platform-specific no-follow/reparse-point controls across every downstream decoder/write boundary. PR #858 must not claim that stronger property unless it is implemented and tested. The current bounded objective is to eliminate ambiguous path syntax, direct source symlinks, invalid writable-root types, and already-present cache/temp symlink escapes without expanding filesystem authority.

## Verification contract

The exact PR head must exercise POSIX and Windows lexical adversarial cases, native absolute success paths, direct source symlink rejection, existing-directory rejection, missing-file orchestration compatibility, existing file rejection for writable cache/temp roots at both preflight and derived-path I/O boundaries, cache/temp fixed-subdirectory symlink escapes, payload-safe failures, native resolution failures, focused API behavior, and the full analysis-engine suite. New production code remains subject to the repository's exact 100% owned statement/branch coverage and public-docstring gates, plus repository CI, SAST, security, supply-chain, SBOM, current automated review, and protected-branch approval rules.

## References

Microsoft. (n.d.). *File path formats on Windows systems*. Microsoft Learn. Retrieved August 15, 2026, from https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats

Microsoft. (n.d.). *Naming files, paths, and namespaces*. Microsoft Learn. Retrieved August 15, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file

MITRE. (2026). *CWE-22: Improper limitation of a pathname to a restricted directory ('Path Traversal') (Version 4.20)*. Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/22.html

Python Software Foundation. (2026). *pathlib — Object-oriented filesystem paths* (Python 3.14 documentation). https://docs.python.org/3.14/library/pathlib.html
