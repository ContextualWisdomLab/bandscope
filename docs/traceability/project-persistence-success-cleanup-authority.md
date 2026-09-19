# Project Persistence successful-cleanup authority

## Problem

An existing-project publication validates the displaced predecessor and the published candidate before entering successful cleanup. Until this change, `finish_successful_publication` then deleted the displaced pathname and retired the published recovery journal without re-binding either cleanup action to the durable journal identities.

That leaves a TOCTOU window: after commit validation but before cleanup, another local process can replace either the displaced/backup pathname or the target pathname. The old cleanup would still remove whatever currently occupied the displaced pathname and could retire recovery evidence even though the target no longer denoted the candidate that had been validated. This is a cleanup-authority defect, not evidence that normal concurrent commits are races by themselves.

MITRE CWE-367 describes the relevant class: a resource property can change between a check and a later operation, invalidating the earlier authorization. The mitigation used here is a second native-identity check immediately at the destructive cleanup boundary, with fail-closed retention of recovery evidence on mismatch.

Reference: MITRE. (2026). *CWE-367: Time-of-check Time-of-use (TOCTOU) race condition* (CWE 4.20). https://cwe.mitre.org/data/definitions/367.html

## RED

- `d3daecf148a10a085df98ea26fc2c8b8680cf274` adds a native regression in which a validated displaced predecessor pathname is replaced by a foreign regular file before successful cleanup. The required behavior is to preserve that foreign file, retain published recovery evidence, and fail closed.
- The predecessor implementation fails this contract because `finish_successful_publication` calls best-effort `remove_stage(stage)` without proving that `stage` still denotes the journal's `expected` identity.

## Causal fix

`83a40b255297763ee55ef1519ddc409f0d2421c3` changes only the successful-cleanup authority boundary:

- promote the prepared journal to the durable published phase first;
- reopen and parse that durable journal instead of relying on stale caller assumptions;
- require the selected target to still have the journal's `candidate` native identity before retiring rollback material;
- for migration journals, re-run the candidate receipt check at this final cleanup boundary;
- delete the displaced/backup pathname only when its current native identity still equals the journal's `expected` predecessor;
- for migration journals, re-run the predecessor receipt check immediately before deletion;
- if either pathname has changed identity, return the recovery error without deleting the foreign object or the published journal.

No lock, force overwrite, filename-only trust, warning suppression, or journal deletion on ambiguous authority was introduced.

## Edge-case reinforcement

`1d537922228f2988d2a7fbc5b12e6999800e0a6c` adds a second native case for the symmetric target race: after the candidate had been the validated target, another file occupies that pathname before cleanup. Successful cleanup must retain the known-good predecessor and published journal and must not clobber the new occupant.

The two cases deliberately exercise path replacement rather than generated arrays or mocks. They run inside the same native Project Persistence integration harness used on Windows and macOS.

## Security notes

- **Untrusted inputs:** selected project pathnames, adjacent generated artifacts, and durable recovery journals remain untrusted filesystem state.
- **Trust boundary:** a pathname is not cleanup authority. The durable journal's native identities plus, for migrations, receipt digests define the objects that may be retired.
- **Safe failure:** identity/content mismatch retains rollback/recovery evidence and leaves the unexpected object untouched.
- **Privacy/logging:** no project/audio bytes, pathnames, or recovery content are added to ordinary logs.
- **Residual risk:** parent-directory operations remain pathname based; this change does not claim descriptor-bound ancestor-swap protection. Regular non-migration saves also do not gain a content digest merely from native identity. Packaged process-kill, disk-full, permission-failure, and power-loss evidence remains required by #962.

## Verification boundary

Source-level GREEN is not a release claim. The exact descendant containing this document must receive terminal Windows/macOS Project Persistence native results, repository-wide CI/security/SBOM/SAST/build settlement, and qualifying independent approval before #970 can move out of Draft or be merged. Any later semantic commit invalidates those exact-head results and must be re-evaluated rather than borrowing predecessor evidence.
