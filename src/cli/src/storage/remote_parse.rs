use anyhow::Context;
use eu4save::{models::Eu4Save, Encoding};
use flate2::bufread::GzDecoder;
use std::fs::{self, File};
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

fn brotli_inflate(file: &File, meta: &fs::Metadata) -> anyhow::Result<Vec<u8>> {
    let buffer_size = 4096;
    let mut reader = BufReader::new(file);
    let mut input = brotli::Decompressor::new(&mut reader, buffer_size);
    let mut out = vec![0u8; buffer_size];
    input.read_exact(&mut out)?;

    // Now that we know it is a brotli stream, let's allocate a buffer accordingly.
    // Some empirical evidence shows that it should be around 17x after inflation.
    out.reserve((meta.len() * 17) as usize);
    std::io::copy(&mut input, &mut out)?;
    Ok(out)
}

pub(crate) fn inflate_file(mut file: &File) -> anyhow::Result<Vec<u8>> {
    let meta = file.metadata()?;
    if let Ok(out) = brotli_inflate(file, &meta) {
        return Ok(out);
    };

    file.seek(SeekFrom::Start(0)).context("unable to seek")?;
    let mut out = vec![0u8; 2];
    file.read_exact(out.as_mut_slice())
        .context("unable to read magic number")?;
    if out.as_slice() == [0x1f, 0x8b] {
        out.clear();
        out.reserve(meta.len() as usize * 10);
        file.seek(SeekFrom::Start(0)).context("unable to seek")?;
        let reader = BufReader::new(file);
        let mut decoder = GzDecoder::new(reader);
        if let Ok(_) = std::io::copy(&mut decoder, &mut out) {
            return Ok(out);
        }
    }

    out.reserve(meta.len() as usize);
    file.read_to_end(&mut out)?;
    Ok(out)
}

pub(crate) fn remote_parse(path: &Path) -> anyhow::Result<(Eu4Save, Encoding)> {
    let file = File::open(path).context("unable to open")?;
    let data = inflate_file(&file)?;
    Ok(eu4game::shared::parse_save(&data).context("unable to parse")?)
}
