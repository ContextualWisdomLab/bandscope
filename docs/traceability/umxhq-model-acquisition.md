# Explicit UMX-HQ weight acquisition

Status: implemented in the Draft Distribution owner, not a commercial model release.
Owner: #1126 / #1180. Weight-rights evidence: #1181. Offline evaluator: #828 / #770.
Implementation baseline: `528ba04cbaf2228bd819e3313f06f849ab027fac`.

## Command

Use the repository's Node 22 build environment. No npm install, Python, torch,
external downloader executable, credentials or paid API is needed for this command.
The parent directory must already exist and be a trusted private build workspace.
Use a new destination for each attempt; an existing path is never overwritten.

First acquisition, explicitly accepting publisher-record bootstrap evidence:

```sh
node scripts/release/download_umxhq.mjs --bootstrap --output ../umxhq-candidate
```

After independently reviewing and retaining that acquisition receipt, repeat with
full SHA-256 pins and another new output directory:

```sh
node scripts/release/download_umxhq.mjs --pin ../umxhq-candidate/acquisition-receipt.json --output ../umxhq-reacquired
```

`--help` and module import perform no download. Missing, duplicate, conflicting or
unknown options fail before acquisition. There is no arbitrary URL/model option.
The command is not called by analysis, install hooks, or release packaging. CI runs
only its offline transport-fixture tests, not original-model downloads on each PR.

## Acquisition contract

The source record is fixed to `https://zenodo.org/api/records/3370489`, DOI
`10.5281/zenodo.3370489`, version `1.0.1`, and `metadata.license.id=mit-license`.
The four targets are fixed:

| Target | Original filename |
|---|---|
| vocals | `vocals-b62c91ce.pth` |
| bass | `bass-8d85a5bd.pth` |
| drums | `drums-9619578f.pth` |
| other | `other-b52fbbf7.pth` |

Download URLs are constructed exclusively under
`https://zenodo.org/records/3370489/files/`. The remote record's download URLs are
never followed. Training logs, ZIP files, UMXL, mirrors, Demucs and other models are
not acquisition targets. No checkpoint is imported, unpacked, deserialized or run.

Before accepting file bytes, the command requires the exact published size and
checks the legacy publisher MD5. It computes full SHA-256 incrementally while
writing the bounded stream. Pinned reacquisition additionally requires every full
SHA-256 and size from the separately supplied receipt. Record input is at most
1 MiB, each checkpoint at most 64 MiB, and the notice at most 16 KiB. A four-file
attempt therefore has an explicit bounded storage requirement, not an unbounded
cache. No transparent compression, redirects or retries are enabled.

**Bootstrap MD5 and the newly calculated SHA-256 are not independent publisher
signatures or commercial-release admission.** The first receipt is an observation
of an authenticated HTTPS acquisition. Review and retain its full hashes before
using `--pin`. A subsequent hash match proves byte identity relative to those pins,
not quality, licensor authority, training-data rights or absence of runtime bugs.

## Rights and notices

The model-weight permission basis is the original Zenodo model record, not the
source repository's code license inferred to cover every checkpoint. Preserve
`zenodo-record.json` and its SHA-256 as the retrieved weight-license evidence.
The public MIT grant does not require a separate OEM negotiation; normal license
obligations, third-party rights and the lack of indemnity remain distinct.

The command also acquires and verifies the actual upstream notice at:

`https://raw.githubusercontent.com/sigsep/open-unmix-pytorch/814f144e34b2d1ed517eb605ce928dcb838abbed/LICENSE`

Its SHA-256 is
`4f7b047ffafb9fbb39a40d605bab961b9b030711addce6e9d23886c2ae3b105e`.
`scripts/release/fixtures/openunmix-LICENSE.txt` preserves those exact notice bytes
for the offline contract tests. The notice preserves Inria's named 2019 copyright
and full permission/warranty text. Do not substitute it for the separate Zenodo
weight-license record or extend it to UMXL.

## Output and offline evaluator handoff

