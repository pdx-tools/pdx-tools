use crate::entity_profile::CountryRef;
use crate::presentation::{
    CountryRefSource, Localized, OwnedCountryName, UiLocationIdx, UiMarketId, present_dto,
};
use eu5save::models::{LocationIdx, MarketId, ReligionId};

// `DisplayData::HistoricalCountry` is the owner of the location on a past
// timeline date. The country may no longer exist, so it carries a name instead
// of a reference.
present_dto! {
    pub(crate) mod workspace;
    pub mod presentation;

    #[serde(tag = "mode", content = "value", rename_all = "camelCase")]
    pub enum HoverStat {
        None,
        Control { value: f64 },
        Development { value: f64 },
        Population { value: u32 },
        Markets { access: f64 },
        RgoLevel { value: f64 },
        BuildingLevels { value: f64 },
        Wealth { value: f64 },
        UnrealizedTaxBase { value: f64 },
        Religion { religion: ReligionId => Localized<String> },
        StateEfficacy { value: f64 },
        PopulationGrowth { value: f64 },
    }

    #[serde(
        tag = "kind",
        rename_all = "camelCase",
        rename_all_fields = "camelCase",
    )]
    pub enum DisplayData {
        Clear,
        Location {
            location_id: u32,
            location: LocationIdx => Localized<UiLocationIdx>,
            stat: HoverStat => HoverStat,
        },
        Country {
            location_id: u32,
            country: CountryRefSource => CountryRef,
            stat: HoverStat => HoverStat,
        },
        HistoricalCountry {
            location_id: u32,
            name: OwnedCountryName => String,
            dead: bool,
        },
        Market {
            location_id: u32,
            market: MarketId => Localized<UiMarketId>,
            market_value: f64,
        },
    }
}
