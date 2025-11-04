use eu5save::{BasicTokenResolver, Eu5File, FailedResolveStrategy, MeltOptions};
use std::{env, io::BufWriter};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let file = std::fs::File::open(&args[1])?;
    let file = Eu5File::from_file(file)?;
    let file_data = std::fs::read("assets/eu5.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;
    let stdout = std::io::stdout();
    let handle = stdout.lock();
    let mut buffer = BufWriter::new(handle);
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Error);
    file.melt(options, &resolver, &mut buffer)?;
    Ok(())
}
