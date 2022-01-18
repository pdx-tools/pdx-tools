use anyhow::bail;

mod reprocess;

enum Subcommand {
    Reprocess,
}

fn interpret_subcommand(input: Option<&str>) -> anyhow::Result<Subcommand> {
    match input {
        Some("reprocess") => Ok(Subcommand::Reprocess),
        Some(_) => bail!("unrecognized subcommand, must be reprocess"),
        None => bail!("must provide subcommand"),
    }
}

fn main() -> anyhow::Result<()> {
    let mut args = pico_args::Arguments::from_env();
    let command = interpret_subcommand(args.subcommand()?.as_deref())?;

    match command {
        Subcommand::Reprocess => reprocess::cmd(args),
    }
}
