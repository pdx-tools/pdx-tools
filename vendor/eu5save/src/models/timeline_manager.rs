use crate::{
    Eu5Date,
    models::{BStr, CountryId, CountryName, CountryTag, LocationId},
};
use arena_serde::ArenaDeserialize;

/// Campaign timeline data.
///
/// The section holds the data that the rest of the save no longer keeps: the
/// events that the timeline marks, the countries that no longer exist, and the
/// dated renames that give a country the correct name at a past date.
///
/// Every field is optional. A save from early in a campaign has no note and no
/// dead country.
#[derive(Debug, Default, ArenaDeserialize)]
pub struct TimelineManager<'bump> {
    #[arena(default)]
    pub timeline_notes: &'bump [TimelineNote<'bump>],
    #[arena(default)]
    pub dead_countries: &'bump [DeadCountry<'bump>],
    #[arena(default)]
    pub country_renames: &'bump [CountryRename<'bump>],
}

/// A named event on the timeline, such as the start of the Black Death.
#[derive(Debug, ArenaDeserialize)]
pub struct TimelineNote<'bump> {
    /// The localization key of the event.
    pub key: BStr<'bump>,
    pub date: Eu5Date,
    /// The location where the event started, if it has one.
    pub location: Option<LocationId>,
    /// If true, the population chart shows a marker for the event.
    #[arena(default)]
    pub show_in_pop_graph: bool,
}

/// A country that no longer exists.
///
/// The country has no record in `countries.database`, so the timeline uses this
/// archive to show it in a historical chart or ranking.
#[derive(Debug, ArenaDeserialize)]
pub struct DeadCountry<'bump> {
    pub country_id: CountryId,
    pub tag: CountryTag<'bump>,
    /// The coat of arms key the country flew.
    pub flag: Option<BStr<'bump>>,
    pub death_date: Eu5Date,
    pub name: CountryName<'bump>,
    /// The map color, packed as one integer instead of an `rgb` block.
    #[arena(default)]
    pub map_color_hex: u32,
    /// Annual samples. See [`crate::models::historical_sample_years`].
    #[arena(default)]
    pub historical_population: &'bump [f64],
    #[arena(default)]
    pub historical_tax_base: &'bump [f64],
    #[arena(default)]
    pub historical_economical_base: &'bump [f64],
    /// The year of the last sample in the historical arrays.
    pub last_stat_year: Option<i16>,
}

