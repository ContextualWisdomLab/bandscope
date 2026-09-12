# Feature-cache archive path admission

## Problem

Feature-cache metadata already opens an untrusted persisted sidecar with bounded, non-blocking/no-follow descriptor semantics where the platform exposes them. The NPZ archive path did not: `Path.open("rb")` resolved the pathname first and only then used `fstat()` to check that the resulting descriptor was a bounded regular file.

That ordering let a local cache-path substitution redirect replay through a symbolic link to another regular NPZ. On Unix-like systems a FIFO at the archive pathname can also block during ordinary read-only open before the regular-file admission check runs. Both cases violate the persistence boundary: an app-owned cache path is not sufficient authority after crash recovery, restore, or local modification.

## Decision

The archive owner now opens the NPZ with `os.open()` using read-only plus `O_NONBLOCK` and `O_NOFOLLOW` when those constants are available, then performs `fstat()` and all size/type checks on that same descriptor before copying its admitted extent into the private spooled snapshot.

The realistic regression uses a valid external NPZ as a symbolic-link target while keeping a valid BandScope sidecar at the cache pathname. On platforms exposing `O_NOFOLLOW`, replay must return a cache miss rather than materialize that target. The test is skipped where the runtime does not expose the flag; the production code keeps the existing portable `getattr(..., 0)` boundary instead of claiming identical filesystem semantics on every OS.

RED: `1038bdbfec8606901561e0924050de55950b4403`.

Production: `4ca8d02d856e0c13d9b2322268c6d79a8492d4e2`.

## Alternatives considered

Resolving the symlink and checking whether its target remains below the cache root was rejected. It retains a pathname-resolution race and would expand cache admission into path-containment policy even though replay only needs one already-open regular file.

Calling `Path.resolve()` before `open()` was rejected for the same reason: a check on one pathname resolution does not make a later open operate on the same filesystem object.

Removing `O_NONBLOCK` because it does not change ordinary regular-file reads was rejected. Persisted cache paths are untrusted at open time; on Unix, named-pipe open behavior can block before `fstat()` can reject the object. The flag is therefore a pre-admission liveness control, not a regular-file performance option.

## Claim boundary

This repair rejects a trailing-component symbolic link where `O_NOFOLLOW` is available and prevents ordinary FIFO open from becoming a blocking replay input where `O_NONBLOCK` is available. It does not provide Linux `openat2(2)`-style resolution constraints for every parent directory component, does not cryptographically bind the metadata and NPZ snapshots to one generation, and does not create durable source-content identity. The versioned immutable manifest remains separate work and must consume Project Persistence source identity after that owner reaches protected ancestry.

## Traceability

- CWE-59 — Improper Link Resolution Before File Access ('Link Following'): the weakness applies when a pathname associated with a symbolic link is used without ensuring that resolution stays within the intended resource policy.
- Python 3.14 `os` documentation: `O_NONBLOCK` is Unix-only, while `O_NOFOLLOW` is an extension exposed only when the underlying C library provides it; BandScope therefore feature-detects both flags.
- Linux `open(2)`: `O_NOFOLLOW` fails when the trailing pathname component is a symbolic link, and `O_NONBLOCK` avoids ordinary blocking open semantics where applicable, including FIFO handling.

## References

MITRE. (2026). *CWE-59: Improper link resolution before file access ('link following') (Version 4.20).* Common Weakness Enumeration. https://cwe.mitre.org/data/definitions/59.html

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces (Python 3.14.7 documentation).* https://docs.python.org/3.14/library/os.html

Kerrisk, M., & Linux man-pages contributors. (2026). *open(2) — Linux manual page* (Linux man-pages 6.18). https://man7.org/linux/man-pages/man2/open.2.html
