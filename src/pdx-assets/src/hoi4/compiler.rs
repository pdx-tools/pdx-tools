use crate::FileProvider;
use crate::asset_compilers::PackageOptions;
use anyhow::Result;
use hoi4app::{
    entries,
    game_install::{GameFiles, GameInstallError},
};
use rawzip::CompressionMethod;
use serde::Serialize;
use std::io::Write;
use std::path::Path;

struct FileProviderAdapter<'a, P: ?Sized>(&'a P);

impl<P> GameFiles for FileProviderAdapter<'_, P>
where
    P: FileProvider + ?Sized,
{
    fn file_exists(&self, path: &str) -> bool {
        self.0.file_exists(path)
    }

    fn read_file(&self, path: &str) -> Result<Vec<u8>, GameInstallError> {
        self.0
            .read_file(path)
            .map_err(|e| GameInstallError::io(path, e))
    }

    fn list_files(&self, dir: &str, ends_with: &str) -> Result<Vec<String>, GameInstallError> {
        let mut files = self
            .0
            .walk_directory(dir, &[ends_with])
            .map_err(|e| GameInstallError::io(dir, e))?;
        files.sort();
        Ok(files)
    }
}

/// Compile the map of an HOI4 installation into `{out_dir}/hoi4/{version}/`:
///
/// - `game.zip`: the provinces, states, colors, and names that the save
///   worker needs to color the map.
/// - `map.zip`: the location textures that the map worker renders.
pub fn compile_game_bundle<P>(
    fs: &P,
    out_dir: &Path,
    game_version: &str,
    options: &PackageOptions,
) -> Result<()>
where
    P: FileProvider + ?Sized,
{
    let compiled = hoi4app::game_install::compile(&FileProviderAdapter(fs))?;

    // Bundle tracing only needs the file accesses of the compilation above.
    if options.dry_run {
        return Ok(());
    }

    let version_dir = out_dir.join("hoi4").join(game_version);
    std::fs::create_dir_all(&version_dir)?;

    let game_path = version_dir.join("game.zip");
    {
        let writer = std::io::BufWriter::new(std::fs::File::create(&game_path)?);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);
        write_entry(&mut archive, entries::GAME_DATA, &compiled.game_data)?;
        archive.finish()?
    };

    let map_path = version_dir.join("map.zip");
    {
        let writer = std::io::BufWriter::new(std::fs::File::create(&map_path)?);
        let mut archive = rawzip::ZipArchiveWriter::new(writer);
        write_entry(&mut archive, entries::WORLD_META, compiled.world_meta)?;
        for (filename, data) in [
            (entries::WEST_TEXTURE, compiled.world.west().as_slice()),
            (entries::EAST_TEXTURE, compiled.world.east().as_slice()),
        ] {
            write_bytes(&mut archive, filename, bytemuck::cast_slice(data))?;
        }
        archive.finish()?
    };

    tracing::info!(
        name: "hoi4.bundle.complete",
        game_path = %game_path.display(),
        map_path = %map_path.display(),
        provinces = compiled.game_data.provinces().len(),
        states = compiled.game_data.states().len(),
        colors = compiled.game_data.colors().len(),
        "HOI4 bundle parts created"
    );

    Ok(())
}

fn write_entry<W: Write>(
    archive: &mut rawzip::ZipArchiveWriter<W>,
    filename: &str,
    data: impl Serialize,
) -> Result<()> {
    write_bytes(archive, filename, &postcard::to_allocvec(&data)?)
}

fn write_bytes<W: Write>(
    archive: &mut rawzip::ZipArchiveWriter<W>,
    filename: &str,
    bytes: &[u8],
) -> Result<()> {
    let (mut entry, config) = archive
        .new_file(filename)
        .compression_method(CompressionMethod::ZSTD)
        .start()?;
    let encoder = pdx_zstd::Encoder::new(&mut entry, 7)?;
    let mut writer = config.wrap(encoder);
    writer.write_all(bytes)?;
    let (encoder, out) = writer.finish()?;
    encoder.finish()?;
    let uncompressed_size = out.uncompressed_size();
    let compressed_size = entry.finish(out)?.compressed_size();

    tracing::info!(
        name: "hoi4.write.complete",
        file_name = filename,
        compression_uncompressed_size = uncompressed_size,
        compression_compressed_size = compressed_size,
        "file written"
    );

    Ok(())
}
