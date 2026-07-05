"""Separation-quality characterization for the local stem separator.

These tests measure how well :class:`AudioStemSeparator` recovers *known*
source signals from a mixture, using signals whose ground truth we control.

Important: the current separator is a frequency-band FFT heuristic, not a
neural source-separation model. It routes energy by frequency band, so a
real instrument (whose harmonics span several bands) is split across stems
rather than isolated. These tests pin that behaviour with concrete numbers.
They are characterization/regression guards, NOT a quality bar — if a real
model (e.g. demucs) is introduced, SI-SDR will rise well past these bounds
and these assertions should be re-baselined.
"""

from __future__ import annotations

import numpy as np
import soundfile as sf

from bandscope_analysis.separation.audio_separator import (
    AudioSeparationConfig,
    AudioStemSeparator,
)

_SR = 22_050


def _si_sdr(estimate: np.ndarray, reference: np.ndarray) -> float:
    """Scale-invariant SDR in dB (higher = closer to the reference source)."""
    estimate = estimate - float(np.mean(estimate))
    reference = reference - float(np.mean(reference))
    scale = float(np.dot(estimate, reference)) / (float(np.dot(reference, reference)) + 1e-12)
    projection = scale * reference
    noise = estimate - projection
    return float(
        10.0
        * np.log10(
            (float(np.dot(projection, projection)) + 1e-12) / (float(np.dot(noise, noise)) + 1e-12)
        )
    )


def _harmonic_bass(times: np.ndarray, f0: float = 82.0, harmonics: int = 8) -> np.ndarray:
    """A bass note with harmonics that cross the separator's band boundaries."""
    signal = np.zeros_like(times)
    for k in range(1, harmonics + 1):
        signal += (1.0 / k) * np.sin(2 * np.pi * f0 * k * times)
    return signal / float(np.max(np.abs(signal)))


def _config(duration_seconds: float) -> AudioSeparationConfig:
    return AudioSeparationConfig(
        target_sample_rate=_SR,
        chunk_duration_seconds=duration_seconds,
        max_duration_seconds=duration_seconds + 1.0,
        max_file_bytes=8_000_000,
    )


def test_recovered_bass_is_not_high_fidelity_isolation(tmp_path) -> None:
    """A real bass source is only partially recovered (band-split, not separation)."""
    duration = 1.0
    times = np.arange(int(_SR * duration), dtype=np.float32) / _SR
    true_bass = _harmonic_bass(times)
    true_vocal = np.sin(2 * np.pi * 440.0 * times) + 0.5 * np.sin(2 * np.pi * 880.0 * times)
    true_vocal /= float(np.max(np.abs(true_vocal)))
    mix = (0.6 * true_bass + 0.6 * true_vocal).astype(np.float32)

    audio_path = tmp_path / "mix.wav"
    sf.write(audio_path, mix, _SR)

    result = AudioStemSeparator(_config(duration)).separate(audio_path)
    bass_stem = result["stems"]["bass"]
    length = min(bass_stem.size, true_bass.size)

    si_sdr = _si_sdr(bass_stem[:length], (0.6 * true_bass[:length]).astype(np.float64))

    # It keeps the in-band portion (positive) but is far from clean isolation.
    # A neural separator would clear ~20 dB on a signal this simple; the band
    # heuristic does not. Re-baseline this upper bound if a real model lands.
    assert si_sdr > 0.0
    assert si_sdr < 18.0


def test_bass_source_energy_leaks_across_stems(tmp_path) -> None:
    """Harmonics of a single source spread across stems, proving band-splitting."""
    duration = 1.0
    times = np.arange(int(_SR * duration), dtype=np.float32) / _SR
    bass_only = (0.6 * _harmonic_bass(times)).astype(np.float32)

    audio_path = tmp_path / "bass_only.wav"
    sf.write(audio_path, bass_only, _SR)

    stems = AudioStemSeparator(_config(duration)).separate(audio_path)["stems"]
    energy = {name: float(np.sum(stem.astype(np.float64) ** 2)) for name, stem in stems.items()}
    total = sum(energy.values()) + 1e-12
    leaked_fraction = 1.0 - energy["bass"] / total

    # A true source separator would keep ~all of a lone bass in the bass stem.
    # This heuristic leaks a meaningful share into other stems (measured ~11%).
    assert leaked_fraction >= 0.05


def test_realistic_mix_scores_far_below_usable_separation(tmp_path) -> None:
    """On overlapping instruments + broadband drums, mean SI-SDR is negative.

    A realistic band (bass/keys/voice whose harmonics share bands, plus
    broadband drums) is where frequency masking breaks down. Real neural
    separators score a positive mean SI-SDR here (Demucs ~+9 dB, Open-Unmix
    ~+5 dB on MUSDB18); this heuristic scores a *negative* mean, i.e. for
    most stems the "separated" output is further from the true source than
    the mixture itself. Re-baseline if a real model is introduced.
    """
    duration = 2.0
    times = np.arange(int(_SR * duration), dtype=np.float32) / _SR
    rng = np.random.default_rng(0)

    def _norm(signal: np.ndarray) -> np.ndarray:
        return signal / (float(np.max(np.abs(signal))) + 1e-12)

    drums = np.zeros_like(times)
    burst_len = int(0.12 * _SR)
    for onset in np.arange(0.0, duration, 0.5):
        start = int(onset * _SR)
        burst = rng.standard_normal(burst_len) * np.exp(-np.linspace(0, 6, burst_len))
        end = min(start + burst_len, drums.size)
        drums[start:end] += burst[: end - start]

    truth = {
        "bass": _norm(_harmonic_bass(times, f0=55.0, harmonics=12)),
        "other": _norm(_harmonic_bass(times, f0=220.0, harmonics=8)),
        "vocals": _norm(_harmonic_bass(times, f0=261.0, harmonics=6)),
        "drums": _norm(drums),
    }
    mix = np.sum([0.5 * source for source in truth.values()], axis=0).astype(np.float32)

    audio_path = tmp_path / "band.wav"
    sf.write(audio_path, mix, _SR)
    stems = AudioStemSeparator(_config(duration)).separate(audio_path)["stems"]

    scores = {
        name: _si_sdr(stems[name][: times.size], (0.5 * truth[name]).astype(np.float64))
        for name in truth
    }
    mean_si_sdr = float(np.mean(list(scores.values())))

    # Decisively below any usable separator (Demucs/Open-Unmix are positive).
    assert mean_si_sdr < 0.0
    # Overlapping instruments contaminate the vocal band: worse than the mix.
    assert scores["vocals"] < 0.0
