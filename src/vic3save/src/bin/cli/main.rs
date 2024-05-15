use std::{env, error::Error, io::Read};

mod fmt;
mod markets;
mod melt;
mod stats_cli;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    let stdin = std::io::stdin();
    let mut lock = stdin.lock();
    let mut buf = Vec::new();

    match args[1].as_str() {
        "fmt" => {
            lock.read_to_end(&mut buf)?;
            fmt::run(&buf)
        }
        "melt" => {
            lock.read_to_end(&mut buf)?;
            melt::run(&buf)
        }
        "stats" => stats_cli::run(&args[1..]),
        "market" => markets::run(&args[1..]),
        x => panic!("unrecognized argument: {}", x),
    }?;

    Ok(())
}
