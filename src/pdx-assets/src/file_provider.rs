use anyhow::{Context, Result, anyhow};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug)]
pub struct FsFile {
    pub path: PathBuf,
}

pub trait FileProvider {
    fn read_file(&self, path: &str) -> Result<Vec<u8>>;
    fn read_to_string(&self, path: &str) -> Result<String>;
    fn file_exists(&self, path: &str) -> bool;
    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>>;
    fn open_file(&self, path: &str) -> Result<Box<dyn Read>>;

    /// Returns the file system path for a given path.
    ///
    /// For zip file this will extract the file to a temporary location,
    /// whereas for directory provider it will essentially be a no-op.
    fn fs_file(&self, path: &str) -> Result<FsFile>;
}

#[derive(Debug)]
pub struct DirectoryProvider {
    base_path: PathBuf,
}

impl DirectoryProvider {
    pub fn new<P: AsRef<Path>>(base_path: P) -> Self {
        Self {
            base_path: base_path.as_ref().to_path_buf(),
        }
    }
}

impl FileProvider for DirectoryProvider {
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        let full_path = self.base_path.join(path);
        fs::read(&full_path)
            .with_context(|| format!("Failed to read file: {}", full_path.display()))
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        let full_path = self.base_path.join(path);
        fs::read_to_string(&full_path)
            .with_context(|| format!("Failed to read file to string: {}", full_path.display()))
    }

    fn file_exists(&self, path: &str) -> bool {
        self.base_path.join(path).exists()
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        let full_path = self.base_path.join(path);
        let mut files = Vec::new();

        for entry in WalkDir::new(&full_path) {
            let entry = entry?;
            if entry.file_type().is_file() {
                let relative_path = entry
                    .path()
                    .strip_prefix(&self.base_path)?
                    .to_string_lossy()
                    .replace('\\', "/");

                if !ends_with
                    .iter()
                    .any(|suffix| relative_path.ends_with(suffix))
                {
                    continue;
                }
                files.push(relative_path);
            }
        }

        files.sort();
        Ok(files)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        // For directory provider, no extraction needed - return direct path
        Ok(FsFile {
            path: self.base_path.join(path),
        })
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        let full_path = self.base_path.join(path);
        let file = fs::File::open(&full_path)
            .with_context(|| format!("Failed to open file: {}", full_path.display()))?;
        Ok(Box::new(file))
    }
}

#[derive(Debug)]
pub struct ZipProvider {
    zip_path: PathBuf,
    file_index: HashMap<String, (rawzip::ZipArchiveEntryWayfinder, rawzip::CompressionMethod)>,
    temp_dir: tempfile::TempDir,
}

impl ZipProvider {
    pub fn new<P: AsRef<Path>>(zip_path: P) -> Result<Self> {
        let zip_path = zip_path.as_ref().to_path_buf();

        // Use file-based API to build index efficiently
        let file = fs::File::open(&zip_path)
            .with_context(|| format!("Failed to open zip file: {}", zip_path.display()))?;

        let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
        let archive = rawzip::ZipArchive::from_file(file, &mut buf)
            .with_context(|| format!("Failed to parse zip archive: {}", zip_path.display()))?;

        // Build file index once
        let mut file_index = HashMap::new();
        let mut entries = archive.entries(&mut buf);

        while let Some(entry) = entries.next_entry()? {
            let file_path = entry.file_path().try_normalize()?.into();
            let wayfinder = entry.wayfinder();
            let compression_method = entry.compression_method();
            file_index.insert(file_path, (wayfinder, compression_method));
        }

        Ok(Self {
            zip_path,
            file_index,
            temp_dir: tempfile::tempdir()?,
        })
    }

