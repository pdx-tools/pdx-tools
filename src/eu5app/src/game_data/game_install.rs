mod parsing;
mod raw;

use pdx_map::R16;
pub use raw::{
    GameFileSource, GameInstallationDirectory, GameTextures, PalettedTextures, RawGameData,
    ZipArchiveData,
};

use crate::game_data::{
    GameData, GameDataError, Localization, OptimizedGameBundle, OptimizedLocalizationBundle,
    OptimizedMapBundle, TextureProvider,
};

pub struct Eu5GameInstall {
    textures: GameTextures,
    game_data: GameData,
    localization: Localization,
}

impl Eu5GameInstall {
    /// Open game data from an arbitrary path.
    ///
    /// - File: treated as a raw/source bundle zip.
    /// - Directory with a `game/` subdirectory: treated as a raw EU5 install
    ///   or extracted raw source.
    /// - Other directory: treated as an optimized bundle family directory; must
    ///   contain `game.zip`, `map.zip`, and `loc-en.zip` side by side.
    #[tracing::instrument(name = "eu5.game_install.open", skip_all, fields(path = %path.as_ref().display()))]
    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, GameDataError> {
        let path = path.as_ref();
        if path.is_file() {
            let file = std::fs::File::open(path)
                .map_err(|e| GameDataError::Io(e, format!("{}", path.display())))?;
            let mut buffer = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
            let zip = rawzip::ZipArchive::from_file(file, &mut buffer)
                .map_err(GameDataError::ZipAccess)?;
            let zip = ZipArchiveData::open(zip, buffer);

            let (raw_game_data, texture_builder) = RawGameData::from_source(&zip)?;
            let paletted = texture_builder.build()?;
            let (game_data, localization) = raw_game_data.materialize(&paletted);
            let textures = paletted.into_textures();
            return Ok(Self {
                textures,
                game_data,
                localization,
            });
        }

        // Raw install / extracted raw source: detect via presence of `game/`.
        if path.join("game").is_dir() {
            let game_installation = GameInstallationDirectory::open(path);
            let (raw_game_data, texture_builder) = RawGameData::from_source(&game_installation)?;
            let paletted = texture_builder.build()?;
            let (game_data, localization) = raw_game_data.materialize(&paletted);
            let textures = paletted.into_textures();
            return Ok(Self {
                textures,
                game_data,
                localization,
            });
        }

        // Optimized bundle family directory: require all three parts.
        let game_zip = path.join("game.zip");
        let map_zip = path.join("map.zip");
        let loc_zip = path.join("loc-en.zip");
        let game_bytes = std::fs::read(&game_zip)
            .map_err(|e| GameDataError::Io(e, format!("{}", game_zip.display())))?;
        let map_bytes = std::fs::read(&map_zip)
            .map_err(|e| GameDataError::Io(e, format!("{}", map_zip.display())))?;
        let loc_bytes = std::fs::read(&loc_zip)
            .map_err(|e| GameDataError::Io(e, format!("{}", loc_zip.display())))?;

        let game_data = OptimizedGameBundle::open(&game_bytes)?.into_game_data()?;
        let localization = OptimizedLocalizationBundle::open(&loc_bytes)?.into_localization()?;
        let mut map_bundle = OptimizedMapBundle::open(&map_bytes)?;
        let (west_data, east_data) = map_bundle.load_hemispheres()?;
        let max_location_index = map_bundle.load_max_location_index()?;
        let textures = GameTextures::new(west_data, east_data, max_location_index);
        Ok(Self {
            textures,
            game_data,
            localization,
        })
    }

    pub fn into_game_data(self) -> GameData {
        self.game_data
    }

    pub fn into_localization(self) -> Localization {
        self.localization
    }

    pub fn into_inner(self) -> (GameTextures, GameData, Localization) {
        (self.textures, self.game_data, self.localization)
    }

    pub fn game_data(&self) -> &GameData {
        &self.game_data
    }

    pub fn localization(&self) -> &Localization {
        &self.localization
    }

    /// Returns a cheap clone of the world
    pub fn world(&self) -> std::sync::Arc<pdx_map::World> {
        self.textures.world()
    }
}

impl TextureProvider for Eu5GameInstall {
    fn west_texture(&self) -> &[R16] {
        self.textures.west_texture()
    }

    fn east_texture(&self) -> &[R16] {
        self.textures.east_texture()
    }

    fn west_texture_size(&self) -> usize {
        self.textures.west_texture_size()
    }

    fn east_texture_size(&self) -> usize {
        self.textures.east_texture_size()
    }
}
