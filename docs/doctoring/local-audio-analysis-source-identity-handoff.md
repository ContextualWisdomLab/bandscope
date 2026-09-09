# Local-audio analysis source identity handoff

## Problem

BandScope already verifies the app-owned `source.<extension>` publication against the native staging receipt and retains a path-free `LocalAudioPublicationIdentity` containing the exact byte length and lowercase SHA-256 digest. Before this repair, `start_analysis_job` recovered only the renderer-hidden bootstrap path/name/size tuple. The verified content identity stayed in native state and never crossed the owned analysis-child boundary, so a future feature-cache generation could not bind itself to the exact publication that Resource Admission had verified.

This is an authority-drop defect rather than a hash-algorithm defect. Path, display name, extension, and byte length are insufficient content identity: two different files can share all four values.

## Constraints

- The renderer must not gain the content digest as a new authority. The digest is retrieved only from `LocalAudioPublicationIdentityState`, keyed by the BandScope-minted project id.
- Resource Admission remains the owner of the verified publication receipt. Project Persistence may consume that path-free identity, but this repair does not duplicate `sourceReference` or persistence schema owned by #970.
- A digest is integrity/identity evidence, not authenticity. An attacker who can replace both an artifact and an unauthenticated digest can recompute SHA-256. No MAC, signature, FIPS 140 validation, or tamper-proof cache claim is made here.
- The analysis child receives the digest in the native JSON job envelope. The current Python feature-cache reader does not yet consume that envelope field; the versioned immutable cache manifest remains the next persistence change.

## Decision

`start_analysis_job` now requires the native publication identity for local-audio jobs before it grants analysis authority. It cross-checks the retained identity against the native bootstrap source size, extension, and app-owned artifact name. A missing or contradictory identity fails before the job slot is acquired.

The owned child-process JSON envelope carries `sourceContentSha256` only when that verified native identity exists. Demo jobs remain unchanged. The field is deliberately outside the renderer-authored request object so JavaScript cannot nominate an arbitrary digest and have it treated as verified publication evidence.

This creates the typed trust seam required by the next feature-cache manifest without prematurely introducing a second source-identity owner. The next change must validate and bind this digest with one versioned metadata/NPZ generation before cache replay; until then, no cache-hit correctness claim is derived from the new envelope field.

## Alternatives rejected

Re-hashing `localSource.sourcePath` inside Python was rejected. It would create a second content-identity implementation below the already verified native publication boundary, add another full-file read on the analysis path, and reintroduce pathname replacement questions after native Resource Admission has already produced exact content evidence.

Using file name, path, size, modification time, inode, or another filesystem tuple as the generation key was rejected. Those values are useful admission evidence but do not identify file contents and do not solve same-size replacement.

Exposing `contentSha256` in renderer-visible `LocalAudioSource` was rejected. The browser-side request is not the authority that verified the app-owned publication, so reflecting the digest through that surface would make provenance easier to confuse without improving the native trust boundary.

## Risks and follow-up

The in-memory native identity state is session-scoped. Restart/re-admission and Project Persistence still need the canonical path-free durable identity owned by the persistence lane. The cache manifest must fail closed when the exact source identity is unavailable rather than falling back to path/name/size.

The current top-level analysis envelope field is a prerequisite, not the completed manifest. It does not bind the existing `.features.json` and `.features.npz` pair, provide crash-atomic multi-file publication, authenticate local cache contents, or prove MIR/source-separation accuracy.

## Exact evidence

- RED: `be30f7156dc63371b4a9c19c377a2ac2a30fd144` requires local analysis startup to recover the native publication identity and carry a source-content digest toward the analysis boundary.
- Production: `a9c1b436d2b26d7fcb5d0f58d515a5da0caee21c` recovers and cross-checks the retained identity, then adds its digest to the owned analysis-child JSON envelope.
- The pre-existing Resource Admission implementation computes SHA-256 over exactly the staged bytes, re-reads the published object, and requires the publication to reproduce the staging size/digest receipt before `LocalAudioPublicationIdentity` is minted.

## TRACEABILITY

National Institute of Standards and Technology. (2015). *Secure Hash Standard (SHS)* (FIPS PUB 180-4). https://doi.org/10.6028/NIST.FIPS.180-4

NIST specifies SHA-256 as part of the SHA-2 family and describes message digests as a means to detect whether message contents differ from the contents used to generate the digest. NIST announced in 2023 that FIPS 180-4 will be revised, chiefly to remove SHA-1 and incorporate applicable guidance; that revision decision does not invalidate the SHA-256 content-identity use here. BandScope does not claim CAVP/FIPS module validation from using the specified algorithm.