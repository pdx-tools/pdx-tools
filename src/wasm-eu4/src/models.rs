#![allow(nonstandard_style)]

use eu4save::CountryTag;
use serde::Serialize;
use std::collections::HashMap;
use tsify::Tsify;

use crate::savefile::{
    CountryCasualties, CountryCulture, CountryInfo, CountryLeader, CountryStateDetails, Estate,
    IdeaGroup, LocalizedCountryExpense, LocalizedCountryIncome, LocalizedTag,
    OwnedDevelopmentStates, PlayerHistory, RunningMonarch, SingleCountryWarCasualties, War,
};

/// Looks like bindgen doesn't include generics in the typescript signature
/// so we create concrete types for all the return types
macro_rules! wasm_wrapper {
    ($name:ident,$ty:ty) => {
        #[derive(Tsify, Serialize)]
        #[tsify(into_wasm_abi)]
        #[serde(transparent)]
        pub struct $name(pub $ty);

        #[allow(clippy::from_over_into)]
        impl Into<$name> for $ty {
            fn into(self) -> $name {
                $name(self)
            }
        }
    };
}

wasm_wrapper!(CountryCultures, Vec<CountryCulture>);
wasm_wrapper!(StringList, Vec<String>);
wasm_wrapper!(I32List, Vec<i32>);
wasm_wrapper!(CountriesIncome, HashMap<CountryTag, LocalizedCountryIncome>);
wasm_wrapper!(CountriesExpenses, HashMap<CountryTag, LocalizedCountryExpense>);
wasm_wrapper!(Estates, Vec<Estate<'static>>);
wasm_wrapper!(OwnedDevelopmentStatesList, Vec<OwnedDevelopmentStates>);
wasm_wrapper!(CountriesCasualties, Vec<CountryCasualties>);
wasm_wrapper!(LocalizedTags, Vec<LocalizedTag>);
wasm_wrapper!(CountryStateDetailsList, Vec<CountryStateDetails>);
wasm_wrapper!(CountryTags, Vec<CountryTag>);
wasm_wrapper!(CountryInfoList, Vec<CountryInfo>);
wasm_wrapper!(RunningMonarchs, Vec<RunningMonarch>);
wasm_wrapper!(CountryLeaders, Vec<CountryLeader>);
wasm_wrapper!(
    SingleCountryWarCasualtiesList,
    Vec<SingleCountryWarCasualties>
);
wasm_wrapper!(Wars, Vec<War>);
wasm_wrapper!(PlayerHistories, Vec<PlayerHistory>);
wasm_wrapper!(IdeaGroups, Vec<IdeaGroup>);
wasm_wrapper!(MetaRef, &'static eu4save::models::Meta);
wasm_wrapper!(OptionalCountryTag, Option<CountryTag>);
wasm_wrapper!(StaticMap, HashMap<&'static str, &'static str>);
