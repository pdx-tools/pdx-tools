use packager::tarball::PackageOptions;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    let mut args = pico_args::Arguments::from_env();
    let generate_commons = args.contains("--common");
    let regen = args.contains("--regen");
    let path: PathBuf = args.free_from_str().unwrap();

    let options = PackageOptions {
        common: generate_commons,
        regen,
        path,
    };

    packager::tarball::parse_game_bundle(&options)
}
