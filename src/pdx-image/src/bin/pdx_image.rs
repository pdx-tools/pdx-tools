use anyhow::Result;
use pdx_image::{ConvertOptions, CropParams, ImageBackend, ImageBackendType, MontageOptions, WebpQuality};
use std::env;
use std::path::Path;

fn print_usage(program: &str) {
    eprintln!("PDX Image - Professional image processing toolkit");
    eprintln!("===============================================");
    eprintln!("");
    eprintln!("Usage: {} [--backend=rust|imagemagick] <command> [args...]", program);
    eprintln!("");
    eprintln!("Options:");
    eprintln!("  --backend=BACKEND    Choose backend: 'rust' (default) or 'imagemagick'");
    eprintln!("");
    eprintln!("Commands:");
    eprintln!("  convert <input> <output> [crop_x,y,w,h]  - Convert image to WebP with optional cropping");
    eprintln!("  montage <output> <input1> [input2...]   - Create sprite sheet from multiple images");
    eprintln!("");
    eprintln!("Examples:");
    eprintln!("  {} convert texture.dds optimized.webp", program);
    eprintln!("  {} --backend=imagemagick convert image.png cropped.webp", program);
    eprintln!("  {} --backend=rust montage atlas.webp icon*.png", program);
    eprintln!("");
    eprintln!("Backends:");
    eprintln!("  rust        - Pure Rust (fast, no dependencies)");
    eprintln!("  imagemagick - ImageMagick wrapper (requires system ImageMagick)");
}

fn convert_image(input: &str, output: &str, crop_str: Option<&str>, backend: &ImageBackendType) -> Result<()> {
    let crop = if let Some(crop_str) = crop_str {
        let parts: Vec<&str> = crop_str.split(',').collect();
        if parts.len() != 4 {
            anyhow::bail!("Crop format should be x,y,width,height");
        }
        
        let x: u32 = parts[0].parse()?;
        let y: u32 = parts[1].parse()?;
        let width: u32 = parts[2].parse()?;
        let height: u32 = parts[3].parse()?;
        
        Some(CropParams { x, y, width, height })
    } else {
        None
    };
    
    println!("Converting {} -> {}", input, output);
    if let Some(crop_params) = &crop {
        println!("Cropping: {}x{} at ({}, {})", 
                 crop_params.width, crop_params.height, 
                 crop_params.x, crop_params.y);
    }

    let options = ConvertOptions {
        webp_quality: WebpQuality::Lossless,
        crop,
        auto_orient: true,
        strip_profiles: true,
        ..Default::default()
    };

    backend.convert_image(input, output, &options)?;
    println!("✓ Conversion completed!");
    
    Ok(())
}

fn create_montage(output: &str, inputs: &[&str], backend: &ImageBackendType) -> Result<()> {
    if inputs.is_empty() {
        anyhow::bail!("At least one input file is required");
    }

    // Verify input files exist
    for file in inputs {
        if !Path::new(file).exists() {
            anyhow::bail!("File does not exist: {}", file);
        }
    }
    
    let image_data: Vec<(String, &str)> = inputs
        .iter()
        .enumerate()
        .map(|(i, path)| {
            let name = Path::new(path)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("image_{}", i));
            (name, *path)
        })
        .collect();

    let options = MontageOptions {
        grid_cols: 0,
        tile_geometry: None,
        webp_quality: WebpQuality::Quality(90),
        background_color: Some((255, 255, 255)),
        background_transparent: false,
        auto_orient: true,
        alpha_off: false,
    };

    println!("Creating montage from {} images -> {}", inputs.len(), output);
    backend.create_montage(&image_data, output, &options)?;
    println!("✓ Montage created!");
    
    Ok(())
}




fn main() -> Result<()> {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        print_usage(&args[0]);
        std::process::exit(1);
    }

    // Parse backend flag from anywhere in arguments
    let mut backend_type = ImageBackendType::new_rust(); // Default
    let mut filtered_args = Vec::new();
    
    for arg in &args[1..] {
        if arg.starts_with("--backend=") {
            let backend_str = &arg[10..]; // Skip "--backend="
            backend_type = match backend_str {
                "rust" => ImageBackendType::new_rust(),
                "imagemagick" => ImageBackendType::new_imagemagick(),
                _ => {
                    eprintln!("Error: Unknown backend '{}'. Use 'rust' or 'imagemagick'", backend_str);
                    std::process::exit(1);
                }
            };
        } else {
            filtered_args.push(arg.as_str());
        }
    }

    if filtered_args.is_empty() {
        print_usage(&args[0]);
        std::process::exit(1);
    }

    match filtered_args[0] {
        "convert" => {
            if filtered_args.len() < 3 {
                eprintln!("Error: convert requires <input> <output> [crop]");
                std::process::exit(1);
            }
            convert_image(filtered_args[1], filtered_args[2], filtered_args.get(3).copied(), &backend_type)?;
        }
        "montage" => {
            if filtered_args.len() < 3 {
                eprintln!("Error: montage requires <output> <input1> [input2...]");
                std::process::exit(1);
            }
            let inputs: Vec<&str> = filtered_args[2..].to_vec();
            create_montage(filtered_args[1], &inputs, &backend_type)?;
        }
        _ => {
            eprintln!("Error: Unknown command '{}'", filtered_args[0]);
            print_usage(&args[0]);
            std::process::exit(1);
        }
    }

    Ok(())
}