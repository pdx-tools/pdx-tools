mod parsing;
mod raw;

pub use raw::{
    GameFileSource, GameInstallationDirectory, GameTextureBundle, RawGameData, ZipArchiveData,
};

use crate::{
    GameLocationData,
    game_data::{
        GameData, GameDataError, GameDataProvider, OptimizedGameBundle, TextureProvider,
        optimized::OptimizedTextureBundle,
    },
};

pub struct Eu5GameInstall {
    textures: GameTextureBundle,
    game_data: GameData,
}

impl Eu5GameInstall {
    /// Open game data from an arbitrary path (auto-detects type)
    pub fn open(path: impl AsRef<std::path::Path>) -> Result<Self, GameDataError> {
        let path = path.as_ref();
        if path.is_file() {
            let data = std::fs::read(path)
                .map_err(|e| GameDataError::Io(e, format!("{}", path.display())))?;

            if let Ok(game_data) = OptimizedGameBundle::open(&data) {
                let game_data = game_data.into_game_data()?;
                let textures = OptimizedTextureBundle::open(&data)?;
                let mut west_data = vec![0u8; textures.west_texture_size()];
                let mut east_data = vec![0u8; textures.east_texture_size()];
                textures.load_west_texture(&mut west_data)?;
                textures.load_east_texture(&mut east_data)?;
                let textures = GameTextureBundle::new(west_data, east_data);
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
}

impl GameDataProvider for Eu5GameInstall {
    fn lookup_location(&self, name: &str) -> Option<GameLocationData> {
        self.game_data.lookup_location(name)
    }

    fn localized_country_name(&self, tag: &str) -> Option<&str> {
        self.game_data.localized_country_name(tag)
    }
}

impl TextureProvider for Eu5GameInstall {
    fn load_west_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        self.textures.load_west_texture(dst)
    }

    fn load_east_texture(&self, dst: &mut [u8]) -> Result<(), GameDataError> {
        self.textures.load_east_texture(dst)
    }

    fn west_texture_size(&self) -> usize {
        self.textures.west_texture_size()
    }

    fn east_texture_size(&self) -> usize {
        self.textures.east_texture_size()
    }
}
