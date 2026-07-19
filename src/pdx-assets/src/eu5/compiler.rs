use crate::asset_compilers::PackageOptions;
use crate::images::{
    Color, Geometry, MontageRequest, MontageSizing, OutputFormat, ScaleFilter, WebpQuality,
};
use crate::{FileProvider, ImageProcessor};
use anyhow::Result;
use eu5app::game_data::{
    GoodsData, LocalizationsData,
    game_install::{GameFileSource, RawGameData},
    optimized::WorldMetadata,
};
use rawzip::CompressionMethod;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};

const FRONTEND_GOODS_ICONS_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../app/app/features/eu5/components/icons/goods"
);

const TRADE_GOODS_ICON_PATH: &str = "game/main_menu/gfx/interface/icons/trade_goods";
const FLAGS_PER_ATLAS: usize = 128;

struct FileProviderAdapter<P>(P);

impl<P> GameFileSource for FileProviderAdapter<P>
where
    P: FileProvider,
{
    fn open_file<'a>(
        &'a self,
        path: &str,
    ) -> std::result::Result<Box<dyn std::io::Read + 'a>, eu5app::game_data::GameDataError> {
        self.0
            .open_file(path)
            .map_err(|e| map_provider_error(e, path))
    }

    fn read_to_string(
        &self,
        path: &str,
    ) -> std::result::Result<String, eu5app::game_data::GameDataError> {
        self.0
            .read_to_string(path)
            .map_err(|e| map_provider_error(e, path))
    }

    fn walk_directory(
        &self,
        path: &str,
        ends_with: &[&str],
    ) -> std::result::Result<Vec<String>, eu5app::game_data::GameDataError> {
        self.0
            .walk_directory(path, ends_with)
            .map_err(|e| map_provider_error(e, path))
    }
}

fn map_provider_error(e: anyhow::Error, path: &str) -> eu5app::game_data::GameDataError {
    let message = e.to_string();
    if message.contains("File not found") || message.contains("No such file or directory") {
        eu5app::game_data::GameDataError::MissingData(String::from(path))
    } else {
        eu5app::game_data::GameDataError::Io(std::io::Error::other(e), String::from(path))
    }
}

pub fn compile_game_bundle<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    game_version: &str,
    options: &PackageOptions,
) -> Result<()>
where
    P: FileProvider,
    I: ImageProcessor,
{
    let provider = FileProviderAdapter(fs);
    let (raw_game_data, texture_builder) = RawGameData::from_source(&provider)?;

    // Collect goods icon paths now (before dry_run check) so DDS files are
    // accessed during bundle tracing even when skipping image processing.
    let mut goods_icon_names = raw_game_data
        .goods
        .keys()
        .map(|name| {
            (
                name.clone(),
                format!("{TRADE_GOODS_ICON_PATH}/icon_goods_{name}.dds"),
            )
        })
        .chain(std::iter::once((
            "_default".to_string(),
            format!("{TRADE_GOODS_ICON_PATH}/_default.dds"),
        )))
        .collect::<Vec<_>>();
    goods_icon_names.sort();
    let goods_images: Vec<(String, PathBuf)> = goods_icon_names
        .into_iter()
        .map(|(name, path)| {
            let f = fs.fs_file(&path)?;
            Ok((name, f.path))
        })
        .collect::<Result<_>>()?;

    // Load coat of arms definitions and warm/trace the referenced emblem and
    // pattern textures now (before the dry_run check) so they are recorded for
    // bundle tracing even when we skip image processing. EU5 flag assets are
    // required; `load` fails loudly if they are absent.
    let flag_renderer = crate::eu5::coat_of_arms::Eu5FlagRenderer::load(fs)?;
    flag_renderer.trace();

    // If we are bundle tracing no need to do expensive image processing or create bundle
    if options.dry_run {
        return Ok(());
    }

    let textures = texture_builder.build()?;

    // Create location data with color awareness
    let locations = textures.location_aware(raw_game_data.locations);

    // Create per-version output directory: assets/game/eu5/{version}/
    let version_dir = out_dir.join("eu5").join(game_version);
    std::fs::create_dir_all(&version_dir)?;

    // Game part: language-agnostic gameplay/lookup data consumed by the game worker.
    let game_path = version_dir.join("game.zip");
    {
        let output = std::fs::File::create(&game_path)?;
        let writer = std::io::BufWriter::new(output);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);

        write_entry(&mut archive, "location_lookup.bin", &locations)?;
        write_entry(
            &mut archive,
            "game_data.bin",
            GoodsData {
                goods: raw_game_data.goods,
            },
        )?;
        archive.finish()?
    };

    // English localization part: split out so map workers can ignore it.
    let loc_path = version_dir.join("loc-en.zip");
    {
        let output = std::fs::File::create(&loc_path)?;
        let writer = std::io::BufWriter::new(output);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);
        write_entry(
            &mut archive,
            "localizations.bin",
            LocalizationsData {
                entries: raw_game_data.localizations,
            },
        )?;
        archive.finish()?
    };

    // Map part: hemisphere textures and world metadata consumed by the map worker.
    let map_path = version_dir.join("map.zip");
    {
        let output = std::fs::File::create(&map_path)?;
        let writer = std::io::BufWriter::new(output);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);

        let max_location_index = textures.textures().world().max_location_index().value();
        write_entry(
            &mut archive,
            "world_meta.bin",
            WorldMetadata::new(max_location_index),
        )?;

        for (filename, data) in [
            ("locations-0.r16", textures.textures().west_data()),
            ("locations-1.r16", textures.textures().east_data()),
        ] {
            let (mut entry, config) = archive
                .new_file(filename)
                .compression_method(CompressionMethod::ZSTD)
                .start()?;
            let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
            let mut writer = config.wrap(encoder);
            writer.write_all(bytemuck::cast_slice(data))?;
            let (encoder, out) = writer.finish()?;
            encoder.finish()?;
            entry.finish(out)?;
        }

        archive.finish()?
    };

    tracing::info!(
        name: "eu5.bundle.complete",
        game_path = %game_path.display(),
        map_path = %map_path.display(),
        loc_path = %loc_path.display(),
        "EU5 optimized bundle parts created"
    );

    if !options.minimal {
        let frontend_goods_dir = Path::new(FRONTEND_GOODS_ICONS_DIR);
        std::fs::create_dir_all(frontend_goods_dir)?;

        imaging.montage(MontageRequest {
            images: &goods_images,
            output_path: frontend_goods_dir.join("goods.webp"),
            format: OutputFormat::Webp {
                quality: WebpQuality::Lossless,
            },
            sizing: MontageSizing::Scaled {
                sizes: vec![Geometry::new(32, 32), Geometry::new(128, 128)],
                filter: ScaleFilter::Point,
            },
            background: Some(Color::Transparent),
            additional_args: vec![],
        })?;

        tracing::info!(
            name: "eu5.goods.icons.complete",
            output_dir = %frontend_goods_dir.display(),
            "EU5 goods icon atlas generated"
        );

        translate_flags(imaging, &version_dir, &flag_renderer)?;
    }

    Ok(())
}

