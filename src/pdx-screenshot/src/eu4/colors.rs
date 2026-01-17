use eu4game::game::Game;
use eu4save::{CountryTag, models::Eu4Save};
use std::collections::HashMap;

const OCEAN: [u8; 4] = [69, 94, 119, 255];
const WASTELAND: [u8; 4] = [61, 61, 61, 255];
const UNOWNED_COLOR: [u8; 4] = [94, 94, 94, 128];

/// Generate political map colors for provinces
/// Returns (primary_colors, secondary_colors) where each is a flat RGBA buffer
#[tracing::instrument(
    level = "debug",
    name = "screenshot.generate_political_colors",
    skip(save, game, color_index)
)]
pub fn generate_political_colors(
    save: &Eu4Save,
    game: &Game,
    color_index: &[u16],
    color_count: usize,
) -> (Vec<u8>, Vec<u8>) {
    let result_len = color_count * 4;
    let mut primary = vec![0u8; result_len];
    let mut secondary = vec![0u8; result_len];

    let mut country_colors: HashMap<&CountryTag, [u8; 4]> = HashMap::new();
    for (tag, country) in &save.game.countries {
        let c = &country.colors.map_color;
        country_colors.entry(tag).or_insert([c[0], c[1], c[2], 255]);
    }

    for (id, prov) in &save.game.provinces {
        let Some(&color_slot) = color_index.get(usize::from(id.as_u16())) else {
            continue;
        };

        let offset = color_slot as usize * 4;
        if offset + 4 > primary.len() {
            continue;
        }

        let primary_color = &mut primary[offset..offset + 4];
        let secondary_color = &mut secondary[offset..offset + 4];

        primary_color.copy_from_slice(&WASTELAND);
        secondary_color.copy_from_slice(&WASTELAND);

        if let Some(owner_tag) = prov.owner.as_ref() {
            if let Some(known_color) = country_colors.get(owner_tag) {
                primary_color.copy_from_slice(known_color);
                secondary_color.copy_from_slice(known_color);
            }

            if let Some(controller_tag) = prov.controller.as_ref()
                && controller_tag != owner_tag
                && let Some(known_color) = country_colors.get(controller_tag)
            {
                secondary_color.copy_from_slice(known_color);
            }
        } else if let Some(game_prov) = game.get_province(id) {
            match game_prov.terrain {
                schemas::eu4::Terrain::Ocean => {
                    primary_color.copy_from_slice(&OCEAN);
                    secondary_color.copy_from_slice(&OCEAN);
                }
                _ => {
                    primary_color.copy_from_slice(&UNOWNED_COLOR);
                    secondary_color.copy_from_slice(&UNOWNED_COLOR);
                }
            }
        }
    }

    (primary, secondary)
}
