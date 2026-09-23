# Structure evidence path admission

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228

## Problem

The structure noninferiority validator treated registration/result JSON as bounded untrusted evidence, but opened caller-selected paths with `Path.open("rb")`. A symbolic link therefore resolved to its target before the regular-file `fstat` check. The parser still read one descriptor and enforced the 2 MiB bound, but the path boundary did not prove that the admitted filesystem object was the object named by the caller rather than a linked target.

This is a narrower finding than corpus audio/annotation admission. The corpus tool already requests `O_NOFOLLOW` where available and has a fallback symbolic-link rejection. The result/registration validator did not have the equivalent boundary.

## Decision

Registration and result evidence paths are admitted as regular, non-link files.

- Build the open flags from `O_RDONLY`, optional `O_BINARY`, and `O_NOFOLLOW` when the platform exposes it.
- Open once with `os.open` and perform `fstat`, size validation, bounded read, UTF-8 decode, duplicate-key rejection, and JSON parsing from that same descriptor.
- On platforms without `O_NOFOLLOW`, reject `Path.is_symlink()` after the descriptor is opened and before evidence bytes are consumed. This fallback closes ordinary linked-path admission but is not claimed as a kernel-atomic no-follow primitive.
- Do not resolve/canonicalize and then reopen the path: that would create a separate check/use pathname window.
- Do not broaden the validator into generic filesystem policy or corpus resource admission; this boundary owns only registration/result evidence files.

MITRE classifies link following before file access as CWE-59 because an attacker-controlled filename can identify an unintended linked resource. The kernel no-follow flag is preferred when available because the rejection occurs at open rather than by trusting a pathname check performed earlier.

## RED → GREEN evidence

- RED `4275f922fe8d2e1d4e0acb43661ae166fb957936`: a platform without `O_NOFOLLOW` must reject an evidence path classified as a symbolic link; a platform exposing `O_NOFOLLOW` must pass that flag at the open boundary.
- GREEN `8f68c11b85d31cbf04ea21d5bc9a62ac67aa9c8d`: `_load_json` now uses `os.open`, optional `O_NOFOLLOW`, same-descriptor `fstat`, bounded read, and fallback link rejection.

The tests deliberately exercise both branches without depending on developer-mode or elevated symlink privileges on Windows CI.

## Security and claim boundary

This repair prevents the validator from intentionally following a symbolic-link evidence path. It does not claim protection against every filesystem namespace attack, hard-link policy, privileged mount manipulation, or a hostile kernel/filesystem. Existing evidence constraints remain unchanged: regular file, at most 2 MiB, UTF-8 JSON, no duplicate object keys, no non-standard NaN/Infinity constants, and closed-world scientific schemas.

## References

MITRE. (2026). *CWE-59: Improper Link Resolution Before File Access ('Link Following')*. Common Weakness Enumeration, version 4.20. https://cwe.mitre.org/data/definitions/59.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces*. Python 3 documentation. `os.O_NOFOLLOW` is used when exposed by the host platform.
