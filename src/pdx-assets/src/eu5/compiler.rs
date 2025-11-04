use crate::asset_compilers::PackageOptions;
use crate::{FileProvider, ImageProcessor};
use anyhow::{Context, Result};
use eu5app::parsing::{parse_default_map, parse_locations_data, parse_named_locations};
use eu5save::hash::FnvHashMap;
use rawzip::CompressionMethod;
use std::io::Read;
use std::path::Path;

pub fn compile_game_bundle<P, I>(
    fs: &P,
    imaging: &I,
    out_dir: &Path,
    game_version: &str,
    options: &PackageOptions,
) -> Result<()>
where
    P: FileProvider + ?Sized,
    I: ImageProcessor,
{
    // Parse game data files using eu5app parsing
    let named_locations_data =
        fs.read_file("game/in_game/map_data/named_locations/00_default.txt")?;
    let named_locations = parse_named_locations(&named_locations_data[..])?;

    let default_map_data = fs.read_file("game/in_game/map_data/default.map")?;
    let default_map = parse_default_map(&default_map_data[..])?;

    let mut location_lookup = parse_locations_data(named_locations, &default_map);

    // Split location texture into two tiles
    let locations_file = fs.fs_file("game/in_game/map_data/locations.png")?;

    // If we are bundle tracing no need callout to imagemagick or create bundle
    if options.dry_run {
        return Ok(());
    }

    let temp_dir = tempfile::tempdir().context("Failed to create temporary directory")?;

    // Split the texture using ImageMagick
    let west_rgba_path = temp_dir.path().join("locations-1.rgba");
    let east_rgba_path = temp_dir.path().join("locations-2.rgba");

    let convert_request = crate::images::ConvertRequest {
        input_path: locations_file.path,
        output_path: temp_dir.path().join("locations-%d.rgba"),
        format: crate::images::OutputFormat::Raw,
        operation: Some(crate::images::ImageOperation::Tile(
            crate::images::TileGeometry::new(2, 1),
        )),
    };

    imaging.convert(convert_request)?;

    // Build location coordinate mapping
    let mut location_coordinates = FnvHashMap::default();
    let (height, width) = eu5app::tile_dimensions();
    let mut buffer = vec![0u8; (height * width * 4) as usize];

    for (idx, rgba_path) in [&west_rgba_path, &east_rgba_path].iter().enumerate() {
        let offset_x = width * (idx as u32);
        let mut file = std::fs::File::open(rgba_path)
            .with_context(|| format!("Failed to open: {}", rgba_path.display()))?;
        file.read_exact(&mut buffer)
            .with_context(|| format!("Failed to read: {}", rgba_path.display()))?;

        let chunks = buffer.chunks_exact(4);
        for (idx, chunk) in chunks.enumerate() {
            let rgba = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            location_coordinates.entry(rgba).or_insert_with(|| {
                (
                    (offset_x as u16) + ((idx as u32) % width) as u16,
                    ((idx as u32) / width) as u16,
                )
            });
        }
    }

    // Fill in coordinates
    for location in location_lookup.iter_mut() {
        let color_id = u32::from_le_bytes([
            location.color_id[0],
            location.color_id[1],
            location.color_id[2],
            255,
        ]);
        if let Some(&(x, y)) = location_coordinates.get(&color_id) {
            location.coordinates = (x, y);
        }
    }

    location_lookup.sort_by(|a, b| a.name.cmp(&b.name));

    // Create output directory
    let eu5_out_dir = out_dir.join("eu5");
    std::fs::create_dir_all(&eu5_out_dir)?;

    // Create the bundle zip file
    let bundle_path = eu5_out_dir.join(format!("eu5-{game_version}.zip"));
    let output = std::fs::File::create(&bundle_path)?;
    let writer = std::io::BufWriter::new(output);
    let mut archive = rawzip::ZipArchiveWriter::new(writer);

    // Write location_lookup.bin
    let (mut entry, config) = archive
        .new_file("location_lookup.bin")
        .compression_method(CompressionMethod::Zstd)
        .start()?;
    let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
    let mut writer = config.wrap(encoder);
    postcard::to_io(&location_lookup, &mut writer)?;
    let (encoder, out) = writer.finish()?;
    let uncompressed_size = out.uncompressed_size();
    encoder.finish()?;
    let compressed_size = entry.finish(out)?;

    log::info!(
        "location_lookup.bin: uncompressed={}, compressed={}",
        uncompressed_size,
        compressed_size
    );

    // Write texture files
    for (filename, rgba_path) in [
        ("locations-0.rgba", &west_rgba_path),
        ("locations-1.rgba", &east_rgba_path),
    ] {
        let (mut entry, config) = archive
            .new_file(filename)
            .compression_method(CompressionMethod::Zstd)
            .start()?;
        let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
        let mut writer = config.wrap(encoder);
        let mut file = std::fs::File::open(rgba_path)?;
        std::io::copy(&mut file, &mut writer)?;
        let (encoder, out) = writer.finish()?;
        encoder.finish()?;
        entry.finish(out)?;
    }

    archive.finish()?;

    log::info!("Created EU5 game bundle at: {}", bundle_path.display());
    Ok(())
}
