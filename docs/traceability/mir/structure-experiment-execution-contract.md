# Structure experiment execution contract

Status: Proposed  
Owner: Signal-MIR Analysis  
Tracking: #1225, #1228  
Parent: `docs/traceability/mir/structure-feature-noninferiority.md`

## Problem

The structure preregistration already required `runtime.host_profile`, while `isolated-single-shot-v1` makes latency and peak-RSS part of the production decision. The corpus-admission runtime check, however, verified source commit, `uv.lock`, Python, librosa, and NumPy only. `runtime.host_profile` was accepted as non-empty text and was never compared with the machine that actually executed the CQT/STFT performance measurements.

That gap is material. A receipt could truthfully bind source and dependency versions while describing an arbitrary host label unrelated to the executing CPU/model/OS. Because the decision contains a candidate/baseline latency-ratio gate, the host is part of the scientific condition rather than descriptive metadata.

A second gap followed from the same boundary: repository-owned pieces existed for corpus admission, admitted-track quality/performance evidence, track receipt construction, paired aggregation, and result admission, but no single canonical command joined those owners into one path-free execution envelope. An experiment operator could therefore reconstruct the chain manually after each owner returned.

## Decision

`run_structure_noninferiority_experiment.py` is the canonical orchestration boundary for a complete registered run. It does not duplicate MIR, admission, aggregation, or decision logic. It calls the existing owners in this order:

1. validate the scientific registration and require a content-addressed execution-host identity;
2. compare that identity with the current host before corpus admission or candidate measurement;
3. admit the registered local corpus and pass only the immutable admitted PCM/annotation handoff to the canonical CQT/STFT consumer;
4. require the consumer evidence to match the corpus receipt on track ID, decoded-PCM SHA-256, annotation SHA-256, decoded frame count, and sample rate;
5. obtain schema-v1 track receipts from the existing canonical adapter;
6. compute macro-track/paired-bootstrap summaries through the existing aggregator;
7. evaluate the complete result through the existing metric-aware validator; and
8. atomically publish one path-free execution envelope containing the host evidence, corpus receipt, result, and decision.

The runner preserves the existing owner boundaries. `verify_structure_corpus.py` remains the Audio Ingestion/Resource Admission owner, `evaluate_admitted_structure_track.py` remains the Signal-MIR track-evidence owner, `aggregate_structure_noninferiority.py` remains the aggregation/uncertainty owner, and `validate_structure_noninferiority.py` remains the result-admission owner.

## `structure-performance-host-v1`

Canonical execution requires `registration.runtime.host_profile` to be:

`structure-performance-host-v1:<sha256>`

The digest is SHA-256 over compact, sorted UTF-8 JSON containing exactly:

- contract ID;
- platform (`darwin` or `win32`);
- OS release;
- OS version/build string;
- process architecture/machine;
- hardware product model;
- CPU model string; and
- logical CPU count.

The profile deliberately excludes hostname/computer name, account/user identity, hardware serial numbers, MAC addresses, IP addresses, filesystem paths, and other identifiers that are unnecessary to reproduce the CQT/STFT performance condition. This is a purpose-bound scientific host identity, not a device inventory record.

On macOS, hardware values are read dynamically with `/usr/sbin/sysctl -n hw.model` and `machdep.cpu.brand_string`. Apple recommends obtaining system/hardware details dynamically and using `sysctl`/`sysctlbyname` when a global variable is unavailable, because architectural and hardware differences can affect program behavior. The command is invoked as an argument array with `shell=False` and a bounded timeout.

On Windows, the runner reads machine-level hardware model and processor-model strings from the local registry and combines them with the OS/build and process architecture. Microsoft documents processor identity as machine-level registry information and warns that architecture alone does not distinguish processor type, so the contract does not treat `platform.machine()` as a complete CPU identity.

Unsupported operating systems fail closed because `isolated-single-shot-v1` itself admits performance evidence only on macOS and Windows.

## Preregistration workflow

The concrete host-profile payload must be captured and reviewed before candidate results are inspected. Its canonical JSON representation is the human-reviewable evidence; `runtime.host_profile` stores the corresponding content address so the registration digest binds that exact payload without storing machine-identifying fields that are irrelevant to the claim.

At execution, the runner captures the host again and requires exact content-address equality before it opens corpus material. A free-form label such as `registered-cpu-host-v1` is not accepted by the canonical execution path. Likewise, a valid content address for a different Mac/Windows hardware/OS profile fails before corpus admission.

The lower-level registration/result validator remains reusable for historical/schema validation; the stricter host identity is an execution prerequisite owned by this runner. Running corpus admission alone does not authorize latency/RSS evidence or a production feature decision.

