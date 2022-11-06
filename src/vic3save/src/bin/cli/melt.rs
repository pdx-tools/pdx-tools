use vic3save::{EnvTokens, Vic3File, FailedResolveStrategy};
use std::{error::Error, io::Write};

pub fn run(file_data: &[u8]) -> Result<(), Box<dyn Error>> {
    let file = Vic3File::from_slice(file_data)?;
    let mut zip_sink = Vec::new();
    let parsed_file = file.parse(&mut zip_sink)?;
    let binary = parsed_file.as_binary().unwrap();
    let out = binary
        .melter()
        .on_failed_resolve(FailedResolveStrategy::Error)
        .melt(&EnvTokens)?;

    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    handle.write_all(out.data())?;

    Ok(())
}