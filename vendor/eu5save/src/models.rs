mod bstr;
mod building_manager;
mod character_db;
mod color;
mod countries;
mod culture_manager;
mod de;
mod diplomacy_manager;
mod loan_manager;
mod locations;
mod market_manager;
mod population;
mod religion_manager;
mod subunit_manager;
mod timeline_manager;
mod trade_manager;
mod unit_manager;
mod version;
mod war_manager;

pub use bstr::BStr;
pub use building_manager::*;
pub use character_db::*;
pub use color::Color;
pub use countries::*;
pub use culture_manager::*;
pub use diplomacy_manager::*;
pub use loan_manager::*;
pub use locations::*;
pub use market_manager::*;
pub use population::*;
pub use religion_manager::*;
pub use subunit_manager::*;
pub use timeline_manager::*;
pub use trade_manager::*;
pub use unit_manager::*;
pub use version::GameVersion;
pub use war_manager::*;

use crate::Eu5Date;
use arena_serde::ArenaDeserialize;
use de::*;

#[derive(Debug, ArenaDeserialize)]
pub struct ZipPrelude<'bump> {
    pub metadata: Metadata<'bump>,
}

#[derive(Debug, ArenaDeserialize)]
pub struct Metadata<'bump> {
    pub compatibility: Compatibility<'bump>,
    pub date: Eu5Date,
    pub playthrough_id: BStr<'bump>,
    #[arena(default)]
    pub playthrough_name: Option<BStr<'bump>>,
    #[arena(default)]
    pub save_label: Option<BStr<'bump>>,
    #[arena(default)]
    pub player_country_name: Option<BStr<'bump>>,
    pub version: GameVersion,
}

impl Metadata<'_> {
    pub fn name(&self) -> Option<&str> {
        self.playthrough_name
            .as_ref()
            .or(self.save_label.as_ref())
            .map(BStr::to_str)
    }
}

#[derive(Debug, ArenaDeserialize)]
pub struct Compatibility<'bump> {
    pub locations: &'bump [BStr<'bump>],
}

impl<'bump> Compatibility<'bump> {
    pub fn locations_iter(&self) -> impl ExactSizeIterator<Item = (LocationId, &str)> + '_ {
        self.locations
            .iter()
            .enumerate()
            .map(|(i, s)| (LocationId::new((i + 1) as u32), s.to_str()))
    }
}

#[derive(Debug, ArenaDeserialize)]
pub struct Gamestate<'bump> {
    pub metadata: Metadata<'bump>,
    pub provinces: Eu5Database<'bump, Province<'bump>>,
    pub population: population::PopulationDirectory<'bump>,
    pub countries: countries::Countries<'bump>,
    pub locations: Locations<'bump>,
    #[arena(duplicated, alias = "played_country")]
    pub played_countries: &'bump [PlayedCountry<'bump>],
    pub diplomacy_manager: DiplomacyManager<'bump>,
    pub market_manager: MarketManager<'bump>,
    pub building_manager: BuildingManager<'bump>,
    pub character_db: CharacterDb<'bump>,
    pub war_manager: WarManager<'bump>,
    pub unit_manager: UnitManager<'bump>,
    pub subunit_manager: SubUnitManager<'bump>,
    pub loan_manager: LoanManager<'bump>,
    pub trade_manager: TradeManager<'bump>,
    pub religion_manager: ReligionManager<'bump>,
    pub culture_manager: CultureManager<'bump>,
    #[arena(default)]
    pub timeline_manager: TimelineManager<'bump>,
}

#[derive(Debug, ArenaDeserialize)]
pub struct Province<'bump> {
    pub owner: countries::CountryId,
    pub province_definition: BStr<'bump>,
}

#[derive(Debug, ArenaDeserialize, PartialEq)]
pub struct PlayedCountry<'bump> {
    pub name: BStr<'bump>,
    pub country: countries::CountryId,
}

#[derive(Debug)]
pub struct Eu5Database<'bump, Of: ArenaDeserialize<'bump>> {
    pub database: &'bump [(u32, Option<Of>)],
}

impl<'bump, Of: ArenaDeserialize<'bump> + 'bump> ArenaDeserialize<'bump>
    for Eu5Database<'bump, Of>
{
    fn deserialize_in_arena<'de, D>(
        deserializer: D,
        allocator: &'bump arena_serde::Arena,
    ) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de;
        use std::fmt;

        #[derive(serde::Deserialize)]
        #[serde(field_identifier, rename_all = "lowercase")]
        enum Field {
            Database,
        }

        struct Eu5DatabaseVisitor<'a, T> {
            allocator: &'a arena_serde::Arena,
            marker: std::marker::PhantomData<T>,
        }

        impl<'de, 'a, T: ArenaDeserialize<'a> + 'a> de::Visitor<'de> for Eu5DatabaseVisitor<'a, T> {
            type Value = Eu5Database<'a, T>;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("struct Eu5Database")
            }

            fn visit_map<V>(self, mut map: V) -> Result<Eu5Database<'a, T>, V::Error>
            where
                V: de::MapAccess<'de>,
            {
                let mut database = None;
                while let Some(key) = map.next_key()? {
                    match key {
                        Field::Database => {
                            if database.is_some() {
                                return Err(de::Error::duplicate_field("database"));
                            }

                            struct DatabaseSeed<'b, U> {
                                allocator: &'b arena_serde::Arena,
                                marker: std::marker::PhantomData<U>,
                            }

                            impl<'de, 'b, U: ArenaDeserialize<'b> + 'b> de::DeserializeSeed<'de> for DatabaseSeed<'b, U> {
                                type Value = bumpalo::collections::Vec<'b, (u32, Option<U>)>;

                                fn deserialize<D>(
                                    self,
                                    deserializer: D,
                                ) -> Result<Self::Value, D::Error>
                                where
                                    D: serde::Deserializer<'de>,
                                {
                                    deserialize_vec_pair_arena(deserializer, self.allocator)
                                }
                            }

                            database = Some(map.next_value_seed(DatabaseSeed {
                                allocator: self.allocator,
                                marker: std::marker::PhantomData,
                            })?);
                        }
                    }
                }
                let database = database.ok_or_else(|| de::Error::missing_field("database"))?;
                Ok(Eu5Database {
                    database: database.into_bump_slice(),
                })
            }
        }

        const FIELDS: &[&str] = &["database"];
        deserializer.deserialize_struct(
            "Eu5Database",
            FIELDS,
            Eu5DatabaseVisitor {
                allocator,
                marker: std::marker::PhantomData,
            },
        )
    }
}

