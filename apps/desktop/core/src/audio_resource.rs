use std::io::{Read, Write};

/// Maximum encoded local-audio file size accepted by the desktop bootstrap boundary.
pub const MAX_LOCAL_AUDIO_FILE_BYTES: u64 = 100 * 1024 * 1024;

const LOCAL_AUDIO_READ_ERROR: &str = "Could not read the selected audio file.";
const LOCAL_AUDIO_WRITE_ERROR: &str = "Could not prepare the local project workspace.";
const LOCAL_AUDIO_TOO_LARGE_ERROR: &str =
    "Choose a shorter or smaller song file to start analysis.";

/// Validate a native local-audio file length before storing bootstrap metadata.
///
/// The caller must obtain this length from the native filesystem descriptor or
/// metadata boundary rather than from renderer-controlled JSON. The function
/// intentionally returns only bounded product messages and never includes a
/// local path or payload content.
pub fn validate_local_audio_file_size(file_size_bytes: u64) -> Result<u64, String> {
    if file_size_bytes == 0 {
        return Err(LOCAL_AUDIO_READ_ERROR.to_string());
    }
    if file_size_bytes > MAX_LOCAL_AUDIO_FILE_BYTES {
        return Err(LOCAL_AUDIO_TOO_LARGE_ERROR.to_string());
    }
    Ok(file_size_bytes)
}

fn copy_bounded_local_audio_with_limit<R: Read, W: Write>(
    mut reader: R,
    writer: &mut W,
    max_bytes: u64,
) -> Result<u64, String> {
    let mut copied = 0_u64;
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        if copied == max_bytes {
            let mut overflow_probe = [0_u8; 1];
            let read = reader
                .read(&mut overflow_probe)
                .map_err(|_| LOCAL_AUDIO_READ_ERROR.to_string())?;
            if read == 0 {
                break;
            }
            return Err(LOCAL_AUDIO_TOO_LARGE_ERROR.to_string());
        }

        let remaining = (max_bytes - copied).min(buffer.len() as u64) as usize;
        let read = reader
            .read(&mut buffer[..remaining])
            .map_err(|_| LOCAL_AUDIO_READ_ERROR.to_string())?;
        if read == 0 {
            break;
        }
        writer
            .write_all(&buffer[..read])
            .map_err(|_| LOCAL_AUDIO_WRITE_ERROR.to_string())?;
        copied += read as u64;
    }

    if copied == 0 {
        return Err(LOCAL_AUDIO_READ_ERROR.to_string());
    }
    Ok(copied)
}

/// Copy one admitted local-audio stream into a staging writer without allowing
/// source growth to exceed the encoded-byte resource ceiling.
///
/// Security Notes: callers must pass an already-open, OS-authorized source
/// descriptor and a private app-owned staging writer. The helper writes no more
/// than the 100 MiB ceiling and, after reaching it exactly, reads only one probe
/// byte to detect source growth. Source-read and destination-write failures use
/// distinct bounded product errors so storage failures are not misdiagnosed as
/// bad media. The caller must discard the staging artifact on error and publish
/// it only after this method returns the observed byte count successfully.
pub fn copy_bounded_local_audio<R: Read, W: Write>(reader: R, writer: &mut W) -> Result<u64, String> {
    copy_bounded_local_audio_with_limit(reader, writer, MAX_LOCAL_AUDIO_FILE_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Error, ErrorKind};

    struct FailingWriter;

    impl Write for FailingWriter {
        fn write(&mut self, _buffer: &[u8]) -> std::io::Result<usize> {
            Err(Error::new(ErrorKind::Other, "simulated destination failure"))
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buffer: &mut [u8]) -> std::io::Result<usize> {
            Err(Error::new(ErrorKind::Other, "simulated source failure"))
        }
    }

    #[test]
    fn bounded_copy_rejects_stream_growth_without_staging_bytes_past_the_limit() {
        let input = Cursor::new(vec![1_u8, 2, 3, 4, 5]);
        let mut staged = Vec::new();

        let error = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect_err("a source that grows beyond the admitted byte limit must fail closed");

        assert_eq!(error, LOCAL_AUDIO_TOO_LARGE_ERROR);
        assert_eq!(staged, vec![1_u8, 2, 3, 4]);
    }

    #[test]
    fn bounded_copy_accepts_the_exact_limit_and_reports_observed_bytes() {
        let input = Cursor::new(vec![1_u8, 2, 3, 4]);
        let mut staged = Vec::new();

        let copied = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect("the exact encoded-byte limit remains admissible");

        assert_eq!(copied, 4);
        assert_eq!(staged, vec![1_u8, 2, 3, 4]);
    }

    #[test]
    fn bounded_copy_reports_destination_failure_as_workspace_failure() {
        let input = Cursor::new(vec![1_u8, 2, 3, 4]);
        let mut staged = FailingWriter;

        let error = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect_err("a staging write failure must not be reported as a source read failure");

        assert_eq!(error, LOCAL_AUDIO_WRITE_ERROR);
    }

    #[test]
    fn bounded_copy_keeps_source_failure_distinct_from_workspace_failure() {
        let input = FailingReader;
        let mut staged = Vec::new();

        let error = copy_bounded_local_audio_with_limit(input, &mut staged, 4)
            .expect_err("a source read failure must retain the media-read diagnosis");

        assert_eq!(error, LOCAL_AUDIO_READ_ERROR);
        assert!(staged.is_empty());
    }
}
