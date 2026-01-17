use eu4game::shared::{Eu4Parser, Eu4SaveOutput};
use eu4save::{PdsDate, SegmentedResolver, query::Query};

use super::ScreenshotError;

/// Parsed save file with full game state
pub struct ParsedSave {
    pub query: Query,
}

impl ParsedSave {
    #[tracing::instrument(name = "screenshot.parse_save", skip(data))]
    pub fn parse(data: &[u8]) -> Result<Self, ScreenshotError> {
        let tokens = schemas::resolver::Eu4FlatTokens::new();
        let breakpoint = tokens.breakpoint();
        let values = tokens.into_values();
        let resolver = SegmentedResolver::from_parts(values, breakpoint, 10000);

        let Eu4SaveOutput { save, .. } = Eu4Parser::new()
            .parse_with(data, &resolver)
            .map_err(ScreenshotError::Parse)?;

        let query = Query::from_save(save);

        Ok(Self { query })
    }

    pub fn minor_version(&self) -> u16 {
        self.query.save().meta.savegame_version.second
    }

    pub fn is_multiplayer(&self) -> bool {
        self.query.save().meta.multiplayer
    }

    pub fn date(&self) -> String {
        self.query.save().meta.date.iso_8601().to_string()
    }
}
