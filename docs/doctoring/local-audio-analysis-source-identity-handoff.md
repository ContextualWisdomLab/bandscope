# Local-audio analysis source identity handoff

## Problem

BandScope already verifies the app-owned `source.<extension>` publication against the native staging receipt and retains a path-free `LocalAudioPublicationIdentity` containing the exact byte length and lowercase SHA-256 digest. Before this repair, `start_analysis_job` recovered only the renderer-hidden bootstrap path/name/size tuple. The verified content identity stayed in native state and never crossed the owned analysis-child boundary, so a future feature-cache generation could not bind itself to the exact publication that Resource Admission had verified.

This is an authority-drop defect rather than a hash-algorithm defect. Path, display name, extension, and byte length are insufficient content identity: two different files can share all four values.

A later review of the first Python consumer found a second boundary defect. The CLI disabled persisted caching when `sourceContentSha256` was absent by deleting a string `cacheRoot` before the canonical request validator ran. A malformed traversal value such as `../cache` could therefore disappear before `validate_analysis_job_request` had a chance to reject it. Disabling an unverified cache must not sanitize or erase an independently invalid request field.

## Constraints

- The renderer must not gain the content digest as a new authority. The digest is retrieved only from `LocalAudioPublicationIdentityState`, keyed by the BandScope-minted project id.
- Resource Admission remains the owner of the verified publication receipt. Project Persistence may consume that path-free identity, but this repair does not duplicate `sourceReference` or persistence schema owned by #970.
- A digest is integrity/identity evidence, not authenticity. An attacker who can replace both an artifact and an unauthenticated digest can recompute SHA-256. No MAC, signature, FIPS 140 validation, or tamper-proof cache claim is made here.
- The analysis child receives the digest in the native JSON job envelope. Python now validates the request before any digest-derived cache namespace transformation and scopes persisted cache lookup below `source-sha256-v1/<digest>` only when the verified digest is present. This is still not the versioned immutable metadata/NPZ manifest.
- Invalid request fields must remain observable to the canonical validator. Cache-disable logic is not a normalization or sanitization authority.

## Decision

`start_analysis_job` now requires the native publication identity for local-audio jobs before it grants analysis authority. It cross-checks the retained identity against the native bootstrap source size, extension, and app-owned artifact name. A missing or contradictory identity fails before the job slot is acquired.

The owned child-process JSON envelope carries `sourceContentSha256` only when that verified native identity exists. Demo jobs remain unchanged. The field is deliberately outside the renderer-authored request object so JavaScript cannot nominate an arbitrary digest and have it treated as verified publication evidence.

The Python CLI validates the renderer/native request object before `_bind_verified_source_cache_namespace` may remove an unverified cache root or append the verified digest namespace. A valid local request without native source identity still has persisted caching disabled, but malformed `cacheRoot`, `localSource`, project, and other request fields fail through the existing canonical validation path instead of being hidden by cache scoping. This preserves the rule that transformation must not make an invalid request appear valid.

When the digest is present, persisted analysis and feature-cache paths are scoped below the verified source digest namespace. That prevents a path/name/size-addressed cache created for one verified byte sequence from being looked up under another verified source identity. The cache metadata and NPZ bytes are not yet cryptographically bound to one manifest, so this namespace is a prerequisite rather than completion of cache generation integrity.

## Alternatives rejected

Re-hashing `localSource.sourcePath` inside Python was rejected. It would create a second content-identity implementation below the already verified native publication boundary, add another full-file read on the analysis path, and reintroduce pathname replacement questions after native Resource Admission has already produced exact content evidence.

Using file name, path, size, modification time, inode, or another filesystem tuple as the generation key was rejected. Those values are useful admission evidence but do not identify file contents and do not solve same-size replacement.

Exposing `contentSha256` in renderer-visible `LocalAudioSource` was rejected. The browser-side request is not the authority that verified the app-owned publication, so reflecting the digest through that surface would make provenance easier to confuse without improving the native trust boundary.

Teaching `_bind_verified_source_cache_namespace` to recognize and selectively preserve every malformed request shape was rejected. That would duplicate `validate_analysis_job_request` and let the two validation contracts drift. Canonical validation therefore runs first; cache namespace binding consumes only an already validated request.

## Risks and follow-up

The in-memory native identity state is session-scoped. Restart/re-admission and Project Persistence still need the canonical path-free durable identity owned by the persistence lane. The cache manifest must fail closed when the exact source identity is unavailable rather than falling back to path/name/size.

The current digest namespace prevents cross-source lookup under a different verified digest, but it does not bind the existing `.features.json` and `.features.npz` pair into one crash-atomic generation, authenticate local cache contents, or prove MIR/source-separation accuracy. The next persistence change remains a versioned immutable manifest that binds the verified source identity, bounded metadata snapshot, and private NPZ replay snapshot.

## Exact evidence

- RED `be30f7156dc63371b4a9c19c377a2ac2a30fd144` requires local analysis startup to recover the native publication identity and carry a source-content digest toward the analysis boundary.
- Production `a9c1b436d2b26d7fcb5d0f58d515a5da0caee21c` recovers and cross-checks the retained identity, then adds its digest to the owned analysis-child JSON envelope.
- Intervening RED `6ce5e9587ea22cc84e589ba28c6146419a6f6f0b` and production `9472f99d10844f0cffdafbc8cb82be5d4b806362` scope persisted cache lookup to the verified source digest; `693ef8366ef62dec1235d86671b1da205dc8c545` adds fail-closed cache-scoping regressions.
- RED `d94f528ee3f73ea4808b3bb37dddc964870f2700` proves that cache-disable transformation could hide an invalid traversal `cacheRoot` before canonical request validation.
- Production `2edcfb71e98fbbc1a28954638351d230a7085cc9` validates the complete request before digest namespace binding, preserving canonical rejection while retaining cache disablement when verified source identity is absent.
- The pre-existing Resource Admission implementation computes SHA-256 over exactly the staged bytes, re-reads the published object, and requires the publication to reproduce the staging size/digest receipt before `LocalAudioPublicationIdentity` is minted.

## TRACEABILITY

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

NIST specifies SHA-256 as part of the SHA-2 family and describes message digests as a means to detect whether message contents differ from the contents used to generate the digest. NIST announced in 2023 that FIPS 180-4 will be revised, chiefly to remove SHA-1 and incorporate applicable guidance; that revision decision does not invalidate the SHA-256 content-identity use here. BandScope does not claim CAVP/FIPS module validation from using the specified algorithm.

MITRE. (2026). *CWE-22: Improper limitation of a pathname to a restricted directory (Path Traversal), CWE 4.20*. https://cwe.mitre.org/data/definitions/22.html

CWE-22 describes relative-path traversal through special elements such as `..`. BandScope's canonical request validator rejects traversal segments for app-owned cache roots. The repair above preserves that rejection by ensuring cache-disable transformation does not erase the field first.