impl<'bump> Gamestate<'bump> {
    /// Finds the maximum population across all locations in the gamestate.
    pub fn location_max_population(&self) -> (f64, LocationId) {
        self.locations
            .iter()
            .map(|x| (self.location_population(x.location()), x.id()))
            .max_by(|(a, _), (b, _)| a.total_cmp(b))
            .unwrap_or((0.0, LocationId::new(0)))
    }

    /// Calculates the total population for a specific location by summing up all pops.
    /// Population is calculated as floor(size * 1000) for each pop.
    pub fn location_population(&self, location: &Location) -> f64 {
        location
            .population
            .pops
            .iter()
            .filter_map(|pop_id| {
                self.population
                    .database
                    .lookup(*pop_id)
                    .map(|pop| (pop.size * 1000.0).floor())
            })
            .sum()
    }

    pub fn location_max_development(&self) -> (f64, LocationId) {
        self.locations
            .iter()
            .map(|x| (x.location().development, x.id()))
            .max_by(|(a, _), (b, _)| a.total_cmp(b))
            .unwrap_or((0.0, LocationId::new(0)))
    }

    pub fn location_max_rgo_level(&self) -> (f64, LocationId) {
        self.locations
            .iter()
            .map(|x| (x.location().rgo_level, x.id()))
            .max_by(|(a, _), (b, _)| a.total_cmp(b))
            .unwrap_or((0.0, LocationId::new(0)))
    }

    pub fn location_max_wealth(&self) -> (f64, LocationId) {
        self.locations
            .iter()
            .map(|x| (x.location().possible_tax, x.id()))
            .max_by(|(a, _), (b, _)| a.total_cmp(b))
            .unwrap_or((0.0, LocationId::new(0)))
    }

    /// Finds the maximum building levels sum across all locations.
    /// Only counts buildings where the building owner matches the location owner.
    pub fn location_max_building_levels(&self) -> (f64, LocationId) {
        self.locations
            .iter()
            .map(|entry| {
                let sum = self.location_building_levels_sum(entry.id(), entry.location());
                (sum, entry.id())
            })
            .max_by(|(a, _), (b, _)| a.total_cmp(b))
            .unwrap_or((0.0, LocationId::new(0)))
    }

    /// Calculates the sum of building levels for a specific location.
    /// Only counts buildings where the building owner matches the location owner.
    pub fn location_building_levels_sum(
        &self,
        location_id: LocationId,
        location: &Location,
    ) -> f64 {
        self.building_manager
            .database
            .iter()
            .filter(|building| building.location == location_id && building.owner == location.owner)
            .map(|building| building.level)
            .sum()
    }

    /// Provides access to metadata with arena-allocated strings
    pub fn metadata(&self) -> &Metadata<'bump> {
        &self.metadata
    }

    // pub fn provinces(&self) -> &Eu5Database<'bump, Province<'bump>> {
    //     &self.provinces
    // }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::TextDeserializer;

    #[test]
    fn test_gamestate_is_send_sync() {
        fn assert_send<T: Send + Sync>() {}
        assert_send::<Gamestate>();
    }

    fn assert_metadata(
        data: &str,
        expected_name: Option<&str>,
        expected_playthrough_name: Option<&str>,
        expected_save_label: Option<&str>,
    ) {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            metadata: Metadata<'bump>,
        }

        let allocator = arena_serde::Arena::new();
        let mut deserializer =
            TextDeserializer::from_utf8_reader(jomini::text::TokenReader::new(data.as_bytes()));
        let metadata = Wrapper::deserialize_in_arena(&mut deserializer, &allocator)
            .expect("metadata deserializes")
            .metadata;

        assert_eq!(metadata.name(), expected_name);
        assert_eq!(
            metadata.playthrough_name.as_ref().map(BStr::to_str),
            expected_playthrough_name
        );
        assert_eq!(
            metadata.save_label.as_ref().map(BStr::to_str),
            expected_save_label
        );
    }

    #[test]
    fn metadata_accepts_save_label() {
        assert_metadata(
            r#"
                metadata={
                    date=1346.4.1
                    playthrough_id="2068958e-18a3-43e1-9fa5-99eb1ff77064"
                    save_label="Autosave"
                    version="1.3.99"
                    compatibility={ locations={} }
                }
            "#,
            Some("Autosave"),
            None,
            Some("Autosave"),
        );
    }

    #[test]
    fn metadata_prefers_playthrough_name() {
        assert_metadata(
            r#"
                metadata={
                    date=1346.4.1
                    playthrough_id="2068958e-18a3-43e1-9fa5-99eb1ff77064"
                    playthrough_name="Playthrough"
                    save_label="Autosave"
                    version="1.3.99"
                    compatibility={ locations={} }
                }
            "#,
            Some("Playthrough"),
            Some("Playthrough"),
            Some("Autosave"),
        );
    }
}
