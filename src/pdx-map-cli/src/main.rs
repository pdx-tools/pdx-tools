use anyhow::{Context, Result, anyhow, bail};
use clap::Parser;
use pdx_map::{GpuColor, StitchedImage, ViewportBounds};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::time::Instant;

/// CLI tool for rendering Paradox map data with location information
#[derive(Parser, Debug)]
#[command(name = "pdx-map-cli")]
#[command(about = "Renders Paradox map data with location information to PNG", long_about = None)]
struct Args {
    /// Path to the color-coded Paradox map image (will be split into west/east textures)
    #[arg(short, long, value_name = "FILE")]
    map: PathBuf,

    /// Path to location data CSV file, or use '-' for stdin.
    ///
    /// CSV format (no header):
    ///   rgb_key,primary_color,secondary_color,owner_color,flags
    ///
    /// Columns:
    ///   rgb_key          - Hex color key from the map (e.g., FF0000 for red)
    ///   primary_color    - Primary hex color to fill in the location
    ///   secondary_color  - Secondary hex color to stripe the location (optional, blank defaults to primary)
    ///   owner_color      - Hex color for location owner (optional, blank defaults to primary)
    ///   flags            - Bitflags as integer (0=none, 1=NO_LOCATION_BORDERS, 2=HIGHLIGHTED)
    ///
    /// Example input for Denmark controlling Stockholm from Sweden in EU4:
    ///
    /// 802240,0852A5,BE4646,0852A5,0
    /// 0028FF,0852A5,0852A5,0852A5,0
    #[arg(short, long, value_name = "FILE", verbatim_doc_comment)]
    input: String,

    /// Output PNG file path
    #[arg(short, long, value_name = "FILE")]
    output: PathBuf,

    /// Disable location borders
    #[arg(long)]
    no_location_borders: bool,

    /// Disable owner borders
    #[arg(long)]
    no_owner_borders: bool,
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
struct LocationRecord {
    rgb_key: pdx_map::Rgb,
    primary_color: pdx_map::Rgb,
    secondary_color: pdx_map::Rgb,
    owner_color: pdx_map::Rgb,
    flags: u32,
}

struct SplitImageData {
    west_data: Vec<u8>,
    east_data: Vec<u8>,
    tile_width: u32,
    tile_height: u32,
    palette: pdx_map::R16Palette,
}

impl SplitImageData {
    fn full_width(&self) -> u32 {
        self.tile_width * 2
    }

