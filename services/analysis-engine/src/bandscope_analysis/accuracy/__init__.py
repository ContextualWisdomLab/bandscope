"""Real-audio accuracy acceptance for decoded PCM fixtures."""

from .harmony import (
    AccuracyChecksumError,
    AccuracyIdentityError,
    AccuracyManifestError,
    FixtureRecord,
    HarmonyAccuracyManifest,
    evaluate_harmony_fixture,
    parse_fixture_record,
    write_c_major_triad_wav,
)

__all__ = [
    "AccuracyChecksumError",
    "AccuracyIdentityError",
    "AccuracyManifestError",
    "FixtureRecord",
    "HarmonyAccuracyManifest",
    "evaluate_harmony_fixture",
    "parse_fixture_record",
    "write_c_major_triad_wav",
]
