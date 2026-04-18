use eu5app::TableCell as Eu5TableCell;
use eu5app::game_data::GameData;
use eu5app::game_data::OptimizedGameBundle;
use eu5app::{CanvasDimensions, MapMode as Eu5MapMode};
use eu5app::{Eu5LoadedSave, Eu5SaveLoader};
use eu5app::{Eu5SaveMetadata, LocationData};
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
    Religion,
    StateEfficacy,
}

#[derive(Debug, Clone, Serialize, Deserialize, tsify::Tsify)]
#[tsify(into_wasm_abi)]
#[serde(rename_all = "camelCase")]
pub struct CountryStateEfficacy {
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
        SelectionSummaryData {
            entity_count: summary.entity_count as u32,
            location_count: summary.location_count as u32,
            is_empty: sel.is_empty(),
            total_population,
            preset,
            focused_location: sel.focused_location().map(|idx| idx.value()),
            focused_location_name: self.app.focused_location_display_name(),
            derived_entity_anchor: self.app.derived_entity_anchor().map(|idx| idx.value()),
            scope_display_name: self.app.scope_display_name(),
        }
    }

    /// Get hover display data for a location based on the current interaction mode.
    /// Shows location-level detail when scoped and hovering an in-scope location.
    #[wasm_bindgen]
    pub fn get_hover_data(&self, location_id: u32) -> HoverDisplayData {
        let location_idx = eu5save::models::LocationIdx::new(location_id);

        let current_map_mode = self.app().get_map_mode();

        let should_show_location = self
            .app()
            .derived_entity_anchor()
            .map(|anchor| {
                self.app()
                    .same_entity(anchor, location_idx, current_map_mode)
            })
            .unwrap_or(false);

        let location = self
            .app()
            .gamestate()
            .locations
            .index(location_idx)
            .location();

        if location.owner.is_dummy() {
            return HoverDisplayData::Clear;
        }

        if should_show_location {
            let location_name = self.app().location_name(location_idx).to_string();

            // Collect mode-specific data based on current map mode
            let (
                development,
                population,
                rgo_level,
                control_value,
                building_level,
                market_access,
                possible_tax,
            ) = match current_map_mode {
                eu5app::MapMode::Development => (
                    Some(location.development),
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                ),
                eu5app::MapMode::Population => {
                    let actual_population = self.app().gamestate().location_population(location);
                    (
                        None,
                        Some(actual_population as u32),
                        None,
                        None,
                        None,
                        None,
                        None,
                    )
                }
                eu5app::MapMode::RgoLevel => {
                    (None, None, Some(location.rgo_level), None, None, None, None)
                }
                eu5app::MapMode::Control => {
                    (None, None, None, Some(location.control), None, None, None)
                }
                eu5app::MapMode::BuildingLevels => {
                    let building_levels = self.app().get_location_building_levels();
                    let level = building_levels[location_idx];
                    (None, None, None, None, Some(level), None, None)
                }
                eu5app::MapMode::Markets => (
                    None,
                    None,
                    None,
                    None,
                    None,
                    Some(location.market_access),
                    None,
                ),
                eu5app::MapMode::PossibleTax => (
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    Some(location.possible_tax),
                ),
                _ => (None, None, None, None, None, None, None), // Political mode doesn't need extra data
            };

            // Collect religion data for Religion mode
            let (location_religion_name, owner_religion_name) =
                if matches!(current_map_mode, eu5app::MapMode::Religion) {
                    let loc_religion_name = location
                        .religion
                        .and_then(|rid| self.app().gamestate().religion_manager.lookup(rid))
                        .map(|r| r.name.to_str().to_string());

                    let owner_rel_name = self
                        .app()
                        .gamestate()
                        .countries
                        .get(location.owner)
                        .and_then(|owner_idx| {
                            self.app().gamestate().countries.index(owner_idx).data()
                        })
                        .and_then(|owner_data| owner_data.primary_religion)
                        .and_then(|owner_rel_id| {
                            self.app().gamestate().religion_manager.lookup(owner_rel_id)
                        })
                        .map(|r| r.name.to_str().to_string());

                    (loc_religion_name, owner_rel_name)
                } else {
                    (None, None)
                };

            HoverDisplayData::Location {
                location_id,
                location_name,
                development,
                population,
                rgo_level,
                control_value,
                building_level,
                market_access,
                possible_tax,
                location_religion_name,
                owner_religion_name,
            }
        } else {
            // For Markets mode, show market center name instead of country info
            if matches!(current_map_mode, eu5app::MapMode::Markets) {
                let Some(market_id) = location.market else {
                    return HoverDisplayData::Clear;
                };

                let Some(market) = self.app().gamestate().market_manager.get(market_id) else {
                    return HoverDisplayData::Clear;
                };

                let Some(center_idx) = self.app().gamestate().locations.get(market.center) else {
                    return HoverDisplayData::Clear;
                };

                let market_center_name = self.app().location_name(center_idx).to_string();
                let market_value = market.market_value();

                return HoverDisplayData::Country {
                    location_id,
                    country_tag: String::new(),
                    country_name: String::new(),
                    total_development: None,
                    total_population: None,
                    total_rgo_level: None,
                    average_control_value: None,
                    total_building_levels: None,
                    market_center_name: Some(market_center_name),
                    market_value: Some(market_value),
                    total_possible_tax: None,
                    country_religion_name: None,
                };
            }

            let owner_id = location.owner;
            let Some(country) = self.app().gamestate().countries.get_entry(owner_id) else {
                return HoverDisplayData::Clear;
            };

            let country_name = country
                .data()
                .map(|data| self.app.localized_country_name(&data.country_name))
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("C{}", owner_id.value()));

            let country_tag = country.tag().to_str().to_string();

            // Get country religion if in Religion mode
            let country_religion_name = if matches!(current_map_mode, eu5app::MapMode::Religion) {
                country
                    .data()
                    .and_then(|data| data.primary_religion)
                    .and_then(|rel_id| self.app.gamestate().religion_manager.lookup(rel_id))
                    .map(|r| r.name.to_str().to_string())
            } else {
                None
            };

            // Aggregate data across all locations owned by this country
            let (
                total_development,
                total_population,
                total_rgo_level,
                average_control_value,
                total_building_levels,
                total_possible_tax,
            ) = match current_map_mode {
                eu5app::MapMode::Development
                | eu5app::MapMode::Population
                | eu5app::MapMode::RgoLevel
                | eu5app::MapMode::Control
                | eu5app::MapMode::BuildingLevels
                | eu5app::MapMode::PossibleTax => {
                    let mut dev_sum = 0.0;
                    let mut pop_sum = 0u32;
                    let mut rgo_sum = 0.0;
                    let mut control_sum = 0.0;
                    let mut building_sum = 0.0;
                    let mut tax_sum = 0.0;
                    let mut count = 0;

                    let building_levels =
                        if matches!(current_map_mode, eu5app::MapMode::BuildingLevels) {
                            Some(self.app().get_location_building_levels())
                        } else {
                            None
                        };

                    // Iterate through all locations owned by this country
                    for entry in self.app().gamestate().locations.iter() {
                        if entry.location().owner == owner_id {
                            let loc = entry.location();
                            dev_sum += loc.development;
                            pop_sum += self.app().gamestate().location_population(loc) as u32;
                            rgo_sum += loc.rgo_level;
                            control_sum += loc.control;
                            tax_sum += loc.possible_tax;
                            if let Some(levels) = building_levels {
                                building_sum += levels[entry.idx()];
                            }
                            count += 1;
                        }
                    }

                    let total_dev = if matches!(current_map_mode, eu5app::MapMode::Development) {
                        Some(dev_sum)
                    } else {
                        None
                    };

                    let total_pop = if matches!(current_map_mode, eu5app::MapMode::Population) {
                        Some(pop_sum)
                    } else {
                        None
                    };

                    let total_rgo = if matches!(current_map_mode, eu5app::MapMode::RgoLevel) {
                        Some(rgo_sum)
                    } else {
                        None
                    };

                    let avg_control =
                        if matches!(current_map_mode, eu5app::MapMode::Control) && count > 0 {
                            Some(control_sum / count as f64)
                        } else {
                            None
                        };

                    let total_building =
                        if matches!(current_map_mode, eu5app::MapMode::BuildingLevels) {
                            Some(building_sum)
                        } else {
                            None
                        };

                    let total_tax = if matches!(current_map_mode, eu5app::MapMode::PossibleTax) {
                        Some(tax_sum)
                    } else {
                        None
                    };

                    (
                        total_dev,
                        total_pop,
                        total_rgo,
                        avg_control,
                        total_building,
                        total_tax,
                    )
                }
                _ => (None, None, None, None, None, None), // Political, Markets modes don't need extra data
            };

            HoverDisplayData::Country {
                location_id,
                country_tag,
                country_name,
                total_development,
                total_population,
                total_rgo_level,
                average_control_value,
                total_building_levels,
                market_center_name: None,
                market_value: None,
                total_possible_tax,
                country_religion_name,
            }
        }
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
                tag: efficacy.tag,
                name: efficacy.name,
                color: efficacy.color,
                total_efficacy: efficacy.total_efficacy,
                location_count: efficacy.location_count,
                avg_efficacy: efficacy.avg_efficacy,
                total_population: efficacy.total_population,
            })
            .collect();

        StateEfficacyData { countries }
    }
}

