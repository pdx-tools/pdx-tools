use crate::Eu4GameError;
use eu4save::{
    file::{Eu4Binary, Eu4FileEntryName, Eu4ParsedFile, Eu4Text},
    models::{CountryEvent, Eu4Save, GameState, Meta, Monarch},
    query::Query,
    Encoding, Eu4Date, Eu4File,
};
use highway::{HighwayHash, HighwayHasher, Key};
use jomini::binary::TokenResolver;

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
    pub hasher: HighwayHasher,
}

impl Default for SaveCheckSummer {
    fn default() -> Self {
        Self::new()
    }
}

impl SaveCheckSummer {
    pub fn new() -> Self {
        Self {
            hasher: HighwayHasher::new(new_key()),
        }
    }

    pub fn append(&mut self, data: &[u8]) {
        self.hasher.append(data);
    }

    pub fn finish(self) -> String {
        let hash = self.hasher.finalize256();
        let bytes = copy_hash_output_to_byte_array(hash);
        base64::encode(bytes)
    }
}

// Compute the checksum of the save using highway hash. This is not sophisticated at all. It's
// meant to be a fast, best effort check to know if save is already uploaded. Note that this is
// easily circumvented by modifying a single character or re-zipping the save.
pub fn save_checksum(body: &[u8]) -> String {
    let mut hash = SaveCheckSummer::new();
    hash.append(body);
    hash.finish()
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
// dynasty names and 9 male names. That leaves 144 start combinations for
// Zuni. Taking this as the average (it's not, as I would suspect this to be
// on the lower side), gives a total of 10,512 starting combinations. We need
// to find more entropy as the birthday problem states that one will easily
// find a collision given such a small pool. We can include the randomly
// generated adm, dip, and mil points for the ruler, but there are events that
// increase these (see hindu events, well advised events, elections) and it
// seems overly difficult to track this. Personalities seem to be the better
// option. Even rulers predefined at the start will often get assigned a
// random personality (and there are about 50 personalities and 600 rulers
// that are assigned personalities). Using just the first personality nets us
// another 30,000 combinations. The reason we use only the first personality
// is that all rulers should at least one EXCEPT for regencies, and councils,
// and if the player does not enable rights of man (and who doesn't have
// rights of man enabled?). IDs are also used in the calculation as while
// these don't change for a given patch, there is a high likelihood of them
// changing per patch.
//
// 40,000 combinations per patch is good, but it's not enough for me to sleep
// easy. PDXU informed me that the REB decision_seed is appears to uniquely
// identify a run and so it is added to the mix.
pub fn playthrough_id(query: &Query) -> Option<String> {
    let start_date = query.save().game.start_date;
    let monarch_content_date = start_date.add_days(1);
    let mut hash = HighwayHasher::new(new_key());

    if let Some(reb) = query.country(&"REB".parse().unwrap()) {
        hash.append(&reb.decision_seed.to_le_bytes())
    }

    // can't use advisors from province history as they are seemingly purged
    // from the history after they die.
    hash_countries(&mut hash, monarch_content_date, query.save());

    let output = hash.finalize256();
    let bytes = copy_hash_output_to_byte_array(output);
    Some(base64::encode(bytes))
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
        if let Some((personality, _)) = monarch.personalities.first() {
            hash.append(personality.as_bytes());
        }
    }
}

pub fn parse_save_with_tokens<Q>(
    data: &[u8],
    resolver: &Q,
) -> Result<(Eu4Save, Encoding), Eu4GameError>
where
    Q: TokenResolver,
{
    parse_save_with_tokens_full(data, resolver, false)
}

pub fn parse_save_with_tokens_full<Q>(
    data: &[u8],
    resolver: &Q,
    debug: bool,
) -> Result<(Eu4Save, Encoding), Eu4GameError>
where
    Q: TokenResolver,
{
    let mut zip_sink = Vec::new();
    let save = parse_save_raw(data, &mut zip_sink)?;
    save.parse_full_save(resolver, debug)
}

#[cfg(feature = "embedded")]
pub fn parse_save(data: &[u8]) -> Result<(Eu4Save, Encoding), Eu4GameError> {
    let tokens = schemas::resolver::Eu4FlatBufferTokens::new();
    parse_save_with_tokens(data, &tokens)
}

