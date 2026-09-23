use axum::{
    body::Bytes,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use pdx_screenshot::eu4::{GpuContext, ScreenshotError};
use tokio::sync::OnceCell;

static GPU: OnceCell<GpuContext> = OnceCell::const_new();

fn error_response(err: ScreenshotError) -> (StatusCode, String) {
    match err {
        ScreenshotError::Parse(e) => {
            tracing::warn!(error = %e, "screenshot parse error");
            (StatusCode::BAD_REQUEST, format!("Invalid save file: {e}"))
        }
        ScreenshotError::UnsupportedVersion(v) => {
            tracing::warn!(minor_version = v, "unsupported EU4 minor version");
            (
                StatusCode::BAD_REQUEST,
                format!("Unsupported EU4 minor version: {v}"),
            )
        }
        ScreenshotError::CreateRenderer(e) => {
            tracing::error!(error = %e, "screenshot renderer creation failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to render screenshot".to_string(),
            )
        }
        ScreenshotError::CaptureViewport(e) => {
            tracing::error!(error = %e, "screenshot viewport capture failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to render screenshot".to_string(),
            )
        }
        ScreenshotError::Encode(e) => {
            tracing::error!(error = %e, "screenshot encode error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to encode screenshot".to_string(),
            )
        }
    }
}

#[tracing::instrument(
    level = "info",
    name = "screenshot.endpoint",
    skip(body),
    fields(request_bytes = body.len())
)]
pub async fn endpoint(body: Bytes) -> impl IntoResponse {
    let gpu = match GPU.get_or_try_init(GpuContext::new).await {
        Ok(gpu) => gpu,
        Err(e) => {
            tracing::error!(error = %e, "screenshot rendering unavailable");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Screenshot rendering is unavailable on this host",
            )
                .into_response();
        }
    };

    match pdx_screenshot::eu4::render(gpu, &body).await {
        Ok(webp) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/webp"));
            (StatusCode::OK, headers, Bytes::from(webp)).into_response()
        }
        Err(e) => {
            let (status, msg) = error_response(e);
            (status, msg).into_response()
        }
    }
}

#[tracing::instrument(
    level = "info",
    name = "eu5.screenshot.endpoint",
    skip(body),
    fields(request_bytes = body.len())
)]
pub async fn eu5_endpoint(body: Bytes) -> impl IntoResponse {
    let gpu = match GPU.get_or_try_init(GpuContext::new).await {
        Ok(gpu) => gpu,
        Err(error) => {
            tracing::error!(%error, "screenshot rendering unavailable");
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                "Screenshot rendering is unavailable",
            )
                .into_response();
        }
    };

    // The parse takes seconds, and the map load can wait for another
    // request. Run both off the async worker so that they do not block
    // health checks and other requests.
    let result = match tokio::task::block_in_place(|| pdx_screenshot::eu5::prepare(gpu, &body)) {
        Ok(save) => pdx_screenshot::eu5::render(gpu, save).await,
        Err(error) => Err(error),
    };
    match result {
        Ok(webp) => {
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/webp"));
            (StatusCode::OK, headers, Bytes::from(webp)).into_response()
        }
        Err(error) => eu5_error_response(error).into_response(),
    }
}

fn eu5_error_response(err: pdx_screenshot::eu5::ScreenshotError) -> (StatusCode, String) {
    use pdx_screenshot::eu5::ScreenshotError;
    match err {
        ScreenshotError::NoAssets => {
            tracing::error!("EU5 screenshot requested but no EU5 assets are embedded");
            (StatusCode::SERVICE_UNAVAILABLE, err.to_string())
        }
        ScreenshotError::Parse(e) => {
            tracing::warn!(error = %e, "EU5 screenshot parse error");
            (StatusCode::BAD_REQUEST, format!("Invalid save file: {e}"))
        }
        ScreenshotError::GameData(e) => {
            tracing::error!(error = %e, "EU5 screenshot game data failed to load");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to render screenshot".to_string(),
            )
        }
        ScreenshotError::Render(e) => {
            tracing::error!(error = %e, "EU5 screenshot render failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to render screenshot".to_string(),
            )
        }
        ScreenshotError::Encode(e) => {
            tracing::error!(error = %e, "EU5 screenshot encode error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to encode screenshot".to_string(),
            )
        }
    }
}
