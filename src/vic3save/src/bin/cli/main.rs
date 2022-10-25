use std::{env, error::Error, io::Read};

mod fmt;

fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = env::args().collect();
    let stdin = std::io::stdin();
    let mut lock = stdin.lock();
    let mut buf = Vec::new();
    lock.read_to_end(&mut buf)?;

    match args[1].as_str() {
        "fmt" => fmt::run(&buf),
        x => panic!("unrecognized argument: {}", x),
    }?;

    Ok(())
}