/// Render every scoped coat of arms to temporary PNGs and montage consecutive
/// chunks of 128 sorted keys into multi-resolution flag atlases. Sorting makes
/// the split reproducible and usually keeps a country's named variants together.
fn translate_flags<I, P>(
    imaging: &I,
    version_dir: &Path,
    renderer: &crate::eu5::coat_of_arms::Eu5FlagRenderer<P>,
) -> Result<()>
where
    I: ImageProcessor,
    P: FileProvider + ?Sized,
{
    let temp = tempfile::tempdir()?;
    let flag_images = renderer.render_to_pngs(temp.path())?;

    let flags_dir = version_dir.join("common").join("images").join("flags");
    if flags_dir.exists() {
        std::fs::remove_dir_all(&flags_dir)?;
    }
    std::fs::create_dir_all(&flags_dir)?;

    for (atlas_index, atlas_images) in flag_images.chunks(FLAGS_PER_ATLAS).enumerate() {
        imaging.montage(MontageRequest {
            images: atlas_images,
            output_path: flags_dir.join(format!("flags-{atlas_index:02}.webp")),
            format: OutputFormat::Webp {
                quality: WebpQuality::Quality(90),
            },
            sizing: MontageSizing::Scaled {
                sizes: crate::eu5::coat_of_arms::flag_montage_geometries(),
                filter: ScaleFilter::Lanczos,
            },
            background: Some(Color::Transparent),
            additional_args: vec![],
        })?;
    }

    tracing::info!(
        name: "eu5.flags.complete",
        output_dir = %flags_dir.display(),
        flag_count = flag_images.len(),
        atlas_count = flag_images.len().div_ceil(FLAGS_PER_ATLAS),
        "EU5 country flag atlas generated"
    );

    Ok(())
}

fn write_entry<W: Write>(
    archive: &mut rawzip::ZipArchiveWriter<W>,
    filename: &str,
    data: impl Serialize,
) -> Result<()> {
    let (mut entry, config) = archive
        .new_file(filename)
        .compression_method(CompressionMethod::ZSTD)
        .start()?;
    let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
    let mut writer = config.wrap(encoder);
    let bytes = postcard::to_allocvec(&data)?;
    writer.write_all(&bytes)?;

    let (encoder, out) = writer.finish()?;
    encoder.finish()?;
    let uncompressed_size = out.uncompressed_size();
    let compressed_size = entry.finish(out)?.compressed_size();

    tracing::info!(
        name: "eu5.write.complete",
        file_name = filename,
        compression_uncompressed_size = uncompressed_size,
        compression_compressed_size = compressed_size,
        compression_ratio = ?((compressed_size as f64 / uncompressed_size as f64) * 100.0),
        "file written"
    );

    Ok(())
}
