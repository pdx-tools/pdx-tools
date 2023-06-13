use anyhow::Context;
use eu4save::{models::Eu4Save, Encoding};
use flate2::bufread::GzDecoder;
use std::fs::File;
use std::io::{BufReader, Read, Seek};
use std::path::Path;

pub(crate) fn inflate_file(mut file: &File) -> anyhow::Result<Vec<u8>> {
    let meta = file.metadata()?;
    file.rewind().context("unable to seek")?;
    let mut out = vec![0u8; 2];
    file.read_exact(out.as_mut_slice())
        .context("unable to read magic number")?;
    if out.as_slice() == [0x1f, 0x8b] {
        out.clear();
        out.reserve(meta.len() as usize * 10);
        file.rewind().context("unable to seek")?;
        let reader = BufReader::new(file);
        let mut decoder = GzDecoder::new(reader);
        if std::io::copy(&mut decoder, &mut out).is_ok() {
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
    eu4game::shared::parse_save(&data).context("unable to parse")
}
