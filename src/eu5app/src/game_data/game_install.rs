mod parsing;
mod raw;

use pdx_map::R16;
pub use raw::{
    GameFileSource, GameInstallationDirectory, GameTextures, PalettedTextures, RawGameData,
    ZipArchiveData,
};

use crate::game_data::{
    GameData, GameDataError, OptimizedGameBundle, OptimizedMapBundle, TextureProvider,
};

pub struct Eu5GameInstall {
    textures: GameTextures,
    game_data: GameData,
}

impl Eu5GameInstall {
    /// Open game data from an arbitrary path.
    ///
    /// - File: treated as a raw/source bundle zip.
    /// - Directory with a `game/` subdirectory: treated as a raw EU5 install
    ///   or extracted raw source.
    /// - Other directory: treated as an optimized bundle family directory; must
    ///   contain `game.zip` and `map.zip` side by side.
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

            let (game_data, texture_builder) = RawGameData::from_source(&zip)?;
            let paletted = texture_builder.build()?;
            let game_data = game_data.into_game_data(&paletted);
            let textures = paletted.into_textures();
            return Ok(Self {
                textures,
                game_data,
            });
        }

        // Raw install / extracted raw source: detect via presence of `game/`.
        if path.join("game").is_dir() {
            let game_installation = GameInstallationDirectory::open(path);
            let (game_data, texture_builder) = RawGameData::from_source(&game_installation)?;
            let paletted = texture_builder.build()?;
            let game_data = game_data.into_game_data(&paletted);
            let textures = paletted.into_textures();
            return Ok(Self {
                textures,
                game_data,
            });
        }

        // Optimized bundle family directory: require both parts.
        let game_zip = path.join("game.zip");
        let map_zip = path.join("map.zip");
        let game_bytes = std::fs::read(&game_zip)
            .map_err(|e| GameDataError::Io(e, format!("{}", game_zip.display())))?;
        let map_bytes = std::fs::read(&map_zip)
            .map_err(|e| GameDataError::Io(e, format!("{}", map_zip.display())))?;

        let game_data = OptimizedGameBundle::open(&game_bytes)?.into_game_data()?;
        let mut map_bundle = OptimizedMapBundle::open(&map_bytes)?;
        let (west_data, east_data) = map_bundle.load_hemispheres()?;
        let max_location_index = map_bundle.load_max_location_index()?;
        let textures = GameTextures::new(west_data, east_data, max_location_index);
        Ok(Self {
            textures,
            game_data,
        })
    }

    pub fn into_game_data(self) -> GameData {
        self.game_data
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
