use super::file_provider::{FileProvider, FsFile};
use anyhow::Result;
use std::collections::HashSet;
use std::io::Read;
use std::sync::Mutex;

#[derive(Debug)]
pub struct FileAccessTracker<P: FileProvider> {
    provider: P,
    accessed_files: Mutex<HashSet<String>>,
    enabled: bool,
}

impl<P: FileProvider> FileProvider for FileAccessTracker<P> {
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        self.track_access(path);
        self.provider.read_file(path)
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        self.track_access(path);
        self.provider.read_to_string(path)
    }

    fn file_exists(&self, path: &str) -> bool {
        // Do not track file exists checks
        self.provider.file_exists(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        let files = self.provider.walk_directory(path, ends_with)?;
        if self.enabled {
            let mut accessed = self.accessed_files();
            for file in &files {
                accessed.insert(file.clone());
            }
        }
        Ok(files)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        self.track_access(path);
        self.provider.fs_file(path)
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        self.track_access(path);
        self.provider.open_file(path)
    }
}

impl<P: FileProvider> FileAccessTracker<P> {
    pub fn new(provider: P) -> Self {
        Self {
            provider,
            accessed_files: Mutex::new(HashSet::new()),
            enabled: true,
        }
    }

    pub fn get_accessed_files(&self) -> HashSet<String> {
        self.accessed_files().clone()
    }

    fn track_access(&self, path: &str) {
        if self.enabled {
            self.accessed_files().insert(path.to_string());
        }
    }

    fn accessed_files(&self) -> std::sync::MutexGuard<'_, HashSet<String>> {
        self.accessed_files
            .lock()
            .expect("file access tracker mutex poisoned")
    }
}
