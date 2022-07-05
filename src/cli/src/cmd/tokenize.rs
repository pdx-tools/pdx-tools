use crate::brotli_tee::BrotliTee;
use anyhow::Context;
use clap::Args;
use log::{info, debug};
use std::{
    fs::File,
    io::{self, BufRead, BufReader},
    path::{Path, PathBuf},
    process::ExitCode,
};

/// Converts token text files into flatbuffers
#[derive(Args)]
pub struct TokenizeArgs {
    /// path to eu4 ironman tokens
    #[clap(long, env, value_parser)]
    eu4_ironman_tokens: Option<PathBuf>,

    /// path to ck3 ironman tokens
    #[clap(long, env, value_parser)]
    ck3_ironman_tokens: Option<PathBuf>,

    /// path to hoi4 ironman tokens
    #[clap(long, env, value_parser)]
    hoi4_ironman_tokens: Option<PathBuf>,

    /// path to imperator tokens
    #[clap(long, env, value_parser)]
    imperator_tokens: Option<PathBuf>,
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

        Ok(ExitCode::SUCCESS)
    }
}

fn tokenize_path<P>(path: P, name: &str) -> anyhow::Result<()>
where
    P: AsRef<Path>,
{
    let reader = File::open(path.as_ref())
        .with_context(|| format!("unable to open {}", path.as_ref().display()))?;
    let out = Path::new("assets").join("tokens").join(name);
    let writer = BrotliTee::create(&out)?;

    tokenize(reader, writer, name)
}

fn tokenize<R, W>(reader: R, mut writer: W, name: &str) -> anyhow::Result<()>
where
    R: io::Read,
    W: io::Write,
{
    let mut buffer = schemas::flatbuffers::FlatBufferBuilder::new();
    let mut reader = BufReader::new(reader);

    let mut tokens: Vec<String> = Vec::new();
    let mut current = 0u16;
    let mut line = String::new();
    let mut empty_count = 0;
    let mut empty_ranges = 0;

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

        tokens.push(String::from(text.trim()));
        current = z + 1;
        line.clear();
    }

    let arg: Vec<_> = tokens.iter().map(|x| x.as_ref()).collect();
    let off = buffer.create_vector_of_strings(&arg);

    let root = schemas::tokens::Tokens::create(
        &mut buffer,
        &schemas::tokens::TokensArgs { values: Some(off) },
    );

    buffer.finish(root, None);
    let raw = buffer.finished_data();
    info!(
        "{}: tokens: {}, empty: {}, ranges: {}, size: {}",
        name,
        tokens.len(),
        empty_count,
        empty_ranges,
        raw.len()
    );
    writer.write_all(raw)?;
    Ok(())
}
