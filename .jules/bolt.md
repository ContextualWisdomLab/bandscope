## 2024-05-24 - RoleExtractor Loop N+1 Performance Optimization
**Learning:** Instantiating dictionaries with repeated heuristic calculation calls (like string allocations and string matching for 'setup note' or 'priority') inside a loop over many elements causes significant slowdowns.
**Action:** When providing mock implementations or repeated identical elements, hoist their creation outside the loop and share references or compute them exactly once.