    fn full_height(&self) -> u32 {
        self.tile_height
    }
}

/// Parse a hex color string (e.g., "FF0000") to GpuColor
fn parse_hex_color(hex: &str) -> Result<pdx_map::Rgb> {
    let hex = hex.trim();
    if hex.is_empty() {
        return Ok(pdx_map::Rgb::default());
    }

    if hex.len() != 6 {
        bail!("Hex color must be 6 characters (RRGGBB), got: {}", hex);
    }

    let r = u8::from_str_radix(&hex[0..2], 16)
        .with_context(|| format!("Invalid hex color red component: {}", hex))?;
    let g = u8::from_str_radix(&hex[2..4], 16)
        .with_context(|| format!("Invalid hex color green component: {}", hex))?;
    let b = u8::from_str_radix(&hex[4..6], 16)
        .with_context(|| format!("Invalid hex color blue component: {}", hex))?;

    Ok(pdx_map::Rgb::new(r, g, b))
}

/// Parse a CSV line into a LocationRecord
fn parse_csv_line(line: &str, line_num: usize) -> Result<LocationRecord> {
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() < 5 {
        bail!(
            "Line {}: Expected at least 5 columns, got {}",
            line_num,
            parts.len()
        );
    }

    let rgb_key =
        parse_hex_color(parts[0]).with_context(|| format!("Line {}: Invalid rgb_key", line_num))?;

    let primary_color = parse_hex_color(parts[1])
        .with_context(|| format!("Line {}: Invalid primary_color", line_num))?;

    // Secondary color defaults to primary if empty
    let secondary_color = if parts[2].trim().is_empty() {
        primary_color
    } else {
        parse_hex_color(parts[2])
            .with_context(|| format!("Line {}: Invalid secondary_color", line_num))?
    };

    // Owner color defaults to primary if empty
    let owner_color = if parts[3].trim().is_empty() {
        primary_color
    } else {
        parse_hex_color(parts[3])
            .with_context(|| format!("Line {}: Invalid owner_color", line_num))?
    };

    let flags = parts[4]
        .trim()
        .parse::<u32>()
        .with_context(|| format!("Line {}: Invalid flags", line_num))?;

    Ok(LocationRecord {
        rgb_key,
        primary_color,
        secondary_color,
        owner_color,
        flags,
    })
}

/// Parse location data from a reader
fn parse_location_data(reader: impl Read) -> Result<Vec<LocationRecord>> {
    let reader = BufReader::new(reader);
    let mut records = Vec::new();

    for (line_num, line) in reader.lines().enumerate() {
        let line = line.with_context(|| format!("Failed to read line {}", line_num + 1))?;
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let record = parse_csv_line(line, line_num + 1)?;
        records.push(record);
    }

    Ok(records)
}

/// Build LocationArrays from parsed records using color indexing
fn build_location_arrays(
    records: Vec<LocationRecord>,
    palette: &pdx_map::R16Palette,
) -> Result<pdx_map::LocationArrays> {
    let record_colors = records
        .iter()
        .map(|r| (r.rgb_key, r))
        .collect::<HashMap<_, _>>();

    let record_palette = palette.map(|rgb, _| record_colors.get(rgb));
    let primary_colors = record_palette
        .map(|x, r16| GpuColor::from(x.map(|r| r.primary_color).unwrap_or_else(|| r16.as_rgb())));
    let secondary_colors = record_palette
        .map(|x, r16| GpuColor::from(x.map(|r| r.secondary_color).unwrap_or_else(|| r16.as_rgb())));
    let owner_colors = record_palette
        .map(|x, r16| GpuColor::from(x.map(|r| r.owner_color).unwrap_or_else(|| r16.as_rgb())));
    let flags = record_palette.map(|x, _| {
        x.map(|r| pdx_map::LocationFlags::from_bits(r.flags))
            .unwrap_or_default()
    });

    let mut location = pdx_map::LocationArrays::allocate(palette.len());
    location.set_primary_colors(primary_colors.as_slice());
    location.set_secondary_colors(secondary_colors.as_slice());
    location.set_owner_colors(owner_colors.as_slice());
    location.set_flags(flags.as_slice());

    Ok(location)
}

/// Load an image and convert to R16 format with color indexing
fn load_and_split_image(path: &PathBuf) -> Result<SplitImageData> {
    let img = image::open(path).with_context(|| format!("Failed to open map image: {:?}", path))?;
    let img = img.as_rgb8().context("image not in rgb8 format")?;
    let (west, east, palette) = pdx_map::split_rgb8_to_indexed_r16(img.as_raw(), img.width());

    let tile_width = img.width() / 2;
    let tile_height = img.height();

    Ok(SplitImageData {
        west_data: west,
        east_data: east,
        tile_width,
        tile_height,
        palette,
    })
}

fn main() -> Result<()> {
    let args = Args::parse();

    let rt = tokio::runtime::Builder::new_current_thread()
        .build()
        .context("Failed to build single-threaded Tokio runtime")?;

    rt.block_on(async { main_async(args).await })
}

async fn main_async(args: Args) -> anyhow::Result<()> {
    let start = Instant::now();
    let records = if args.input == "-" {
        println!("Reading location data from stdin...");
        parse_location_data(std::io::stdin())?
    } else {
        let input_path = PathBuf::from(&args.input);
        println!("Reading location data from: {:?}", input_path);
        let file = std::fs::File::open(&input_path)
            .with_context(|| format!("Failed to open input file: {:?}", input_path))?;
        parse_location_data(file)?
    };
    println!(
        "Parsed {} location records ({:.2}s)",
        records.len(),
        start.elapsed().as_secs_f64()
    );
    let image_data = load_and_split_image(&args.map)?;
    let start = Instant::now();
    let location_arrays = build_location_arrays(records, &image_data.palette)?;
    println!(
        "Built location arrays with {} slots ({:.2}s)",
        location_arrays.len(),
        start.elapsed().as_secs_f64()
    );

    let start = Instant::now();
    let gpu = pdx_map::GpuContext::new()
        .await
        .context("Failed to initialize GPU context")?;
    println!(
        "Initialized GPU context ({:.2}s)",
        start.elapsed().as_secs_f64()
    );
    let start = Instant::now();
    let west_view = gpu.create_texture(
        &image_data.west_data,
        image_data.tile_width,
        image_data.tile_height,
        "West Texture",
    );
    let east_view = gpu.create_texture(
        &image_data.east_data,
        image_data.tile_width,
        image_data.tile_height,
        "East Texture",
    );
    println!(
        "Created GPU textures ({:.2}s)",
        start.elapsed().as_secs_f64()
    );
    let start = Instant::now();
    let mut renderer = pdx_map::HeadlessMapRenderer::new(
        gpu,
        west_view,
        east_view,
        image_data.tile_width,
        image_data.tile_height,
    )?;
    renderer.update_locations(&location_arrays);
    renderer.set_location_borders(!args.no_location_borders);
    renderer.set_owner_borders(!args.no_owner_borders);
    println!("Created renderer ({:.2}s)", start.elapsed().as_secs_f64());
    let mut dst_image = StitchedImage::new(image_data.full_width(), image_data.full_height());
    let start = Instant::now();
    let bounds = ViewportBounds::new(pdx_map::WorldSize::new(
        image_data.tile_width,
        image_data.tile_height,
    ));
    {
        let west_buffer = renderer.capture_viewport(bounds).await?;
        dst_image.write_west(west_buffer.rows());
        west_buffer.finish();
    };
    println!(
        "Rendered and read back west half ({:.2}s)",
        start.elapsed().as_secs_f64()
    );

    let start = Instant::now();
    {
        let east_buffer = renderer.capture_viewport(bounds).await?;
        dst_image.write_east(east_buffer.rows());
        east_buffer.finish();
    };

    println!(
        "Rendered and read back east half ({:.2}s)",
        start.elapsed().as_secs_f64()
    );
    let start = Instant::now();
    let output_img = image::RgbaImage::from_raw(
        image_data.full_width(),
        image_data.full_height(),
        dst_image.into_inner(),
    )
    .ok_or_else(|| anyhow!("Failed to create image from buffer"))?;
    output_img
        .save(&args.output)
        .with_context(|| format!("Failed to save output image: {:?}", args.output))?;
    println!(
        "Saved output to: {:?} ({:.2}s)",
        args.output,
        start.elapsed().as_secs_f64()
    );
    println!("\nRendering complete!");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rstest::rstest;

    // Tests for parse_hex_color - valid cases
    #[rstest]
    #[case("FF0000", 255, 0, 0)]
    #[case("00FF00", 0, 255, 0)]
    #[case("0000FF", 0, 0, 255)]
    #[case("ff00ff", 255, 0, 255)]
    #[case("FfAa00", 255, 170, 0)]
    #[case("  FF0000  ", 255, 0, 0)]
    fn test_parse_hex_color_valid(
        #[case] input: &str,
        #[case] r: u8,
        #[case] g: u8,
        #[case] b: u8,
    ) {
        let color = parse_hex_color(input).unwrap();
        assert_eq!(color, pdx_map::Rgb::new(r, g, b));
    }

    #[test]
    fn test_parse_hex_color_empty() {
        let color = parse_hex_color("").unwrap();
        assert_eq!(color, pdx_map::Rgb::new(0, 0, 0));
    }

    // Tests for parse_hex_color - invalid cases
    #[rstest]
    #[case("FF00")] // too short
    #[case("FF000000")] // too long
    #[case("GGGGGG")] // invalid chars
    #[case("GG0000")] // invalid red
    #[case("00GG00")] // invalid green
    #[case("0000GG")] // invalid blue
    fn test_parse_hex_color_invalid(#[case] input: &str) {
        parse_hex_color(input).unwrap_err();
    }

    // Tests for parse_csv_line - valid cases
    #[rstest]
    #[case(
        "FF0000,00FF00,0000FF,FFFF00,0",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 0, 255),
            owner_color: pdx_map::Rgb::new(255, 255, 0),
            flags: 0,
        }
    )]
    #[case(
        "FF0000,00FF00,,FFFF00,0",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 255, 0),
            owner_color: pdx_map::Rgb::new(255, 255, 0),
            flags: 0,
        }
    )]
    #[case(
        "FF0000,00FF00,0000FF,,0",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 0, 255),
            owner_color: pdx_map::Rgb::new(0, 255, 0),
            flags: 0,
        }
    )]
    #[case(
        "FF0000,00FF00,,,0",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 255, 0),
            owner_color: pdx_map::Rgb::new(0, 255, 0),
            flags: 0,
        }
    )]
    #[case(
        "FF0000,00FF00,0000FF,FFFF00,3",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 0, 255),
            owner_color: pdx_map::Rgb::new(255, 255, 0),
            flags: 3,
        }
    )]
    #[case(
        "FF0000, 00FF00 , 0000FF , FFFF00 , 1 ",
        LocationRecord {
            rgb_key: pdx_map::Rgb::new(255, 0, 0),
            primary_color: pdx_map::Rgb::new(0, 255, 0),
            secondary_color: pdx_map::Rgb::new(0, 0, 255),
            owner_color: pdx_map::Rgb::new(255, 255, 0),
            flags: 1,
        }
    )]
    fn test_parse_csv_line_valid(#[case] input: &str, #[case] expected: LocationRecord) {
        let record = parse_csv_line(input, 1).unwrap();
        assert_eq!(record, expected);
    }

    // Tests for parse_csv_line - invalid cases
    #[rstest]
    #[case("FF0000,00FF00,0000FF")]
    #[case("INVALID,00FF00,0000FF,FFFF00,0")]
    #[case("FF0000,INVALID,0000FF,FFFF00,0")]
    #[case("FF0000,00FF00,INVALID,FFFF00,0")]
    #[case("FF0000,00FF00,0000FF,INVALID,0")]
    #[case("FF0000,00FF00,0000FF,FFFF00,not_a_number")]
    fn test_parse_csv_line_invalid(#[case] input: &str) {
        parse_csv_line(input, 1).unwrap_err();
    }

    // Tests for parse_location_data
    #[test]
    fn test_parse_location_data_empty_input() {
        let input = b"";
        let records = parse_location_data(&input[..]).unwrap();
        assert_eq!(records.len(), 0);
    }

    #[test]
    fn test_parse_location_data_records() {
        let input = b"FF0000,00FF00,0000FF,FFFF00,0\n0000FF,FF0000,00FF00,FFFFFF,1";
        let records = parse_location_data(&input[..]).unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].rgb_key, pdx_map::Rgb::new(255, 0, 0));
        assert_eq!(records[1].rgb_key, pdx_map::Rgb::new(0, 0, 255));
    }

    #[rstest]
    #[case(
        b"FF0000,00FF00,0000FF,FFFF00,0\n\n0000FF,FF0000,00FF00,FFFFFF,1\n\n",
        2
    )]
    #[case(b"# This is a comment\nFF0000,00FF00,0000FF,FFFF00,0\n# Another comment\n0000FF,FF0000,00FF00,FFFFFF,1", 2)]
    #[case(b"# Header comment\n\nFF0000,00FF00,0000FF,FFFF00,0\n\n# Middle comment\n\n0000FF,FF0000,00FF00,FFFFFF,1\n\n# End comment", 2)]
    #[case(
        b"FF0000,00FF00,0000FF,FFFF00,0\n   \n\t\n0000FF,FF0000,00FF00,FFFFFF,1",
        2
    )]
    #[case(b"# Comment 1\n\n# Comment 2\n   \n# Comment 3", 0)]
    fn test_parse_location_data_skip_empty_and_comments(
        #[case] input: &[u8],
        #[case] expected_count: usize,
    ) {
        let records = parse_location_data(input).unwrap();
        assert_eq!(records.len(), expected_count);
    }

    #[test]
    fn test_parse_location_data_invalid_record() {
        let input = b"FF0000,00FF00,0000FF,FFFF00,0\nINVALID_LINE\n0000FF,FF0000,00FF00,FFFFFF,1";
        parse_location_data(&input[..]).unwrap_err();
    }
}
