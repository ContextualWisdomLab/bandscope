## 2024-06-03 - NumPy Variance Overhead in Loops
**Learning:** Calling `np.var(array[:, i])` inside a Python for-loop creates massive overhead compared to pre-computing all variances with `np.var(array, axis=0)`. For arrays around 10,000 frames, vectorization provides a ~20x speedup in Python due to loop/dispatching overhead.
**Action:** When calculating statistics across an axis frame-by-frame inside a loop, always pre-compute the statistics in a single vectorized NumPy call outside the loop.
