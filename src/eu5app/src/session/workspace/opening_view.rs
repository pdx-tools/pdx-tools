use super::*;
use serde::{Deserialize, Serialize};

/// Where the map opens for a save.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "tsify", derive(tsify::Tsify))]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum OpeningView {
    /// The one human player's capital.
    Capital {
        #[cfg_attr(feature = "tsify", tsify(type = "number"))]
        color_id: crate::ColorIdx,
    },
    /// The whole world: an observer game, a multiplayer game, or a player
    /// whose capital is not on the map.
    World,
}

impl<'bump> Eu5Workspace<'bump> {
    /// Where the map opens for this save: the one human player's capital,
    /// or the whole world when there is no one capital to favor.
    pub fn opening_view(&self) -> OpeningView {
        let mut players = self.players();
        let Some(player) = players.next() else {
            return OpeningView::World;
        };
        if players.next().is_some() {
            return OpeningView::World;
        }
        self.capital_color_id(player.country)
            .map_or(OpeningView::World, |color_id| OpeningView::Capital {
                color_id,
            })
    }

    /// The color ID of the country's capital. Returns None if the country
    /// has no capital, or the capital is not on the map.
    fn capital_color_id(
        &self,
        country_idx: eu5save::models::CountryIdx,
    ) -> Option<crate::ColorIdx> {
        let capital_id = self
            .gamestate
            .countries
            .index(country_idx)
            .data()?
            .capital?;

        // Look up capital in gpu_indices (already mapped during initialization)
        let capital_idx = self.gamestate.locations.get(capital_id)?;
        let gpu_idx = self.gpu_indices[capital_idx]?;

        Some(crate::ColorIdx::new(gpu_idx.value()))
    }
}
