//! Resource-bounded streaming admission for BandScope updater artifacts.
//!
//! The current Tauri updater returns verified artifacts as an in-memory byte
//! vector. BandScope's commercial Distribution boundary needs an independent
//! streaming primitive before it can claim bounded hostile-response handling.
//! This crate owns only byte-count admission into a caller-provided sink. It
//! does not perform HTTP, metadata authentication, signature verification,
//! digest verification, installation, rollback, or project persistence.

#![forbid(unsafe_code)]

use std::io::{ErrorKind, Write};

/// Hard ceiling for one updater artifact accepted by the Distribution boundary.
pub const MAX_UPDATER_ARTIFACT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Largest single response chunk the adapter may hand to this boundary.
pub const MAX_DOWNLOAD_CHUNK_BYTES: usize = 1024 * 1024;

/// Fail-closed reasons for bounded updater-artifact admission.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DownloadAdmissionError {
    /// The expected artifact length is zero or exceeds the product ceiling.
    InvalidExpectedSize,
    /// A response `Content-Length`, when present, disagrees with authenticated metadata.
    ContentLengthMismatch,
    /// One caller-provided response chunk exceeds the bounded adapter contract.
    ChunkTooLarge,
    /// Accepting a chunk would exceed the authenticated artifact length.
    ExceedsExpectedSize,
    /// The destination sink failed while accepting artifact bytes.
    SinkWriteFailed(ErrorKind),
    /// A previous admission or sink failure poisoned this download attempt.
    Poisoned,
    /// The response ended before the authenticated artifact length was reached.
    Incomplete,
}

/// Byte-count evidence emitted only after an exactly sized stream completes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DownloadReceipt {
    bytes_written: u64,
}

impl DownloadReceipt {
    /// Return the exact number of bytes admitted to the sink.
    pub const fn bytes_written(self) -> u64 {
        self.bytes_written
    }
}

/// Stateful byte-admission guard for one updater artifact response.
///
/// The guard rejects overrun before writing the offending chunk. Any sink
/// failure or hostile overrun poisons the attempt so later chunks cannot turn a
/// partially failed response into a successful receipt.
#[derive(Debug)]
pub struct ArtifactDownloadAdmission {
    expected_size_bytes: u64,
    received_size_bytes: u64,
    poisoned: bool,
}

impl ArtifactDownloadAdmission {
    /// Start one bounded download from authenticated expected size evidence.
    ///
    /// `response_content_length` is advisory transport metadata. When the HTTP
    /// stack supplies it, it must match the authenticated expected size before
    /// body streaming starts. `None` remains acceptable for chunked transfer;
    /// cumulative admission still enforces the exact authenticated byte count.
    pub fn new(
        expected_size_bytes: u64,
        response_content_length: Option<u64>,
    ) -> Result<Self, DownloadAdmissionError> {
        if expected_size_bytes == 0 || expected_size_bytes > MAX_UPDATER_ARTIFACT_BYTES {
            return Err(DownloadAdmissionError::InvalidExpectedSize);
        }
        if response_content_length.is_some_and(|length| length != expected_size_bytes) {
            return Err(DownloadAdmissionError::ContentLengthMismatch);
        }
        Ok(Self {
            expected_size_bytes,
            received_size_bytes: 0,
            poisoned: false,
        })
    }

    /// Admit one already-bounded response chunk into the supplied sink.
    ///
    /// This method never allocates a copy of `chunk`. The network adapter must
    /// itself stream bounded chunks rather than buffering the full response
    /// before this boundary is called.
    pub fn write_chunk<W: Write>(
        &mut self,
        sink: &mut W,
        chunk: &[u8],
    ) -> Result<(), DownloadAdmissionError> {
        if self.poisoned {
            return Err(DownloadAdmissionError::Poisoned);
        }
        if chunk.len() > MAX_DOWNLOAD_CHUNK_BYTES {
            self.poisoned = true;
            return Err(DownloadAdmissionError::ChunkTooLarge);
        }
        let chunk_size = u64::try_from(chunk.len()).map_err(|_| {
            self.poisoned = true;
            DownloadAdmissionError::ChunkTooLarge
        })?;
        let next_size = self
            .received_size_bytes
            .checked_add(chunk_size)
            .ok_or_else(|| {
                self.poisoned = true;
                DownloadAdmissionError::ExceedsExpectedSize
            })?;
        if next_size > self.expected_size_bytes {
            self.poisoned = true;
            return Err(DownloadAdmissionError::ExceedsExpectedSize);
        }
        if let Err(error) = sink.write_all(chunk) {
            self.poisoned = true;
            return Err(DownloadAdmissionError::SinkWriteFailed(error.kind()));
        }
        self.received_size_bytes = next_size;
        Ok(())
    }

