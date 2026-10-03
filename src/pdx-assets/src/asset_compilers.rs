use crate::{FileProvider, images::ImageProcessor};
use anyhow::{Context, Result};
use std::path::Path;

pub trait GameAssetCompiler {
    fn compile_assets<P: FileProvider, I: ImageProcessor>(
        &self,
        provider: &P,
        imaging: &I,
        out_dir: &Path,
        options: &PackageOptions,
    ) -> Result<CompilationOutput>;
}

#[derive(Debug, Clone)]
pub struct CompilationOutput {
    pub game_version: String, // major.minor
}

#[derive(Debug, Clone)]
pub struct PackageOptions {
    pub minimal: bool,
    pub dry_run: bool,
    pub game_version: Option<String>,
}

impl PackageOptions {
    pub fn dry_run() -> Self {
        Self {
            dry_run: true,
            minimal: true,
            game_version: None,
        }
    }
}

pub struct Eu4AssetCompliler;

impl GameAssetCompiler for Eu4AssetCompliler {
    fn compile_assets<P: FileProvider, I: ImageProcessor>(
        &self,
        provider: &P,
        imaging: &I,
        out_dir: &Path,
        options: &PackageOptions,
    ) -> Result<CompilationOutput> {
        let game_version = crate::eu4::data::game_version::extract_game_version(provider)
            .context("Unable to extract eu4 game version")?;
        let out_dir = out_dir.join("eu4").join(&game_version);
        crate::eu4::compiler::parse_game_assets(
            provider,
            imaging,
            &out_dir,
            &game_version,
            options,
        )?;
        Ok(CompilationOutput { game_version })
    }
}

pub struct Eu5AssetCompiler;

impl GameAssetCompiler for Eu5AssetCompiler {
    fn compile_assets<P: FileProvider, I: ImageProcessor>(
        &self,
        provider: &P,
        imaging: &I,
        out_dir: &Path,
        options: &PackageOptions,
    ) -> Result<CompilationOutput> {
        let game_version = options
            .game_version
            .clone()
            .context("EU5 requires --version to be specified (caesar_branch.txt no longer contains a parseable version)")?;

        crate::eu5::compiler::compile_game_bundle(
            provider,
            imaging,
            out_dir,
            &game_version,
            options,
        )?;

        Ok(CompilationOutput { game_version })
    }
}

pub struct Hoi4AssetCompiler;

impl GameAssetCompiler for Hoi4AssetCompiler {
    fn compile_assets<P: FileProvider, I: ImageProcessor>(
        &self,
        provider: &P,
        _imaging: &I,
        out_dir: &Path,
        options: &PackageOptions,
    ) -> Result<CompilationOutput> {
        let game_version = match options.game_version.clone() {
            Some(version) => version,
            None => crate::hoi4::compiler::extract_game_version(provider)
                .context("Unable to extract hoi4 game version")?,
        };

        crate::hoi4::compiler::compile_game_bundle(provider, out_dir, &game_version, options)?;
        Ok(CompilationOutput { game_version })
    }
}
