use std::{env, error::Error, io::Read};

mod fmt;
mod markets;
mod melt;
mod stats_cli;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();

    match args[1].as_str() {
        "fmt" => {
            let stdin = std::io::stdin();
            let mut lock = stdin.lock();
            let mut buf = Vec::new();
            lock.read_to_end(&mut buf)?;
            fmt::run(&buf)
        }
        "melt" => melt::run(&args[2..]),
        "stats" => stats_cli::run(&args[2..]),
        "market" => markets::run(&args[2..]),
        x => panic!("unrecognized argument: {}", x),
    }?;

    Ok(())
}
