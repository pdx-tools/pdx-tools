use eu5app::Eu5SaveMetadata;
use eu5app::TableCell as Eu5TableCell;
use eu5app::entity_profile::{
    DiplomacySection, EconomySection, EntityHeader, LocationProfile, LocationsSection,
    OverviewSection,
};
use eu5app::game_data::GameData;
use eu5app::game_data::OptimizedGameBundle;
use eu5app::selection_views::HoverDisplayData;
use eu5app::selection_views::{
    BuildingLevelsInsightData, DevelopmentInsightData, EntityBreakdownData, LocationDistribution,
    MarketInsightData, PopulationInsightData, PossibleTaxInsightData, PossibleTaxScope,
    ReligionInsightData, RgoInsightData, ScopeSummary, StateEfficacyTopLocation, TaxGapInsightData,
    TaxGapScope,
};
use eu5app::{CanvasDimensions, MapMode as Eu5MapMode};
use eu5app::{Eu5LoadedSave, Eu5SaveLoader};
use eu5save::models::Gamestate;
use eu5save::{Eu5ErrorKind, Eu5Melt};
use eu5save::{FailedResolveStrategy, MeltOptions};
use schemas::FlatResolver;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::ops::Deref;
use std::rc::Rc;
use wasm_bindgen::prelude::*;

#[derive(Copy, Clone, Debug, Deserialize, Serialize, tsify::Tsify, PartialEq)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub enum MapMode {
    Political,
    Control,
    Development,
    Population,
    Markets,
    RgoLevel,
    BuildingLevels,
    PossibleTax,
    TaxGap,
    Religion,
    StateEfficacy,
}

#[derive(Debug, Clone, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountryStateEfficacy {
    pub anchor_location_idx: u32,
    pub tag: String,
    pub name: String,
    pub color: String,
    pub total_efficacy: f64,
    pub location_count: u32,
    pub avg_efficacy: f64,
    pub total_population: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct StateEfficacyData {
    pub countries: Vec<CountryStateEfficacy>,
    pub top_locations: Vec<StateEfficacyTopLocation>,
    pub distribution: LocationDistribution,
}

#[derive(Debug, Clone, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountrySearchEntry {
    pub id: u32,
    pub tag: String,
    pub name: String,
    pub capital_location_idx: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountriesData {
    pub countries: Vec<CountrySearchEntry>,
}

#[derive(Debug, Clone, tsify::Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct SelectionSummaryData {
    pub entity_count: u32,
    pub location_count: u32,
    pub is_empty: bool,
    pub total_population: u32,
    pub preset: Option<String>,
    /// Raw location index of the focused single tile, or `None`.
    pub focused_location: Option<u32>,
    /// Display name of the focused location, if any.
    pub focused_location_name: Option<String>,
    /// Representative location of the single entity the filter resolves to, if any.
    pub derived_entity_anchor: Option<u32>,
    /// Display name of the single entity the filter resolves to, if any.
    pub scope_display_name: Option<String>,
    /// First selected location index, set when exactly one location is selected and no entity anchor exists.
    pub first_location_idx: Option<u32>,
}

impl From<MapMode> for Eu5MapMode {
    fn from(mode: MapMode) -> Self {
        match mode {
            MapMode::Political => Eu5MapMode::Political,
            MapMode::Control => Eu5MapMode::Control,
            MapMode::Development => Eu5MapMode::Development,
            MapMode::Population => Eu5MapMode::Population,
            MapMode::Markets => Eu5MapMode::Markets,
            MapMode::RgoLevel => Eu5MapMode::RgoLevel,
            MapMode::BuildingLevels => Eu5MapMode::BuildingLevels,
            MapMode::PossibleTax => Eu5MapMode::PossibleTax,
            MapMode::TaxGap => Eu5MapMode::TaxGap,
            MapMode::Religion => Eu5MapMode::Religion,
            MapMode::StateEfficacy => Eu5MapMode::StateEfficacy,
        }
    }
}

