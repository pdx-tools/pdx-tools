use crate::Eu4GameError;
use base64::Engine;
use eu4save::{
    file::{Eu4Modeller, Eu4SliceFileKind},
    models::{CountryEvent, Eu4Save, GameState, Meta, Monarch},
    query::Query,
    CountryTag, Encoding, Eu4Date, Eu4Error, Eu4File, SegmentedResolver,
};
use highway::{HighwayHash, HighwayHasher, Key};
use serde::{de::DeserializeOwned, Deserializer};
use std::io::Read;

// This file contains code that is shared between the server and wasm, but not strictly relevant to
// the save file.

fn new_key() -> Key {
    // Partition primes! No particular reason why I chose them.
    Key([10619863, 6620830889, 80630964769, 228204732751])
}

fn copy_hash_output_to_byte_array(data: [u64; 4]) -> [u8; 4 * std::mem::size_of::<u64>()] {
    const HASH_LEN: usize = 4;
    const U64_LEN: usize = std::mem::size_of::<u64>();
    const BYTE_LEN: usize = U64_LEN * HASH_LEN;

    let mut bytes: [u8; BYTE_LEN] = [0; BYTE_LEN];
    for i in 0..HASH_LEN {
        bytes[U64_LEN * i..U64_LEN * (i + 1)].copy_from_slice(&data[i].to_le_bytes());
    }

    bytes
}

#[derive(Debug)]
pub struct SaveCheckSummer {
    hasher: Option<HighwayHasher>,
}

impl SaveCheckSummer {
    pub fn new(enabled: bool) -> Self {
        Self {
            hasher: enabled.then(|| HighwayHasher::new(new_key())),
        }
    }

    pub fn append(&mut self, data: &[u8]) {
        if let Some(hasher) = self.hasher.as_mut() {
            hasher.append(data)
        }
    }

    pub fn finish(self) -> Option<String> {
        if let Some(hasher) = self.hasher {
            let hash = hasher.finalize256();
            let bytes = copy_hash_output_to_byte_array(hash);
            Some(base64::engine::general_purpose::STANDARD.encode(bytes))
        } else {
            None
        }
    }
}

pub struct SaveCheckSummerReader<'a> {
    reader: Box<dyn Read + 'a>,
    hasher: &'a mut SaveCheckSummer,
}

impl<'a> std::fmt::Debug for SaveCheckSummerReader<'a> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SaveCheckSummerReader").finish()
    }
}

impl Read for SaveCheckSummerReader<'_> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self.reader.read(buf) {
            Ok(x) => {
                self.hasher.append(&buf[..x]);
                Ok(x)
            }
            Err(e) => Err(e),
        }
    }
}