    fn read_file_data(
        &self,
        wayfinder: rawzip::ZipArchiveEntryWayfinder,
        compression_method: rawzip::CompressionMethod,
    ) -> Result<Vec<u8>> {
        let file = fs::File::open(&self.zip_path)?;
        let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
        let archive = rawzip::ZipArchive::from_file(file, &mut buf)?;

        let entry = archive.get_entry(wayfinder)?;

        match compression_method {
            rawzip::CompressionMethod::Store => {
                // No compression - read directly
                let reader = entry.reader();
                let mut verifying_reader = entry.verifying_reader(reader);
                let mut buffer = Vec::new();
                verifying_reader.read_to_end(&mut buffer)?;
                Ok(buffer)
            }
            rawzip::CompressionMethod::Deflate => {
                // Deflate compression
                let reader = entry.reader();
                let inflater = flate2::read::DeflateDecoder::new(reader);
                let mut verifying_reader = entry.verifying_reader(inflater);
                let mut buffer = Vec::new();
                verifying_reader.read_to_end(&mut buffer)?;
                Ok(buffer)
            }
            rawzip::CompressionMethod::Zstd => {
                // Zstd compression
                let reader = entry.reader();
                let decoder = zstd::stream::read::Decoder::new(reader)?;
                let mut verifying_reader = entry.verifying_reader(decoder);
                let mut buffer = Vec::new();
                verifying_reader.read_to_end(&mut buffer)?;
                Ok(buffer)
            }
            _ => Err(anyhow!(
                "Unsupported compression method: {:?}",
                compression_method
            )),
        }
    }

    fn create_reader(
        &self,
        wayfinder: rawzip::ZipArchiveEntryWayfinder,
        compression_method: rawzip::CompressionMethod,
    ) -> Result<Box<dyn Read>> {
        // For simplicity, read the full data and return a cursor
        // This avoids lifetime issues with the archive
        let data = self.read_file_data(wayfinder, compression_method)?;
        Ok(Box::new(std::io::Cursor::new(data)))
    }
}

impl FileProvider for ZipProvider {
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        let (wayfinder, compression_method) = self
            .file_index
            .get(path)
            .ok_or_else(|| anyhow!("File not found: {}", path))?;

        self.read_file_data(*wayfinder, *compression_method)
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        let bytes = self.read_file(path)?;
        String::from_utf8(bytes).with_context(|| format!("File is not valid UTF-8: {}", path))
    }

    fn file_exists(&self, path: &str) -> bool {
        self.file_index.contains_key(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        let mut results: Vec<String> = self
            .file_index
            .keys()
            .filter(|file_path| file_path.starts_with(path))
            .filter(|file_path| ends_with.iter().any(|suffix| file_path.ends_with(suffix)))
            .cloned()
            .collect();
        results.sort();
        Ok(results)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        let (wayfinder, compression_method) = self
            .file_index
            .get(path)
            .ok_or_else(|| anyhow!("File not found: {}", path))?;

        let file_name = Path::new(path)
            .file_name()
            .ok_or_else(|| anyhow!("Invalid path: {}", path))?;
        let temp_path = self.temp_dir.path().join(file_name);

        // Read file data and write to temp file
        let file_data = self.read_file_data(*wayfinder, *compression_method)?;
        fs::write(&temp_path, file_data)?;

        Ok(FsFile { path: temp_path })
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        let (wayfinder, compression_method) = self
            .file_index
            .get(path)
            .ok_or_else(|| anyhow!("File not found: {}", path))?;

        self.create_reader(*wayfinder, *compression_method)
    }
}

// Helper function to create appropriate provider based on path
pub fn create_provider<P: AsRef<Path>>(source_path: P) -> Result<Box<dyn FileProvider>> {
    let path = source_path.as_ref();

    if path.is_dir() {
        Ok(Box::new(DirectoryProvider::new(path)))
    } else if path.extension().and_then(|s| s.to_str()) == Some("zip") {
        Ok(Box::new(ZipProvider::new(path)?))
    } else {
        Err(anyhow!("Unsupported source type: {}", path.display()))
    }
}

/// Implement FileProvider for all Box<dyn FileProvider>
impl FileProvider for Box<dyn FileProvider> {
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        self.as_ref().read_file(path)
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        self.as_ref().read_to_string(path)
    }

    fn file_exists(&self, path: &str) -> bool {
        self.as_ref().file_exists(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        self.as_ref().walk_directory(path, ends_with)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        self.as_ref().fs_file(path)
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        self.as_ref().open_file(path)
    }
}
