use eu4game::game::Game;
use eu4save::{CountryTag, models::Eu4Save, query::Query};
use std::collections::HashMap;

const OCEAN : [u8; 4] = [69, 94, 119, 255];
const WASTELAND: [u8; 4] = [61, 61, 61, 255];
const UNOWNED_COLOR: [u8; 4] = [94, 94, 94, 128];

/// Generate political map colors for provinces
/// Returns (primary_colors, secondary_colors) where each is a flat RGBA buffer
pub fn generate_political_colors(
    save: &Eu4Save,
    _query: &Query,
    game: &Game,
    color_index: &[u16],
    color_count: usize,
) -> (Vec<u8>, Vec<u8>) {
    let result_len = color_count * 4;
    let mut primary = vec![0u8; result_len];
    let mut secondary = vec![0u8; result_len];

    // Build country colors map
    let mut country_colors: HashMap<&CountryTag, [u8; 4]> = HashMap::new();
    for (tag, country) in &save.game.countries {
        let c = &country.colors.map_color;
        country_colors.entry(tag).or_insert([c[0], c[1], c[2], 255]);
    }

    // Process each province
    for (id, prov) in &save.game.provinces {
        let id_u16 = id.as_u16();
        if (id_u16 as usize) >= color_index.len() {
            continue;
        }

        let offset = color_index[id_u16 as usize] as usize * 4;
        if offset + 4 > primary.len() {
            continue;
        }

        let primary_color = &mut primary[offset..offset + 4];
        let secondary_color = &mut secondary[offset..offset + 4];

        // Default to wasteland
        primary_color.copy_from_slice(&WASTELAND);
        secondary_color.copy_from_slice(&WASTELAND);

        if let Some(_controller_tag) = prov.controller.as_ref() {
            // Province has a controller (either owner or occupier)
            if let Some(owner_tag) = prov.owner.as_ref() {
                if let Some(known_color) = country_colors.get(owner_tag) {
                    primary_color.copy_from_slice(known_color);
                    secondary_color.copy_from_slice(known_color);
                }

                // If controller is different from owner, update secondary (occupation)
                if let Some(controller_tag) = prov.controller.as_ref() {
                    if controller_tag != owner_tag {
                        if let Some(known_color) = country_colors.get(controller_tag) {
                            secondary_color.copy_from_slice(known_color);
                        }
                    }
                }
            }
        } else if let Some(game_prov) = game.get_province(id) {
            // Province has no controller - apply terrain defaults
            match game_prov.terrain {
                schemas::eu4::Terrain::Ocean => {
                    primary_color.copy_from_slice(&OCEAN);
                    secondary_color.copy_from_slice(&OCEAN);
                }
                schemas::eu4::Terrain::Wasteland => {
                    primary_color.copy_from_slice(&WASTELAND);
                    secondary_color.copy_from_slice(&WASTELAND);
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

/// Get player capital coordinates from save and game data
pub fn get_player_capital_coordinates(
    save: &Eu4Save,
    query: &Query,
    game: &Game,
) -> Option<(u16, u16)> {
    let player_tag = &save.meta.player;
    let country = query.country(player_tag)?;
    let capital_id = country.capital;
    let capital_prov = game.get_province(&capital_id)?;

    Some((capital_prov.center_x, capital_prov.center_y))
}
