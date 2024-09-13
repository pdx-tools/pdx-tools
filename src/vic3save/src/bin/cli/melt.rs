use std::{error::Error, io::BufWriter};
use vic3save::{BasicTokenResolver, FailedResolveStrategy, Vic3File};

pub fn run(file_data: &[u8]) -> Result<(), Box<dyn Error>> {
    let file = Vic3File::from_slice(file_data)?;
    let file_data = std::fs::read("assets/vic3.txt").unwrap_or_default();
    let resolver = BasicTokenResolver::from_text_lines(file_data.as_slice())?;
    let stdout = std::io::stdout();
    let handle = stdout.lock();
    let buffer = BufWriter::new(handle);
    file.melter()
        .on_failed_resolve(FailedResolveStrategy::Error)
        .melt(buffer, &resolver)?;
    Ok(())
}
