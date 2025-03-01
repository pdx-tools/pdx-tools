use anyhow::Context;
use clap::Args;
use std::{
    io::{Cursor, Read, Seek},
    path::PathBuf,
    process::ExitCode,
};
use walkdir::WalkDir;

/// Re-encode save container format
#[derive(Args)]
pub struct TranscodeArgs {
    #[arg(long)]
    dest: PathBuf,

    /// Files and directories to parse
    #[arg(action = clap::ArgAction::Append)]
    files: Vec<PathBuf>,
}

impl TranscodeArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        let files = self
            .files
            .iter()
            .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
            .filter(|e| e.file_type().is_file());

        let mut buf = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
        for file in files {
            let path = file.path();
            let file = std::fs::File::open(path)
                .with_context(|| format!("unable to open: {}", path.display()))?;

            let file_length = file
                .metadata()
                .with_context(|| format!("unable to get metadata: {}", path.display()))?
                .len();

            let locator = rawzip::ZipLocator::new().max_search_space(1024);
            let data = match locator.locate_in_file(file, &mut buf) {
                Ok(zip) => {
                    let mut is_encoded = true;
                    let mut files = Vec::new();
                    let mut entries = zip.entries(&mut buf);
                    while let Some(entry) = entries.next_entry()? {
                        if !matches!(entry.file_raw_path(), b"meta" | b"gamestate" | b"ai") {
                            continue;
                        }

                        is_encoded &= entry.compression_method() == rawzip::CompressionMethod::Zstd;
                        files.push((entry.file_safe_path()?.into_owned(), entry.wayfinder()));
                    }

                    if is_encoded {
                        println!("{} already zstd", path.display());
                        continue;
                    }

                    let out = Vec::with_capacity(file_length as usize);
                    let cursor = Cursor::new(out);
                    let mut out_zip = rawzip::ZipArchiveWriter::new(cursor);

                    for (name, wayfinder) in files {
                        let options = rawzip::ZipEntryOptions::default()
                            .compression_method(rawzip::CompressionMethod::Zstd);
                        let mut out_file = out_zip.new_file(&name, options)?;
                        let enc = zstd::stream::Encoder::new(&mut out_file, 7)?;
                        let mut writer = rawzip::ZipDataWriter::new(enc);
                        let entry = zip.get_entry(wayfinder)?;
                        let reader = flate2::read::DeflateDecoder::new(entry.reader());
                        let mut reader = entry.verifying_reader(reader);
                        std::io::copy(&mut reader, &mut writer)?;
                        let (writer, output) = writer.finish()?;
                        writer.finish()?;
                        out_file.finish(output)?;
                    }

                    out_zip.finish()?.into_inner()
                }
                Err((mut file, _)) => {
                    let mut header = [0u8; 4];
                    file.seek(std::io::SeekFrom::Start(0))
                        .with_context(|| format!("unable to seek: {}", path.display()))?;
                    file.read_exact(&mut header)
                        .with_context(|| format!("unable to read header: {}", path.display()))?;

                    if header == zstd::zstd_safe::MAGICNUMBER.to_le_bytes() {
                        println!("{} already zstd", path.display());
                        continue;
                    }

                    file.seek(std::io::SeekFrom::Start(0))
                        .with_context(|| format!("unable to seek: {}", path.display()))?;

                    let out = Vec::with_capacity(file_length as usize);
                    let mut cursor = Cursor::new(out);
                    let mut encoder = zstd::Encoder::new(&mut cursor, 7)?;
                    std::io::copy(&mut file, &mut encoder)
                        .with_context(|| format!("unable to copy: {}", path.display()))?;
                    encoder
                        .finish()
                        .with_context(|| format!("unable to finish: {}", path.display()))?;
                    cursor.into_inner()
                }
            };

            let out_path = self.dest.join(path.file_name().unwrap());
            std::fs::write(&out_path, &data)
                .with_context(|| format!("unable to write to {}", out_path.display()))?;
            println!("{} {}/{}", out_path.display(), file_length, data.len());
        }

        Ok(ExitCode::SUCCESS)
    }
}
