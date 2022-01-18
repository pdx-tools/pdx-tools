use std::path::Path;

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
}