#[derive(Debug, Clone, Copy, tsify::Tsify, Serialize)]
#[tsify(into_wasm_abi)]
pub struct CapitalColorId {
    color_id: u16,
}

#[derive(Debug, Clone, tsify::Tsify, Serialize)]
#[tsify(into_wasm_abi)]
#[serde(tag = "kind")]
pub enum HoverDisplayData {
    #[serde(rename = "location")]
    Location {
        #[serde(rename = "locationId")]
        location_id: u32,
        #[serde(rename = "locationName")]
        location_name: String,
        // Optional mode-specific data
        #[serde(skip_serializing_if = "Option::is_none")]
        development: Option<f64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        population: Option<u32>,
        #[serde(rename = "rgoLevel", skip_serializing_if = "Option::is_none")]
        rgo_level: Option<f64>,
        #[serde(rename = "controlValue", skip_serializing_if = "Option::is_none")]
        control_value: Option<f64>,
        #[serde(rename = "buildingLevel", skip_serializing_if = "Option::is_none")]
        building_level: Option<f64>,
        #[serde(rename = "marketAccess", skip_serializing_if = "Option::is_none")]
        market_access: Option<f64>,
        #[serde(rename = "possibleTax", skip_serializing_if = "Option::is_none")]
        possible_tax: Option<f64>,
        #[serde(
            rename = "locationReligionName",
            skip_serializing_if = "Option::is_none"
        )]
        location_religion_name: Option<String>,
        #[serde(rename = "ownerReligionName", skip_serializing_if = "Option::is_none")]
        owner_religion_name: Option<String>,
    },
    #[serde(rename = "country")]
    Country {
        #[serde(rename = "locationId")]
        location_id: u32,
        #[serde(rename = "countryTag")]
        country_tag: String,
        #[serde(rename = "countryName")]
        country_name: String,
        // Optional aggregated mode-specific data
        #[serde(rename = "totalDevelopment", skip_serializing_if = "Option::is_none")]
        total_development: Option<f64>,
        #[serde(rename = "totalPopulation", skip_serializing_if = "Option::is_none")]
        total_population: Option<u32>,
        #[serde(rename = "totalRgoLevel", skip_serializing_if = "Option::is_none")]
        total_rgo_level: Option<f64>,
        #[serde(
            rename = "averageControlValue",
            skip_serializing_if = "Option::is_none"
        )]
        average_control_value: Option<f64>,
        #[serde(
            rename = "totalBuildingLevels",
            skip_serializing_if = "Option::is_none"
        )]
        total_building_levels: Option<f64>,
        #[serde(rename = "marketCenterName", skip_serializing_if = "Option::is_none")]
        market_center_name: Option<String>,
        #[serde(rename = "marketValue", skip_serializing_if = "Option::is_none")]
        market_value: Option<f64>,
        #[serde(rename = "totalPossibleTax", skip_serializing_if = "Option::is_none")]
        total_possible_tax: Option<f64>,
        #[serde(
            rename = "countryReligionName",
            skip_serializing_if = "Option::is_none"
        )]
        country_religion_name: Option<String>,
    },
    #[serde(rename = "clear")]
    Clear,
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