/// A dated change to the name, tag, flag, or map color of a country.
#[derive(Debug, ArenaDeserialize)]
pub struct CountryRename<'bump> {
    pub country_id: CountryId,
    /// The date the change took effect.
    pub date: Eu5Date,
    pub name: CountryName<'bump>,
    pub tag: CountryTag<'bump>,
    pub flag: Option<BStr<'bump>>,
    /// The map color, packed as one integer instead of an `rgb` block.
    #[arena(default)]
    pub map_color_hex: u32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::{TextDeserializer, common::PdsDate};

    fn deserialize<'bump>(
        data: &str,
        allocator: &'bump arena_serde::Arena,
    ) -> TimelineManager<'bump> {
        #[derive(ArenaDeserialize)]
        struct Wrapper<'bump> {
            timeline_manager: TimelineManager<'bump>,
        }

        let deserializer =
            TextDeserializer::from_utf8_slice(data.as_bytes()).expect("valid text data");
        Wrapper::deserialize_in_arena(&deserializer, allocator)
            .expect("timeline manager deserializes")
            .timeline_manager
    }

    #[test]
    fn empty_timeline_manager() {
        let allocator = arena_serde::Arena::new();
        let timeline = deserialize("timeline_manager={\n}", &allocator);
        assert!(timeline.timeline_notes.is_empty());
        assert!(timeline.dead_countries.is_empty());
        assert!(timeline.country_renames.is_empty());
    }

    #[test]
    fn timeline_note() {
        let allocator = arena_serde::Arena::new();
        let timeline = deserialize(
            r#"timeline_manager={
                timeline_notes={ {
                    key="timeline_note_black_death"
                    date=1346.6.1
                    location=4814
                    show_in_pop_graph=yes
                } }
            }"#,
            &allocator,
        );

        let [note] = timeline.timeline_notes else {
            panic!("expected one note")
        };
        assert_eq!(note.key.to_str(), "timeline_note_black_death");
        assert_eq!(note.date.game_fmt().to_string(), "1346.6.1");
        assert_eq!(note.location, Some(LocationId::new(4814)));
        assert!(note.show_in_pop_graph);
    }

    /// The name of a dead country is a plain string in the simple case and an
    /// object in the complex case. Both forms are in the same save.
    #[test]
    fn dead_countries_with_both_name_forms() {
        let allocator = arena_serde::Arena::new();
        let timeline = deserialize(
            r#"timeline_manager={
                dead_countries={ {
                    country_id=2354
                    tag="AAA00"
                    flag="AAA00"
                    death_date=1342.4.1
                    name="riau_kampar_province"
                    map_color_hex=4287626951
                    historical_population={ 17.69766 17.84589 }
                    historical_tax_base={ 0 2.92113 }
                    historical_economical_base={ 0.3005 3.11387 }
                    last_stat_year=1341
                } {
                    country_id=2368
                    tag="AAA13"
                    flag="POR_REVOLT"
                    death_date=1343.3.18
                    name={
                        name="CIVILWAR_FACTION_pretender_NAME"
                        key={
                            Adjective="CIVILWAR_FACTION_pretender_ADJECTIVE"
                        }

                        bases={
                            Base="POR"
                        }

                    }
                    map_color_hex=4284610724
                } }
            }"#,
            &allocator,
        );

        let [simple, complex] = timeline.dead_countries else {
            panic!("expected two dead countries")
        };

        assert_eq!(simple.country_id, CountryId::new(2354));
        assert_eq!(simple.tag.as_str(), "AAA00");
        assert_eq!(simple.flag.unwrap().to_str(), "AAA00");
        assert_eq!(simple.death_date.game_fmt().to_string(), "1342.4.1");
        assert_eq!(simple.name.name().to_str(), "riau_kampar_province");
        assert_eq!(simple.map_color_hex, 4287626951);
        assert_eq!(simple.historical_population, &[17.69766, 17.84589]);
        assert_eq!(simple.historical_tax_base, &[0.0, 2.92113]);
        assert_eq!(simple.historical_economical_base, &[0.3005, 3.11387]);
        assert_eq!(simple.last_stat_year, Some(1341));

        // A dead country can be without the historical arrays.
        assert_eq!(
            complex.name.name().to_str(),
            "CIVILWAR_FACTION_pretender_NAME"
        );
        assert_eq!(complex.flag.unwrap().to_str(), "POR_REVOLT");
        assert!(complex.historical_population.is_empty());
        assert_eq!(complex.last_stat_year, None);
    }

    #[test]
    fn country_renames() {
        let allocator = arena_serde::Arena::new();
        let timeline = deserialize(
            r#"timeline_manager={
                country_renames={ {
                    country_id=2104
                    date=1341.9.1
                    name="ADH"
                    tag="ADH"
                    flag="ADH"
                    map_color_hex=4292777777
                } }
            }"#,
            &allocator,
        );

        let [rename] = timeline.country_renames else {
            panic!("expected one rename")
        };
        assert_eq!(rename.country_id, CountryId::new(2104));
        assert_eq!(rename.date.game_fmt().to_string(), "1341.9.1");
        assert_eq!(rename.name.name().to_str(), "ADH");
        assert_eq!(rename.tag.as_str(), "ADH");
        assert_eq!(rename.map_color_hex, 4292777777);
    }

    /// A tag is not always three to five characters. Script can name a formable
    /// country with a longer tag, like the Sardinia-Piedmont formable.
    #[test]
    fn country_rename_with_long_tag() {
        let allocator = arena_serde::Arena::new();
        let timeline = deserialize(
            r#"timeline_manager={
                country_renames={ {
                    country_id=2104
                    date=1341.9.1
                    name="SAR_piedmont"
                    tag="SAR_piedmont"
                    flag="SAR_piedmont"
                    map_color_hex=4292777777
                } }
            }"#,
            &allocator,
        );

        let [rename] = timeline.country_renames else {
            panic!("expected one rename")
        };
        assert_eq!(rename.tag.as_str(), "SAR_piedmont");
    }
}
