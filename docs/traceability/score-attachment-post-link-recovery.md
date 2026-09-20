# Score attachment post-link interruption recovery

Issue: #1239  
Canonical owner: Score Storage / Score Attachment  
Source RED: `1ce4bb86864ef845d39f7cb80614a2b686213499`  
Causal repair: `48a7ccfab996330fa415e68afaabc34782d62ad4`

## Problem

Score Storage publishes a validated PDF by creating `<score_id>.pdf` as a hard link to the synchronized `.score-<score_id>.stage`, then retires the staging alias. A process can terminate after the destination link exists but before stage retirement. The next process previously treated any stage-plus-destination state as permanently ambiguous, so a valid published PDF could block inventory and every later Score Storage mutation even though both names still represented the same buyer bytes.

This is a storage-recovery problem, not authority to infer durable project metadata. Project Persistence #970 remains the owner of whether an unreferenced published score should later be recovered, preserved, or discarded.

## RED

`score_pdf_interruption_recovery::process_killed_after_publication_link_recovers_destination_without_stage_alias` creates the exact persisted post-link shape in a child native process:

1. write and `sync_all` a valid reserved stage;
2. create `<score_id>.pdf` as a hard link to that stage;
3. expose a readiness marker and remain alive;
4. let the parent kill and reap the child;
5. start recovery through the public receipt inventory boundary.

The pre-repair implementation unconditionally rejected any existing destination from `recover_abandoned_score_stages`, so the new recovery expectation is a deterministic source-level RED. No hosted RED is claimed unless that exact superseded head receives a terminal failing run.

## Selected repair

Recovery still holds the existing cross-process Score Storage workspace lease. For a reserved stage with a matching destination name it now:

- validates the destination through the existing contained Score PDF resolver;
- reads both stage and destination through the existing bounded PDF validator;
- compares their shared-kernel SHA-256 content identities;
- retires only the stage alias when those validated bytes are equal;
- leaves `<score_id>.pdf` intact so it becomes an ordinary published-object recovery candidate;
- preserves both names and fails closed when the bytes differ or either object cannot be safely validated.

The equality check is content identity only. It is not a signature, authenticity proof, source-file provenance claim, or evidence that project attachment metadata was durable. A same-content but distinct file is also safe for this narrow cleanup because the only destructive action is removal of the temporary staging name while equivalent buyer bytes remain at the published destination.

## Alternatives rejected

Blindly deleting the stage whenever a destination exists is rejected because an unrelated destination could cause buyer bytes to be discarded. Blindly deleting the destination is rejected because it may be the only durable published copy after process death. Treating every stage-plus-destination pair as permanently ambiguous is non-destructive but leaves a recoverable crash state wedged indefinitely. Filesystem age, PID, or elapsed-time heuristics remain rejected because they do not prove content or lifecycle identity.

## Security and durability boundary

The workspace lease excludes another live writer using the current Score Storage contract. An older concurrently running build that never acquires this lease remains outside this guarantee and is still an explicit compatibility gap. The Unix lower-level delete path also retains its documented final basename race; this repair does not claim to close that separate issue.

Recovery does not attach the surviving destination to a project and does not delete it as an orphan. The destination is surfaced only through Score Storage inventory/receipt APIs. Project Persistence must compare that owner truth with durable project attachment ids before any buyer-visible Recover/Preserve/Discard decision.

## Test points

- terminated stage-only writer is still recovered before the next publication;
- terminated post-link writer preserves the published destination and removes only the redundant stage alias;
- content-different stage plus destination remains preserved and fails closed;
- receipt inventory after post-link recovery returns the score id without exposing local paths, selected filenames, or PDF bytes.

## References

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS) (FIPS PUB 180-4).* https://doi.org/10.6028/NIST.FIPS.180-4

The Open Group. (2024). *link, linkat — link one file to another file.* POSIX.1-2024, The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/link.html

The Open Group. (2024). *unlink, unlinkat — remove a directory entry.* POSIX.1-2024, The Open Group Base Specifications Issue 8. https://pubs.opengroup.org/onlinepubs/9799919799/functions/unlink.html
