## 2024-11-13 - Mock Object State Mutations

**Learning:** When simulating async operations with `setTimeout` that mutate a mock object's state in arrays, finding the object by its ID inside every callback creates an O(N) traversal.

**Action:** Caching the object reference initially and directly mutating it inside the async callbacks completely removes the O(N) traversals. Object.assign() or direct property assignments can be used safely to mutate the state without lookup penalties.