    /// Return bytes durably handed to the sink by successful chunk writes.
    pub const fn received_size_bytes(&self) -> u64 {
        self.received_size_bytes
    }

    /// Finish the response only when exactly the authenticated size was written.
    pub fn finish(self) -> Result<DownloadReceipt, DownloadAdmissionError> {
        if self.poisoned {
            return Err(DownloadAdmissionError::Poisoned);
        }
        if self.received_size_bytes != self.expected_size_bytes {
            return Err(DownloadAdmissionError::Incomplete);
        }
        Ok(DownloadReceipt {
            bytes_written: self.received_size_bytes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;

    #[test]
    fn exact_chunked_response_emits_receipt() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(6, Some(6)).expect("valid size");

        admission.write_chunk(&mut sink, b"abc").expect("first chunk");
        admission.write_chunk(&mut sink, b"def").expect("second chunk");
        let receipt = admission.finish().expect("exact response should finish");

        assert_eq!(sink, b"abcdef");
        assert_eq!(receipt.bytes_written(), 6);
    }

    #[test]
    fn missing_content_length_still_uses_exact_cumulative_bound() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(4, None).expect("chunked response");

        admission.write_chunk(&mut sink, b"ab").expect("bounded chunk");
        admission.write_chunk(&mut sink, b"cd").expect("bounded chunk");

        assert_eq!(admission.finish().expect("exact chunked response").bytes_written(), 4);
        assert_eq!(sink, b"abcd");
    }

    #[test]
    fn content_length_mismatch_fails_before_body_admission() {
        assert_eq!(
            ArtifactDownloadAdmission::new(8, Some(7)).unwrap_err(),
            DownloadAdmissionError::ContentLengthMismatch
        );
    }

    #[test]
    fn overrun_is_rejected_before_offending_chunk_reaches_sink() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(4, None).expect("valid size");
        admission.write_chunk(&mut sink, b"abc").expect("first chunk");

        assert_eq!(
            admission.write_chunk(&mut sink, b"de"),
            Err(DownloadAdmissionError::ExceedsExpectedSize)
        );
        assert_eq!(sink, b"abc");
        assert_eq!(
            admission.write_chunk(&mut sink, b"d"),
            Err(DownloadAdmissionError::Poisoned)
        );
    }

    #[test]
    fn oversized_single_chunk_poisoning_is_fail_closed() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(
            (MAX_DOWNLOAD_CHUNK_BYTES as u64) + 1,
            None,
        )
        .expect("artifact remains below global ceiling");
        let chunk = vec![0_u8; MAX_DOWNLOAD_CHUNK_BYTES + 1];

        assert_eq!(
            admission.write_chunk(&mut sink, &chunk),
            Err(DownloadAdmissionError::ChunkTooLarge)
        );
        assert!(sink.is_empty());
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Poisoned));
    }

    #[test]
    fn truncated_response_never_emits_success_receipt() {
        let mut sink = Vec::new();
        let mut admission = ArtifactDownloadAdmission::new(5, Some(5)).expect("valid size");
        admission.write_chunk(&mut sink, b"four").expect("partial body");

        assert_eq!(admission.received_size_bytes(), 4);
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Incomplete));
    }

    struct PartialThenFailWriter {
        accepted: usize,
    }

    impl Write for PartialThenFailWriter {
        fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
            if self.accepted == 0 {
                let count = buffer.len().min(1);
                self.accepted += count;
                return Ok(count);
            }
            Err(io::Error::new(ErrorKind::WriteZero, "synthetic sink failure"))
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn partial_sink_failure_poisoning_prevents_false_completion() {
        let mut sink = PartialThenFailWriter { accepted: 0 };
        let mut admission = ArtifactDownloadAdmission::new(3, Some(3)).expect("valid size");

        assert_eq!(
            admission.write_chunk(&mut sink, b"abc"),
            Err(DownloadAdmissionError::SinkWriteFailed(ErrorKind::WriteZero))
        );
        assert_eq!(admission.received_size_bytes(), 0);
        assert_eq!(admission.finish(), Err(DownloadAdmissionError::Poisoned));
    }

    #[test]
    fn zero_and_over_ceiling_expected_sizes_are_rejected() {
        assert_eq!(
            ArtifactDownloadAdmission::new(0, None).unwrap_err(),
            DownloadAdmissionError::InvalidExpectedSize
        );
        assert_eq!(
            ArtifactDownloadAdmission::new(MAX_UPDATER_ARTIFACT_BYTES + 1, None).unwrap_err(),
            DownloadAdmissionError::InvalidExpectedSize
        );
    }
}
