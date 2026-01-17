use anyhow::Context;
use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::post,
    Router,
};
use std::{net::SocketAddr, sync::Arc};
use tokio::{net::TcpListener, signal};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

mod assets;
mod colors;
mod date_layer;
mod parser;
mod renderer;
mod viewport;

use assets::Eu4Assets;

// Avoid musl's default allocator due to lackluster performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Application state shared across requests
struct AppState {
    assets: Eu4Assets,
    gpu: pdx_map::GpuContext,
}

/// Error type for screenshot generation
#[derive(Debug, thiserror::Error)]
enum ScreenshotError {
    #[error("Failed to parse save file: {0}")]
    ParseError(#[from] anyhow::Error),

    #[error("Internal server error: {0}")]
    InternalError(String),
}

impl IntoResponse for ScreenshotError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ScreenshotError::ParseError(e) => {
                tracing::error!("Parse error: {}", e);
                (StatusCode::BAD_REQUEST, format!("Invalid save file: {}", e))
            }
            ScreenshotError::InternalError(e) => {
                tracing::error!("Internal error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Internal server error: {}", e),
                )
            }
        };

        (status, message).into_response()
    }
}

/// Main screenshot endpoint
async fn screenshot_endpoint(
    State(state): State<Arc<AppState>>,
    body: Bytes,
) -> Result<impl IntoResponse, ScreenshotError> {
    tracing::info!("Received screenshot request (bytes: {})", body.len());

    // Parse save file (in blocking task due to CPU-intensive work)
    let (parsed, metadata) = tokio::task::block_in_place(|| {
        let resolver = state.assets.resolver();

        // Fast metadata parsing
        tracing::debug!("Parsing save metadata");
        let metadata = parser::parse_metadata(&body, resolver)?;

        tracing::info!(
            "Save metadata - version: 1.{}, multiplayer: {}, player: {:?}",
            metadata.minor_version,
            metadata.is_multiplayer,
            metadata.player_tag
        );

        // Full save parsing
        tracing::debug!("Parsing full save");
        let parsed = parser::parse_full_save(&body, resolver)?;

        Ok::<_, anyhow::Error>((parsed, metadata))
    })
    .map_err(|e: anyhow::Error| ScreenshotError::ParseError(e))?;

    // Load assets for this version
    let minor_version = metadata.minor_version;
    tracing::info!("Loading assets for version 1.{}", minor_version);

    let game_data = state
        .assets
        .load_game_data(minor_version)
        .await
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let color_index = state
        .assets
        .load_color_index(minor_version)
        .await
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let color_order = state
        .assets
        .load_color_order(minor_version)
        .await
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let color_lut = assets::build_color_lut(&color_order)
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let (west_texture, west_width, west_height) = state
        .assets
        .load_west_texture(minor_version, &color_lut)
        .await
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let (east_texture, east_width, east_height) = state
        .assets
        .load_east_texture(minor_version, &color_lut)
        .await
        .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    let color_count = color_order.len() / 3;

    // Render screenshot
    tracing::info!("Rendering screenshot");
    let image_buffer = renderer::render_screenshot(
        parsed,
        &state.gpu,
        west_texture,
        west_width,
        west_height,
        east_texture,
        east_width,
        east_height,
        (*game_data).clone(),
        color_index,
        color_count,
        metadata.is_multiplayer,
    )
    .await
    .map_err(|e| ScreenshotError::InternalError(e.to_string()))?;

    // Encode as PNG
    tracing::info!("Encoding as PNG");
    let (width, height) = viewport::output_dimensions();
    let png_data = tokio::task::block_in_place(|| {
        let img = image::RgbaImage::from_raw(width, height, image_buffer)
            .context("Failed to create image from buffer")?;

        let dynamic_img = image::DynamicImage::ImageRgba8(img);
        let mut png_bytes = Vec::new();
        dynamic_img
            .write_to(
                &mut std::io::Cursor::new(&mut png_bytes),
                image::ImageFormat::Png,
            )
            .context("Failed to encode PNG")?;

        Ok::<_, anyhow::Error>(Bytes::from(png_bytes))
    })
    .map_err(|e: anyhow::Error| ScreenshotError::InternalError(e.to_string()))?;

    tracing::info!("Screenshot complete (PNG size: {} bytes)", png_data.len());

    // Return response with PNG content type
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));

    Ok((headers, png_data))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    tracing::info!("Starting API Screenshot Service");

    // Load assets
    let assets_path = std::env::var("ASSETS_PATH").unwrap_or_else(|_| "assets".to_string());
    tracing::info!("Loading assets from: {}", assets_path);

    let assets = Eu4Assets::new(assets_path).context("Failed to initialize assets")?;

    // Initialize GPU context
    tracing::info!("Initializing GPU context");
    let gpu = pdx_map::GpuContext::new()
        .await
        .context("Failed to initialize GPU")?;

    tracing::info!("GPU initialized successfully");

    // Create app state
    let state = Arc::new(AppState { assets, gpu });

    // Build router
    let app = Router::new()
        .route("/", post(screenshot_endpoint))
        .with_state(state)
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024)) // 50MB limit for save files
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        );

    // Bind to port
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr)
        .await
        .context("Failed to bind to port")?;

    tracing::info!("Listening on {}", addr);

    // Start server with graceful shutdown
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Server error")?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C signal");
        },
        _ = terminate => {
            tracing::info!("Received terminate signal");
        },
    }

    tracing::info!("Starting graceful shutdown");
}
