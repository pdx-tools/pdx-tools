mod parsing;
mod source;

// Re-export SourceGameData as the main public type
pub use source::SourceGameData;

// Re-export all parsing functions as public API
pub use parsing::{
    country_localization, parse_default_map, parse_localization_string, parse_locations_data,
    parse_named_locations,
};
