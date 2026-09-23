use base64::Engine;
use highway::{HighwayHash, HighwayHasher, Key};
use std::io::Write;

fn new_key() -> Key {
    // The same partition primes that the EU4 save checksum uses.
    Key([10619863, 6620830889, 80630964769, 228204732751])
}

/// Accumulates a hash that identifies the content of a save.
///
/// The hash covers the decompressed metadata and gamestate streams, not the
/// bytes of the container. A save keeps the same hash when the client
/// transcodes it to a different compression before upload, so the hash can
/// detect duplicate uploads of the same save.
///
/// Pass it as the observer of [`Eu5SaveLoader::open_with`], which writes the
/// content to it as the content is read, so the save is read only once.
///
/// [`Eu5SaveLoader::open_with`]: crate::Eu5SaveLoader::open_with
#[derive(Debug)]
pub struct SaveCheckSummer(HighwayHasher);

impl SaveCheckSummer {
    pub fn new() -> Self {
        Self(HighwayHasher::new(new_key()))
    }

    pub fn finish(self) -> String {
        let bytes: Vec<u8> = self
            .0
            .finalize256()
            .iter()
            .flat_map(|word| word.to_le_bytes())
            .collect();
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }
}

impl Default for SaveCheckSummer {
    fn default() -> Self {
        Self::new()
    }
}

impl Write for SaveCheckSummer {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.append(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
