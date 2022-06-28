use anyhow::Context;
use eu4save::{models::Eu4Save, Encoding};
use flate2::read::GzDecoder;
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom};
use std::path::Path;
use tempfile::tempfile;

// maybe the file is brotli encoded. There's no way to know, so
// if we don't succeed in the decoding step return the original error,
// else return the parse result on the brotli inflated data
fn brotli_parse(fp: &Path) -> anyhow::Result<(Eu4Save, Encoding)> {
    let inflated_file = tempfile()?;
    let deflated_file = File::open(fp)?;

    let mut writer = BufWriter::new(inflated_file);
    let mut reader = BufReader::new(deflated_file);

    brotli::BrotliDecompress(&mut reader, &mut writer)?;
    applib::parser::extract_save(writer.into_inner()?).map_err(|e| e.into())
}

pub(crate) fn remote_parse(path: &Path) -> anyhow::Result<(Eu4Save, Encoding)> {
    let mut file = File::open(path).context("unable to open")?;
    let mut magic = [0u8; 2];
    file.read_exact(&mut magic)
        .context("unable to read magic number")?;

    if magic == [0x1f, 0x8b] {
        file.seek(SeekFrom::Start(0)).context("unable to seek")?;
        let mut inflated_file = tempfile().context("unable to create temporary file")?;
        let mut decoder = GzDecoder::new(file);

        // If the copy fails, let's try to brotli decode as the probability that a brotli
        // save starts with the gzip magic number is 1 in 4.3 billion
        match std::io::copy(&mut decoder, &mut inflated_file).map_err(|e| e.into()) {
            Ok(_) => applib::parser::extract_save(inflated_file).context("unable to parse"),
            Err(e) => brotli_parse(path).map_err(|_| e),
        }
    } else {
        file.seek(SeekFrom::Start(0)).context("unable to seek")?;
        match applib::parser::extract_save(file).map_err(|e| e.into()) {
            Ok(x) => Ok(x),
            Err(e) => brotli_parse(path).map_err(|_| e),
        }
    }
}
