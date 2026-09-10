"""Bounded PCM decode port for the Resource Admission & Decode context.

The current adapter still delegates to ``librosa`` and therefore remains a
transitional boundary while #1129 removes the libsndfile-backed runtime graph.
Consumers must call this port rather than selecting decoder fallbacks
independently.

Security Notes:
- The caller-authorized binary handle, container metadata, decoder output, and
  third-party decoder exceptions are untrusted.
- Encoded byte size is measured and admitted from the caller-owned seekable
  handle before metadata parsing or decode work begins.
- Metadata parsing and decoding receive a bounded view whose logical EOF is the
  admitted byte count, so source growth after admission cannot widen decoder
  read authority beyond the resource-policy ceiling.
- Source metadata is admitted before decode and the resulting PCM is revalidated
  against the same versioned policy before it can enter MIR or model work.
- Decoder output must already be one-dimensional when ``mono=True``; a malformed
  multi-channel shape is rejected rather than flattened into false mono PCM.
- Decoder output must remain floating-point before canonicalization. Integer,
  boolean, object, or complex results are treated as a malformed decoder contract
  rather than silently reinterpreted as real-valued rehearsal PCM.
- The decoder call explicitly pins canonical ``float32`` output and the
  band-limited ``soxr_hq`` resampler so changes to third-party defaults cannot
  silently change those selected decode parameters. Numerical output can still
  change when the decoder/resampler implementation or dependency versions change.
- Decoder sample count, visible allocated bytes, and the predicted canonical
  float32 byte count are checked before normalization. A non-owning NumPy view
  is detached into an owned canonical buffer, so the returned MIR artifact cannot
  retain a larger hidden backing allocation. If that bounded canonical copy
  itself fails under host memory pressure, the port preserves the stable
  ``memory_budget_exceeded`` resource-policy contract. Earlier decoder-output
  materialization failures remain malformed-decoder failures rather than being
  misclassified as an admitted canonical-buffer budget failure. Decoder-internal
  peak memory before return remains a separate process-resource acceptance boundary.
- Decoder details remain exception causes only; the surfaced failure is the
  payload-free canonical resource-policy error.
- This port adds no path, network, subprocess, or credential authority.
"""

from __future__ import annotations

import io
import warnings
from collections.abc import Buffer
from typing import BinaryIO, cast

import librosa
import numpy as np
from numpy.typing import NDArray

from bandscope_analysis.audio_metadata import preflight_audio_metadata
from bandscope_analysis.audio_resource_policy import (
    DEFAULT_AUDIO_RESOURCE_POLICY,
    AudioResourcePolicy,
    AudioResourcePolicyError,
)

AudioMonoArray = NDArray[np.float32]
_CANONICAL_RESAMPLE_TYPE = "soxr_hq"
_CANONICAL_PCM_ITEMSIZE = np.dtype(np.float32).itemsize


class _BoundedEncodedSource(io.RawIOBase):
    """Expose one seekable source with a fixed admitted logical end offset."""

    def __init__(self, source: BinaryIO, admitted_bytes: int) -> None:
        """Retain the caller-owned handle without acquiring path authority."""
        super().__init__()
        self._source = source
        self._admitted_bytes = admitted_bytes

    def readable(self) -> bool:
        """Report the read capability required by decoder virtual I/O."""
        return True

    def seekable(self) -> bool:
        """Report the seek capability required by container parsers."""
        return True

    def tell(self) -> int:
        """Return the current position of the caller-owned handle."""
        return int(self._source.tell())

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        """Seek relative to the admitted logical file rather than later growth."""
        if whence == io.SEEK_SET:
            target = offset
        elif whence == io.SEEK_CUR:
            target = self.tell() + offset
        elif whence == io.SEEK_END:
            target = self._admitted_bytes + offset
        else:
            raise ValueError("invalid seek mode")
        if target < 0:
            raise OSError("invalid encoded source seek")
        return int(self._source.seek(target, io.SEEK_SET))

    def read(self, size: int = -1) -> bytes:
        """Read no farther than the byte extent admitted before decode."""
        remaining = max(self._admitted_bytes - self.tell(), 0)
        bounded_size = remaining if size < 0 else min(size, remaining)
        return self._source.read(bounded_size)

    def readinto(self, buffer: Buffer, /) -> int:
        """Fill decoder-owned buffers without crossing the admitted EOF."""
        view = memoryview(buffer)
        data = self.read(len(view))
        view[: len(data)] = data
        return len(data)


def _malformed_decode_error() -> AudioResourcePolicyError:
    """Build the stable payload-free decoder failure."""
    return AudioResourcePolicyError("malformed_header")


def _measure_encoded_source_bytes(source: BinaryIO) -> int:
    """Measure one seekable encoded source and restore it to the decode origin."""
    try:
        source.seek(0, 2)
        file_size = source.tell()
        source.seek(0)
    except Exception as error:
        raise _malformed_decode_error() from error
    return file_size


def decode_mono_audio(
    source: BinaryIO,
    *,
    policy: AudioResourcePolicy = DEFAULT_AUDIO_RESOURCE_POLICY,
) -> tuple[AudioMonoArray, int]:
    """Admit and decode one caller-owned source to bounded mono float32 PCM."""
    admitted_bytes = policy.validate_encoded_file_bytes(_measure_encoded_source_bytes(source))
    admitted_source = cast(BinaryIO, _BoundedEncodedSource(source, admitted_bytes))
    preflight_audio_metadata(admitted_source, policy)

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, module=r"^audioread")
            warnings.filterwarnings("ignore", category=FutureWarning, module=r"^audioread")
            decoded, sample_rate = librosa.load(
                admitted_source,
                sr=policy.target_sample_rate,
                mono=True,
                duration=policy.decode_probe_duration_seconds,
                dtype=np.float32,
                res_type=_CANONICAL_RESAMPLE_TYPE,
            )
    except AudioResourcePolicyError:
        raise
    except Exception as error:
        raise _malformed_decode_error() from error

    try:
        decoded_array = np.asarray(decoded)
        if decoded_array.ndim != 1:
            raise _malformed_decode_error()
        if not np.issubdtype(decoded_array.dtype, np.floating):
            raise _malformed_decode_error()
        if decoded_array.size > policy.max_decoded_samples:
            raise AudioResourcePolicyError("decoded_sample_count_exceeded")
        if decoded_array.nbytes > policy.max_decoded_audio_bytes:
            raise AudioResourcePolicyError("memory_budget_exceeded")
        canonical_bytes = decoded_array.size * _CANONICAL_PCM_ITEMSIZE
        if canonical_bytes > policy.max_decoded_audio_bytes:
            raise AudioResourcePolicyError("memory_budget_exceeded")
        if decoded_array.dtype == np.dtype(np.float32) and decoded_array.flags.owndata:
            pcm = decoded_array
        else:
            try:
                pcm = np.array(decoded_array, dtype=np.float32, copy=True)
            except MemoryError as error:
                raise AudioResourcePolicyError("memory_budget_exceeded") from error
    except AudioResourcePolicyError:
        raise
    except (MemoryError, OverflowError, TypeError, ValueError) as error:
        raise _malformed_decode_error() from error

    try:
        policy.validate_decoded_audio(pcm, sample_rate)
    except AudioResourcePolicyError:
        raise
    except Exception as error:
        raise _malformed_decode_error() from error
    return cast(AudioMonoArray, pcm), int(sample_rate)
