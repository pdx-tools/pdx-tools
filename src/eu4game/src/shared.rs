use crate::Eu4GameError;
use eu4save::{
    file::{Eu4FileKind, Eu4Modeller},
    models::{CountryEvent, Eu4Save, GameState, Meta, Monarch},
    query::Query,
    CountryTag, Encoding, Eu4Date, Eu4Error, Eu4File,
};
use highway::{HighwayHash, HighwayHasher, Key};
use jomini::binary::TokenResolver;
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
            Some(base64::encode(bytes))
        } else {
            None
        }
    }

    pub fn wrap<R: Read>(&mut self, reader: R) -> SaveCheckSummerReader<R> {
        SaveCheckSummerReader {
            reader,
            hasher: self,
        }
    }
}

#[derive(Debug)]
pub struct SaveCheckSummerReader<'a, R> {
    reader: R,
    hasher: &'a mut SaveCheckSummer,
}

impl<'a, R: Read> Read for &'_ mut SaveCheckSummerReader<'a, R> {
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
    base64::encode(bytes)
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
    pub fn parse_reuse(
        &self,
        data: &[u8],
        inflated: &mut Vec<u8>,
    ) -> Result<Eu4SaveOutput, Eu4GameError> {
        let tokens = schemas::resolver::Eu4FlatTokens::new();
        self.parse_with(data, &tokens, inflated)
    }

    #[cfg(all(feature = "embedded", debug_assertions))]
    pub fn parse(&self, data: &[u8]) -> Result<Eu4SaveOutput, Eu4GameError> {
        let mut inflated = Vec::new();
        self.parse_reuse(data, &mut inflated)
    }

    fn deserialize<'res, 'de, T, D>(&self, deser: D) -> Result<T, Eu4GameError>
    where
        T: DeserializeOwned,
        D: Deserializer<'de, Error = Eu4Error>,
    {
        if self.debug {
            serde_path_to_error::deserialize(deser)
                .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))
        } else {
            Ok(T::deserialize(deser)?)
        }
    }

    pub fn parse_with<Q>(
        &self,
        data: &[u8],
        resolver: &Q,
        mut inflated: &mut Vec<u8>,
    ) -> Result<Eu4SaveOutput, Eu4GameError>
    where
        Q: TokenResolver,
    {
        let mut hasher = SaveCheckSummer::new(self.hash);
        if data.starts_with(&zstd::zstd_safe::MAGICNUMBER.to_le_bytes()) {
            zstd::stream::copy_decode(data, &mut inflated).map_err(Eu4GameError::ZstdInflate)?;
            hasher.append(inflated);
            let mut modeller = Eu4Modeller::from_slice(inflated, resolver);
            let save: Eu4Save = self.deserialize(&mut modeller)?;
            let encoding = modeller.encoding();
            Ok(Eu4SaveOutput {
                save,
                encoding,
                hash: hasher.finish(),
            })
        } else {
            let file = Eu4File::from_slice(data)?;
            if file.size() > 300 * 1024 * 1024 {
                return Err(Eu4GameError::TooLarge(file.size()));
            }

            let encoding = file.encoding();
            match file.kind() {
                Eu4FileKind::Zip(zip) => {
                    let meta_file = zip.meta_file()?;
                    let gamestate_file = zip.gamestate_file()?;
                    let ai_file = zip.ai_file()?;
                    let max_size = meta_file
                        .size()
                        .max(gamestate_file.size())
                        .max(ai_file.size());

                    inflated.reserve_exact(max_size);

                    // This is safe as the "read_exact" method guarantee to
                    // initialize the entire passed in buffer.
                    #[allow(clippy::uninit_vec)]
                    unsafe {
                        inflated.set_len(max_size)
                    }

                    let meta_data = &mut inflated[..meta_file.size()];
                    meta_file.read_exact(meta_data)?;
                    hasher.append(meta_data);
                    let mut modeller = Eu4Modeller::from_slice(meta_data, resolver);
                    let meta: Meta = self.deserialize(&mut modeller)?;

                    let gamestate_data = &mut inflated[..gamestate_file.size()];
                    gamestate_file.read_exact(gamestate_data)?;
                    hasher.append(gamestate_data);
                    let mut modeller = Eu4Modeller::from_slice(gamestate_data, resolver);
                    let game: GameState = self.deserialize(&mut modeller)?;

                    let ai_data = &mut inflated[..ai_file.size()];
                    ai_file.read_exact(ai_data)?;
                    hasher.append(ai_data);

                    let save = Eu4Save { meta, game };
                    Ok(Eu4SaveOutput {
                        save,
                        encoding,
                        hash: hasher.finish(),
                    })
                }
                _ => {
                    hasher.append(data);
                    let mut modeller = Eu4Modeller::from_slice(data, resolver);
                    let save: Eu4Save = self.deserialize(&mut modeller)?;
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

pub fn parse_meta<Q>(data: &[u8], resolver: &Q) -> Result<Meta, Eu4GameError>
where
    Q: TokenResolver,
{
    if data.starts_with(&zstd::zstd_safe::MAGICNUMBER.to_le_bytes()) {
        let mut decoder = zstd::Decoder::new(data).map_err(Eu4GameError::ZstdInflate)?;
        let mut modeller = Eu4Modeller::from_reader(&mut decoder, resolver);
        Ok(modeller.deserialize()?)
    } else {
        let file = Eu4File::from_slice(data)?;
        match file.kind() {
            Eu4FileKind::Zip(zip) => {
                let meta_file = zip.meta_file()?;
                let mut reader = meta_file.reader();
                let mut modeller = Eu4Modeller::from_reader(&mut reader, resolver);
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
