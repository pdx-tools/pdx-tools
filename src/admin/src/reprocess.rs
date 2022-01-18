use admin_shared::parser::{ParseFileError, ParseResult, ParsedFile};
use anyhow::{bail, Context};
use serde::Serialize;
use std::{
    fs::File,
    io::{self, BufReader, BufWriter},
    path::Path,
};
use tempfile::tempfile;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReprocessEntry {
    pub save_id: String,
    pub save: ParsedFile,
}

// maybe the file is brotli decoded. There's no way to know, so
// if we don't succeed in the decoding step return the original error,
// else return the parse result on the brotli inflated data
fn brotli_parse(fp: &Path, original_err: ParseFileError) -> anyhow::Result<ParseResult> {
    let inflated_file = tempfile()?;
    let deflated_file = File::open(fp)?;

    let mut writer = BufWriter::new(inflated_file);
    let mut reader = BufReader::new(deflated_file);

    match brotli::BrotliDecompress(&mut reader, &mut writer) {
        Ok(_) => Ok(admin_shared::parser::parse_file(writer.into_inner()?)?),
        Err(_) => Err(original_err.into()),
    }
}

pub fn cmd(args: pico_args::Arguments) -> anyhow::Result<()> {
    let mut saves = Vec::new();
    let rest = args.finish();
    let files = rest
        .iter()
        .flat_map(|fp| WalkDir::new(fp).into_iter().filter_map(|e| e.ok()))
        .filter(|e| e.file_type().is_file());

    for file in files {
        let path = file.path();

        let parsed = match admin_shared::parser::parse_path(path) {
            Ok(x) => Ok(x),
            Err(e) => brotli_parse(path, e),
        };

        let save = parsed.with_context(|| format!("unable to parse: {}", path.display()))?;

        let save = match save {
            ParseResult::InvalidPatch(_) => bail!("unable parse patch"),
            ParseResult::Parsed(x) => *x,
        };

        saves.push(ReprocessEntry {
            save_id: String::from(path.to_str().unwrap()),
            save,
        });
    }

    let stdout = io::stdout();
    let mut locked = stdout.lock();
    serde_json::to_writer(&mut locked, &saves)?;
    Ok(())
}
