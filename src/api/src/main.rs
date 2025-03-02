use applib::parser::{parse_save_data, ParseResult};
use axum::{
    body::Bytes,
    extract::DefaultBodyLimit,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use std::net::SocketAddr;
use tokio::{net::TcpListener, signal};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;

// Avoid musl's default allocator due to lackluster performance
// https://nickb.dev/blog/default-musl-allocator-considered-harmful-to-performance
#[cfg(target_env = "musl")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

async fn upload(data: Bytes) -> Result<Json<ParseResult>, StatusCode> {
    tracing::info!("received request (bytes: {})", data.len());
    let result = tokio::task::block_in_place(|| parse_save_data(&data));

    match result {
        Ok(parsed) => Ok(Json(parsed)),
        Err(e) => {
            tracing::error!("parsing error: {}", e);
            Err(StatusCode::BAD_REQUEST)
        }
    }
}

async fn convert_png(data: Bytes) -> impl IntoResponse {
    tracing::info!("received png request (bytes: {})", data.len());

    tokio::task::block_in_place(|| {
        let Ok(png) = image::load_from_memory_with_format(&data, image::ImageFormat::Png) else {
            return Err(StatusCode::BAD_REQUEST);
        };

        let Ok(encoder) = webp::Encoder::from_image(&png) else {
            return Err(StatusCode::BAD_REQUEST);
        };

        let data = Bytes::copy_from_slice(&encoder.encode_lossless());
        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("image/webp"));

        Ok((headers, data))
    })
}

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    let port = match std::env::var("PORT") {
        Ok(x) => x.parse::<u16>().unwrap(),
        Err(_) => 8080,
    };

    let app = Router::new()
        .route("/", post(upload))
        .route("/webp", post(convert_png))
        .layer(DefaultBodyLimit::max(15 * 1024 * 1024))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
                .on_response(trace::DefaultOnResponse::new().level(Level::INFO)),
        );
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await.expect("to bind to port");
    tracing::info!("listening on {}", addr);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("to create axum server");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    println!("signal received, starting graceful shutdown");
}
