"""Register-overlap (density warning) detection between separated stems.

Computes real frequency-register overlap between stem pairs so that density
warnings ("competing in the low register") are derived from the audio itself
instead of fabricated fixed strings. A dense overlap between two pitched
instruments in the same register drives rehearsal priority in the BandScope
domain model.

Stems follow the AudioStemSeparator convention used across ``roles``:
``{"vocals": np.ndarray, "bass": ..., "drums": ..., "other": ...}`` with mono
float arrays at a common sample rate.

Security Notes:
- Operates only on in-memory numpy arrays; no file I/O or network access.
- Canonical orchestration owns audio-size, stem-count, memory, CPU/GPU, and
  cancellation admission policy before feature analyzers execute.
- Fails safe: empty, silent, or malformed stems produce an empty result and
  no exception escapes the public functions.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from numpy.typing import NDArray

logger = logging.getLogger(__name__)

# Frequency bands (Hz) used for pitched-register analysis.
BANDS: dict[str, tuple[float, float]] = {
    "low": (40.0, 250.0),
    "mid": (250.0, 2000.0),
    "high": (2000.0, 8000.0),
}
_BAND_ORDER = {band: index for index, band in enumerate(BANDS)}

# Drums are excluded from pitched-register analysis: percussion is broadband
# (energy is spread across the spectrum by transients and noise), so band
# shares do not indicate a pitched register competing with another instrument.
UNPITCHED_STEMS = frozenset({"drums"})

# Minimum fraction of a stem's spectral energy in a band for it to count as
# occupying that register.
DEFAULT_THRESHOLD = 0.35

# Display names keep 4-stem honesty: htdemucs `other` is mixed accompaniment,
# not a named keyboard or guitar part.
_STEM_DISPLAY_NAMES = {
    "vocals": "Lead Vocal",
    "bass": "Bass Guitar",
    "other": "accompaniment",
}
# Role assignment is narrower than display naming. The mixed `other` stem may
# be named as accompaniment in copy, but it cannot establish whether a keyboard
# hand or guitar caused the overlap. Attach warnings only to stems with an
# unambiguous role identity; the opposite mixed side remains role-agnostic.
_STEM_TO_ROLE_IDS = {
    "vocals": ("lead-vocal",),
    "bass": ("bass-guitar",),
    "other": (),
}
_BAND_LABELS = {
    "low": "low register",
    "mid": "mid register",
    "high": "high register",
}


def band_energy_profile(
    audio: NDArray[np.floating[Any]],
    sr: int,
) -> dict[str, float]:
    """Compute the fraction of a stem's spectral energy in each register band.

    Energy is the magnitude-squared of the real FFT summed over the bins that
    fall inside each band defined in :data:`BANDS`. Resource admission is a
    canonical orchestration concern; this feature consumes the accepted audio
    artifact without inventing a second sample-count ceiling.

    Args:
        audio: Mono float audio samples for one stem.
        sr: Sample rate in Hz.

    Returns:
        Dict mapping band name ("low", "mid", "high") to the fraction of the
        stem's total spectral energy in that band. All fractions are 0.0 when
        the stem is empty or has zero total energy.
    """
    zero_profile = {band: 0.0 for band in BANDS}

    if not isinstance(audio, np.ndarray) or audio.size == 0 or sr <= 0:
        return zero_profile

    spectrum = np.abs(np.fft.rfft(audio.astype(np.float64))) ** 2
    freqs = np.fft.rfftfreq(audio.size, d=1.0 / sr)

    total = float(np.sum(spectrum))
    if total <= 0.0 or not np.isfinite(total):
        return zero_profile

    return {
        band: float(np.sum(spectrum[(freqs >= lo) & (freqs < hi)]) / total)
        for band, (lo, hi) in BANDS.items()
    }


def detect_register_overlap(
    stems: dict[str, NDArray[np.floating[Any]]],
    sr: int,
    threshold: float = DEFAULT_THRESHOLD,
) -> list[dict[str, Any]]:
    """Detect register overlaps (density warnings) between pitched stems.

    For each pair of different pitched stems, an overlap is reported for every
    band in which both stems concentrate at least ``threshold`` of their
    spectral energy. Drums are excluded (see :data:`UNPITCHED_STEMS`): as a
    broadband percussion source they do not occupy a pitched register.
    Resource admission is owned by canonical orchestration rather than a
    feature-local stem-count ceiling.

    Args:
        stems: Dict mapping stem names to mono float audio arrays.
        sr: Common sample rate in Hz.
        threshold: Minimum energy fraction for a stem to occupy a band. Values
            outside the finite ``0.0..1.0`` range fail safe with no overlaps.

    Returns:
        List of overlap records ``{"stem_a", "stem_b", "band", "severity"}``
        where ``severity`` is the smaller of the two energy shares rounded to
        two decimals. Pairs are ordered alphabetically (stem_a < stem_b), the
        list is sorted by severity descending, and equal-severity records keep
        alphabetical pair order followed by the declared :data:`BANDS` order.
        Empty when fewer than two pitched stems have positive band energy, the
        threshold is invalid, or any internal failure occurs.
    """
    try:
        if isinstance(threshold, bool):
            return []
        threshold_value = float(threshold)
        if not np.isfinite(threshold_value) or not 0.0 <= threshold_value <= 1.0:
            return []

        pitched = sorted(name for name in stems if name not in UNPITCHED_STEMS)
        profiles = {name: band_energy_profile(stems[name], sr) for name in pitched}

        overlaps: list[dict[str, Any]] = []
        for band in BANDS:
            active_stems = [
                (stem, profiles[stem][band])
                for stem in pitched
                if profiles[stem][band] > 0.0 and profiles[stem][band] >= threshold_value
            ]
            for i, (stem_a, share_a) in enumerate(active_stems):
                for stem_b, share_b in active_stems[i + 1 :]:
                    overlaps.append(
                        {
                            "stem_a": stem_a,
                            "stem_b": stem_b,
                            "band": band,
                            "severity": round(min(share_a, share_b), 2),
                        }
                    )

        # Preserve the pre-optimization stable tie order: alphabetical pairs,
        # then the declared register-band order rather than lexical band names.
        overlaps.sort(
            key=lambda item: (
                -float(item["severity"]),
                item["stem_a"],
                item["stem_b"],
                _BAND_ORDER[str(item["band"])],
            )
        )
        return overlaps
    except Exception:  # pragma: no cover - defensive fail-safe path
        logger.warning("Register-overlap detection failed; returning no overlaps.", exc_info=True)
        return []


def slice_stems_to_window(
    stems: dict[str, Any],
    start_sec: float,
    end_sec: float,
    sr: int,
) -> dict[str, NDArray[np.floating[Any]]]:
    """Slice each stem to one section window without inventing samples.

    Args:
        stems: Dict mapping stem names to mono float audio arrays.
        start_sec: Inclusive window start in seconds.
        end_sec: Exclusive window end in seconds.
        sr: Sample rate in Hz.

    Returns:
        A new stem dict cropped to the window. Invalid windows, non-positive
        sample rates, or non-array values become empty arrays so later FFT
        work fails closed instead of using the whole song by accident.
    """
    empty = np.array([], dtype=np.float64)
    if sr <= 0 or not np.isfinite(start_sec) or not np.isfinite(end_sec) or end_sec <= start_sec:
        return {name: empty.copy() for name in stems}

    start_sample = max(0, int(start_sec * sr))
    end_sample = max(0, int(end_sec * sr))
    if end_sample <= start_sample:
        return {name: empty.copy() for name in stems}

    windowed: dict[str, NDArray[np.floating[Any]]] = {}
    for name, audio in stems.items():
        if not isinstance(audio, np.ndarray) or audio.size == 0:
            windowed[name] = empty.copy()
            continue
        low_index = min(start_sample, int(audio.size))
        high_index = min(end_sample, int(audio.size))
        if high_index <= low_index:
            windowed[name] = empty.copy()
            continue
        windowed[name] = audio[low_index:high_index]
    return windowed


def format_overlap_warnings(overlaps: list[dict[str, Any]]) -> dict[str, list[str]]:
    """Turn measured overlap records into next-action rehearsal warnings.

    Args:
        overlaps: Records from :func:`detect_register_overlap`.

    Returns:
        Mapping of unambiguous role ids to de-duplicated warning strings.
        Unknown stems or bands are omitted. Mixed accompaniment may appear in
        the message text but never authorizes assigning that observation to a
        named keyboard hand or guitar role.
    """
    warnings: dict[str, list[str]] = {}
    for record in overlaps:
        stem_a = str(record.get("stem_a", ""))
        stem_b = str(record.get("stem_b", ""))
        band = str(record.get("band", ""))
        name_a = _STEM_DISPLAY_NAMES.get(stem_a)
        name_b = _STEM_DISPLAY_NAMES.get(stem_b)
        band_label = _BAND_LABELS.get(band)
        if name_a is None or name_b is None or band_label is None:
            continue
        message = (
            f"The {band_label} is crowded between {name_a} and {name_b}. "
            "Thin one part in this section so players can hear their cue."
        )
        for role_id in (*_STEM_TO_ROLE_IDS[stem_a], *_STEM_TO_ROLE_IDS[stem_b]):
            bucket = warnings.setdefault(role_id, [])
            if message not in bucket:
                bucket.append(message)
    return warnings
