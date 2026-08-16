# Filesystem path authority

## Status

**Active Draft PR evidence.** This record documents the security model for issue #852 and PR #858. It is not protected-`develop` shipped truth until the implementation is merged and revalidated on the protected branch.

## Decision boundary

BandScope accepts local audio and owns cache/temporary filesystem locations for analysis. A path string is therefore an authority-bearing input rather than an inert label. The implementation separates two checks:

1. **Lexical path-shape policy** detects relative authority, parent/current-directory segments, Windows drive-relative forms, network/UNC roots, Win32 device namespaces, legacy DOS device aliases, alternate data streams, and other Win32 filename-normalization ambiguities without depending on the host operating system.
2. **Native filesystem authority** requires the current host to recognize a request path as absolute before analysis progress begins, then repeats canonical file-type or containment checks at the repository-owned read/write boundary. Pure lexical validation remains separately callable so cross-platform syntax can be tested without pretending a foreign-host path is usable by the current runtime.

This separation is intentional. A Windows path such as `C:\Music\rehearsal.wav` can be recognized as a fully qualified local Windows path by the lexical contract even when a Linux CI runner is evaluating syntax, while normal Linux request preflight must reject that string before emitting decode progress because Linux I/O cannot treat it as a native absolute path.

## Evidence and rationale

Microsoft documents that a drive designator without a following backslash, such as `C:tmp.txt`, is relative to the current directory for that drive, and specifically gives `C:..\tmp.txt` as a relative-path form. It also distinguishes UNC names beginning with two backslashes and the Win32 device namespaces addressed through `\\?\` and `\\.\`. Those forms carry authority outside BandScope's local-file contract and are rejected rather than normalized into a different meaning.

Windows path APIs and path abstractions admit slash spellings in contexts where backslash is the canonical namespace separator. BandScope therefore canonicalizes `/` to `\` **only while classifying the leading authority prefix**. This prevents mixed forms such as `/\server\share`, `\/server\share`, `/\?\C:\...`, or `\/.\pipe\...` from bypassing the UNC/device rejection merely because no homogeneous `\\` or `//` prefix is present. The original string is left unchanged for subsequent `PurePosixPath`/`PureWindowsPath` parsing and for payload-safe diagnostics, so this is a refusal rule rather than an authority-changing path rewrite.

Microsoft's current Win32 naming guidance also reserves `CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`, and the documented ISO/IEC 8859-1 superscript-digit variants even when an extension follows. Microsoft's `RtlIsDosDeviceName_U` documentation additionally identifies `CONIN$` and `CONOUT$` as valid DOS device names, and the `CreateFile` contract opens those names as console input/output handles. BandScope therefore rejects them as device authority rather than treating them as regular local files. The Win32 naming guidance also reserves `:` within ordinary filename components and documents alternate data streams as a separate stream mechanism. It further warns against names ending in a space or period. Microsoft also documents that the Windows Object Manager removes an ASCII space (0x20) at the beginning or end of a file or folder name during creation. BandScope therefore rejects a Windows path component that begins or ends in an ASCII space, as well as one ending in a period, rather than validating a string that Windows can normalize to a different authority-bearing name such as ` NUL.wav` → `NUL.wav`.

MITRE CWE-22 treats untrusted pathname construction that can resolve outside an intended restricted location as path traversal. Its observed examples include failures to handle the Windows backslash separator and cases where an absolute input resets a joined path. BandScope therefore does not rely on a single `".."` substring rule.

MITRE CWE-59 separately defines link-following weakness as accessing a file by name without preventing that name from identifying a link or shortcut to an unintended resource. That distinction matters for BandScope's derived cache files: a digest-derived filename can still carry unintended authority when an already-present symbolic link occupies that exact child path. The cache contract therefore canonicalizes the exact feature-cache targets and repository-owned atomic-write temporary siblings, not only their parent directory.

Python's current `pathlib` documentation states that `Path.resolve()` makes paths absolute, resolves symbolic links, and eliminates `..` components; in non-strict mode it resolves as far as possible and appends a non-existing remainder. Accordingly, this slice uses canonical resolution to detect already-present symlink escapes but does **not** claim descriptor-level protection against a privileged local actor swapping filesystem entries after validation and before a later open.

## Implemented/required controls for PR #858

