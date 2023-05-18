use crate::zstd_tee::ZstdTee;
use anyhow::Context;
use clap::Args;
use log::{debug, info};
use std::{
    fs::File,
    io::{self, BufRead, BufReader, Cursor, Write},
    path::{Path, PathBuf},
    process::ExitCode,
};

/// Converts token text files into flatbuffers
#[derive(Args)]
pub struct TokenizeArgs {
    /// path to eu4 ironman tokens
    #[arg(long, env)]
    eu4_ironman_tokens: Option<PathBuf>,

    /// path to ck3 ironman tokens
    #[arg(long, env)]
    ck3_ironman_tokens: Option<PathBuf>,

    /// path to hoi4 ironman tokens
    #[arg(long, env)]
    hoi4_ironman_tokens: Option<PathBuf>,

    /// path to imperator tokens
    #[arg(long, env)]
    imperator_tokens: Option<PathBuf>,

    /// path to vic3 tokens
    #[arg(long, env)]
    vic3_tokens: Option<PathBuf>,
}

impl TokenizeArgs {
    pub fn run(&self) -> anyhow::Result<ExitCode> {
        if let Some(e) = self.eu4_ironman_tokens.as_ref() {
            tokenize_path(e, "eu4")?
        }

        if let Some(e) = self.ck3_ironman_tokens.as_ref() {
            tokenize_path(e, "ck3")?
        }

        if let Some(e) = self.hoi4_ironman_tokens.as_ref() {
            tokenize_path(e, "hoi4")?
        }

        if let Some(e) = self.imperator_tokens.as_ref() {
            tokenize_path(e, "imperator")?
        }

        if let Some(e) = self.vic3_tokens.as_ref() {
            tokenize_path(e, "vic3")?
        }

        Ok(ExitCode::SUCCESS)
    }
}

fn tokenize_path<P>(path: P, name: &str) -> anyhow::Result<()>
where
    P: AsRef<Path>,
{
    let reader = File::open(path.as_ref())
        .with_context(|| format!("unable to open {}", path.as_ref().display()))?;
    let out_dir = Path::new("assets").join("tokens");
    std::fs::create_dir_all(&out_dir).context("unable to create token directory")?;

    let out = out_dir.join(name);
    let mut writer = ZstdTee::create(out)?;

    tokenize(reader, &mut writer, name)?;
    writer.flush()?;
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
            debug!("empty range: [{},{}) {} len", current, z, z - current);
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
    info!(
        "{}: tokens: {}, breakpoint: {} empty: {}, empty ranges: {}, byte size: {}",
        name,
        tokens.len(),
        breakpoint,
        empty_count,
        empty_ranges,
        raw.len()
    );
    top_writer.write_all(&raw)?;
    Ok(())
}
