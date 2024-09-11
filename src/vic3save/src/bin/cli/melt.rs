use std::{error::Error, io::BufWriter};
use vic3save::{EnvTokens, FailedResolveStrategy, Vic3File};

pub fn run(file_data: &[u8]) -> Result<(), Box<dyn Error>> {
    let file = Vic3File::from_slice(file_data)?;
    let stdout = std::io::stdout();
    let handle = stdout.lock();
    let buffer = BufWriter::new(handle);
    file.melter()
        .on_failed_resolve(FailedResolveStrategy::Error)
        .melt(buffer, &EnvTokens)?;
    Ok(())
}
