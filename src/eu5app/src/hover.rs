use crate::entity_profile::CountryRef;
use crate::presentation::{CountryRefSource, Localized, UiLocationIdx, UiMarketId, present_dto};
use eu5save::models::{LocationIdx, MarketId, ReligionId};

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
        PossibleTax { value: f64 },
        TaxGap { value: f64 },
        Religion { religion: ReligionId => Localized<String> },
        StateEfficacy { value: f64 },
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
        Market {
            location_id: u32,
            market: MarketId => Localized<UiMarketId>,
            market_value: f64,
        },
    }
}
