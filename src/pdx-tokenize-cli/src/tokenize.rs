use anyhow::Context;
use highway::HighwayHash;
use pdx_zstd::zstd_tee::{ZstdFiles, ZstdTee};
use std::{
    fs::File,
    io::{self, BufRead, BufReader, Cursor, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

pub struct TokenizeArgs {
    pub tokens_dir: PathBuf,
}

impl TokenizeArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        for game in ["eu4", "eu5", "ck3", "hoi4", "imperator", "vic3"] {
            let token_file = self.tokens_dir.join(game).with_extension("txt");
            if token_file.exists() {
                let file = File::open(&token_file)?;
                if file.metadata()?.len() > 0 {
                    tokenize_path(token_file)?;
                    continue;
                }
            }

            tracing::info!(
                name: "tokenize.file.skip",
                game = %token_file.display(),
                "skipping empty tokenization file"
            );
        }

        Ok(ExitCode::SUCCESS)
    }
}

fn tokenize_path<P>(path: P) -> anyhow::Result<()>
where
    P: AsRef<Path>,
{
    let file_path = path.as_ref();
    let reader = File::open(file_path)
        .with_context(|| format!("unable to open {}", path.as_ref().display()))?;

    let zstd_files = ZstdFiles::from_path(file_path)?;

    let buffered = Vec::new();
    let mut buf_cursor = Cursor::new(buffered);
    tokenize(reader, &mut buf_cursor, zstd_files.name())?;
    let buffered = buf_cursor.into_inner();
    let mut hasher = highway::HighwayHasher::new(highway::Key::default());
    hasher.append(&buffered);
    let new_out = hasher.finalize256();

    if let Ok(mut raw_file) = File::open(zstd_files.raw_path()) {
        let mut hasher = highway::HighwayHasher::new(highway::Key::default());
        std::io::copy(&mut raw_file, &mut hasher)
            .context("unable to read existing tokenize file")?;
        let old_out = hasher.finalize256();
        if new_out == old_out {
            tracing::info!(
                name: "tokenize.file.unchanged",
                game = %zstd_files.name(),
                "no changes detected for token file"
            );
            return Ok(());
        }
    }

    let mut writer = ZstdTee::from_zstd_files(zstd_files)?;
    std::io::copy(&mut buffered.as_slice(), &mut writer)
        .context("unable to write to tokenize file")?;
    Ok(())
}

fn tokenize<R, W>(reader: R, mut top_writer: W, name: &str) -> anyhow::Result<()>
where
    R: io::Read,
    W: io::Write,
{
    let mut reader = BufReader::new(reader);

    let mut tokens: Vec<String> = Vec::new();
    let mut current = 0u16;
    let mut line = String::new();
    let mut empty_count = 0;
    let mut empty_ranges = 0;
    let mut breakpoint = 0;

    while reader.read_line(&mut line).context("read line")? != 0 {
        let (num, text) = line
            .split_once(' ')
            .with_context(|| format!("unable to split line: `{line}"))?;
        let z = u16::from_str_radix(num.trim_start_matches("0x"), 16)
            .with_context(|| format!("unable to parse {num}"))?;

        if z != current {
            tracing::debug!(
                name: "tokenize.parsing.empty_range",
                range_start = current,
                range_end = z,
                range_length = z - current,
                "empty range encountered"
            );
            empty_ranges += 1;
            for _ in current..z {
                empty_count += 1;
                tokens.push(String::from(""));
            }
        }

        if z < 10000 {
            breakpoint = z;
        }

        tokens.push(String::from(text.trim()));
        current = z + 1;
        line.clear();
    }

    let mut writer = Cursor::new(Vec::new());
    writer.write_all(&(u16::try_from(tokens.len())?).to_le_bytes())?;
    writer.write_all(&breakpoint.to_le_bytes())?;

    let toks = tokens[..usize::from(breakpoint)]
        .iter()
        .chain(tokens[usize::from(schemas::BREAKPOINT)..].iter());

    for token in toks {
        writer.write_all(&u8::try_from(token.len())?.to_le_bytes())?;
        writer.write_all(token.as_bytes())?;
    }

    let raw = writer.into_inner();
    tracing::info!(
        name: "tokenize.processing.complete",
        game = %name,
        tokens_count = tokens.len(),
        breakpoint = breakpoint,
        empty_count = empty_count,
        empty_ranges_count = empty_ranges,
        byte_size = raw.len(),
        "tokenization complete"
    );
    top_writer.write_all(&raw)?;
    Ok(())
}
