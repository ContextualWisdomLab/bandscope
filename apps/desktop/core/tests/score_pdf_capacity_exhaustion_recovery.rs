#[cfg(target_os = "macos")]
use bandscope_desktop_core::{
    inventory_published_score_pdf_receipts, publish_score_pdf_attachment,
};
#[cfg(target_os = "macos")]
use std::{
    env,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(target_os = "macos")]
const SCORE_ID: &str = "6fa459ea-ee8a-4ca4-894e-db77e160355e";
#[cfg(target_os = "macos")]
const SOURCE_BYTES: usize = 1024 * 1024;
#[cfg(target_os = "macos")]
const RESERVE_BYTES: usize = 512 * 1024;
#[cfg(target_os = "macos")]
const FILL_BLOCK_BYTES: usize = 64 * 1024;
#[cfg(target_os = "macos")]
const ENOSPC: i32 = 28;

#[cfg(target_os = "macos")]
fn unique_test_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after Unix epoch")
        .as_nanos();
    env::temp_dir().join(format!("bandscope-score-capacity-{name}-{suffix}"))
}

#[cfg(target_os = "macos")]
fn pdf_fixture(bytes: usize) -> Vec<u8> {
    let mut fixture = vec![b'x'; bytes];
    fixture[..9].copy_from_slice(b"%PDF-1.7\n");
    fixture
}

#[cfg(target_os = "macos")]
fn write_allocated_file(path: &Path, bytes: usize) {
    let mut file = File::create(path).expect("capacity fixture should be created");
    let block = vec![0_u8; FILL_BLOCK_BYTES];
    let mut remaining = bytes;
    while remaining > 0 {
        let count = remaining.min(block.len());
        file.write_all(&block[..count])
            .expect("capacity fixture should allocate its requested bytes");
        remaining -= count;
    }
    file.sync_all()
        .expect("capacity fixture should be synchronized before exhaustion");
}

#[cfg(target_os = "macos")]
fn assert_enospc(error: &std::io::Error) {
    assert_eq!(
        error.raw_os_error(),
        Some(ENOSPC),
        "the isolated filesystem must fail from real capacity exhaustion"
    );
}

#[cfg(target_os = "macos")]
fn fill_until_enospc(path: &Path) {
    let mut filler = File::create(path).expect("capacity filler should be created");
    let block = vec![0_u8; FILL_BLOCK_BYTES];

    for _ in 0..1024 {
        if let Err(error) = filler.write_all(&block) {
            assert_enospc(&error);
            return;
        }
        if let Err(error) = filler.sync_data() {
            assert_enospc(&error);
            return;
        }
    }

    panic!("the fixed-size disk image did not reach ENOSPC within the bounded fill");
}

#[cfg(target_os = "macos")]
struct MountedImage {
    image: PathBuf,
    mountpoint: PathBuf,
    host_root: PathBuf,
}

#[cfg(target_os = "macos")]
impl MountedImage {
    fn create(host_root: PathBuf) -> Self {
        fs::create_dir_all(&host_root).expect("capacity host root should be created");
        let image = host_root.join("capacity.dmg");
        let mountpoint = host_root.join("volume");
        fs::create_dir(&mountpoint).expect("capacity mountpoint should be created");

        let create = Command::new("hdiutil")
            .arg("create")
            .args(["-size", "16m", "-fs", "HFS+", "-volname", "BandScopeENOSPC"])
            .arg(&image)
            .status()
            .expect("hdiutil create should launch");
        assert!(create.success(), "fixed-size capacity image should be created");

        let attach = Command::new("hdiutil")
            .arg("attach")
            .arg(&image)
            .arg("-nobrowse")
            .arg("-mountpoint")
            .arg(&mountpoint)
            .status()
            .expect("hdiutil attach should launch");
        assert!(attach.success(), "fixed-size capacity image should mount");

        Self {
            image,
            mountpoint,
            host_root,
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for MountedImage {
    fn drop(&mut self) {
        let _ = Command::new("hdiutil")
            .arg("detach")
            .arg(&self.mountpoint)
            .arg("-force")
            .status();
        let _ = fs::remove_file(&self.image);
        let _ = fs::remove_dir_all(&self.host_root);
    }
}

#[cfg(target_os = "macos")]
#[test]
fn actual_capacity_exhaustion_does_not_create_published_score_truth() {
    let host_root = unique_test_dir("enospc");
    fs::create_dir_all(&host_root).expect("capacity host root should be created");
    let source = host_root.join("selected.pdf");
    fs::write(&source, pdf_fixture(SOURCE_BYTES)).expect("source PDF should be written on host disk");

    let mounted = MountedImage::create(host_root.clone());
    let scores_root = mounted.mountpoint.clone();
    let reserve = scores_root.join("reserve.bin");
    let filler = scores_root.join("filler.bin");

    write_allocated_file(&reserve, RESERVE_BYTES);
    fill_until_enospc(&filler);
    fs::remove_file(&reserve).expect("removing the fixed reserve should free bounded capacity");

    let error = publish_score_pdf_attachment(&source, &scores_root, SCORE_ID)
        .expect_err("a 1 MiB score must not fit in the bounded capacity released by the reserve");
    assert_eq!(error, "Could not attach the score PDF.");

    let stage = scores_root.join(format!(".score-{SCORE_ID}.stage"));
    let destination = scores_root.join(format!("{SCORE_ID}.pdf"));
    assert!(
        !destination.exists(),
        "ENOSPC during staged copy must not create published score truth"
    );
    assert!(
        !stage.exists(),
        "the failed writer must retire only its owned partial stage"
    );
    assert_eq!(
        fs::metadata(&source)
            .expect("source should remain intact after capacity exhaustion")
            .len(),
        SOURCE_BYTES as u64,
        "capacity fault injection must not shrink the product source or its 25 MiB ceiling"
    );

    let receipts = inventory_published_score_pdf_receipts(&scores_root)
        .expect("fresh restart inventory should accept the cleaned capacity-fault workspace");
    assert!(
        receipts.is_empty(),
        "capacity exhaustion must not become a published recovery candidate"
    );
}
