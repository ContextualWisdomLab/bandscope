# BandScope Commercial Model

This model is a buyer-data-room artifact for the 20억 KRW sale-readiness
program. It is not a valuation claim. It defines the minimum bottom-up evidence
needed before BandScope can credibly discuss ARR in the 3-5억 KRW range.

## Decision Frame

BandScope is sale-discussion-ready only when a reviewer can connect product
evidence to a repeatable paid workflow:

- a buyer-demo can be completed in 15 minutes
- pilot teams can explain the rehearsal pain BandScope removes
- export artifacts are useful enough to support a recurring team workflow
- security and release evidence are clean enough for desktop distribution
- the ARR model is based on named pilot conversion assumptions, not broad market
  language

## Bottom-Up ARR Formula

```text
annual_recurring_revenue =
  paid_team_count * annual_contract_value_krw * retained_account_rate
```

Use this simple formula until real billing data exists. Do not replace it with a
larger market-size story unless the model is backed by actual customer or buyer
pipeline evidence.

## Scenario Table

| Scenario | Paid teams | Annual contract value | Retained account rate | ARR |
| --- | ---: | ---: | ---: | ---: |
| Proof floor | 75 | 5,000,000 KRW | 80% | 300,000,000 KRW |
| Target case | 100 | 5,000,000 KRW | 80% | 400,000,000 KRW |
| Strong case | 125 | 5,000,000 KRW | 80% | 500,000,000 KRW |

The 20억 KRW discussion is more defensible when BandScope can show a credible
path from current pilots to the target case. Until pilot evidence exists, this
table is `presence-only` commercial evidence.

## Required Evidence

| Evidence | Owner source | Final validation |
| --- | --- | --- |
| Buyer-demo proof | Product Design screenshots and demo notes | Empty, selected, loading, error, ready, export, and mobile states captured without Figma Code Connect. |
| Pilot proof | `docs/business/pilot-evidence-template.md` records | 3-5 named or safely aliased pilot teams with date, workflow, result, and acceptance note. |
| Product value proof | Product PRs for BPM, practice progress, role guidance, section roadmap, and export | Merged to `develop` with current-head checks and screenshots. |
| Release proof | GitHub release/build evidence | SBOM, checksum or manifest sidecars, Windows/macOS build evidence, and redacted export behavior. |
| Security proof | GitHub alerts and policy docs | Dependabot open alerts 0, code scanning closed or dispositioned, OpenSSF project 13428 completed. |

## Guardrails

- Do not cite this model as achieved ARR.
- Do not commit private customer names, private audio, contracts, emails, or
  unreleased song metadata.
- Use customer aliases when pilot consent is not explicit.
- Keep churn, price, and conversion assumptions visible; do not hide them in a
  spreadsheet.
- Treat every row as provisional until a named validation path exists.

## Open Gaps

- No pilot record has been validated in this repository yet.
- No Product Design screenshot set has been captured for the full buyer-demo
  state matrix.
- The OpenSSF Best Practices project remains externally incomplete.
- Current product PRs still need to merge and be rechecked on `develop`.