// The playthrough id of a save is calculated from:
//
// - Randomly generated names for monarchs and queens created on startup
// - Randomly generated personalities for monarchs and queens created on startup
// - Heirs aren't used as their names can change
// - REB decision seed
//
// On 1.30.4 1444 start date, there are 73 countries with names randomly
// generated. Taking a randomly selected country, ZWI (Zuni), there are 16
// dynasty names and 9 male names. That leaves 144 start combinations for Zuni.
// Taking this as the average (it's not, as I would suspect this to be on the
// lower side), gives a total of 10,512 starting combinations. We need to find
// more entropy as the birthday problem states that one will easily find a
// collision given such a small pool. We can include the randomly generated adm,
// dip, and mil points for the ruler, but there are events that increase these
// (see hindu events, well advised events, elections) and it seems overly
// difficult to track this. Personalities seem to be the better option. Even
// rulers predefined at the start will often get assigned a random personality
// (and there are about 50 personalities and 600 rulers that are assigned
// personalities). Using just the first personality nets us another 30,000
// combinations. Unfortunately, there are some saves where personalities change
// (there are events that change personalities). IDs are also used in the
// calculation as while these don't change for a given patch, there is a high
// likelihood of them changing per patch.
//
// 40,000 combinations per patch is good, but it's not enough for me to sleep
// easy. PDXU informed me that the REB decision_seed is appears to uniquely
// identify a run and so it is added to the mix.
pub fn playthrough_id(query: &Query) -> String {
    let start_date = query.save().game.start_date;
    let monarch_content_date = start_date.add_days(1);
    let mut hash = HighwayHasher::new(new_key());

    if let Some(reb) = query.country(&CountryTag::new(*b"REB")) {
        hash.append(&reb.decision_seed.to_le_bytes())
    }

    // can't use advisors from province history as they are seemingly purged
    // from the history after they die.
    hash_countries(&mut hash, monarch_content_date, query.save());

    let output = hash.finalize256();
    let bytes = copy_hash_output_to_byte_array(output);
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub fn hash_countries(hash: &mut impl HighwayHash, content_date: Eu4Date, save: &Eu4Save) {
    let events = save
        .game
        .countries
        .iter()
        .map(|(_, country)| country)
        .flat_map(|country| {
            country.history.events.iter().filter_map(|(d, event)| {
                if d <= &content_date {
                    Some(event)
                } else {
                    None
                }
            })
        });

    let mut monarchs: Vec<&Monarch> = Vec::new();

    for event in events {
        match event {
            CountryEvent::Monarch(x) | CountryEvent::Queen(x) => {
                monarchs.push(x);
            }
            _ => {}
        }
    }

    // Have to sort the monarchs by name as monarchs are repositioned in the file as
    // new tags are formed. When england forms great britain, those english monarchs
    // are moved to that new tag and are now in a different order scanning the save
    // top to bottom. Sorting by monarch name fixes this.
    monarchs.sort_unstable_by_key(|x| x.id.id);

    for monarch in monarchs {
        hash.append(&monarch.id.id.to_le_bytes());
        hash.append(monarch.name.as_bytes());
    }
}

#[derive(Debug)]
pub struct Eu4SaveOutput {
    pub save: Eu4Save,
    pub encoding: Encoding,
    pub hash: Option<String>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Eu4Parser {
    debug: bool,
    hash: bool,
}

impl Eu4Parser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_debug(&mut self, debug: bool) -> &mut Self {
        self.debug = debug;
        self
    }

    pub fn with_hash(&mut self, hash: bool) -> &mut Self {
        self.hash = hash;
        self
    }

    #[cfg(feature = "embedded")]
    pub fn parse(&self, data: &[u8]) -> Result<Eu4SaveOutput, Eu4GameError> {
        let tokens = schemas::resolver::Eu4FlatTokens::new();
        let breakpoint = tokens.breakpoint();
        let values = tokens.into_values();
        let resolver = SegmentedResolver::from_parts(values, breakpoint, 10000);
        self.parse_with(data, &resolver)
    }

    fn deserialize<'de, T, D>(&self, deser: D) -> Result<T, Eu4GameError>
    where
        T: DeserializeOwned,
        D: Deserializer<'de, Error = Eu4Error>,
    {
        if self.debug {
            let mut track = serde_path_to_error::Track::new();
            let deser = serde_path_to_error::Deserializer::new(deser, &mut track);
            let mut erased = <dyn erased_serde::Deserializer>::erase(deser);
            erased_serde::deserialize(&mut erased)
                .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))
        } else {
            Ok(T::deserialize(deser)?)
        }
    }

    pub fn parse_with(
        &self,
        data: &[u8],
        resolver: &SegmentedResolver,
    ) -> Result<Eu4SaveOutput, Eu4GameError> {
        let mut hasher = SaveCheckSummer::new(self.hash);
        if pdx_zstd::is_zstd_compressed(data) {
            let reader = pdx_zstd::Decoder::from_slice(data)?;
            let (save, encoding) = {
                let mut reader = SaveCheckSummerReader {
                    reader: Box::new(reader),
                    hasher: &mut hasher,
                };
                let mut modeller = Eu4Modeller::from_reader(&mut reader, resolver);
                let save: Eu4Save = self.deserialize(&mut modeller)?;
                let encoding = modeller.encoding();
                (save, encoding)
            };
            Ok(Eu4SaveOutput {
                save,
                encoding,
                hash: hasher.finish(),
            })
        } else {
            let mut file = Eu4File::from_slice(data)?;
            let file_size = file.size();
            if file_size > 300 * 1024 * 1024 {
                return Err(Eu4GameError::TooLarge(file_size));
            }

            let encoding = file.encoding();

            match file.kind_mut() {
                Eu4SliceFileKind::Text(x) => {
                    hasher.append(x.get_ref());
                    let mut modeller = x.deserializer();
                    let save: Eu4Save = self.deserialize(&mut modeller)?;
                    Ok(Eu4SaveOutput {
                        save,
                        encoding,
                        hash: hasher.finish(),
                    })
                }
                Eu4SliceFileKind::Binary(x) => {
                    hasher.append(x.get_ref());
                    let mut modeller = x.deserializer(resolver);
                    let save: Eu4Save = self.deserialize(&mut modeller)?;
                    Ok(Eu4SaveOutput {
                        save,
                        encoding,
                        hash: hasher.finish(),
                    })
                }
                Eu4SliceFileKind::Zip(zip) => {
                    let meta = zip.get(eu4save::file::Eu4FileEntryName::Meta)?;
                    let meta: Meta = {
                        let reader = SaveCheckSummerReader {
                            reader: Box::new(meta),
                            hasher: &mut hasher,
                        };
                        let mut modeller = Eu4Modeller::from_reader(reader, resolver);
                        self.deserialize(&mut modeller)?
                    };

                    let gamestate = zip.get(eu4save::file::Eu4FileEntryName::Gamestate)?;
                    let gamestate: GameState = {
                        let reader = SaveCheckSummerReader {
                            reader: Box::new(gamestate),
                            hasher: &mut hasher,
                        };
                        let mut modeller = Eu4Modeller::from_reader(reader, resolver);
                        self.deserialize(&mut modeller)?
                    };

                    let ai = zip.get(eu4save::file::Eu4FileEntryName::Ai)?;
                    {
                        let mut reader = SaveCheckSummerReader {
                            reader: Box::new(ai),
                            hasher: &mut hasher,
                        };
                        std::io::copy(&mut reader, &mut std::io::sink())?;
                    }

                    let save = Eu4Save {
                        meta,
                        game: gamestate,
                    };
                    Ok(Eu4SaveOutput {
                        save,
                        encoding,
                        hash: hasher.finish(),
                    })
                }
            }
        }
    }
}

