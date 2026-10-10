# Architecture decision records

BandScope records durable architecture decisions in this directory.

## Status lifecycle

- `Proposed`: the decision is under implementation or still lacks exact-head production evidence.
- `Accepted`: the implementation, contracts, tests, security review, and production evidence all match the decision.
- `Superseded`: a later ADR replaces the decision without rewriting its history.
- `Rejected`: the decision was considered and deliberately not adopted.

A pull request, prototype, Storybook story, or passing unit test does not by itself make an ADR `Accepted`. The owning PR must satisfy the repository's protected current-head merge gate and preserve the stated decision in the shipped product.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-playable-stem-delivery-and-audition.md) | Proposed | Deliver locally generated stems through revocable native authority and add single-source audition before a synchronized multitrack mixer. |
