## 2024-06-10 - Vectorizing NumPy Array Variance

**Learning:** Computing the variance column-by-column inside a Python `for` loop over a NumPy array (`np.var(array[:, i])`) causes significant execution overhead.

**Action:** Precompute variance across the entire array along the specified axis (`np.var(array, axis=0)`) and access the result dynamically inside the loop. This can result in dramatic performance improvements (e.g., >20x speedup in this codebase).
