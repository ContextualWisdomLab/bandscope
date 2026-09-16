# Final-result cache durability traceability

## Problem

BandScope's final rehearsal-result cache influenced a buyer-visible rehearsal decision path, but `_store_cached_analysis()` previously wrote JSON to a fixed temporary pathname and used pathname replacement without synchronizing the completed file or the containing directory. A process crash was covered by atomic replacement, but a power loss could occur after the application reported `cacheStatus: stored` and before the new bytes or directory entry reached durable media. Atomicity and durability are different guarantees.

## Decision

Project Persistence keeps this cache-publication responsibility on #970. Resource Admission remains the sole authority for admitted audio byte count and SHA-256 identity; the Python cache boundary only consumes that evidence.

The final-result writer now follows this order:

1. create a unique temporary file in the target cache directory;
2. serialize the complete JSON payload;
3. flush Python's buffered writer and call `os.fsync()` on the staged file;
4. publish the staged file only after that sync succeeds;
5. on POSIX, replace the target and then fsync the parent directory;
6. on Windows, use `MoveFileExW` with `MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH` rather than silently falling back to a plain rename;
7. return success only after the platform publication boundary succeeds, otherwise return a cache miss through the existing API caller.

The temporary name is unique rather than `analysis.tmp`, so concurrent analysis jobs do not share one staging pathname. A publication failure removes only the writer-owned stage when it still exists; it does not fabricate a stored result.

## RED → fix evidence

- `6c39f6a33195e75505d57fd9a2a95084437980e6` introduced executable REDs requiring staged-file sync before publication, POSIX parent-directory sync after replacement, and fail-closed API status on publication failure.
- `57c305a5eda541be95a2abfbc1dfa585fbd22340` added the cache durability adapter and platform publication paths.
- `14db687ad69d14b83b0dc1e5c2f1466329f97da0` routed production `_store_cached_analysis()` through that adapter.
- `2cfc06bd925df2c7278ec999f2f0d6a57c258528` bound the simulated durability failure to the actual API import used in production.
- `abc4cf1a59990d241d2ac93ac2444ab3201b4f7f`, `901a50a82766d4a33bf6fca0950ca4594387fc02`, and `8d9c43206d42f48fb4164d486835c2a08d07327a` expanded platform/failure coverage and removed cross-platform strict-check assumptions about Win32-only `ctypes` attributes.

Hosted exact-head checks remain authoritative. These source commits are not by themselves a release or merge claim.

## Alternatives rejected

- **Keep `Path.replace()` only:** atomic namespace replacement does not prove the staged bytes and replacement metadata survived a power loss.
- **Call `fsync()` only on the JSON file:** on POSIX this still leaves the renamed directory entry outside the explicit durability boundary.
- **Use one predictable `.tmp` filename:** concurrent jobs can contend for or overwrite the same staging pathname.
- **Silently use plain `os.replace()` on Windows:** it would make the Windows durability claim weaker than the product contract. The implementation fails closed if the Win32 write-through binding is unavailable.
- **Move source identity into the cache layer:** source authenticity remains Resource Admission's contract; duplicating it here would create a second owner.

## Security Notes

### Attack surface

The final-result cache is a local derived-artifact boundary. Cache bytes, cache directory entries, staging files, and publication/recovery state can be corrupted, replaced, or interrupted independently of the admitted source audio.

### Trust boundary

Native Resource Admission remains the sole source-identity authority. Project Persistence owns only the derived rehearsal-result bytes and their durable publication state; it must not infer source authority from filenames, pathnames, or cache location.

### Mitigations

Publication uses a unique writer-owned stage, flush plus file `fsync`, platform-specific atomic publication, POSIX parent-directory `fsync`, and Windows `MOVEFILE_WRITE_THROUGH`. Any serialization, sync, publication, or cleanup failure is fail-closed for cache reuse and never reports `stored`.

### Test points

Tests cover file-sync-before-publication ordering, unique writer-owned staging cleanup, stage creation failure, parent-directory descriptor cleanup on both success and fsync failure, POSIX replace-before-parent-fsync ordering, Windows replace/write-through flags, unavailable Win32 bindings, Win32 move failure, platform dispatch, and API fail-closed status.

### Realistic threats

Realistic failures include process interruption during staging, power loss after byte write but before durable namespace publication, concurrent writers sharing a target, filesystem or recovery tooling leaving partial cache state, and local replacement of derived cache bytes. The boundary adds no network path and logs no raw audio or original source path.

### Remaining risk

Filesystem and storage hardware may provide weaker guarantees than requested sync primitives. The current tests prove API ordering and platform calls, not destructive physical power-cut behavior on every supported filesystem. Packaged Windows/macOS crash/power-loss fault injection remains release evidence, as do signing, notarization, updater rollback, and actual-audio scientific acceptance.

## References

Microsoft. (2024, November 20). *MoveFileExW function (winbase.h)*. Microsoft Learn. https://learn.microsoft.com/windows/win32/api/winbase/nf-winbase-movefileexw

Python Software Foundation. (2026). *os — Miscellaneous operating system interfaces: `os.fsync`*. Python 3 documentation. https://docs.python.org/3/library/os.html#os.fsync

Python Software Foundation. (2026). *tempfile — Generate temporary files and directories*. Python 3 documentation. https://docs.python.org/3/library/tempfile.html
