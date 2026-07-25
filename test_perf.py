import numpy as np
import time

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

def _checkerboard_novelty_reference_new(
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

    from numpy.lib.stride_tricks import sliding_window_view
    windows = sliding_window_view(ssm, (kernel_size, kernel_size))
    # n-K+1 elements.
    diag_windows = np.diagonal(windows, axis1=0, axis2=1)

    num_elements = n - 2 * half
    diag_windows = diag_windows[:, :, :num_elements]

    valid = np.einsum('ij,ijk->k', kernel, diag_windows)

    novelty[half : n - half] = valid

    max_val = np.max(np.abs(novelty))
    if max_val > 0:
        novelty = novelty / max_val

    return novelty

# Let's check with smaller matrix and random data
ssm = np.random.rand(500, 500)
kernel_size = 64

t0 = time.time()
r1 = _checkerboard_novelty_reference_old(ssm, kernel_size)
t1 = time.time()
print(f"Old: {t1-t0:.4f}s")

t0 = time.time()
r2 = _checkerboard_novelty_reference_new(ssm, kernel_size)
t1 = time.time()
print(f"New: {t1-t0:.4f}s")

print("Match:", np.allclose(r1, r2))
