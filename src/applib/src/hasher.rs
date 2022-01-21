use eu4game::shared::SaveCheckSummer;
use std::{fs::File, io::Read};

pub fn hash(path: &str) -> Result<String, std::io::Error> {
    let mut f = File::open(path)?;
    let mut buffer = [0u8; 8192];
    let mut hasher = SaveCheckSummer::new();
    loop {
        let read = f.read(&mut buffer)?;
        hasher.append(&buffer[..read]);
        if read == 0 {
            return Ok(hasher.finish());
        }
    }
}
