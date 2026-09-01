"""Generate the licensed BandScope demo WAV fixture.

The output is original Contextual Wisdom Lab audio released under CC0 1.0.
"""

from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 22050
DURATION_SECONDS = 10
AMPLITUDE = 0.2


def write_demo_wav(path: Path) -> None:
    """Write the two-section sine WAV used by the licensed demo package."""
    path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = SAMPLE_RATE * DURATION_SECONDS
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for index in range(n_frames):
            moment = index / SAMPLE_RATE
            frequency = 220.0 if moment < DURATION_SECONDS / 2 else 330.0
            sample = int(AMPLITUDE * 32767.0 * math.sin(2.0 * math.pi * frequency * moment))
            frames.extend(struct.pack("<h", sample))
        wav_file.writeframes(bytes(frames))


def main() -> int:
    """Write ``late-night-set.wav`` to the bundled demo resource directory."""
    parser = argparse.ArgumentParser(description="Generate the licensed BandScope demo WAV.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("apps/desktop/src-tauri/resources/demo/late-night-set.wav"),
        help="Destination WAV path.",
    )
    args = parser.parse_args()
    write_demo_wav(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