A successful directory contains four `.pth` files, `zenodo-record.json`,
`LICENSE.openunmix`, and `acquisition-receipt.json`; no `INCOMPLETE` marker remains.
The receipt's `checkpoints` mapping uses the same target names and
`filename`, `size_bytes`, `sha256` fields as #828's `CheckpointReceipt`.
Its `record_kind` is `candidate_acquisition_receipt_not_release_manifest` and
`release_admitted` is always `false`. It does not modify the checked-in candidate
coordinates, production model policy, supplemental shipped inventory or default
model. No code in this change bypasses the existing release preflight.

The consumer must reject a directory with an `INCOMPLETE` marker or missing receipt,
reverify local file bytes against independently reviewed pins and retain the
existing descriptor/path controls before passing immutable bytes to the evaluator.
No missing-file recovery path inside inference may invoke this acquisition command.

## Interruption, failure and retry

SIGINT/SIGTERM cancel the request and bounded stream; cancellation exits 130.
Other acquisition errors exit 1; argument errors exit 2. Failure diagnostics omit
provider payloads, local paths and credentials. Files are created exclusively with
restrictive permissions and published with no-overwrite hard links, then the
partial pathname is removed. Unsupported filesystem operations fail closed.

Incomplete attempts retain an `INCOMPLETE` marker and may retain bounded `.part`
files for inspection. They are never reused as successful cache entries. No
recursive deletion, overwrite, silent resume or retry occurs. Inspect/remove only
the failed attempt you own, or choose a new private destination. A process/power
failure around receipt publication is not success while `INCOMPLETE` remains.
This tool does not claim crash-proof directory durability or protection against a
host administrator or malicious same-user process replacing ancestor directories.

## Implementation boundary and removal condition

This dependency-free Node command is a **build/qualification acquisition tool**,
using the already-required Node build environment and its built-in TLS/crypto/files.
It adds no desktop runtime, no Python downloader, no package-manager dependency,
no model binary to Git, and no lockfile exception. The production HTTP/downloader,
update admission and filesystem authority remain the existing Rust Distribution
components. It must never become a second application networking implementation.
When the released Rust acquisition API covers this bootstrap task, delegate this
command to that owner and retire its build-only transport while preserving the
same exact-source, pinning and negative-test contracts.

## Security Notes

### Attack surface

Publisher metadata and byte streams, TLS process state, output paths, local pin
files, cancellation and interrupted writes.

### Trust boundary

Explicit operator/build-host acquisition is separate from model loading, scientific
acceptance and commercial release. The build host and private parent workspace
are trusted. Remote links and model bytes are data, never executable instructions.

### Mitigations

Fixed source URLs; explicit TLS certificate verification with built-in roots and
no shared/proxy agent; direct 200 responses only; byte/content-encoding checks;
complete four-target schema; descriptor-bound bounded pin reads; exclusive output;
path-identity checks; no-overwrite file publication; mandatory receipt/marker
protocol; full SHA-256 pins for reacquisition; no inference or release-policy writes.

### Remaining risks

First acquisition relies on publisher HTTPS and metadata, not a signed full-digest
release manifest. MD5 is only legacy consistency evidence. Same-user/admin races,
filesystem crash durability, full native packaging and actual pretrained quality
remain outside this tool's claims. Node/runtime vulnerabilities still require the
existing supply-chain and native build gates; they are not waived here.

### Test points

Run `node --test scripts/release/download_umxhq.test.mjs scripts/release/download_umxhq_cli.test.mjs`.
The existing `.github/workflows/ci.yml` Distribution-download matrix runs this same
command on Linux, Windows and macOS before its existing Rust tests. Fixtures test
success, SHA-256-pinned reacquisition, corruption/truncation/overflow, bad metadata,
redirect/compression/HTML/rate-limit responses, cancellation, path substitution,
pin-file races, notice tampering, CLI dispatch and no-overwrite behavior. No fixture
is a real pretrained model or source-separation quality result.
