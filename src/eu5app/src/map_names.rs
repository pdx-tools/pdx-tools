//! The names set on the map: of the realms, or of the religions or markets
//! that the map mode colors.

use crate::presentation::{LocalizationContext, OwnedCountryName, Present};
use eu5save::models::{CountryIdx, LocationIdx, ReligionId};
use serde::{Deserialize, Serialize};

/// What a name on the map says.
#[derive(Debug, Clone)]
pub(crate) enum MapNameText {
    /// A country on the save date, named as the lists name it.
    Country(CountryIdx),
    /// The owner on a past date, named as the hover of that date names it.
    DatedCountry(OwnedCountryName),
    Religion(ReligionId),
    /// A market, by its center. The map mode already says that it is a market.
    Market(LocationIdx),
}

impl Present for MapNameText {
    type Output = String;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        match self {
            MapNameText::Country(idx) => idx.present(ctx).name,
            MapNameText::DatedCountry(name) => name.present(ctx),
            MapNameText::Religion(religion) => religion.present(ctx).name,
            MapNameText::Market(center) => center.present(ctx).name,
        }
    }
}

/// One name and the land that it names.
#[derive(Debug, Clone)]
pub(crate) struct MapNameSource {
    pub text: MapNameText,
    pub must_show: bool,
    pub leader_line: bool,
    pub locations: Vec<u16>,
}

/// The names for the map date, mode and selection, the most important first.
#[derive(Debug, Clone)]
pub(crate) struct MapNamesSource {
    pub names: Vec<MapNameSource>,
}

/// One name on the map.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(rename_all = "camelCase")]
pub struct MapName {
    pub text: String,
    /// The name keeps a place near its land when the land is too small for it.
    pub must_show: bool,
    /// The name can stand away from its land, with a line to it.
    pub leader_line: bool,
    /// The number of the name's locations in [`MapNames::locations`].
    pub location_count: u32,
}

/// The names for the map date, mode and selection, the most important first.
/// The land of all names is in one list, so that it goes to the map as one buffer.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct MapNames {
    names: Vec<MapName>,
    locations: Vec<u16>,
}

impl MapNames {
    pub fn names(&self) -> &[MapName] {
        &self.names
    }

    /// The map color ids of the land of each name, in the order of the names.
    pub fn locations(&self) -> &[u16] {
        &self.locations
    }

    /// Each name with the map color ids of its land.
    pub fn lands(&self) -> impl Iterator<Item = (&MapName, &[u16])> {
        let mut rest = self.locations.as_slice();
        self.names.iter().map(move |name| {
            let (land, after) = rest.split_at(name.location_count as usize);
            rest = after;
            (name, land)
        })
    }
}

impl Present for MapNamesSource {
    type Output = MapNames;

    fn present(self, ctx: &LocalizationContext<'_, '_>) -> Self::Output {
        let mut out = MapNames::default();
        for name in self.names {
            // The count and the land go in together, so that they always agree.
            out.names.push(MapName {
                text: name.text.present(ctx),
                must_show: name.must_show,
                leader_line: name.leader_line,
                location_count: name.locations.len() as u32,
            });
            out.locations.extend(name.locations);
        }
        out
    }
}