pub fn parse_meta<Q>(data: &[u8], resolver: &Q) -> Result<Meta, Eu4GameError>
where
    Q: TokenResolver,
{
    if let Some(tsave) = tarsave::extract_tarsave(data) {
        let mut zip_sink = Vec::new();
        let meta_file = Eu4File::from_slice(tsave.meta)?;
        let parsed_meta = meta_file.parse(&mut zip_sink)?;
        Ok(parsed_meta.deserializer(resolver).deserialize()?)
    } else {
        let file = Eu4File::from_slice(data)?;
        if file.size() > 300 * 1024 * 1024 {
            return Err(Eu4GameError::TooLarge(file.size()));
        }

        let mut entries = file.entries();
        while let Some(entry) = entries.next_entry() {
            if !matches!(entry.name(), Some(Eu4FileEntryName::Meta) | None) {
                continue;
            }

            let mut zip_sink = Vec::new();
            let file = entry.parse(&mut zip_sink)?;
            let deser = file.deserializer(resolver);

            let meta: Meta = serde_path_to_error::deserialize(&deser)
                .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))?;

            return Ok(meta);
        }

        Err(Eu4GameError::NoMeta)
    }
}

pub struct Eu4RemoteFile<'a> {
    pub encoding: Encoding,
    pub kind: Eu4RemoteFileKind<'a>,
}

impl<'a> Eu4RemoteFile<'a> {
    pub fn parse_full_save<Q>(
        &self,
        resolver: &Q,
        debug: bool,
    ) -> Result<(Eu4Save, Encoding), Eu4GameError>
    where
        Q: TokenResolver,
    {
        match &self.kind {
            Eu4RemoteFileKind::Disjoint { meta, game } => {
                let meta: Meta = meta.deserializer(resolver).deserialize()?;
                let game: GameState = game.deserializer(resolver).deserialize()?;
                Ok((Eu4Save { meta, game }, self.encoding))
            }
            Eu4RemoteFileKind::Unified(game) => {
                let deser = game.deserializer(resolver);
                let data = if debug {
                    let meta = serde_path_to_error::deserialize(&deser)
                        .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))?;
                    let game = serde_path_to_error::deserialize(&deser)
                        .map_err(|e| Eu4GameError::DeserializeDebug(e.to_string()))?;
                    Eu4Save { game, meta }
                } else {
                    let meta = deser.deserialize()?;
                    let game = deser.deserialize()?;
                    Eu4Save { game, meta }
                };
                Ok((data, self.encoding))
            }
        }
    }
}

pub enum Eu4RemoteFileKind<'a> {
    Disjoint {
        meta: Eu4ParsedFile<'a>,
        game: Eu4ParsedFile<'a>,
    },
    Unified(Eu4ParsedFile<'a>),
}

pub fn parse_save_raw<'a>(
    data: &'a [u8],
    zip_sink: &'a mut Vec<u8>,
) -> Result<Eu4RemoteFile<'a>, Eu4GameError> {
    if let Some(tsave) = tarsave::extract_tarsave(data) {
        if tsave.meta.starts_with(b"EU4txt") {
            let meta = Eu4Text::from_slice(tsave.meta)?;
            let game = Eu4Text::from_slice(tsave.gamestate)?;
            Ok(Eu4RemoteFile {
                encoding: Encoding::TextZip,
                kind: Eu4RemoteFileKind::Disjoint {
                    meta: Eu4ParsedFile::from(meta),
                    game: Eu4ParsedFile::from(game),
                },
            })
        } else {
            let meta = Eu4Binary::from_slice(tsave.meta)?;
            let game = Eu4Binary::from_slice(tsave.gamestate)?;
            Ok(Eu4RemoteFile {
                encoding: Encoding::BinaryZip,
                kind: Eu4RemoteFileKind::Disjoint {
                    meta: Eu4ParsedFile::from(meta),
                    game: Eu4ParsedFile::from(game),
                },
            })
        }
    } else {
        let file = Eu4File::from_slice(data)?;
        if file.size() > 300 * 1024 * 1024 {
            return Err(Eu4GameError::TooLarge(file.size()));
        }

        let parsed_file = file.parse(zip_sink)?;
        Ok(Eu4RemoteFile {
            encoding: file.encoding(),
            kind: Eu4RemoteFileKind::Unified(parsed_file),
        })
    }
}
