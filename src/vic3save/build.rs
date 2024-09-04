use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;

fn main() {
    let out_path = Path::new(&env::var("OUT_DIR").unwrap()).join("gen_tokens.rs");
    let mut writer = BufWriter::new(File::create(out_path).unwrap());
    writeln!(writer, "match token {{").unwrap();

    println!("cargo:rerun-if-env-changed=VIC3_IRONMAN_TOKENS");
    let tfile = env::var("VIC3_IRONMAN_TOKENS")
        .ok()
        .filter(|x| !x.is_empty());

    println!("cargo::rustc-check-cfg=cfg(ironman)");
    if let Some(v) = tfile {
        println!("cargo:rustc-cfg=ironman");
        println!("cargo:rerun-if-changed={}", v);
        let file = File::open(&v).unwrap();
        let mut reader = BufReader::new(file);

        let mut line = String::new();
        while reader.read_line(&mut line).unwrap() != 0 {
            let (token_val, token_s) = line.split_once(' ').unwrap();
            writeln!(writer, "{} => Some(\"{}\"),", token_val, token_s.trim()).unwrap();
            line.clear();
        }
    }

    writeln!(writer, "_ => None,").unwrap();
    writeln!(writer, "}}").unwrap();
}
