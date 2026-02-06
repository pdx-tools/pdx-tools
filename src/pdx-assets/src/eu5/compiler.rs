use crate::asset_compilers::PackageOptions;
use crate::{FileProvider, ImageProcessor};
use anyhow::Result;
use eu5app::game_data::game_install::{GameFileSource, RawGameData};
use rawzip::CompressionMethod;
use serde::Serialize;
use std::io::Write;
use std::path::Path;

struct FileProviderAdapter<P>(P);

impl<P> GameFileSource for FileProviderAdapter<P>
where
    P: FileProvider,
{
    fn open_file<'a>(
        &'a self,
        path: &str,
    ) -> std::result::Result<Box<dyn std::io::Read + 'a>, eu5app::game_data::GameDataError> {
        self.0.open_file(path).map_err(|e| {
            eu5app::game_data::GameDataError::Io(std::io::Error::other(e), String::from(path))
        })
    }
}

pub fn compile_game_bundle<P, I>(
    fs: &P,
    _imaging: &I,
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

    // If we are bundle tracing no need to do expensive image processing or create bundle
    if options.dry_run {
        return Ok(());
    }

    let textures = texture_builder.build()?;

    // Create location data with color awareness
    let locations = textures.location_aware(raw_game_data.locations);

    // Create output directory
    let eu5_out_dir = out_dir.join("eu5");
    std::fs::create_dir_all(&eu5_out_dir)?;

    // Create the bundle zip file
    let bundle_path = eu5_out_dir.join(format!("eu5-{game_version}.zip"));
    let output = std::fs::File::create(&bundle_path)?;
    let writer = std::io::BufWriter::new(output);
    let mut archive = rawzip::ZipArchiveWriter::new(writer);

    write_entry(&mut archive, "location_lookup.bin", &locations)?;
    write_entry(
        &mut archive,
        "country_localization.bin",
        raw_game_data.country_localizations,
    )?;

    // Write R16 texture files
    for (filename, data) in [
        ("locations-0.r16", textures.west_data()),
        ("locations-1.r16", textures.east_data()),
    ] {
        let (mut entry, config) = archive
            .new_file(filename)
            .compression_method(CompressionMethod::Zstd)
            .start()?;
        let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
        let mut writer = config.wrap(encoder);
        writer.write_all(bytemuck::cast_slice(data))?;
        let (encoder, out) = writer.finish()?;
        encoder.finish()?;
        entry.finish(out)?;
    }

    archive.finish()?;

    tracing::info!(
        name: "eu5.bundle.complete",
        bundle_path = %bundle_path.display(),
        "EU5 game bundle created"
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
        .compression_method(CompressionMethod::Zstd)
        .start()?;
    let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
    let mut writer = config.wrap(encoder);
    let bytes = postcard::to_allocvec(&data)?;
    writer.write_all(&bytes)?;

    let (encoder, out) = writer.finish()?;
    encoder.finish()?;
    let uncompressed_size = out.uncompressed_size();
    let compressed_size = entry.finish(out)?;

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
