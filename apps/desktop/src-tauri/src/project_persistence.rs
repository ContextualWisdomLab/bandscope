#[cfg(test)]
mod tests {
    use super::publish_new_project_file;
    use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    fn test_dir(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "bandscope-project-persistence-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    #[test]
    fn publishes_complete_new_project_without_stage_artifacts() {
        let root = test_dir("new");
        let target = root.join("setlist.bscope");
        let content = br#"{\"id\":\"song-1\"}"#;

        publish_new_project_file(&target, content).expect("new project should publish safely");

        assert_eq!(fs::read(&target).expect("published project should be readable"), content);
        let names = fs::read_dir(&root)
            .expect("test directory should be readable")
            .map(|entry| entry.expect("directory entry should be readable").file_name())
            .collect::<Vec<_>>();
        assert_eq!(names, vec![target.file_name().unwrap().to_os_string()]);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }

    #[test]
    fn refuses_to_clobber_an_existing_known_good_project() {
        let root = test_dir("existing");
        let target = root.join("setlist.bscope");
        let known_good = br#"{\"id\":\"known-good\"}"#;
        fs::write(&target, known_good).expect("fixture should be written");

        let error = publish_new_project_file(&target, br#"{\"id\":\"replacement\"}"#)
            .expect_err("existing project must not be overwritten unsafely");

        assert_eq!(error, "Project file already exists. Choose a new file name.");
        assert_eq!(fs::read(&target).expect("known-good project should remain"), known_good);
        fs::remove_dir_all(root).expect("test directory should be removable");
    }
}
