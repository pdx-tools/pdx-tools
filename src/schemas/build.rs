use std::{
    env,
    fs::File,
    io::{BufWriter, Write},
    path::Path,
};

fn main() {
    if std::env::var("XARGO_HOME").is_err() {
        println!("cargo:rerun-if-changed=src/eu4.fbs");
        flatc_rust::run(flatc_rust::Args {
            inputs: &[Path::new("src/eu4.fbs")],
            out_dir: Path::new("target/flatbuffers/"),
            ..Default::default()
        })
        .expect("flatc");
    }

    let out_path = Path::new(&env::var("OUT_DIR").unwrap()).join("gen_tokens.rs");
    let mut writer = BufWriter::new(File::create(&out_path).unwrap());

    for game in &["eu4", "ck3", "hoi4", "imperator", "vic3"] {
        let mut pascal = String::from(*game);
        pascal.get_mut(0..1).unwrap().make_ascii_uppercase();
        let path = format!("../../assets/tokens/{game}-raw.bin");
        let tokens = Path::new(&path);
        let exists = tokens.exists();
        let token_path = if exists {
            tokens.canonicalize().unwrap().display().to_string()
        } else {
            String::from("")
        };

        writeln!(
            writer,
            r#"
#[cfg(feature = "inline")]
pub struct {pascal}FlatTokens {{
    resolver: FlatResolver<'static>,
}}

#[cfg(feature = "inline")]
impl {pascal}FlatTokens {{
    #[cfg({game}_tokens)]
    pub fn new() -> Self {{
        let data = include_bytes!("{token_path}");
        Self {{
            resolver: FlatResolver::from_slice(data),
        }}
    }}

    #[cfg(not({game}_tokens))]
    pub fn new() -> Self {{
        Self {{
            resolver: FlatResolver {{
                values: Vec::new(),
                breakpoint: 0,
            }},
        }}
    }}
}}

#[cfg(feature = "inline")]
impl Default for {pascal}FlatTokens {{
    fn default() -> Self {{
        Self::new()
    }}
}}

#[cfg(feature = "inline")]
impl jomini::binary::TokenResolver for {pascal}FlatTokens {{
    fn resolve(&self, token: u16) -> Option<&str> {{
        self.resolver.resolve(token)
    }}
}}
"#
        )
        .unwrap();

        if tokens.exists() {
            println!("cargo:rustc-cfg={game}_tokens");
        }
    }
}
