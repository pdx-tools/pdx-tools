mod parsing;
mod raw;

use pdx_map::R16Palette;
pub use raw::{
    GameFileSource, GameInstallationDirectory, GameTextureBundle, RawGameData, ZipArchiveData,
};

use crate::game_data::{
    GameData, GameDataError, OptimizedGameBundle, TextureProvider,
    optimized::OptimizedTextureBundle,
};

pub struct Eu5GameInstall {
    textures: GameTextureBundle,
    game_data: GameData,
}

impl Eu5GameInstall {
    /// Open game data from an arbitrary path (auto-detects type)
    #[tracing::instrument(name = "eu5.game_install.open", skip_all, fields(path = %path.as_ref().display()))]
    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, GameDataError> {
        let path = path.as_ref();
        if path.is_file() {
            let data = std::fs::read(path)
                .map_err(|e| GameDataError::Io(e, format!("{}", path.display())))?;

            if let Ok(game_data) = OptimizedGameBundle::open(&data) {
                let game_data = game_data.into_game_data()?;
                let mut textures = OptimizedTextureBundle::open(&data)?;
                let west_data = textures.load_west_texture(Vec::new())?;
                let east_data = textures.load_east_texture(Vec::new())?;
                let textures =
                    GameTextureBundle::new(west_data, east_data, R16Palette::new(vec![]));
                return Ok(Self {
                    textures,
                    game_data,
                });
            }

            let file = std::fs::File::open(path)
                .map_err(|e| GameDataError::Io(e, format!("{}", path.display())))?;
            let mut buffer = vec![0u8; rawzip::RECOMMENDED_BUFFER_SIZE];
            let zip = rawzip::ZipArchive::from_file(file, &mut buffer)
                .map_err(GameDataError::ZipAccess)?;
            let zip = ZipArchiveData::open(zip, buffer);

            // Fall back to treating it as a game_install bundle zip
            let (game_data, texture_builder) = RawGameData::from_source(&zip)?;
            let textures = texture_builder.build()?;
            let game_data = game_data.into_game_data(&textures);
            return Ok(Self {
                textures,
                game_data,
            });
        }

        // Directory - treat as raw game install or extracted bundle
        let game_installation = GameInstallationDirectory::open(path);
        let (game_data, textures) = RawGameData::from_source(&game_installation)?;
        let textures = textures.build()?;
        let game_data = game_data.into_game_data(&textures);
        Ok(Self {
            textures,
            game_data,
        })
    }

    pub fn into_game_data(self) -> GameData {
        self.game_data
    }
}

impl TextureProvider for Eu5GameInstall {
    fn load_west_texture(&mut self, dst: Vec<u8>) -> Result<Vec<u8>, GameDataError> {
        self.textures.load_west_texture(dst)
    }

    fn load_east_texture(&mut self, dst: Vec<u8>) -> Result<Vec<u8>, GameDataError> {
        self.textures.load_east_texture(dst)
    }

    fn west_texture_size(&self) -> usize {
        self.textures.west_texture_size()
    }

    fn east_texture_size(&self) -> usize {
        self.textures.east_texture_size()
    }
}
