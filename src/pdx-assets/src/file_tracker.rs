use super::file_provider::{FileProvider, FsFile};
use anyhow::Result;
use std::cell::RefCell;
use std::collections::HashSet;
use std::io::Read;

#[derive(Debug)]
pub struct FileAccessTracker<P: FileProvider> {
    provider: P,
    accessed_files: RefCell<HashSet<String>>,
    enabled: bool,
}

impl<P: FileProvider> FileProvider for FileAccessTracker<P> {
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        if self.enabled {
            self.accessed_files.borrow_mut().insert(path.to_string());
        }
        self.provider.read_file(path)
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        if self.enabled {
            self.accessed_files.borrow_mut().insert(path.to_string());
        }
        self.provider.read_to_string(path)
    }

    fn file_exists(&self, path: &str) -> bool {
        // Do not track file exists checks
        self.provider.file_exists(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        let files = self.provider.walk_directory(path, ends_with)?;
        if self.enabled {
            let mut accessed = self.accessed_files.borrow_mut();
            for file in &files {
                accessed.insert(file.clone());
            }
        }
        Ok(files)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        if self.enabled {
            self.accessed_files.borrow_mut().insert(path.to_string());
        }
        self.provider.fs_file(path)
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        if self.enabled {
            self.accessed_files.borrow_mut().insert(path.to_string());
        }
        self.provider.open_file(path)
    }
}

impl<P: FileProvider> FileAccessTracker<P> {
    pub fn new(provider: P) -> Self {
        Self {
            provider,
            accessed_files: RefCell::new(HashSet::new()),
            enabled: true,
        }
    }

    pub fn get_accessed_files(&self) -> HashSet<String> {
        self.accessed_files.borrow().clone()
    }
}
