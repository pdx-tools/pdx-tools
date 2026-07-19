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

pub trait FileProvider: Send + Sync {
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
            rawzip::CompressionMethod::STORE => {
                // No compression - read directly
                let reader = entry.reader();
                let mut verifying_reader = entry.verifying_reader(reader);
                let mut buffer = Vec::new();
                verifying_reader.read_to_end(&mut buffer)?;
                Ok(buffer)
            }
            rawzip::CompressionMethod::DEFLATE => {
                // Deflate compression
                let reader = entry.reader();
                let inflater = flate2::read::DeflateDecoder::new(reader);
                let mut verifying_reader = entry.verifying_reader(inflater);
                let mut buffer = Vec::new();
                verifying_reader.read_to_end(&mut buffer)?;
                Ok(buffer)
            }
            rawzip::CompressionMethod::ZSTD => {
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
        let dir_prefix = format!("{}/", path.trim_end_matches('/'));
        let mut results: Vec<String> = self
            .file_index
            .keys()
            .filter(|file_path| file_path.starts_with(&dir_prefix))
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
pub fn create_provider<P: AsRef<Path>>(
    source_path: P,
) -> Result<Box<dyn FileProvider + Send + Sync>> {
    let path = source_path.as_ref();

    if path.is_dir() {
        Ok(Box::new(DirectoryProvider::new(path)))
    } else if path.extension().and_then(|s| s.to_str()) == Some("zip") {
        Ok(Box::new(ZipProvider::new(path)?))
    } else {
        Err(anyhow!("Unsupported source type: {}", path.display()))
    }
}

impl<P> FileProvider for Box<P>
where
    P: FileProvider + ?Sized,
{
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

impl<P> FileProvider for &P
where
    P: FileProvider + ?Sized,
{
    fn read_file(&self, path: &str) -> Result<Vec<u8>> {
        (*self).read_file(path)
    }

    fn read_to_string(&self, path: &str) -> Result<String> {
        (*self).read_to_string(path)
    }

    fn file_exists(&self, path: &str) -> bool {
        (*self).file_exists(path)
    }

    fn walk_directory(&self, path: &str, ends_with: &[&str]) -> Result<Vec<String>> {
        (*self).walk_directory(path, ends_with)
    }

    fn fs_file(&self, path: &str) -> Result<FsFile> {
        (*self).fs_file(path)
    }

    fn open_file(&self, path: &str) -> Result<Box<dyn Read>> {
        (*self).open_file(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn zip_with_files(
        files: &[(&str, &[u8], rawzip::CompressionMethod)],
    ) -> tempfile::NamedTempFile {
        let mut tmp = tempfile::Builder::new().suffix(".zip").tempfile().unwrap();
        let mut writer = rawzip::ZipArchiveWriter::new(&mut tmp);

        for (path, contents, compression_method) in files {
            let (mut entry, config) = writer
                .new_file(path)
                .compression_method(*compression_method)
                .start()
                .unwrap();

            match *compression_method {
                rawzip::CompressionMethod::STORE => {
                    let mut w = config.wrap(&mut entry);
                    std::io::copy(&mut Cursor::new(contents), &mut w).unwrap();
                    let (_, output) = w.finish().unwrap();
                    entry.finish(output).unwrap();
                }
                rawzip::CompressionMethod::DEFLATE => {
                    let encoder = flate2::write::DeflateEncoder::new(
                        &mut entry,
                        flate2::Compression::default(),
                    );
                    let mut w = config.wrap(encoder);
                    std::io::copy(&mut Cursor::new(contents), &mut w).unwrap();
                    let (encoder, output) = w.finish().unwrap();
                    encoder.finish().unwrap();
                    entry.finish(output).unwrap();
                }
                rawzip::CompressionMethod::ZSTD => {
                    let encoder = zstd::stream::Encoder::new(&mut entry, 0).unwrap();
                    let mut w = config.wrap(encoder);
                    std::io::copy(&mut Cursor::new(contents), &mut w).unwrap();
                    let (encoder, output) = w.finish().unwrap();
                    encoder.finish().unwrap();
                    entry.finish(output).unwrap();
                }
                method => panic!("test helper does not support {method:?}"),
            }
        }

        writer.finish().unwrap();
        tmp
    }

    #[test]
    fn walk_directory_does_not_match_sibling_directories_with_shared_prefix() {
        let tmp = zip_with_files(&[
            (
                "game/in_game/common/goods/00_goods.txt",
                b"x",
                rawzip::CompressionMethod::STORE,
            ),
            (
                "game/in_game/common/goods_demand/army_demands.txt",
                b"x",
                rawzip::CompressionMethod::STORE,
            ),
        ]);

        let provider = ZipProvider::new(tmp.path()).unwrap();
        let files = provider
            .walk_directory("game/in_game/common/goods", &[".txt"])
            .unwrap();

        assert_eq!(files, vec!["game/in_game/common/goods/00_goods.txt"]);
    }

    #[test]
    fn read_file_supports_zip_compression_methods_used_by_provider() {
        let tmp = zip_with_files(&[
            (
                "stored.txt",
                b"stored contents",
                rawzip::CompressionMethod::STORE,
            ),
            (
                "deflated.txt",
                b"deflated contents",
                rawzip::CompressionMethod::DEFLATE,
            ),
            (
                "zstd.txt",
                b"zstd contents",
                rawzip::CompressionMethod::ZSTD,
            ),
        ]);

        let provider = ZipProvider::new(tmp.path()).unwrap();

        assert_eq!(
            provider.read_file("stored.txt").unwrap(),
            b"stored contents"
        );
        assert_eq!(
            provider.read_to_string("deflated.txt").unwrap(),
            "deflated contents"
        );
        assert_eq!(provider.read_file("zstd.txt").unwrap(), b"zstd contents");
    }

    #[test]
    fn open_file_reads_zip_entry_contents() {
        let tmp = zip_with_files(&[(
            "common/countries.txt",
            b"country = FRA",
            rawzip::CompressionMethod::DEFLATE,
        )]);
        let provider = ZipProvider::new(tmp.path()).unwrap();
        let mut reader = provider.open_file("common/countries.txt").unwrap();
        let mut contents = String::new();

        reader.read_to_string(&mut contents).unwrap();

        assert_eq!(contents, "country = FRA");
    }

    #[test]
    fn fs_file_extracts_zip_entry_to_temp_file() {
        let tmp = zip_with_files(&[(
            "gfx/interface/icon.dds",
            b"fake image data",
            rawzip::CompressionMethod::STORE,
        )]);
        let provider = ZipProvider::new(tmp.path()).unwrap();

        let fs_file = provider.fs_file("gfx/interface/icon.dds").unwrap();

        assert_eq!(fs_file.path.file_name().unwrap(), "icon.dds");
        assert_eq!(fs::read(fs_file.path).unwrap(), b"fake image data");
    }

    #[test]
    fn missing_zip_entry_returns_not_found_errors() {
        let tmp = zip_with_files(&[("exists.txt", b"x", rawzip::CompressionMethod::STORE)]);
        let provider = ZipProvider::new(tmp.path()).unwrap();

        assert!(!provider.file_exists("missing.txt"));
        assert_eq!(
            provider.read_file("missing.txt").unwrap_err().to_string(),
            "File not found: missing.txt"
        );
        assert_eq!(
            provider.open_file("missing.txt").err().unwrap().to_string(),
            "File not found: missing.txt"
        );
        assert_eq!(
            provider.fs_file("missing.txt").unwrap_err().to_string(),
            "File not found: missing.txt"
        );
    }
}
