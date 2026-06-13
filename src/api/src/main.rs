use applib::parser::{ParseResult, parse_save_data};
use axum::{
    Json, Router,
    body::Bytes,
    extract::DefaultBodyLimit,
    http::StatusCode,
    routing::{get, post},
};
use std::io::IsTerminal;
use std::net::SocketAddr;
use tokio::{net::TcpListener, signal};
use tower_http::trace::{self, TraceLayer};
use tracing::Level;
use tracing_subscriber::{EnvFilter, fmt::format::FmtSpan};

mod screenshot;

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

// Liveness/readiness probe. This service is stateless (no external deps), so a
// bare 200 is an honest signal that the router is up and serving.
async fn health() -> StatusCode {
    StatusCode::OK
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let builder = tracing_subscriber::fmt()
        .with_target(false)
        .with_span_events(FmtSpan::CLOSE)
        .with_env_filter(filter);

    // Pretty, colored output in an interactive terminal; structured JSON
    // otherwise.
    if std::io::stdout().is_terminal() {
        builder.compact().init();
    } else {
        builder.json().init();
    }

    let port = match std::env::var("PORT") {
        Ok(x) => x.parse::<u16>().unwrap(),
        Err(_) => 8080,
    };

    let app = Router::new()
        .route("/", post(upload))
        .route("/healthz", get(health))
        .route("/screenshot", post(screenshot::endpoint))
        .layer(DefaultBodyLimit::max(50 * 1024 * 1024))
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

    Ok(())
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
