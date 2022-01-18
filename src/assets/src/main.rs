use anyhow::bail;

mod sync_assets;

enum Subcommand {
    SyncAssets,
}

fn interpret_subcommand(input: Option<&str>) -> anyhow::Result<Subcommand> {
    match input {
        Some("sync-assets") => Ok(Subcommand::SyncAssets),
        Some(_) => bail!("unrecognized subcommand, must be reprocess"),
        None => bail!("must provide subcommand"),
    }
}

fn main() -> anyhow::Result<()> {
    let mut args = pico_args::Arguments::from_env();
    let command = interpret_subcommand(args.subcommand()?.as_deref())?;

    match command {
        Subcommand::SyncAssets => sync_assets::cmd(args),
    }
}
