# Canonical audio resource policy

BandScope admits one rehearsal recording at a time. Every intake path, decoder,
and feature analyzer must apply the same versioned resource budget before
expensive work starts.

## Published policy (version 1)

| Bound | Value | Why this number |
| --- | --- | --- |
| Encoded file bytes | 100 MiB inclusive | Existing temporal intake ceiling; long enough for a 15-minute stereo rehearsal capture without inviting decompression bombs. |
| Duration | 0.05 s through 15 minutes inclusive | Existing temporal and YouTube intake evidence. Not an invented five-minute cap. |
| Source sampling rate | 8 kHz through 192 kHz | Covers phone voice notes through high-rate interface captures. Feature DSP may resample after admission (bass pYIN at 22 050 Hz is allowed). |
| Target sampling rate | 44 100 Hz | Compact-disc PCM rate used by temporal analysis and stem separation. |
| Channel count | Mono or stereo | Rehearsal recordings are not multichannel session stems. |
| Decoded sample count | `15 × 60 × 44100` | Checked product of duration and target rate. |
| Decoded memory | sample count × 2 channels × 4 bytes | Float32 stereo estimate; overflow fails closed. |

## Next action copy

Rejection copy is payload-free. It names the next rehearsal action and never
echoes paths, sizes, durations, or header bytes:

- Choose a shorter or smaller song file to start analysis.
- Choose a song shorter than 15 minutes to start analysis.
- Choose a shorter song file to start analysis.
- Choose a longer song file to start analysis.
- Choose a WAV, MP3, FLAC, or M4A file recorded at a standard sample rate.
- Choose a mono or stereo song file to start analysis.
- Choose another song file. This one could not be measured safely.
- Choose another song file. This one could not be read as audio.

Audit metadata records `policy_version` and `reason` on
`AudioResourcePolicyError`. Those fields stay off the user-facing string.

## Validation order

1. Encoded byte size, before open/decode, where the filesystem size is
   trustworthy as an upper bound.
2. YouTube metadata duration ceiling, before download.
3. Decode with the canonical duration bound as a loader safety cap, not as a
   silent shorter feature policy.
4. Revalidate decoded arrays because container metadata is untrusted: layout,
   sampling rate, sample count, wall-clock duration, and memory estimate.
5. Feature DSP (chromagram hop, pYIN 22 050 Hz, Demucs split) runs only on an
   admitted buffer.

## Consumers

- `bandscope_analysis.audio_resource_policy` — versioned policy and validators
- `temporal.analyzer` — local file preflight and decoded revalidation
- `separation.audio_separator` — stem decode preflight and decoded revalidation
- `youtube.download_youtube_audio` — duration ceiling and 100 MiB encoded budget
- `transcription.api` — stem byte budget and 15-minute loader cap (no 120 s silent cap)
- `chords.chord_recognizer` — decoded revalidation at `recognize()`

Desktop Rust currently records `file_size_bytes` at intake but does not yet
enforce this ceiling. The Python engine remains fail-closed if a larger file
reaches analysis.

## Rollback

Revert this slice to restore feature-local limits (YouTube 50 MiB, bass
transcription 120 s, payload-bearing size errors). Do not leave a mix of
canonical validators and the old silent caps on the same branch.

## Security Notes

- Attack surface: untrusted local files, YouTube containers, decoder output,
  and caller-supplied NumPy arrays.
- Trust boundary: this policy classifies resources only. It does not open
  files, follow paths, or talk to the network.
- Mitigations: checked integer products, fail-closed non-finite metadata,
  payload-free copy, decoded revalidation after untrusted headers.
- Test points: inclusive ceilings, next-byte/next-millisecond rejections,
  empty and malformed metadata, decoded expansion, overflow, provenance.
- Realistic threats: decompression bombs, huge channel counts, extreme
  sampling rates, integer overflow in size conversions, inconsistent
  feature-local caps that fail only after expensive work.
- Remaining risk: desktop encoded-byte preflight still records size without
  rejecting; duration still requires a decoder; GPU/VRAM budgets are not
  part of policy version 1.

## References

International Electrotechnical Commission. (1999). *Compact disc digital audio
system* (IEC 60908). Geneva, Switzerland: IEC.

National Institute of Standards and Technology. (2020). *Security and privacy
controls for information systems and organizations* (NIST Special Publication
800-53 Rev. 5). https://doi.org/10.6028/NIST.SP.800-53r5
