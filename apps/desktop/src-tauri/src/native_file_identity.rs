//! Canonical native file identity used by desktop media admission and playback revocation.
//!
//! Identity is captured from an already-open file descriptor/handle. Callers compare
//! it again when reopening a path so same-size replacement or in-place mutation cannot
//! silently inherit previously granted playback authority.

use std::fs::File;

#[cfg(unix)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeFileIdentity {
    device: u64,
    inode: u64,
    change_time_seconds: i64,
    change_time_nanoseconds: i64,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(C)]
struct WindowsFileTime {
    low_date_time: u32,
    high_date_time: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowsByHandleFileInformation {
    file_attributes: u32,
    creation_time: WindowsFileTime,
    last_access_time: WindowsFileTime,
    last_write_time: WindowsFileTime,
    volume_serial_number: u32,
    file_size_high: u32,
    file_size_low: u32,
    number_of_links: u32,
    file_index_high: u32,
    file_index_low: u32,
}

#[cfg(windows)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeFileIdentity {
    volume_serial_number: u32,
    file_index: u64,
    last_write_time: WindowsFileTime,
}

#[cfg(not(any(unix, windows)))]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeFileIdentity;

/// Capture stable identity from an already-open native file.
///
/// Unix uses device/inode plus ctime; Windows uses volume/file index plus last-write
/// time. Platforms without an equivalent supported primitive fail closed.
#[cfg(unix)]
pub fn native_file_identity(file: &File) -> std::io::Result<NativeFileIdentity> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    Ok(NativeFileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
        change_time_seconds: metadata.ctime(),
        change_time_nanoseconds: metadata.ctime_nsec(),
    })
}

#[cfg(windows)]
pub fn native_file_identity(file: &File) -> std::io::Result<NativeFileIdentity> {
    use std::{mem::MaybeUninit, os::windows::io::AsRawHandle};

    #[link(name = "kernel32")]
    extern "system" {
        #[link_name = "GetFileInformationByHandle"]
        fn get_file_information_by_handle(
            file: std::os::windows::io::RawHandle,
            information: *mut WindowsByHandleFileInformation,
        ) -> i32;
    }

    let mut information = MaybeUninit::<WindowsByHandleFileInformation>::uninit();
    let result = unsafe {
        get_file_information_by_handle(file.as_raw_handle(), information.as_mut_ptr())
    };
    if result == 0 {
        return Err(std::io::Error::last_os_error());
    }
    let information = unsafe { information.assume_init() };
    Ok(NativeFileIdentity {
        volume_serial_number: information.volume_serial_number,
        file_index: ((information.file_index_high as u64) << 32)
            | information.file_index_low as u64,
        last_write_time: information.last_write_time,
    })
}

#[cfg(not(any(unix, windows)))]
pub fn native_file_identity(_file: &File) -> std::io::Result<NativeFileIdentity> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "native playback file identity is unsupported on this platform",
    ))
}
