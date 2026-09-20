use bandscope_desktop_core::publish_score_pdf_attachment;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";

fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("bandscope-{name}-{suffix}"))
}

#[test]
fn score_attachment_publication_writes_complete_pdf_without_leaking_stage() {
    let root = unique_test_dir("score-attachment-publish");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    let expected = b"%PDF-1.7\nrehearsal score";
    std::fs::write(&source, expected).expect("score fixture should be written");

    let bytes = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect("validated score should publish");

    assert_eq!(bytes, expected.len() as u64);
    assert_eq!(
        std::fs::read(root.join(format!("{SCORE_ID}.pdf")))
            .expect("published score should be readable"),
        expected
    );
    assert!(!root.join(format!(".score-{SCORE_ID}.stage")).exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn score_attachment_publication_never_clobbers_existing_score_id() {
    let root = unique_test_dir("score-attachment-noclobber");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    std::fs::write(&source, b"%PDF-1.7\nnew bytes").expect("score fixture should be written");
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    std::fs::write(&destination, b"%PDF-1.7\nexisting bytes")
        .expect("existing attachment should be written");

    let error = publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect_err("publication must not replace an existing attachment");

    assert_eq!(error, "Could not attach the score PDF.");
    assert_eq!(
        std::fs::read(&destination).expect("existing attachment should remain readable"),
        b"%PDF-1.7\nexisting bytes"
    );
    assert!(!root.join(format!(".score-{SCORE_ID}.stage")).exists());
    let _ = std::fs::remove_dir_all(root);
}

#[cfg(unix)]
#[test]
fn score_attachment_publication_is_private_under_permissive_umask() {
    use std::os::unix::fs::MetadataExt;
    use std::process::Command;

    if std::env::var_os("BANDSCOPE_SCORE_UMASK_CHILD").is_some() {
        let root = PathBuf::from(
            std::env::var_os("BANDSCOPE_SCORE_UMASK_ROOT")
                .expect("child score root should be supplied"),
        );
        std::fs::create_dir_all(&root).expect("score root should be created");
        let source = root.join("selected.pdf");
        std::fs::write(&source, b"%PDF-1.7\nprivate score")
            .expect("score fixture should be written");
        publish_score_pdf_attachment(&source, &root, SCORE_ID)
            .expect("score publication should succeed under permissive umask");
        let mode = std::fs::metadata(root.join(format!("{SCORE_ID}.pdf")))
            .expect("published score metadata should be readable")
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
        return;
    }

    let root = unique_test_dir("score-attachment-umask");
    let test_binary = std::env::current_exe().expect("test binary should resolve");
    let status = Command::new("sh")
        .arg("-c")
        .arg("umask 000; exec \"$1\" --exact score_attachment_publication_is_private_under_permissive_umask --nocapture")
        .arg("bandscope-score-umask")
        .arg(&test_binary)
        .env("BANDSCOPE_SCORE_UMASK_CHILD", "1")
        .env("BANDSCOPE_SCORE_UMASK_ROOT", &root)
        .status()
        .expect("umask child should run");

    assert!(status.success(), "umask child regression should pass");
    let _ = std::fs::remove_dir_all(root);
}

#[cfg(windows)]
fn windows_dacl_inheritance(path: &std::path::Path) -> (u16, u32) {
    use std::{ffi::c_void, mem::size_of, os::windows::ffi::OsStrExt, ptr};

    #[repr(C)]
    struct AclSizeInformation {
        ace_count: u32,
        acl_bytes_in_use: u32,
        acl_bytes_free: u32,
    }

    #[repr(C)]
    struct AceHeader {
        ace_type: u8,
        ace_flags: u8,
        ace_size: u16,
    }

    const SE_FILE_OBJECT: u32 = 1;
    const DACL_SECURITY_INFORMATION: u32 = 0x0000_0004;
    const ACL_SIZE_INFORMATION_CLASS: u32 = 2;
    const INHERITED_ACE: u8 = 0x10;

    #[link(name = "advapi32")]
    extern "system" {
        fn GetNamedSecurityInfoW(
            object_name: *const u16,
            object_type: u32,
            security_info: u32,
            owner: *mut *mut c_void,
            group: *mut *mut c_void,
            dacl: *mut *mut c_void,
            sacl: *mut *mut c_void,
            security_descriptor: *mut *mut c_void,
        ) -> u32;
        fn GetSecurityDescriptorControl(
            security_descriptor: *mut c_void,
            control: *mut u16,
            revision: *mut u32,
        ) -> i32;
        fn GetAclInformation(
            acl: *const c_void,
            information: *mut c_void,
            information_length: u32,
            information_class: u32,
        ) -> i32;
        fn GetAce(acl: *const c_void, ace_index: u32, ace: *mut *mut c_void) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }

    let wide_path: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut dacl: *mut c_void = ptr::null_mut();
    let mut security_descriptor: *mut c_void = ptr::null_mut();
    let status = unsafe {
        GetNamedSecurityInfoW(
            wide_path.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            ptr::null_mut(),
            ptr::null_mut(),
            &mut dacl,
            ptr::null_mut(),
            &mut security_descriptor,
        )
    };
    assert_eq!(status, 0, "Windows should return the published file DACL");
    assert!(
        !security_descriptor.is_null() && !dacl.is_null(),
        "published score should have a concrete DACL"
    );

    let mut control = 0_u16;
    let mut revision = 0_u32;
    let control_ok = unsafe {
        GetSecurityDescriptorControl(security_descriptor, &mut control, &mut revision)
    };
    assert_ne!(control_ok, 0, "security descriptor control should be readable");

    let mut acl_info = AclSizeInformation {
        ace_count: 0,
        acl_bytes_in_use: 0,
        acl_bytes_free: 0,
    };
    let acl_ok = unsafe {
        GetAclInformation(
            dacl,
            (&mut acl_info as *mut AclSizeInformation).cast(),
            size_of::<AclSizeInformation>() as u32,
            ACL_SIZE_INFORMATION_CLASS,
        )
    };
    assert_ne!(acl_ok, 0, "published score ACL metadata should be readable");

    let mut inherited_ace_count = 0_u32;
    for index in 0..acl_info.ace_count {
        let mut ace: *mut c_void = ptr::null_mut();
        let ace_ok = unsafe { GetAce(dacl, index, &mut ace) };
        assert_ne!(ace_ok, 0, "published score ACE should be readable");
        assert!(!ace.is_null(), "published score ACE should not be null");
        let header = unsafe { &*(ace as *const AceHeader) };
        if header.ace_flags & INHERITED_ACE != 0 {
            inherited_ace_count += 1;
        }
    }

    let freed = unsafe { LocalFree(security_descriptor) };
    assert!(freed.is_null(), "security descriptor should be released");
    (control, inherited_ace_count)
}

#[cfg(windows)]
#[test]
fn score_attachment_publication_inherits_windows_parent_dacl() {
    const SE_DACL_PROTECTED: u16 = 0x1000;

    let root = unique_test_dir("score-attachment-windows-acl");
    std::fs::create_dir_all(&root).expect("score root should be created");
    let source = root.join("selected.pdf");
    std::fs::write(&source, b"%PDF-1.7\nwindows inherited acl")
        .expect("score fixture should be written");

    publish_score_pdf_attachment(&source, &root, SCORE_ID)
        .expect("score publication should succeed with Windows ACL inheritance");
    let destination = root.join(format!("{SCORE_ID}.pdf"));
    let (control, inherited_ace_count) = windows_dacl_inheritance(&destination);

    assert_eq!(
        control & SE_DACL_PROTECTED,
        0,
        "published score must not opt out of parent DACL inheritance"
    );
    assert!(
        inherited_ace_count > 0,
        "published score should retain at least one inherited ACE from the app-owned parent"
    );
    let _ = std::fs::remove_dir_all(root);
}
