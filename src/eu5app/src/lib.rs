mod color;
pub mod entity_profile;
pub mod game_data;
pub mod gradient;

pub mod hover;
pub mod insights;
mod map;
mod models;
pub(crate) mod overlay;
pub mod presentation;
mod selection;
mod session;
mod subject_color;

pub use presentation::{
    LocalizationContext, Localized, Present, UiCountryIdx, UiCultureId, UiLocationId,
    UiLocationIdx, UiMarketId, UiReligionId,
};

pub use entity_profile::EntityKind;
pub use selection::{
    ClickOutcome, GroupId, GroupingTable, LocationData, SelectionPreset, SelectionState,
    SelectionSummary, single_entity_scope,
};
pub use session::{Eu5LoadError, Eu5LoadedSave, Eu5SaveLoader, Eu5SaveMetadata, Eu5Workspace};

pub use color::Srgb;
pub use map::*;
pub use models::*;
pub(crate) use overlay::OverlayBodyConfigSource;
pub use overlay::{OverlayBodyConfig, OverlayTable, TableCell};
