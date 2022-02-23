use anyhow::Context;
use std::{
    fs::File,
    io::{self, BufRead, BufReader},
    path::Path,
};

use crate::brotli_tee::BrotliTee;

pub fn cmd(_: pico_args::Arguments) -> anyhow::Result<()> {
    if let Ok(e) = std::env::var("EU4_IRONMAN_TOKENS") {
        tokenize_path(&e, Path::new("assets").join("tokens").join("eu4"))?
    }

    if let Ok(e) = std::env::var("HOI4_IRONMAN_TOKENS") {
        tokenize_path(&e, Path::new("assets").join("tokens").join("hoi4"))?
    }

    if let Ok(e) = std::env::var("CK3_IRONMAN_TOKENS") {
        tokenize_path(&e, Path::new("assets").join("tokens").join("ck3"))?
    }

    if let Ok(e) = std::env::var("IMPERATOR_TOKENS") {
        tokenize_path(&e, Path::new("assets").join("tokens").join("imperator"))?
    }

    Ok(())
}

fn tokenize_path<P>(path: &str, out: P) -> anyhow::Result<()>
where
    P: AsRef<Path>,
{
    let reader = File::open(&path).with_context(|| format!("unable to open {path}"))?;
    let writer = BrotliTee::create(out.as_ref());

    tokenize(reader, writer)
}

fn tokenize<R, W>(reader: R, mut writer: W) -> anyhow::Result<()>
where
    R: io::Read,
    W: io::Write,
{
    let mut buffer = schemas::flatbuffers::FlatBufferBuilder::new();
    let mut reader = BufReader::new(reader);

    let mut tokens: Vec<String> = Vec::new();
    let mut current = 0u16;
    let mut line = String::new();

    while reader.read_line(&mut line).unwrap() != 0 {
        let mut splits = line.splitn(2, ' ');
        let token_val = splits.next().context("missing token value")?;
        let z = u16::from_str_radix(token_val.trim_start_matches("0x"), 16)
            .with_context(|| format!("unable to parse {token_val}"))?;

        for _ in current..z {
            tokens.push(String::from(""));
        }

        let token_s = splits.next().context("missing token string")?;
        tokens.push(String::from(token_s.trim()));
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
    writer.write_all(raw)?;
    Ok(())
}