- Reject empty and NUL-containing path strings.
- Reject lexical `.` and `..` components using both slash conventions while preserving benign repeated separators.
- Reject Windows drive-relative paths such as `C:relative.wav` and `C:..\relative.wav`.
- Reject UNC/network and Win32 device namespaces for `sourcePath`, `cacheRoot`, and `tempRoot`, including mixed `/` and `\` separator spellings at the authority prefix.
- Reject legacy DOS device aliases in fully qualified Windows path components, including `CONIN$`/`CONOUT$`, documented superscript COM/LPT variants, and extension-bearing aliases such as `NUL.wav`.
- Reject Win32 reserved punctuation/control characters, alternate-stream `:` syntax outside the drive designator, components beginning or ending in an ASCII space, and components ending in a period; these are normalization or namespace forms outside the regular-file contract.
- Keep host-independent lexical validation available for POSIX/Windows syntax tests, but require normal request preflight to recognize each accepted local path as native absolute authority before any analysis progress is emitted.
- Keep validation errors payload-safe: identify the field, not the supplied path value.
- Resolve the selected local source on the native host before separation and reject a direct symlink.
- Require an existing source to be a regular file, while preserving the established orchestration contract in which an authorized but missing path reaches the separation worker and returns the stable payload-safe `Audio source file not found.` result.
- Require an existing `cacheRoot` or `tempRoot` to be a directory, and repeat that type check at the derived-path I/O boundary so a regular file cannot be silently accepted as an app-owned writable root.
- Derive cache and stem-work child names only from repository-controlled directory names and SHA-256 digests.
- Resolve already-existing child symlinks before checking that derived cache/temp paths remain within the canonical authorized root.
- Resolve the exact derived feature-cache metadata and array files before any cache read so an already-present file symlink cannot escape `cacheRoot` merely because its parent directory is authorized.
- Resolve repository-owned atomic-write temporary siblings before either metadata or array cache file is opened; resolve both feature-cache temporary paths before the first write so one invalid sibling cannot cause a partial external write.
- Translate a late cache/temp canonicalization failure into one payload-safe `invalid_request` status rather than emitting progress and later misclassifying the failure.
- Preserve the existing privacy boundary: persisted cache metadata must not include the original absolute source path.

## Residual risk and follow-up boundary

Canonicalization is a point-in-time check. A sufficiently privileged local process can race a later path open by replacing a filesystem entry after validation. Eliminating that class completely requires descriptor/handle-relative open semantics and platform-specific no-follow/reparse-point controls across every downstream decoder/write boundary. PR #858 must not claim that stronger property unless it is implemented and tested. The current bounded objective is to eliminate ambiguous path syntax, foreign-host runtime authority, device/stream aliases, direct source symlinks, invalid writable-root types, and already-present cache/temp symlink escapes without expanding filesystem authority.

## Verification contract

The exact PR head must exercise POSIX and Windows lexical adversarial cases, benign repeated separators, homogeneous and mixed-separator UNC/device namespace prefixes, Windows reserved/device/stream/normalization cases independently of the CI host, including Win32 console devices `CONIN$` and `CONOUT$`, leading-ASCII-space normalization, explicit host-independent lexical acceptance, foreign-host request-preflight rejection before progress, native absolute success paths, direct source symlink rejection, existing-directory rejection, missing-file orchestration compatibility, existing file rejection for writable cache/temp roots at both preflight and derived-path I/O boundaries, cache/temp fixed-subdirectory symlink escapes both before and after validation, exact feature-cache metadata/array file symlink escapes, pre-existing atomic-write temporary-file symlink escapes with outside sentinels unchanged, payload-safe failures, native root and fixed-child resolution failures, late API authority-failure translation, focused API behavior, and the full analysis-engine suite. New production code remains subject to the repository's exact 100% owned statement/branch coverage and public-docstring gates, plus repository CI, SAST, security, supply-chain, SBOM, current automated review, and protected-branch approval rules.

## References

Microsoft. (n.d.). *File path formats on Windows systems*. Microsoft Learn. Retrieved August 15, 2026, from https://learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats

Microsoft. (n.d.). *Naming files, paths, and namespaces*. Microsoft Learn. Retrieved August 15, 2026, from https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file

Microsoft. (n.d.). *Support for whitespace characters in file and folder names for Windows*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/file-folder-name-whitespace-characters

Microsoft. (2023, September 14). *RtlIsDosDeviceName_U function*. Microsoft Learn. https://learn.microsoft.com/en-us/windows/win32/devnotes/rtlisdosdevicename_u

Microsoft. (n.d.). *CreateFileA function (fileapi.h)*. Microsoft Learn. Retrieved August 16, 2026, from https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea

MITRE. (2026). *CWE-22: Improper limitation of a pathname to a restricted directory ('Path Traversal') (Version 4.20)*. Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/22.html

MITRE. (2026). *CWE-59: Improper link resolution before file access ('Link Following') (Version 4.20)*. Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

Python Software Foundation. (2026). *pathlib — Object-oriented filesystem paths* (Python 3.14.6 documentation). https://docs.python.org/3.14/library/pathlib.html
