use pdx_map::PhysicalSize;

#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("invalid RGBA image buffer")]
    InvalidImageBuffer,
    #[error("failed to create WebP encoder: {0}")]
    Webp(String),
}

/// Encode an RGBA image of the given size as a lossless WebP image.
#[tracing::instrument(
    level = "info",
    name = "screenshot.encode_webp",
    skip(rgba),
    fields(
        input_bytes = rgba.len(),
        output_bytes = tracing::field::Empty,
    )
)]
pub(crate) fn encode_webp(rgba: Vec<u8>, size: PhysicalSize<u32>) -> Result<Vec<u8>, EncodeError> {
    let image = image::RgbaImage::from_raw(size.width, size.height, rgba)
        .ok_or(EncodeError::InvalidImageBuffer)?;
    let image = image::DynamicImage::from(image);
    let encoder =
        webp::Encoder::from_image(&image).map_err(|error| EncodeError::Webp(error.to_string()))?;
    let webp = encoder.encode_lossless().to_vec();
    tracing::Span::current().record("output_bytes", webp.len());
    Ok(webp)
}
