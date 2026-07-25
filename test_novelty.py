import numpy as np

def _checkerboard_novelty_reference_old(
    ssm: np.ndarray,
    kernel_size: int = 64,
) -> np.ndarray:
    n = ssm.shape[0]
    half = kernel_size // 2
    novelty = np.zeros(n, dtype=np.float64)

    if n < kernel_size:
        return novelty

    kernel = np.ones((kernel_size, kernel_size), dtype=np.float64)
    kernel[:half, :half] = -1.0
    kernel[half:, half:] = -1.0

    valid = novelty[half : n - half]
    for di in range(-half, half):
        for dj in range(-half, half):
            value = kernel[di + half, dj + half]
            diagonal = np.diagonal(ssm[half + di : n - half + di, half + dj : n - half + dj])
            if value > 0:
                valid += diagonal
            else:
                valid -= diagonal

    max_val = np.max(np.abs(novelty))
    if max_val > 0:
        novelty = novelty / max_val

    return novelty

# Let's test with odd kernel_size
try:
    _checkerboard_novelty_reference_old(np.random.rand(100, 100), 65)
except Exception as e:
    print(f"Old fails with: {e}")