## RED → GREEN lineage

- RED `7a90b922c0f64090f1ac2717e9afc0369503bd58` introduced an execution-contract regression requiring preregistered/observed host mismatch to fail before corpus admission and requiring the host identity to exclude hostname/user fields.
- GREEN `70b86022323728c6b3f85d5f14468423ebf15478` added the canonical execution owner, content-addressed host profile, macOS/Windows host capture, admission-to-evidence identity checks, canonical result construction, and atomic execution envelope.
- RED `f1a6971ff7f60af993c05455e40ccc6d57ab593e` made the free-form host-label gap explicit at the canonical execution preregistration boundary.
- GREEN `a31bebd79d88b940c9f96517d02f7c0364fac485` added `validate_execution_registration()` and made host-contract validation part of execution admission; `7b07c00d9ee8c7ddbb24f3a65bd62aa1e22c05c4` aligned the regression with that public execution boundary.

Synthetic host profiles in these tests prove fail-closed mechanics only. They are not scientific host evidence and cannot substitute for the real profile captured on the machine selected for the preregistered experiment.

## Rejected alternatives

**Trust a descriptive host label.** Rejected because a label such as `registered-cpu-host-v1` does not establish that the observed experiment host is the preregistered machine class.

**Use hostname, serial number, MAC address, or account identity as the host key.** Rejected because those fields add privacy/operational identity without improving the CQT/STFT performance claim. They are not stable scientific hardware descriptors and are outside the purpose-bound evidence contract.

**Let corpus admission authorize performance evidence.** Rejected because corpus admission proves source/runtime/audio identities, not that the performance worker ran on the frozen host. It remains reusable independently, while the experiment runner owns the stronger cross-boundary invariant.

**Reimplement admission, MIR metrics, aggregation, or decision logic in the runner.** Rejected because that would create a second scientific owner and allow semantic drift. The runner composes released/current repository owners and verifies their handoffs instead.

**Write partial result files after each successful track.** Rejected for schema v1 because there is no registered dropout/exclusion policy and a partial complete-case result could be mistaken for the frozen corpus. A future crash-resume/checkpoint contract would need versioned semantics that preserve failed/incomplete track identity without changing the sampling population.

## Security and privacy notes

- Corpus paths remain local to Resource Admission and are not emitted by the execution envelope.
- The host payload contains hardware/OS characteristics needed for scientific reproducibility but excludes direct machine/account/network identifiers.
- macOS host probing invokes an exact repository-selected system binary and fixed selectors; there is no user-controlled command or shell string.
- Windows host probing reads fixed local registry paths/names; it does not write registry state or perform network discovery.
- The execution envelope is atomically published using the existing receipt writer. It contains content identities and scientific evidence, not licensed audio bytes.
- Host identity is a reproducibility condition, not an authentication or anti-tamper primitive. Protected source identity, clean worktree enforcement, runtime locks, and normal release provenance remain separate controls.

## Claim boundary and remaining work

This repair closes the specific ability to claim one preregistered performance host while executing the canonical CQT/STFT measurement on another, and it gives the experiment one repository-owned end-to-end execution path.

It does not make the host perfectly stationary. CPU frequency, thermal state, scheduler contention, filesystem/page cache, power policy, and background workload may vary within one content-addressed profile. Those effects remain part of the scientific review and claim boundary; the existing alternating lane order limits deterministic ordering bias but does not remove host-state variance.

Before a rights-cleared real-audio run, reviewers still must freeze and approve the concrete corpus membership/representativeness, numeric quality noninferiority margins, maximum candidate latency ratio, bootstrap resample count/seed, the actual host-profile payload and content address, and the population/runtime claim. The corpus size and paired-inference plan must be judged adequate for that claim. Candidate results must not be inspected before those choices are frozen.

A production `chroma_cqt` → `chroma_stft` switch remains a separate reviewed change after the complete registered experiment passes and current protected-head CI/security/release gates are satisfied.

## References

Apple Inc. (n.d.). *Addressing architectural differences in your macOS code*. Apple Developer Documentation. https://developer.apple.com/documentation/apple-silicon/addressing-architectural-differences-in-your-macos-code

Apple Inc. (n.d.). *sysctl*. Apple Developer Documentation. https://developer.apple.com/documentation/kernel/sys

Microsoft. (n.d.). *How to determine the type of processor that your computer uses*. Microsoft Learn. https://learn.microsoft.com/en-us/troubleshoot/windows-server/setup-upgrade-and-drivers/determine-the-type-of-processor