pub fn parse_meta(data: &[u8], resolver: &SegmentedResolver) -> Result<Meta, Eu4GameError> {
    if pdx_zstd::is_zstd_compressed(data) {
        let mut decoder = pdx_zstd::Decoder::from_slice(data)?;
        let mut modeller = Eu4Modeller::from_reader(&mut decoder, resolver);
        return Ok(modeller.deserialize()?);
    }

    {
        let file = Eu4File::from_slice(data)?;
        match file.kind() {
            Eu4SliceFileKind::Zip(zip) => {
                let meta = zip.get(eu4save::file::Eu4FileEntryName::Meta)?;
                let mut modeller = Eu4Modeller::from_reader(meta, resolver);
                let res = serde_path_to_error::deserialize(&mut modeller)
                    .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))?;
                Ok(res)
            }
            _ => {
                let mut modeller = Eu4Modeller::from_reader(data, resolver);
                let res = serde_path_to_error::deserialize(&mut modeller)
                    .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))?;
                Ok(res)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn save_checksummer() {
        let mut summer = SaveCheckSummer::new(true);
        summer.append(b"hello");
        summer.append(b"world");
        let hash = summer.finish().unwrap();
        assert_eq!(hash, "/p54eGIaz1s/t1mJgg7qSZwKd+s+R19l1t1xcdou/Yc=");
    }
}
