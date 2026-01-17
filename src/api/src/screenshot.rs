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
        ScreenshotError::InvalidImageBuffer => {
            tracing::error!("screenshot encode error");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to encode screenshot".to_string(),
            )
        }
        ScreenshotError::WebpEncode(e) => {
            tracing::error!(error = %e, "screenshot WebP encoding failed");
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