impl From<Eu5MapMode> for MapMode {
    fn from(mode: Eu5MapMode) -> Self {
        match mode {
            Eu5MapMode::Political => MapMode::Political,
            Eu5MapMode::Control => MapMode::Control,
            Eu5MapMode::Development => MapMode::Development,
            Eu5MapMode::Population => MapMode::Population,
            Eu5MapMode::Markets => MapMode::Markets,
            Eu5MapMode::RgoLevel => MapMode::RgoLevel,
            Eu5MapMode::BuildingLevels => MapMode::BuildingLevels,
            Eu5MapMode::PossibleTax => MapMode::PossibleTax,
            Eu5MapMode::TaxGap => MapMode::TaxGap,
            Eu5MapMode::Religion => MapMode::Religion,
            Eu5MapMode::StateEfficacy => MapMode::StateEfficacy,
        }
    }
}

mod tokens;
pub use tokens::set_tokens;

#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(tag = "type", content = "value")]
#[serde(rename_all = "camelCase")]
pub enum TableCell {
    #[serde(rename = "text")]
    Text(String),
    #[serde(rename = "integer")]
    Integer(i64),
    #[serde(rename = "float")]
    Float { value: f64, decimals: u8 },
}

impl From<Eu5TableCell> for TableCell {
    fn from(cell: Eu5TableCell) -> Self {
        match cell {
            Eu5TableCell::Text(s) => TableCell::Text(s),
            Eu5TableCell::Integer(i) => TableCell::Integer(i),
            Eu5TableCell::Float { value, decimals } => TableCell::Float { value, decimals },
        }
    }
}

#[derive(Copy, Clone, Debug, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct MapModeRange {
    mode: MapMode,
    min_value: f64,
    max_value: f64,
}

#[derive(Copy, Clone, Debug, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSize {
    width: f32,
    height: f32,
}

#[derive(Copy, Clone, Debug, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CanvasDisplay {
    width: f32,
    height: f32,
    scale_factor: f32,
}

