use std::{error::Error, fs, io::BufWriter};
use vic3save::{BasicTokenResolver, FailedResolveStrategy, MeltOptions, Vic3File};

pub fn run(raw_args: &[String]) -> Result<(), Box<dyn Error>> {
    let file = fs::File::open(&raw_args[0])?;
    let mut file = Vic3File::from_file(file)?;
    let file_data = std::fs::read("assets/vic3.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;
    let stdout = std::io::stdout();
    let handle = stdout.lock();
    let mut buffer = BufWriter::new(handle);
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Error);
    file.melt(options, &resolver, &mut buffer)?;
    Ok(())
}