impl From<CanvasDisplay> for CanvasDimensions {
    fn from(display: CanvasDisplay) -> Self {
        CanvasDimensions {
            canvas_width: display.width as u32,
            canvas_height: display.height as u32,
            scale_factor: display.scale_factor,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(transparent)]
pub struct Eu5SaveMetadataHandle(Rc<Eu5SaveMetadata>);

impl Deref for Eu5SaveMetadataHandle {
    type Target = Eu5SaveMetadata;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotOverlayData {
    pub title: String,
    pub save_date: String,
    pub patch_version: String,
    pub body: OverlayBodyConfig,
}

#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct OverlayBodyConfig {
    pub left_table: OverlayTable,
    pub right_table: OverlayTable,
    pub max_rows: Option<u32>,
}

#[derive(Debug, Clone, Deserialize, Serialize, tsify::Tsify)]
#[tsify(into_wasm_abi, from_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct OverlayTable {
    pub title: Option<String>,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<TableCell>>,
}

impl From<eu5app::OverlayBodyConfig> for OverlayBodyConfig {
    fn from(config: eu5app::OverlayBodyConfig) -> Self {
        OverlayBodyConfig {
            left_table: OverlayTable::from(config.left_table),
            right_table: OverlayTable::from(config.right_table),
            max_rows: config.max_rows,
        }
    }
}

impl From<eu5app::OverlayTable> for OverlayTable {
    fn from(table: eu5app::OverlayTable) -> Self {
        OverlayTable {
            title: table.title,
            headers: table.headers,
            rows: table
                .rows
                .into_iter()
                .map(|row| row.into_iter().map(TableCell::from).collect())
                .collect(),
        }
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5MetaParser {
    base_resolver: &'static FlatResolver<'static>,
}

#[wasm_bindgen]
impl Eu5MetaParser {
    #[wasm_bindgen]
    pub fn create() -> Result<Self, JsError> {
        Ok(Eu5MetaParser {
            base_resolver: tokens::get_tokens(),
        })
    }

    #[wasm_bindgen]
    pub fn init(self, save: Vec<u8>) -> Result<SaveLoader, JsError> {
        let file = eu5save::Eu5File::from_slice(save)
            .map_err(|e| JsError::new(&format!("Failed to parse save file: {e}")))?;

        let parser = Eu5SaveLoader::open(file, self.base_resolver)
            .map_err(|e| JsError::new(&format!("Failed to parse save file: {e}")))?;

        Ok(SaveLoader { parser })
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct SaveLoader {
    parser: Eu5SaveLoader<Cursor<Vec<u8>>, &'static FlatResolver<'static>>,
}

#[wasm_bindgen]
impl SaveLoader {
    #[wasm_bindgen]
    pub fn meta(&self) -> Eu5SaveMetadataHandle {
        Eu5SaveMetadataHandle(self.parser.meta())
    }

    #[wasm_bindgen]
    pub fn parse_gamestate(self) -> Result<Eu5WasmGamestate, JsError> {
        let meta = self.meta();
        let parsed_save = self
            .parser
            .parse()
            .map_err(|e| JsError::new(&format!("Failed to parse game state: {e}")))?;

        Ok(Eu5WasmGamestate { parsed_save, meta })
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmGamestate {
    meta: Eu5SaveMetadataHandle,
    parsed_save: Eu5LoadedSave,
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5WasmGameBundle {
    game_data: GameData,
}

#[wasm_bindgen]
impl Eu5WasmGameBundle {
    #[wasm_bindgen]
    pub fn open(data: Vec<u8>) -> Result<Self, JsError> {
        let bundle = OptimizedGameBundle::open(data)
            .map_err(|e| JsError::new(&format!("Failed to open game bundle: {e}")))?;
        let game_data = bundle
            .into_game_data()
            .map_err(|e| JsError::new(&format!("Failed to deserialize game data: {e}")))?;
        Ok(Eu5WasmGameBundle { game_data })
    }
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct Eu5App {
    _loaded_save: Eu5LoadedSave,
    app: eu5app::Eu5Workspace<'static>, // depends on _loaded_save

    _meta: Eu5SaveMetadataHandle,
}

#[wasm_bindgen]
impl Eu5App {
    #[wasm_bindgen]
    pub fn init(
        mut gamestate: Eu5WasmGamestate,
        game_bundle: Eu5WasmGameBundle,
    ) -> Result<Eu5App, JsError> {
        let meta = gamestate.meta;
        let eu5_gamestate = gamestate.parsed_save.take_gamestate();
        let eu5_gamestate =
            unsafe { std::mem::transmute::<Gamestate<'_>, Gamestate<'static>>(eu5_gamestate) };
        let app = eu5app::Eu5Workspace::new(eu5_gamestate, game_bundle.game_data)
            .map_err(|x| JsError::new(&format!("Failed to create EU5 app: {x}")))?;

        Ok(Eu5App {
            _loaded_save: gamestate.parsed_save,
            app,
            _meta: meta,
        })
    }

    fn app(&self) -> &eu5app::Eu5Workspace<'_> {
        &self.app
    }

    #[wasm_bindgen]
    pub fn get_starting_coordinates(&self) -> Option<CapitalColorId> {
        let color_id = self.app().player_capital_color_id()?;
        Some(CapitalColorId {
            color_id: color_id.value(),
        })
    }

    #[wasm_bindgen]
    pub fn location_arrays(&self) -> BufferParts {
        let data = self.app().location_arrays().as_data();
        BufferParts {
            ptr: data.as_ptr() as *const u8,
            len: data.len(),
        }
    }

    /// Switch map mode to the specified mode
    #[wasm_bindgen]
    pub fn set_map_mode(&mut self, mode: MapMode) {
        self.app.set_map_mode(mode.into());
    }

    /// Get the current map mode
    #[wasm_bindgen]
    pub fn get_map_mode(&self) -> MapMode {
        self.app().get_map_mode().into()
    }

    /// Get the min and max values for a given map mode
    #[wasm_bindgen]
    pub fn get_map_mode_range(&self, mode: MapMode) -> MapModeRange {
        let eu5_mode: Eu5MapMode = mode.into();
        let session = self.app();

        let (min_value, max_value) = match eu5_mode {
            Eu5MapMode::Development => (0.0, session.max_development()),
            Eu5MapMode::Population => (0.0, session.max_population()),
            Eu5MapMode::RgoLevel => (0.0, session.max_rgo_level()),
            Eu5MapMode::BuildingLevels => (0.0, session.max_building_levels()),
            Eu5MapMode::PossibleTax => (0.0, session.max_possible_tax()),
            Eu5MapMode::TaxGap => session.tax_gap_range(),
            Eu5MapMode::StateEfficacy => (0.0, session.max_state_efficacy()),
            Eu5MapMode::Control => (0.0, 1.0),
            // For non-numeric modes (Political, Markets, Religion), return default range
            _ => (0.0, 1.0),
        };

        MapModeRange {
            mode,
            min_value,
            max_value,
        }
    }

    /// Check if a location can be highlighted based on its terrain
    #[wasm_bindgen]
    pub fn can_highlight_location(&self, location_idx: u32) -> bool {
        let location_idx = eu5save::models::LocationIdx::new(location_idx);
        self.app().can_highlight_location(location_idx)
    }

    #[wasm_bindgen]
    pub fn handle_location_hover(&mut self, location_idx: u32) {
        let location_idx = eu5save::models::LocationIdx::new(location_idx);
        self.app.handle_location_hover(location_idx)
    }

    #[wasm_bindgen]
    pub fn clear_highlights(&mut self) {
        self.app.clear_highlights();
    }

    /// Select the entity at the given location based on the current interaction mode.
    #[wasm_bindgen]
    pub fn select_entity(&mut self, location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app.select_entity(idx);
    }

    /// Add the entity at `location_idx` to the existing selection.
    #[wasm_bindgen]
    pub fn add_entity(&mut self, location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app.add_entity(idx);
    }

    /// Remove the entity at `location_idx` from the selection.
    #[wasm_bindgen]
    pub fn remove_entity(&mut self, location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app.remove_entity(idx);
    }

    #[wasm_bindgen]
    pub fn select_country(&mut self, anchor_location_idx: u32) -> Option<u32> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.select_country_at(idx).map(|c| c.value() as u32)
    }

    #[wasm_bindgen]
    pub fn add_country(&mut self, anchor_location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.add_country_at(idx);
    }

    #[wasm_bindgen]
    pub fn remove_country(&mut self, anchor_location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.remove_country_at(idx);
    }

    #[wasm_bindgen]
    pub fn select_market(&mut self, anchor_location_idx: u32) -> Option<u32> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.select_market_at(idx).map(|c| c.value() as u32)
    }

    #[wasm_bindgen]
    pub fn add_market(&mut self, anchor_location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.add_market_at(idx);
    }

    #[wasm_bindgen]
    pub fn remove_market(&mut self, anchor_location_idx: u32) {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app.remove_market_at(idx);
    }

    /// Clear the current selection and focus.
    #[wasm_bindgen]
    pub fn clear_selection(&mut self) {
        self.app.clear_selection();
    }

    /// Set `focused_location` to `location_idx`, entering that location's entity
    /// filter first if needed. Returns the GPU color id for centering.
    #[wasm_bindgen]
    pub fn set_focused_location(&mut self, location_idx: u32) -> Option<u32> {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app.set_focused_location(idx).map(|c| c.value() as u32)
    }

    /// Clear the focused location.
    #[wasm_bindgen]
    pub fn clear_focus(&mut self) {
        self.app.clear_focus();
    }

    /// Clear focus if set; otherwise clear the selection.
    #[wasm_bindgen]
    pub fn clear_focus_or_selection(&mut self) {
        self.app.clear_focus_or_selection();
    }

    /// Display name for the focused location.
    #[wasm_bindgen]
    pub fn focused_location_display_name(&self) -> Option<String> {
        self.app().focused_location_display_name()
    }

    /// Display name for the current derived entity scope.
    #[wasm_bindgen]
    pub fn scope_display_name(&self) -> Option<String> {
        self.app().scope_display_name()
    }

    #[wasm_bindgen]
    pub fn apply_resolved_box_selection(&mut self, location_idxs: js_sys::Uint32Array, add: bool) {
        let locations = location_idxs
            .to_vec()
            .into_iter()
            .map(eu5save::models::LocationIdx::new);
        self.app.apply_resolved_box_selection(locations, add);
        self.app.clear_highlights();
    }

    #[wasm_bindgen]
    pub fn replace_selection_with_locations(&mut self, location_idxs: js_sys::Uint32Array) {
        let locations = location_idxs
            .to_vec()
            .into_iter()
            .map(eu5save::models::LocationIdx::new);
        self.app.replace_selection_with_locations(locations);
        self.app.clear_highlights();
    }

    /// Return the grouping table for the current map mode as a flat Uint32Array.
    /// Each element is the raw GroupId for the corresponding GPU location index.
    /// Sentinel value `u32::MAX` means no group (unowned / no market).
    #[wasm_bindgen]
    pub fn grouping_table(&self) -> js_sys::Uint32Array {
        let table = self.app.build_grouping_table();
        let raw: Vec<u32> = table.iter().map(|(_, g)| g.raw()).collect();
        js_sys::Uint32Array::from(raw.as_slice())
    }

    /// Select all locations owned by human-controlled countries and their subjects.
    #[wasm_bindgen]
    pub fn select_players(&mut self) {
        self.app.select_players();
        self.app.rebuild_colors();
    }

    /// Return a summary of the current selection (entity and location counts).
    #[wasm_bindgen]
    pub fn get_selection_summary(&self) -> SelectionSummaryData {
        let sel = self.app.selection_state();
        let summary = sel.entity_summary(&self.app);
        let total_population: u32 = sel
            .selected_locations()
            .iter()
            .filter_map(|&idx| {
                let loc = self.app.gamestate().locations.index(idx).location();
                if loc.owner.is_dummy() {
                    return None;
                }
                Some(self.app.gamestate().location_population(loc) as u32)
            })
            .sum();
        let preset = sel.preset().map(|p| match p {
            eu5app::SelectionPreset::Players => "players".to_string(),
        });
        let derived_entity_anchor = self.app.derived_entity_anchor().map(|idx| idx.value());
        let first_location_idx = if derived_entity_anchor.is_none() && summary.location_count == 1 {
            sel.selected_locations()
                .iter()
                .next()
                .map(|idx| idx.value())
        } else {
            None
        };
        SelectionSummaryData {
            entity_count: summary.entity_count as u32,
            location_count: summary.location_count as u32,
            is_empty: sel.is_empty(),
            total_population,
            preset,
            focused_location: sel.focused_location().map(|idx| idx.value()),
            focused_location_name: self.app.focused_location_display_name(),
            derived_entity_anchor,
            scope_display_name: self.app.scope_display_name(),
            first_location_idx,
        }
    }

    /// Get hover display data for a location based on the current interaction mode.
    /// Shows location-level detail when scoped and hovering an in-scope location.
    #[wasm_bindgen]
    pub fn get_hover_data(&self, location_id: u32) -> HoverDisplayData {
        self.app()
            .hover_data(eu5save::models::LocationIdx::new(location_id))
    }

    /// Get screenshot overlay data for the current map mode
    #[wasm_bindgen]
    pub fn get_overlay_data(&self) -> ScreenshotOverlayData {
        let map_mode_title = self.app().get_map_mode().name().to_string();
        let save_date = format!("{}", self.app().gamestate().metadata.date.date_fmt());
        let version = &self.app().gamestate().metadata.version;
        let patch_version = format!("{}.{}.{}", version.major, version.minor, version.patch);

        let overlay_data = self.app().get_overlay_data();
        ScreenshotOverlayData {
            title: map_mode_title,
            save_date,
            patch_version,
            body: OverlayBodyConfig::from(overlay_data),
        }
    }

    /// Return the GPU color ID needed to center the map at a given location.
    /// Returns None if the location has no map presence (e.g. impassable terrain).
    #[wasm_bindgen]
    pub fn center_at(&self, location_idx: u32) -> Option<u32> {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app().center_at(idx).map(|c| c.value() as u32)
    }

    /// Return all countries with their tag, localized name, and capital location index.
    #[wasm_bindgen]
    pub fn get_countries(&self) -> CountriesData {
        let countries = self
            .app()
            .gamestate()
            .countries
            .iter()
            .filter_map(|entry| {
                let data = entry.data()?;
                let id = entry.id().value();
                let tag = entry.tag().to_str().to_string();
                let name = self
                    .app()
                    .localized_country_name(&data.country_name)
                    .to_string();
                let capital_location_idx = data
                    .capital
                    .and_then(|id| self.app().gamestate().locations.get(id))
                    .map(|idx| idx.value());
                Some(CountrySearchEntry {
                    id,
                    tag,
                    name,
                    capital_location_idx,
                })
            })
            .collect();
        CountriesData { countries }
    }

    /// Calculate state efficacy scores for all nations
    #[wasm_bindgen]
    pub fn get_state_efficacy(&self) -> StateEfficacyData {
        let results = self.app().calculate_state_efficacy();
        let countries = results
            .into_iter()
            .map(|efficacy| CountryStateEfficacy {
                anchor_location_idx: efficacy.anchor_location_idx,
                tag: efficacy.tag,
                name: efficacy.name,
                color: efficacy.color,
                total_efficacy: efficacy.total_efficacy,
                location_count: efficacy.location_count,
                avg_efficacy: efficacy.avg_efficacy,
                total_population: efficacy.total_population,
            })
            .collect();

        StateEfficacyData {
            countries,
            top_locations: self.app().state_efficacy_top_locations(),
            distribution: self.app().state_efficacy_location_distribution(),
        }
    }

    // ── Entity Profile Endpoints ──────────────────────────────────────────

    /// Header data for the current single-entity scope. None when empty or
    /// when the filter spans multiple entities.
    #[wasm_bindgen]
    pub fn get_entity_header(&self) -> Option<EntityHeader> {
        self.app().entity_header()
    }

    /// Overview section stats for the current single-entity scope.
    #[wasm_bindgen]
    pub fn get_overview_section(&self) -> Option<OverviewSection> {
        self.app().overview_section()
    }

    /// Economy section for the current single-entity scope.
    #[wasm_bindgen]
    pub fn get_economy_section(&self) -> Option<EconomySection> {
        self.app().economy_section()
    }

    /// Locations section for the current single-entity scope.
    #[wasm_bindgen]
    pub fn get_locations_section(&self) -> Option<LocationsSection> {
        self.app().locations_section()
    }

    /// Diplomacy section for the current single country scope.
    /// Returns None for market entities.
    #[wasm_bindgen]
    pub fn get_diplomacy_section(&self) -> Option<DiplomacySection> {
        self.app().diplomacy_section()
    }

    /// Full profile for a single location.
    #[wasm_bindgen]
    pub fn get_location_profile(&self, location_idx: u32) -> Option<LocationProfile> {
        let idx = eu5save::models::LocationIdx::new(location_idx);
        self.app().location_profile_for(idx)
    }

    // ── Multi-entity & Aggregate Endpoints ───────────────────────────────

    /// Per-entity breakdown for the current selection (or world if empty).
    /// Groups by owner in most modes; by market in Markets mode.
    #[wasm_bindgen]
    pub fn get_entity_breakdown(&self) -> EntityBreakdownData {
        self.app().selection_entity_breakdown()
    }

    /// Histogram distribution of location metric values for the current mode
    /// over the current selection (or world if empty).
    #[wasm_bindgen]
    pub fn get_location_distribution(&self) -> LocationDistribution {
        self.app().selection_location_distribution()
    }

    /// Development insight data: per-country aggregates for scatter chart and
    /// top development locations for the table view.
    #[wasm_bindgen]
    pub fn get_development_insight(&self) -> DevelopmentInsightData {
        self.app().calculate_development_insight()
    }

    /// Possible-tax insight data: per-country realized vs ceiling aggregates
    /// and top locations by possible tax.
    #[wasm_bindgen]
    pub fn get_possible_tax_insight(&self) -> PossibleTaxInsightData {
        self.app().calculate_possible_tax_insight()
    }

    /// Tax-gap insight data: per-country realized vs ceiling aggregates and
    /// top locations by signed gap.
    #[wasm_bindgen]
    pub fn get_tax_gap_insight(&self) -> TaxGapInsightData {
        self.app().calculate_tax_gap_insight()
    }

    /// Scope summary: entity/location/population totals for the active selection,
    /// or world totals when no selection is active.
    #[wasm_bindgen]
    pub fn get_scope_summary(&self) -> ScopeSummary {
        self.app().get_scope_summary()
    }

    /// Possible-tax scope: location count, summed possible tax ceiling, and
    /// summed realized tax base for the active selection or entire world.
    #[wasm_bindgen]
    pub fn get_possible_tax_scope(&self) -> PossibleTaxScope {
        self.app().get_possible_tax_scope()
    }

    /// Tax-gap scope: location count, signed gap, and aggregate realization
    /// ratio for the active selection or entire world.
    #[wasm_bindgen]
    pub fn get_tax_gap_scope(&self) -> TaxGapScope {
        self.app().get_tax_gap_scope()
    }

    /// Market insight data: scoped goods pressure, scoped market stress,
    /// and top production-opportunity locations for the current filter.
    #[wasm_bindgen]
    pub fn get_market_insight(&self) -> MarketInsightData {
        self.app().calculate_market_insight()
    }

    /// Population insight data: scoped country population, concentration curve,
    /// and top populated locations for the current filter.
    #[wasm_bindgen]
    pub fn get_population_insight(&self) -> PopulationInsightData {
        self.app().calculate_population_insight()
    }

    /// Building levels insight data: scoped building type aggregates, foreign owner
    /// summaries, heatmap cells, and top locations by total levels.
    #[wasm_bindgen]
    pub fn get_building_levels_insight(&self) -> BuildingLevelsInsightData {
        self.app().calculate_building_levels_insight()
    }

    /// Religion insight data: state religions by ruled population and per-religion
    /// follower/coverage breakdown for the current filter.
    #[wasm_bindgen]
    pub fn get_religion_insight(&self) -> ReligionInsightData {
        self.app().calculate_religion_insight()
    }

    /// RGO insight data: scoped raw-material capacity by material and location,
    /// profile deltas against global share, and owner-control breakdown.
    #[wasm_bindgen]
    pub fn get_rgo_insight(&self) -> RgoInsightData {
        self.app().calculate_rgo_insight()
    }

    /// Entity header for a specific entity resolved from `anchor_location_idx`,
    /// over that entity's full territory (ignores current selection).
    #[wasm_bindgen]
    pub fn get_entity_header_for(&self, anchor_location_idx: u32) -> Option<EntityHeader> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app().entity_header_for(idx)
    }

    /// Overview section for a specific entity's full territory.
    #[wasm_bindgen]
    pub fn get_overview_section_for(&self, anchor_location_idx: u32) -> Option<OverviewSection> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app().overview_section_for(idx)
    }

    /// Economy section for a specific entity's full territory.
    #[wasm_bindgen]
    pub fn get_economy_section_for(&self, anchor_location_idx: u32) -> Option<EconomySection> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app().economy_section_for(idx)
    }

    /// Locations section for a specific entity's full territory.
    #[wasm_bindgen]
    pub fn get_locations_section_for(&self, anchor_location_idx: u32) -> Option<LocationsSection> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app().locations_section_for(idx)
    }

    /// Diplomacy section for a specific country entity.
    /// Returns None for market entities.
    #[wasm_bindgen]
    pub fn get_diplomacy_section_for(&self, anchor_location_idx: u32) -> Option<DiplomacySection> {
        let idx = eu5save::models::LocationIdx::new(anchor_location_idx);
        self.app().diplomacy_section_for(idx)
    }
}

#[derive(Debug, Clone, Copy, tsify::Tsify, Serialize)]
#[tsify(into_wasm_abi)]
pub struct CapitalColorId {
    color_id: u16,
}

#[wasm_bindgen]
pub fn setup_eu5_wasm(level: wasm_pdx_core::log_level::LogLevel) {
    wasm_pdx_core::console_error_panic_hook::set_once();
    wasm_pdx_core::console_writer::init_with_level(level.into());
}

#[wasm_bindgen]
#[derive(Debug)]
pub struct BufferParts {
    ptr: *const u8,
    len: usize,
}

#[wasm_bindgen]
impl BufferParts {
    #[wasm_bindgen]
    pub fn ptr(&self) -> *const u8 {
        self.ptr
    }

    #[wasm_bindgen]
    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

fn _melt(data: &[u8]) -> Result<Vec<u8>, eu5save::Eu5Error> {
    let file = eu5save::Eu5File::from_slice(data).map_err(Eu5ErrorKind::from)?;
    let mut out = Cursor::new(Vec::new());
    let options = MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Ignore);
    (&file).melt(options, tokens::get_tokens(), &mut out)?;
    Ok(out.into_inner())
}

#[wasm_bindgen]
pub fn melt(data: &[u8]) -> Result<js_sys::Uint8Array, JsError> {
    _melt(data)
        .map(|x| js_sys::Uint8Array::from(x.as_slice()))
        .map_err(JsError::from)
}
